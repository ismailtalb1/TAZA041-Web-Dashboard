<?php

namespace Tests\Feature;

use App\Models\Customer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class CustomerPasswordChangeTest extends TestCase
{
    use RefreshDatabase;

    public function test_customer_can_change_password_and_only_other_sessions_are_revoked(): void
    {
        $customer = Customer::create([
            'name' => 'Password Customer',
            'email' => 'password-change@example.test',
            'password_hash' => Hash::make('OldPassword123'),
            'status' => Customer::STATUS_REGISTERED,
        ]);
        $currentSession = $customer->createToken('current-web-session');
        $otherSession = $customer->createToken('other-mobile-session');

        $this->withToken($currentSession->plainTextToken)
            ->putJson('/api/customer/profile', [
                'current_password' => 'wrong-password',
                'new_password' => 'NewPassword456',
                'new_password_confirmation' => 'NewPassword456',
            ])->assertUnprocessable();

        $this->withToken($currentSession->plainTextToken)
            ->putJson('/api/customer/profile', [
                'current_password' => 'OldPassword123',
                'new_password' => 'NewPassword456',
                'new_password_confirmation' => 'NewPassword456',
            ])->assertOk()
            ->assertJsonPath('data.changes.0', 'كلمة المرور');

        $this->assertTrue(Hash::check('NewPassword456', $customer->fresh()->password_hash));
        $this->assertDatabaseHas('personal_access_tokens', ['id' => $currentSession->accessToken->id]);
        $this->assertDatabaseMissing('personal_access_tokens', ['id' => $otherSession->accessToken->id]);

        $this->withToken($currentSession->plainTextToken)
            ->getJson('/api/customer/profile')
            ->assertOk();
    }

    public function test_new_password_must_match_and_differ_from_current_password(): void
    {
        $customer = Customer::create([
            'name' => 'Password Validation Customer',
            'email' => 'password-validation@example.test',
            'password_hash' => Hash::make('OldPassword123'),
            'status' => Customer::STATUS_REGISTERED,
        ]);

        $this->actingAs($customer, 'sanctum')
            ->putJson('/api/customer/profile', [
                'current_password' => 'OldPassword123',
                'new_password' => 'DifferentPassword456',
                'new_password_confirmation' => 'MismatchPassword789',
            ])->assertUnprocessable();

        $this->actingAs($customer, 'sanctum')
            ->putJson('/api/customer/profile', [
                'current_password' => 'OldPassword123',
                'new_password' => 'OldPassword123',
                'new_password_confirmation' => 'OldPassword123',
            ])->assertUnprocessable()
            ->assertJsonPath('success', false);

        $this->assertTrue(Hash::check('OldPassword123', $customer->fresh()->password_hash));
    }
}
