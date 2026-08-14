<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Notification;
use App\Models\Offer;
use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CatalogNotificationTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    public function test_adding_a_product_notifies_customers_with_a_menu_link_reference(): void
    {
        $customer = $this->customer();
        $employeeToken = $this->employeeToken();

        $response = $this->withToken($employeeToken)->postJson('/api/products', [
            'name' => 'وجبة الاختبار',
            'name_ar' => 'وجبة الاختبار',
            'name_en' => 'Notification Test Meal',
            'category' => Product::CATEGORY_MEAL,
            'price' => 150,
            'stock_quantity' => 20,
            'is_active' => true,
        ])->assertCreated();

        $productId = $response->json('data.product.id');
        $notification = Notification::forCustomer($customer->id)
            ->byType(Notification::TYPE_NEW_PRODUCT)
            ->sole();

        $this->assertSame($productId, $notification->data['product_id']);

        $this->actingAs($customer, 'sanctum')
            ->getJson('/api/customer/notifications')
            ->assertOk()
            ->assertJsonFragment([
                'type' => Notification::TYPE_NEW_PRODUCT,
            ])
            ->assertJsonFragment([
                'product_id' => $productId,
            ]);
    }

    public function test_expired_offer_notifications_are_not_returned_to_customers(): void
    {
        $customer = $this->customer();
        $product = Product::create([
            'name' => 'منتج العرض',
            'category' => Product::CATEGORY_MEAL,
            'price' => 200,
            'stock_quantity' => 20,
            'is_active' => true,
        ]);

        $response = $this->withToken($this->employeeToken())->postJson('/api/offers', [
            'name' => 'عرض صالح للاختبار',
            'category' => 'meal',
            'offer_price' => 150,
            'start_date' => now()->subHour()->toIso8601String(),
            'end_date' => now()->addDay()->toIso8601String(),
            'products' => [[
                'product_id' => $product->id,
                'quantity' => 1,
            ]],
        ])->assertCreated();

        $offerId = $response->json('data.offer.id');

        $this->actingAs($customer, 'sanctum')
            ->getJson('/api/customer/notifications')
            ->assertOk()
            ->assertJsonFragment([
                'type' => Notification::TYPE_NEW_OFFER,
            ])
            ->assertJsonFragment([
                'offer_id' => $offerId,
            ]);

        Offer::findOrFail($offerId)->update(['end_date' => now()->subMinute()]);

        $this->actingAs($customer, 'sanctum')
            ->getJson('/api/customer/notifications')
            ->assertOk()
            ->assertJsonMissing([
                'offer_id' => $offerId,
            ]);
    }

    public function test_customer_receives_still_active_offers_when_opening_the_site_later(): void
    {
        $offer = Offer::currentlyActive()->firstOrFail();
        $customer = $this->customer();

        $this->assertDatabaseMissing('notifications', [
            'receiver_type' => Notification::RECEIVER_CUSTOMER,
            'receiver_id' => $customer->id,
            'type' => Notification::TYPE_NEW_OFFER,
        ]);

        $this->actingAs($customer, 'sanctum')
            ->getJson('/api/customer/notifications?status=unread')
            ->assertOk()
            ->assertJsonFragment([
                'offer_id' => $offer->id,
            ]);
    }

    public function test_catalog_notifications_are_created_only_for_registered_customers_and_require_login(): void
    {
        $registeredCustomer = $this->customer();
        $guestCustomer = Customer::create([
            'name' => 'ضيف اختبار الإشعارات',
            'status' => Customer::STATUS_GUEST,
        ]);

        $response = $this->withToken($this->employeeToken())->postJson('/api/products', [
            'name' => 'منتج خاص بالزبائن المسجلين',
            'category' => Product::CATEGORY_MEAL,
            'price' => 175,
            'stock_quantity' => 10,
            'is_active' => true,
        ])->assertCreated();

        $productId = $response->json('data.product.id');

        $this->assertDatabaseHas('notifications', [
            'receiver_type' => Notification::RECEIVER_CUSTOMER,
            'receiver_id' => $registeredCustomer->id,
            'type' => Notification::TYPE_NEW_PRODUCT,
        ]);
        $this->assertDatabaseMissing('notifications', [
            'receiver_type' => Notification::RECEIVER_CUSTOMER,
            'receiver_id' => $guestCustomer->id,
            'type' => Notification::TYPE_NEW_PRODUCT,
        ]);

        $this->getJson('/api/customer/notifications')->assertForbidden();

        $this->actingAs($registeredCustomer, 'sanctum')
            ->getJson('/api/customer/notifications')
            ->assertOk()
            ->assertJsonFragment(['product_id' => $productId]);
    }

    private function customer(): Customer
    {
        return Customer::create([
            'name' => 'زبون اختبار الإشعارات',
            'email' => 'catalog-notifications@example.test',
            'status' => Customer::STATUS_REGISTERED,
            'loyalty_points' => 0,
        ]);
    }

    private function employeeToken(): string
    {
        return $this->postJson('/api/auth/employee/login', [
            'username' => 'inventory_mgr',
            'password' => 'Staff@041',
        ])->assertOk()->json('data.token');
    }
}
