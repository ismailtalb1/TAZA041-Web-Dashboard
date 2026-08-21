<?php

namespace Tests\Feature;

use App\Models\Customer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class CustomerSessionLifecycleTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_on_another_client_does_not_revoke_the_existing_mobile_session(): void
    {
        $customer = $this->customer();

        $mobileToken = $this->loginToken($customer->email);
        $webToken = $this->loginToken($customer->email);

        $this->assertCount(2, $customer->fresh()->tokens);
        $this->withToken($mobileToken)->getJson('/api/customer/profile')->assertOk();
        $this->withToken($webToken)->getJson('/api/customer/profile')->assertOk();

        $this->withToken($webToken)->postJson('/api/customer/auth/logout')->assertOk();

        $this->assertCount(1, $customer->fresh()->tokens);
        $this->withToken($mobileToken)->getJson('/api/customer/profile')->assertOk();
    }

    public function test_active_customer_token_is_renewed_before_it_expires(): void
    {
        $customer = $this->customer();
        $plainTextToken = $customer->createToken(
            'mobile-session',
            ['place_orders', 'view_menu', 'manage_profile'],
            now()->addDay(),
        )->plainTextToken;

        $this->withToken($plainTextToken)
            ->getJson('/api/customer/profile')
            ->assertOk();

        $expiresAt = $customer->tokens()->latest('id')->firstOrFail()->expires_at;
        $this->assertTrue($expiresAt->greaterThan(now()->addDays(29)));
    }

    private function loginToken(string $email): string
    {
        return (string) $this->postJson('/api/customer/auth/login', [
            'identifier' => $email,
            'password' => 'SecurePassword123',
        ])->assertOk()->json('data.token');
    }

    private function customer(): Customer
    {
        return Customer::create([
            'name' => 'Session Test Customer',
            'email' => 'session-test@example.test',
            'password_hash' => Hash::make('SecurePassword123'),
            'status' => Customer::STATUS_REGISTERED,
        ]);
    }
}
