<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Notifications\CustomerResetPasswordNotification;
use Illuminate\Contracts\Notifications\Dispatcher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Mockery;
use RuntimeException;
use Tests\TestCase;

class CustomerPasswordResetTest extends TestCase
{
    use RefreshDatabase;

    private const GENERIC_MESSAGE = 'إذا كان البريد الإلكتروني مرتبطاً بحساب، فسيتم إرسال رابط استعادة كلمة المرور إليه.';

    public function test_reset_link_request_never_reveals_whether_the_email_exists(): void
    {
        Notification::fake();
        $customer = $this->customer('recovery-existing@example.test');

        $this->postJson('/api/customer/auth/forgot-password', [
            'email' => $customer->email,
        ])->assertOk()->assertJsonPath('message', self::GENERIC_MESSAGE);

        $this->postJson('/api/customer/auth/forgot-password', [
            'email' => 'recovery-missing@example.test',
        ])->assertOk()->assertJsonPath('message', self::GENERIC_MESSAGE);

        Notification::assertSentTo(
            $customer,
            CustomerResetPasswordNotification::class,
            function (CustomerResetPasswordNotification $notification) use ($customer): bool {
                $mail = $notification->toMail($customer);

                $this->assertSame('TAZA041 - استعادة كلمة المرور', $mail->subject);
                $this->assertSame('تعيين كلمة مرور جديدة', $mail->actionText);
                $this->assertStringContainsString('15 دقيقة', implode(' ', [
                    ...$mail->introLines,
                    ...$mail->outroLines,
                ]));

                return true;
            }
        );
    }

    public function test_valid_link_resets_password_once_and_revokes_only_customer_tokens(): void
    {
        Notification::fake();
        $customer = $this->customer('recovery-success@example.test');
        $otherCustomer = $this->customer('recovery-other@example.test');
        $customer->createToken('old-session');
        $otherCustomer->createToken('other-session');

        $token = $this->requestResetToken($customer);
        $payload = [
            'email' => $customer->email,
            'token' => $token,
            'password' => 'SecurePassword123',
            'password_confirmation' => 'SecurePassword123',
        ];

        $this->postJson('/api/customer/auth/reset-password', $payload)
            ->assertOk()
            ->assertJsonPath('success', true);

        $this->assertTrue(Hash::check('SecurePassword123', $customer->fresh()->password_hash));
        $this->assertDatabaseMissing('personal_access_tokens', ['tokenable_id' => $customer->id]);
        $this->assertDatabaseHas('personal_access_tokens', ['tokenable_id' => $otherCustomer->id]);
        $this->assertDatabaseMissing('customer_password_reset_tokens', ['email' => $customer->email]);

        $this->postJson('/api/customer/auth/reset-password', $payload)
            ->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    public function test_expired_or_invalid_links_and_invalid_passwords_are_rejected(): void
    {
        Notification::fake();
        $customer = $this->customer('recovery-expired@example.test');
        $token = $this->requestResetToken($customer);

        DB::table('customer_password_reset_tokens')
            ->where('email', $customer->email)
            ->update(['created_at' => now()->subMinutes(16)]);

        $this->postJson('/api/customer/auth/reset-password', [
            'email' => $customer->email,
            'token' => $token,
            'password' => 'SecurePassword123',
            'password_confirmation' => 'SecurePassword123',
        ])->assertStatus(422);

        $this->postJson('/api/customer/auth/reset-password', [
            'email' => $customer->email,
            'token' => 'invalid-token',
            'password' => 'short',
            'password_confirmation' => 'different',
        ])->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    public function test_reset_link_requests_are_rate_limited(): void
    {
        Notification::fake();
        $email = 'recovery-rate-limit@example.test';

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->postJson('/api/customer/auth/forgot-password', ['email' => $email])->assertOk();
        }

        $this->postJson('/api/customer/auth/forgot-password', ['email' => $email])
            ->assertStatus(429)
            ->assertJsonPath('success', false);
    }

    public function test_mail_failure_does_not_invalidate_a_previously_issued_link(): void
    {
        Notification::fake();
        $customer = $this->customer('recovery-mail-failure@example.test');
        $token = $this->requestResetToken($customer);
        DB::table('customer_password_reset_tokens')
            ->where('email', $customer->email)
            ->update(['created_at' => now()->subSeconds(61)]);
        $previousReset = DB::table('customer_password_reset_tokens')
            ->where('email', $customer->email)
            ->first();

        $dispatcher = Mockery::mock(Dispatcher::class);
        $dispatcher->shouldReceive('send')
            ->once()
            ->andThrow(new RuntimeException('Simulated mail transport failure.'));
        $this->app->instance(Dispatcher::class, $dispatcher);

        $this->postJson('/api/customer/auth/forgot-password', [
            'email' => $customer->email,
        ])->assertOk()->assertJsonPath('message', self::GENERIC_MESSAGE);

        $currentReset = DB::table('customer_password_reset_tokens')
            ->where('email', $customer->email)
            ->first();

        $this->assertSame($previousReset->token, $currentReset->token);
        $this->assertSame((string) $previousReset->created_at, (string) $currentReset->created_at);

        $this->postJson('/api/customer/auth/reset-password', [
            'email' => $customer->email,
            'token' => $token,
            'password' => 'SecurePassword456',
            'password_confirmation' => 'SecurePassword456',
        ])->assertOk()->assertJsonPath('success', true);
    }

    private function customer(string $email): Customer
    {
        return Customer::create([
            'name' => 'Recovery Customer',
            'email' => $email,
            'password_hash' => Hash::make('OldPassword123'),
            'status' => Customer::STATUS_REGISTERED,
        ]);
    }

    private function requestResetToken(Customer $customer): string
    {
        $token = '';

        $this->postJson('/api/customer/auth/forgot-password', [
            'email' => $customer->email,
        ])->assertOk();

        Notification::assertSentTo(
            $customer,
            CustomerResetPasswordNotification::class,
            function (CustomerResetPasswordNotification $notification, array $channels) use ($customer, &$token): bool {
                $url = $notification->toMail($customer)->actionUrl;
                parse_str((string) parse_url($url, PHP_URL_FRAGMENT), $parameters);
                $token = (string) ($parameters['token'] ?? '');

                return in_array('mail', $channels, true) && $token !== '';
            }
        );

        return $token;
    }
}
