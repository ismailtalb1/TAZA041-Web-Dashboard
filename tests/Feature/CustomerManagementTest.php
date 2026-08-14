<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Employee;
use App\Models\Order;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CustomerManagementTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    public function test_general_manager_can_list_customers_with_suspicious_statistics(): void
    {
        $customer = Customer::create([
            'name' => 'Suspicious Customer',
            'email' => 'suspicious@example.test',
            'password_hash' => bcrypt('password'),
            'status' => Customer::STATUS_REGISTERED,
            'loyalty_points' => 0,
        ]);

        for ($index = 0; $index < Customer::CANCELLATION_WARNING_THRESHOLD; $index++) {
            Order::create([
                'customer_id' => $customer->id,
                'type' => Order::TYPE_NORMAL,
                'status' => Order::STATUS_CANCELLED,
                'total_price' => 100,
                'discount' => 0,
                'final_price' => 100,
            ]);
        }

        $login = $this->postJson('/api/auth/employee/login', [
            'username' => 'admin',
            'password' => 'Admin@041',
        ])->assertOk();

        $token = $login->json('data.token');

        $this->withToken($token)
            ->getJson('/api/admin/customers')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.stats.total_suspicious', 1)
            ->assertJsonFragment([
                'id' => $customer->id,
                'is_suspicious' => true,
                'cancelled_orders' => Customer::CANCELLATION_WARNING_THRESHOLD,
            ]);

        $this->withToken($token)
            ->getJson('/api/admin/customers?filter=suspicious')
            ->assertOk()
            ->assertJsonPath('data.count', 1)
            ->assertJsonPath('data.customers.0.id', $customer->id);
    }

    public function test_general_manager_lists_are_paginated_and_keep_global_statistics(): void
    {
        for ($index = 1; $index <= 30; $index++) {
            $customer = Customer::create([
                'name' => "Customer {$index}",
                'email' => "customer{$index}@example.test",
                'password_hash' => bcrypt('password'),
                'status' => Customer::STATUS_REGISTERED,
                'loyalty_points' => 0,
            ]);

            Order::create([
                'customer_id' => $customer->id,
                'type' => Order::TYPE_NORMAL,
                'status' => $index <= 15 ? Order::STATUS_COMPLETED : Order::STATUS_PENDING,
                'total_price' => 100,
                'discount' => 0,
                'final_price' => 100,
            ]);
        }

        $generalManager = Employee::where('username', 'admin')->firstOrFail();
        Sanctum::actingAs($generalManager, $generalManager->getAbilities());

        $this->getJson('/api/admin/customers?per_page=10&page=2')
            ->assertOk()
            ->assertJsonCount(10, 'data.customers')
            ->assertJsonPath('data.count', 30)
            ->assertJsonPath('data.pagination.current_page', 2)
            ->assertJsonPath('data.pagination.last_page', 3)
            ->assertJsonPath('data.pagination.total', 30);

        $this->getJson('/api/admin/orders?per_page=10&page=2')
            ->assertOk()
            ->assertJsonCount(10, 'data.orders')
            ->assertJsonPath('data.stats.total', 30)
            ->assertJsonPath('data.stats.completed', 15)
            ->assertJsonPath('data.pagination.current_page', 2)
            ->assertJsonPath('data.pagination.last_page', 3)
            ->assertJsonPath('data.pagination.total', 30);
    }
}
