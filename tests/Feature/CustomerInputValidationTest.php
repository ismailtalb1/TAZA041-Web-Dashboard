<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CustomerInputValidationTest extends TestCase
{
    use RefreshDatabase;

    public function test_registration_rejects_numeric_names_and_invalid_phone_numbers(): void
    {
        $this->postJson('/api/customer/auth/register', [
            'name' => '123456',
            'phone' => '0912345678',
            'password' => 'Secure123',
            'password_confirmation' => 'Secure123',
        ])->assertUnprocessable()->assertJsonValidationErrors('name');

        $this->postJson('/api/customer/auth/register', [
            'name' => 'اسم صحيح',
            'phone' => '912345678',
            'password' => 'Secure123',
            'password_confirmation' => 'Secure123',
        ])->assertUnprocessable()->assertJsonValidationErrors('phone');

        $this->postJson('/api/customer/auth/register', [
            'name' => 'اسم صحيح',
            'phone' => '09912345678',
            'password' => 'Secure123',
            'password_confirmation' => 'Secure123',
        ])->assertUnprocessable()->assertJsonValidationErrors('phone');

        $this->postJson('/api/customer/auth/register', [
            'name' => 'اسم صحيح',
            'phone' => '09 1234 5678',
            'password' => 'Secure123',
            'password_confirmation' => 'Secure123',
        ])->assertUnprocessable()->assertJsonValidationErrors('phone');
    }

    public function test_registration_accepts_a_real_name_and_exact_syrian_mobile_format(): void
    {
        $this->postJson('/api/customer/auth/register', [
            'name' => 'محمد الأحمد',
            'phone' => '0912345678',
            'password' => 'Secure123',
            'password_confirmation' => 'Secure123',
        ])->assertCreated()
            ->assertJsonPath('data.customer.name', 'محمد الأحمد')
            ->assertJsonPath('data.customer.phone', '0912345678');
    }

    public function test_login_identifier_must_be_an_email_or_exact_phone_format(): void
    {
        $this->postJson('/api/customer/auth/login', [
            'identifier' => 'not-a-login-identifier',
            'password' => 'anything',
        ])->assertUnprocessable()->assertJsonValidationErrors('identifier');

        $this->postJson('/api/customer/auth/login', [
            'identifier' => '091234567',
            'password' => 'anything',
        ])->assertUnprocessable()->assertJsonValidationErrors('identifier');
    }

    public function test_registration_rejects_weak_passwords_and_control_characters(): void
    {
        $this->postJson('/api/customer/auth/register', [
            'name' => 'Valid Name',
            'email' => 'valid@example.test',
            'address' => "Valid address\u{0007}",
            'password' => '12345678',
            'password_confirmation' => '12345678',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['address', 'password']);
    }
}
