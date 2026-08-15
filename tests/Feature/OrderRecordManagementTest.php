<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\DeliveryOrder;
use App\Models\Employee;
use App\Models\Order;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class OrderRecordManagementTest extends TestCase
{
    use RefreshDatabase;

    public function test_general_manager_can_archive_and_restore_a_closed_order(): void
    {
        $manager = $this->employee(Employee::ROLE_GENERAL_MANAGER, 'records-general');
        $order = $this->order(Order::STATUS_COMPLETED);

        $this->actingAs($manager, 'sanctum')
            ->putJson("/api/orders/{$order->id}/archive")
            ->assertOk()
            ->assertJsonPath('data.order.is_archived', true);

        $this->assertNotNull($order->fresh()->archived_at);
        $this->assertSame($manager->id, $order->fresh()->archived_by);

        $this->getJson('/api/admin/orders')
            ->assertOk()
            ->assertJsonPath('data.pagination.total', 0);

        $this->getJson('/api/admin/orders?record_state=archived')
            ->assertOk()
            ->assertJsonPath('data.orders.0.id', $order->id)
            ->assertJsonPath('data.orders.0.is_archived', true);

        $this->putJson("/api/orders/{$order->id}/restore")
            ->assertOk();

        $this->assertNull($order->fresh()->archived_at);
        $this->getJson('/api/admin/orders')
            ->assertOk()
            ->assertJsonPath('data.orders.0.id', $order->id);
    }

    public function test_order_manager_delete_hides_order_and_delivery_record_globally(): void
    {
        $manager = $this->employee(Employee::ROLE_ORDER_MANAGER, 'records-orders');
        $customer = $this->customer('deleted-order@example.test');
        $order = $this->order(Order::STATUS_COMPLETED, Order::TYPE_DELIVERY, $customer);
        $delivery = DeliveryOrder::create([
            'order_id' => $order->id,
            'delivery_address' => 'Damascus',
            'status' => DeliveryOrder::STATUS_DELIVERED,
        ]);

        $this->actingAs($manager, 'sanctum')
            ->deleteJson("/api/orders/{$order->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $order->id);

        $this->assertNull(Order::find($order->id));
        $this->assertNotNull(Order::withTrashed()->find($order->id));
        $this->assertNull(DeliveryOrder::find($delivery->id));
        $this->assertNotNull(DeliveryOrder::withTrashed()->find($delivery->id));

        $this->getJson('/api/orders')
            ->assertOk()
            ->assertJsonCount(0, 'data.orders');

        $this->actingAs($customer, 'sanctum')
            ->getJson('/api/customer/orders')
            ->assertOk()
            ->assertJsonCount(0, 'data.orders');
    }

    public function test_active_orders_cannot_be_archived_or_deleted(): void
    {
        $manager = $this->employee(Employee::ROLE_ORDER_MANAGER, 'records-active');
        $order = $this->order(Order::STATUS_PENDING);

        $this->actingAs($manager, 'sanctum')
            ->putJson("/api/orders/{$order->id}/archive")
            ->assertStatus(422);

        $this->deleteJson("/api/orders/{$order->id}")
            ->assertStatus(422);

        $this->assertNotNull(Order::find($order->id));
    }

    public function test_employee_without_record_permission_cannot_archive_or_delete(): void
    {
        $finance = $this->employee(Employee::ROLE_FINANCE_MANAGER, 'records-finance');
        $order = $this->order(Order::STATUS_CANCELLED);

        $this->actingAs($finance, 'sanctum')
            ->putJson("/api/orders/{$order->id}/archive")
            ->assertForbidden();

        $this->deleteJson("/api/orders/{$order->id}")
            ->assertForbidden();

        $this->assertNotNull(Order::find($order->id));
    }

    private function employee(string $role, string $username): Employee
    {
        return Employee::create([
            'name' => $username,
            'username' => $username,
            'password_hash' => Hash::make('password'),
            'role' => $role,
            'is_active' => true,
        ]);
    }

    private function customer(string $email): Customer
    {
        return Customer::create([
            'name' => 'Record customer',
            'email' => $email,
            'status' => Customer::STATUS_REGISTERED,
            'loyalty_points' => 0,
        ]);
    }

    private function order(
        string $status,
        string $type = Order::TYPE_NORMAL,
        ?Customer $customer = null,
    ): Order {
        $customer ??= $this->customer(uniqid('record-', true).'@example.test');

        return Order::create([
            'customer_id' => $customer->id,
            'type' => $type,
            'status' => $status,
            'total_price' => 250,
            'discount' => 0,
            'final_price' => 250,
        ]);
    }
}
