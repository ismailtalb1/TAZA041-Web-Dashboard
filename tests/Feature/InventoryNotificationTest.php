<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Employee;
use App\Models\Notification;
use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class InventoryNotificationTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    public function test_inventory_manager_receives_and_can_read_stock_alerts(): void
    {
        $manager = Employee::where('username', 'inventory_mgr')->firstOrFail();
        $product = $this->productWithStock(11);
        $token = $this->employeeToken('inventory_mgr', 'Staff@041');

        $this->withToken($token)
            ->patchJson('/api/products/'.$product->id.'/stock', [
                'stock_quantity' => 10,
                'operation' => 'set',
            ])
            ->assertOk()
            ->assertJsonPath('data.new_stock', 10);

        $alert = Notification::forEmployee($manager->id)
            ->byType(Notification::TYPE_STOCK_ALERT)
            ->sole();

        $this->assertSame(Notification::STATUS_SENT, $alert->status);
        $this->assertSame($product->id, $alert->data['product_id']);
        $this->assertSame('warning', $alert->data['severity']);

        // الانتقال إلى الصفر يحدّث التنبيه نفسه بدلاً من إنشاء إشعار مكرر.
        $this->withToken($token)
            ->patchJson('/api/products/'.$product->id.'/stock', [
                'stock_quantity' => 0,
                'operation' => 'set',
            ])
            ->assertOk();

        $this->assertSame(1, Notification::forEmployee($manager->id)
            ->byType(Notification::TYPE_STOCK_ALERT)->count());

        $alert->refresh();
        $this->assertStringContainsString('نفد', $alert->title);
        $this->assertSame('critical', $alert->data['severity']);

        $this->withToken($token)
            ->getJson('/api/employee/notifications')
            ->assertOk()
            ->assertJsonPath('data.unread_count', 1)
            ->assertJsonPath('data.notifications.0.id', $alert->id)
            ->assertJsonPath('data.notifications.0.is_read', false)
            ->assertJsonPath('data.notifications.0.data.product_id', $product->id);

        $this->withToken($token)
            ->putJson('/api/employee/notifications/'.$alert->id.'/read')
            ->assertOk()
            ->assertJsonPath('data.notification.is_read', true);

        $this->withToken($token)
            ->getJson('/api/employee/notifications/unread-count')
            ->assertOk()
            ->assertJsonPath('data.unread_count', 0)
            ->assertJsonPath('data.has_unread', false);
    }

    public function test_order_stock_changes_create_and_restocking_resolves_the_alert(): void
    {
        $manager = Employee::where('username', 'inventory_mgr')->firstOrFail();
        $product = $this->productWithStock(11);

        $this->assertTrue($product->decreaseStock(1));
        $this->assertSame(1, Notification::unreadCountForEmployee($manager->id));

        $alert = Notification::forEmployee($manager->id)
            ->byType(Notification::TYPE_STOCK_ALERT)
            ->sole();
        $this->assertIsArray($alert->data);
        $this->assertSame(10, $alert->data['stock']);

        $product->increaseStock(5);

        $this->assertSame(0, Notification::unreadCountForEmployee($manager->id));
        $this->assertSame(Notification::STATUS_READ, $alert->fresh()->status);
    }

    public function test_customer_can_report_an_unavailable_meal_to_inventory_manager_without_duplicate_alerts(): void
    {
        $manager = Employee::where('username', 'inventory_mgr')->firstOrFail();
        $customer = Customer::create([
            'name' => 'زبون بلاغ المخزون',
            'email' => 'stock-report@example.test',
            'status' => Customer::STATUS_REGISTERED,
            'loyalty_points' => 0,
        ]);
        $product = $this->productWithStock(0);

        $this->actingAs($customer, 'sanctum')
            ->postJson('/api/customer/products/'.$product->id.'/report-unavailable')
            ->assertOk()
            ->assertJsonPath('data.product_id', $product->id);

        $this->actingAs($customer, 'sanctum')
            ->postJson('/api/customer/products/'.$product->id.'/report-unavailable')
            ->assertOk();

        $alert = Notification::forEmployee($manager->id)
            ->byType(Notification::TYPE_STOCK_ALERT)
            ->sole();

        $this->assertSame(Notification::SENDER_CUSTOMER, $alert->sender_type);
        $this->assertSame($customer->id, $alert->sender_id);
        $this->assertSame($product->id, $alert->data['product_id']);
        $this->assertSame(2, $alert->data['customer_reports_count']);

        $availableProduct = $this->productWithStock(5);
        $this->actingAs($customer, 'sanctum')
            ->postJson('/api/customer/products/'.$availableProduct->id.'/report-unavailable')
            ->assertStatus(422);
    }

    private function productWithStock(int $stock): Product
    {
        return Product::create([
            'name' => 'منتج اختبار الإشعارات',
            'category' => Product::CATEGORY_MEAL,
            'price' => 100,
            'stock_quantity' => $stock,
            'is_active' => true,
        ]);
    }

    private function employeeToken(string $username, string $password): string
    {
        return $this->postJson('/api/auth/employee/login', compact('username', 'password'))
            ->assertOk()
            ->json('data.token');
    }
}
