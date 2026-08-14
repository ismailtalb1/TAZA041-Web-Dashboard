<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Employee;
use App\Models\LoyaltyAccount;
use App\Models\Notification;
use App\Models\Order;
use App\Models\PaymentRecord;
use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OperationalWorkflowTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    public function test_all_seven_employee_roles_can_log_in_and_only_open_their_areas(): void
    {
        $roles = [
            'admin' => [Employee::ROLE_GENERAL_MANAGER, 'Admin@041', '/api/admin/employees', '/api/admin/employees'],
            'order_mgr' => [Employee::ROLE_ORDER_MANAGER, 'Staff@041', '/api/orders', '/api/products'],
            'delivery_mgr' => [Employee::ROLE_DELIVERY_MANAGER, 'Staff@041', '/api/delivery', '/api/finance/accounts'],
            'finance_mgr' => [Employee::ROLE_FINANCE_MANAGER, 'Staff@041', '/api/finance/accounts', '/api/orders'],
            'inventory_mgr' => [Employee::ROLE_INVENTORY_MANAGER, 'Staff@041', '/api/products', '/api/communication/restaurant'],
            'comm_mgr' => [Employee::ROLE_COMMUNICATION_MANAGER, 'Staff@041', '/api/communication/restaurant', '/api/finance/accounts'],
            'driver' => [Employee::ROLE_DRIVER, 'Staff@041', '/api/delivery', '/api/admin/employees'],
        ];

        foreach ($roles as $username => [$role, $password, $allowedPath, $forbiddenPath]) {
            $this->forgetAuthenticatedUser();
            $login = $this->postJson('/api/auth/employee/login', [
                'username' => $username,
                'password' => $password,
            ])->assertOk()
                ->assertJsonPath('data.employee.role', $role)
                ->assertJsonPath('data.token_type', 'Bearer');

            $token = $login->json('data.token');
            $this->assertNotEmpty($token);
            $this->assertNotEmpty($login->json('data.employee.abilities'));

            $employee = Employee::where('username', $username)->firstOrFail();
            $this->assertNotNull($employee->tokens()->latest()->firstOrFail()->expires_at);

            $this->forgetAuthenticatedUser();
            $this->withToken($token)
                ->getJson($allowedPath)
                ->assertOk()
                ->assertJsonPath('success', true);

            if ($role !== Employee::ROLE_GENERAL_MANAGER) {
                $this->withToken($token)
                    ->getJson('/api/admin/employees')
                    ->assertForbidden()
                    ->assertJsonPath('success', false);
            }

            $this->withToken($token)
                ->getJson($forbiddenPath)
                ->assertStatus($role === Employee::ROLE_GENERAL_MANAGER ? 200 : 403);
        }
    }

    public function test_customer_order_payment_status_loyalty_notification_and_review_flow(): void
    {
        $registration = $this->postJson('/api/customer/auth/register', [
            'name' => 'Full Workflow Customer',
            'email' => 'full-workflow@example.test',
            'password' => 'password',
            'password_confirmation' => 'password',
        ])->assertCreated();

        $customerToken = $registration->json('data.token');
        $customer = Customer::where('email', 'full-workflow@example.test')->firstOrFail();
        $product = Product::where('name_en', 'Crispy Meal')->firstOrFail();

        $created = $this->withToken($customerToken)
            ->postJson('/api/customer/orders', [
                'type' => Order::TYPE_NORMAL,
                'items' => [[
                    'item_type' => 'product',
                    'reference_id' => $product->id,
                    'quantity' => 1,
                ]],
            ])->assertCreated()
            ->assertJsonPath('data.order.status', Order::STATUS_PENDING);

        $orderId = $created->json('data.order.id');

        $this->withToken($customerToken)
            ->postJson("/api/customer/orders/{$orderId}/pay", ['method' => PaymentRecord::METHOD_CASH])
            ->assertOk()
            ->assertJsonPath('data.payment.status', PaymentRecord::STATUS_PENDING);

        $this->assertDatabaseMissing('notifications', [
            'receiver_type' => Notification::RECEIVER_CUSTOMER,
            'receiver_id' => $customer->id,
            'type' => Notification::TYPE_PAYMENT_UPDATE,
        ]);

        $orderManagerLogin = $this->postJson('/api/auth/employee/login', [
            'username' => 'order_mgr',
            'password' => 'Staff@041',
        ])->assertOk();
        $orderManagerToken = $orderManagerLogin->json('data.token');

        $this->forgetAuthenticatedUser();
        foreach ([Order::STATUS_CONFIRMED, Order::STATUS_READY, Order::STATUS_COMPLETED] as $status) {
            $this->withToken($orderManagerToken)
                ->putJson("/api/orders/{$orderId}/status", ['status' => $status])
                ->assertOk()
                ->assertJsonPath('data.order.status', $status);
        }

        $this->assertDatabaseHas('payment_records', [
            'order_id' => $orderId,
            'method' => PaymentRecord::METHOD_CASH,
            'status' => PaymentRecord::STATUS_COMPLETED,
        ]);
        $this->assertDatabaseHas('notifications', [
            'receiver_type' => Notification::RECEIVER_CUSTOMER,
            'receiver_id' => $customer->id,
            'type' => Notification::TYPE_PAYMENT_UPDATE,
        ]);

        $loyalty = LoyaltyAccount::where('customer_id', $customer->id)->firstOrFail();
        $this->assertGreaterThan(0, $loyalty->points_balance);

        $this->forgetAuthenticatedUser();
        $this->withToken($customerToken)
            ->getJson("/api/customer/orders/{$orderId}")
            ->assertOk()
            ->assertJsonPath('data.order.status', Order::STATUS_COMPLETED);

        $this->withToken($customerToken)
            ->postJson("/api/customer/orders/{$orderId}/products/{$product->id}/rate", [
                'rating' => 5,
                'comment' => 'Excellent workflow meal.',
            ])->assertOk()
            ->assertJsonPath('data.review.rating', 5);

        $notifications = $this->withToken($customerToken)
            ->getJson('/api/customer/notifications')
            ->assertOk();
        $this->assertGreaterThan(0, $notifications->json('data.total'));

        $this->withToken($customerToken)
            ->putJson('/api/customer/notifications/read-all')
            ->assertOk()
            ->assertJsonPath('data.unread_count', 0);

        $financeLogin = $this->postJson('/api/auth/employee/login', [
            'username' => 'finance_mgr',
            'password' => 'Staff@041',
        ])->assertOk();
        $this->forgetAuthenticatedUser();
        $this->withToken($financeLogin->json('data.token'))
            ->getJson('/api/finance/payments')
            ->assertOk()
            ->assertJsonFragment([
                'method' => PaymentRecord::METHOD_CASH,
                'status' => PaymentRecord::STATUS_COMPLETED,
                'customer_name' => 'Full Workflow Customer',
            ]);

        $communicationLogin = $this->postJson('/api/auth/employee/login', [
            'username' => 'comm_mgr',
            'password' => 'Staff@041',
        ])->assertOk();
        $this->forgetAuthenticatedUser();
        $this->withToken($communicationLogin->json('data.token'))
            ->getJson('/api/reviews/customers')
            ->assertOk()
            ->assertJsonPath('data.stats.total', 1)
            ->assertJsonPath('data.reviews.0.rating', 5);
    }

    private function forgetAuthenticatedUser(): void
    {
        $this->app->make('auth')->forgetGuards();
    }
}
