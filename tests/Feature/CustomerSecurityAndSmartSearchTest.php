<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\CustomerBlockedIp;
use App\Models\Employee;
use App\Models\Notification;
use App\Models\Order;
use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CustomerSecurityAndSmartSearchTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    public function test_general_manager_filters_by_security_status_and_sends_suggested_warning(): void
    {
        $customer = Customer::create([
            'name' => 'Watch Customer',
            'email' => 'watch@example.test',
            'password_hash' => bcrypt('Password123'),
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

        $manager = Employee::where('username', 'admin')->firstOrFail();
        Sanctum::actingAs($manager, $manager->getAbilities());

        $this->getJson('/api/admin/customers?filter=security_watch')
            ->assertOk()
            ->assertJsonPath('data.count', 1)
            ->assertJsonPath('data.customers.0.id', $customer->id)
            ->assertJsonPath('data.customers.0.security_status', Customer::SECURITY_WATCH)
            ->assertJsonPath('data.customers.0.security_warning.title', 'تنبيه بخصوص تكرار الإلغاء');

        $this->postJson("/api/admin/customers/{$customer->id}/warning")
            ->assertOk()
            ->assertJsonPath('data.security_status', Customer::SECURITY_WATCH)
            ->assertJsonPath('data.title', 'تنبيه بخصوص تكرار الإلغاء');

        $this->assertDatabaseHas('notifications', [
            'receiver_id' => $customer->id,
            'title' => 'تنبيه بخصوص تكرار الإلغاء',
            'status' => Notification::STATUS_SENT,
        ]);
    }

    public function test_banning_customer_blocks_their_ip_from_login_and_new_registration_until_unbanned(): void
    {
        $blockedIp = '203.0.113.41';
        $registration = $this->withServerVariables(['REMOTE_ADDR' => $blockedIp])
            ->postJson('/api/customer/auth/register', [
                'name' => 'Blocked Customer',
                'email' => 'blocked@example.test',
                'phone' => '0911111111',
                'password' => 'Password123',
                'password_confirmation' => 'Password123',
            ])->assertCreated();

        $customerId = $registration->json('data.customer.id');
        $manager = Employee::where('username', 'admin')->firstOrFail();
        Sanctum::actingAs($manager, $manager->getAbilities());

        $this->postJson("/api/admin/customers/{$customerId}/ban", [
            'reason' => 'إساءة استخدام متكررة للخدمة',
        ])->assertOk()->assertJsonPath('data.customer.is_ip_blocked', true);

        $this->assertTrue(CustomerBlockedIp::isBlocked($blockedIp));

        $this->withServerVariables(['REMOTE_ADDR' => $blockedIp])
            ->postJson('/api/customer/auth/register', [
                'name' => 'New Account Attempt',
                'email' => 'new-attempt@example.test',
                'phone' => '0922222222',
                'password' => 'Password123',
                'password_confirmation' => 'Password123',
            ])->assertForbidden();

        $this->withServerVariables(['REMOTE_ADDR' => $blockedIp])
            ->postJson('/api/customer/auth/login', [
                'identifier' => 'blocked@example.test',
                'password' => 'Password123',
            ])->assertForbidden();

        $this->postJson("/api/admin/customers/{$customerId}/unban")->assertOk();
        $this->assertFalse(CustomerBlockedIp::isBlocked($blockedIp));
    }

    public function test_public_product_search_recovers_from_a_typo(): void
    {
        $product = Product::create([
            'name' => 'Crispy Chicken',
            'name_en' => 'Crispy Chicken',
            'name_ar' => 'دجاج مقرمش',
            'description' => 'Crunchy chicken meal',
            'category' => Product::CATEGORY_MEAL,
            'price' => 25000,
            'stock_quantity' => 15,
            'is_active' => true,
        ]);

        $this->getJson('/api/public/products?search=krispe')
            ->assertOk()
            ->assertJsonFragment(['id' => $product->id, 'name' => 'Crispy Chicken'])
            ->assertJsonPath('data.search.corrected_to', 'Crispy Chicken');
    }

    public function test_communication_working_hours_are_the_same_source_returned_to_customers(): void
    {
        $manager = Employee::where('username', 'comm_mgr')->firstOrFail();
        Sanctum::actingAs($manager, $manager->getAbilities());

        $hours = [
            'saturday' => ['open' => true, 'from' => '10:00', 'to' => '23:30'],
            'sunday' => ['open' => false, 'from' => '10:00', 'to' => '23:30'],
            'monday' => ['open' => true, 'from' => '09:15', 'to' => '22:00'],
            'tuesday' => ['open' => true, 'from' => '09:15', 'to' => '22:00'],
            'wednesday' => ['open' => true, 'from' => '09:15', 'to' => '22:00'],
            'thursday' => ['open' => true, 'from' => '09:15', 'to' => '22:00'],
            'friday' => ['open' => true, 'from' => '13:00', 'to' => '23:30'],
        ];

        $this->putJson('/api/communication/restaurant', ['working_hours' => $hours])
            ->assertOk()
            ->assertJsonPath('data.restaurant.working_hours.sunday.open', false);

        $this->getJson('/api/public/restaurant')
            ->assertOk()
            ->assertJsonPath('data.restaurant.working_hours.saturday.from', '10:00')
            ->assertJsonPath('data.restaurant.working_hours.friday.to', '23:30');
    }
}
