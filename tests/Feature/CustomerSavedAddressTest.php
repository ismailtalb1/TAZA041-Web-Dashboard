<?php

namespace Tests\Feature;

use App\Models\Customer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class CustomerSavedAddressTest extends TestCase
{
    use RefreshDatabase;

    public function test_saved_addresses_are_private_and_synchronized_per_customer(): void
    {
        $customer = $this->customer('first@example.test');
        $other = $this->customer('other@example.test');

        $this->getJson('/api/customer/saved-addresses')->assertUnauthorized();

        $this->actingAs($customer, 'sanctum')
            ->putJson('/api/customer/saved-addresses/home', $this->address('wrong-password'))
            ->assertUnprocessable()
            ->assertJsonPath('success', false);

        $this->actingAs($customer, 'sanctum')
            ->putJson('/api/customer/saved-addresses/home', $this->address())
            ->assertOk()
            ->assertJsonPath('data.address.type', 'home')
            ->assertJsonPath('data.address.address', 'منزل العائلة');

        $this->actingAs($other, 'sanctum')
            ->getJson('/api/customer/saved-addresses')
            ->assertOk()
            ->assertJsonCount(0, 'data.addresses');

        $this->actingAs($customer, 'sanctum')
            ->getJson('/api/customer/saved-addresses')
            ->assertOk()
            ->assertJsonCount(1, 'data.addresses')
            ->assertJsonPath('data.addresses.0.latitude', 35.5317);
    }

    public function test_bulk_sync_replaces_all_slots_and_delete_requires_password(): void
    {
        $customer = $this->customer('sync@example.test');
        $this->actingAs($customer, 'sanctum');

        $this->putJson('/api/customer/saved-addresses', [
            'current_password' => 'password',
            'addresses' => [
                ['type' => 'home', ...$this->address(null, false)],
                ['type' => 'work', ...$this->address(null, false), 'address' => 'المكتب'],
            ],
        ])->assertOk()->assertJsonCount(2, 'data.addresses');

        $this->putJson('/api/customer/saved-addresses', [
            'current_password' => 'password',
            'addresses' => [
                ['type' => 'work', ...$this->address(null, false), 'address' => 'المكتب الجديد'],
            ],
        ])->assertOk()
            ->assertJsonCount(1, 'data.addresses')
            ->assertJsonPath('data.addresses.0.type', 'work')
            ->assertJsonPath('data.addresses.0.address', 'المكتب الجديد');

        $this->deleteJson('/api/customer/saved-addresses/work', [
            'current_password' => 'wrong-password',
        ])->assertUnprocessable();

        $this->deleteJson('/api/customer/saved-addresses/work', [
            'current_password' => 'password',
        ])->assertOk()->assertJsonCount(0, 'data.addresses');

        $this->assertDatabaseCount('customer_saved_addresses', 0);
    }

    public function test_saved_addresses_are_embedded_in_profile_and_login_for_mobile_compatibility(): void
    {
        $customer = $this->customer('mobile-sync@example.test');

        $this->actingAs($customer, 'sanctum')
            ->putJson('/api/customer/saved-addresses/home', $this->address())
            ->assertOk();

        $this->actingAs($customer, 'sanctum')
            ->getJson('/api/customer/profile')
            ->assertOk()
            ->assertJsonPath('data.saved_addresses.0.type', 'home')
            ->assertJsonPath('data.addresses.0.address', 'منزل العائلة')
            ->assertJsonPath('data.customer.saved_addresses.0.latitude', 35.5317)
            ->assertJsonPath('data.customer.addresses.0.longitude', 35.7901);

        $this->postJson('/api/customer/auth/login', [
            'identifier' => $customer->email,
            'password' => 'password',
        ])->assertOk()
            ->assertJsonPath('data.saved_addresses.0.address', 'منزل العائلة')
            ->assertJsonPath('data.customer.saved_addresses.0.type', 'home');
    }

    private function customer(string $email): Customer
    {
        return Customer::create([
            'name' => 'Saved Address Customer',
            'email' => $email,
            'password_hash' => Hash::make('password'),
            'status' => Customer::STATUS_REGISTERED,
        ]);
    }

    private function address(?string $password = 'password', bool $includePassword = true): array
    {
        return [
            ...($includePassword ? ['current_password' => $password] : []),
            'address' => 'منزل العائلة',
            'details' => 'الطابق الثاني',
            'latitude' => 35.5317,
            'longitude' => 35.7901,
        ];
    }
}
