<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Employee;
use App\Models\LoyaltyAccount;
use App\Models\Offer;
use App\Models\Order;
use App\Models\Product;
use App\Models\ReservationOrder;
use App\Models\RestaurantInfo;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ApplicationTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    public function test_customer_and_dashboard_pages_are_available(): void
    {
        $this->get('/')->assertRedirect('/frontend/index.html');
        $this->get('/dashboard')->assertRedirect('/dashboard/index.html');
    }

    public function test_public_api_and_health_check_work_on_a_fresh_database(): void
    {
        $this->getJson('/api/health')
            ->assertOk()
            ->assertJsonPath('status', 'ok')
            ->assertJsonPath('database', 'connected');

        $this->getJson('/api/public/restaurant')->assertOk()->assertJsonPath('success', true);
        $this->getJson('/api/public/products')->assertOk()->assertJsonPath('success', true);
        $this->getJson('/api/public/offers')->assertOk()->assertJsonPath('success', true);
        $this->getJson('/api/public/pricing')
            ->assertOk()
            ->assertJsonPath('data.loyalty.points_per_10_syp', 1)
            ->assertJsonPath('data.loyalty.description', 'نقطة أساسية لكل 10 ل.س مشتريات، مع مضاعف حسب المستوى')
            ->assertJsonPath('data.loyalty.tiers.0.earning_multiplier', 1)
            ->assertJsonPath('data.loyalty.tiers.1.minimum_points', 400)
            ->assertJsonPath('data.loyalty.tiers.1.earning_multiplier', 1.2)
            ->assertJsonPath('data.loyalty.tiers.2.minimum_points', 700)
            ->assertJsonPath('data.loyalty.tiers.2.earning_multiplier', 1.5)
            ->assertJsonPath('data.loyalty.tiers.3.minimum_points', 1000)
            ->assertJsonPath('data.loyalty.tiers.3.earning_multiplier', 2);
    }

    public function test_live_customer_data_uses_a_revision_and_returns_only_when_changed(): void
    {
        $first = $this->getJson('/api/public/live-data')
            ->assertOk()
            ->assertJsonPath('data.changed', true)
            ->assertJsonStructure([
                'data' => ['revision', 'restaurant', 'images', 'products', 'offers', 'pricing'],
            ]);

        $revision = $first->json('data.revision');

        $this->getJson('/api/public/live-data?since='.urlencode($revision))
            ->assertOk()
            ->assertJsonPath('data.changed', false)
            ->assertJsonPath('data.revision', $revision)
            ->assertJsonMissingPath('data.products');

        $product = Product::active()->firstOrFail();
        $product->update(['stock_quantity' => max(0, $product->stock_quantity - 1)]);

        $this->getJson('/api/public/live-data?since='.urlencode($revision))
            ->assertOk()
            ->assertJsonPath('data.changed', true)
            ->assertJsonFragment([
                'id' => $product->id,
                'stock_quantity' => $product->stock_quantity,
            ]);
    }

    public function test_loyalty_applies_tier_multipliers_to_base_points(): void
    {
        $this->assertSame(0, LoyaltyAccount::calculatePointsFromAmount(9));
        $this->assertSame(1, LoyaltyAccount::calculatePointsFromAmount(10));
        $this->assertSame(28, LoyaltyAccount::calculatePointsFromAmount(280));
        $this->assertSame(10, LoyaltyAccount::calculatePointsFromAmount(100, LoyaltyAccount::TIER_BRONZE));
        $this->assertSame(12, LoyaltyAccount::calculatePointsFromAmount(100, LoyaltyAccount::TIER_SILVER));
        $this->assertSame(15, LoyaltyAccount::calculatePointsFromAmount(100, LoyaltyAccount::TIER_GOLD));
        $this->assertSame(20, LoyaltyAccount::calculatePointsFromAmount(100, LoyaltyAccount::TIER_PLATINUM));
        $this->assertSame(28, LoyaltyAccount::calculateRedemptionPoints(280));
        $this->assertSame(29, LoyaltyAccount::calculateRedemptionPoints(281));
    }

    public function test_general_manager_can_update_loyalty_multipliers_and_they_apply_immediately(): void
    {
        $manager = Employee::where('role', Employee::ROLE_GENERAL_MANAGER)->firstOrFail();

        $this->actingAs($manager, 'sanctum')
            ->putJson('/api/loyalty/settings', [
                'multipliers' => [
                    'bronze' => 1,
                    'silver' => 1.4,
                    'gold' => 1.8,
                    'platinum' => 2.5,
                ],
            ])
            ->assertOk()
            ->assertJsonPath('data.tier_multipliers.silver', 1.4)
            ->assertJsonPath('data.tier_catalog.3.earning_multiplier', 2.5);

        $this->assertSame(14, LoyaltyAccount::calculatePointsFromAmount(
            100,
            LoyaltyAccount::TIER_SILVER
        ));
        $this->assertSame(25, LoyaltyAccount::calculatePointsFromAmount(
            100,
            LoyaltyAccount::TIER_PLATINUM
        ));
        $this->assertSame(1.8, RestaurantInfo::getInstance()
            ->fresh()
            ->loyalty_tier_multipliers['gold']);

        $this->getJson('/api/public/pricing')
            ->assertOk()
            ->assertJsonPath('data.loyalty.tiers.1.earning_multiplier', 1.4)
            ->assertJsonPath('data.loyalty.tiers.2.earning_multiplier', 1.8);
    }

    public function test_only_general_manager_can_update_loyalty_multipliers(): void
    {
        $finance = Employee::where('role', Employee::ROLE_FINANCE_MANAGER)->firstOrFail();

        $this->actingAs($finance, 'sanctum')
            ->putJson('/api/loyalty/settings', [
                'multipliers' => LoyaltyAccount::TIER_MULTIPLIERS,
            ])
            ->assertForbidden();
    }

    public function test_public_menu_keeps_active_out_of_stock_products_visible(): void
    {
        $initialActiveCount = Product::active()->count();
        $available = Product::create([
            'name' => 'Available Meal',
            'description' => 'Available test meal',
            'category' => Product::CATEGORY_MEAL,
            'price' => 100,
            'stock_quantity' => 5,
            'is_active' => true,
        ]);
        $outOfStock = Product::create([
            'name' => 'Out of Stock Meal',
            'description' => 'Visible but unavailable test meal',
            'category' => Product::CATEGORY_MEAL,
            'price' => 120,
            'stock_quantity' => 0,
            'is_active' => true,
        ]);
        Product::create([
            'name' => 'Inactive Meal',
            'description' => 'Hidden test meal',
            'category' => Product::CATEGORY_MEAL,
            'price' => 90,
            'stock_quantity' => 5,
            'is_active' => false,
        ]);

        $this->getJson('/api/public/products')
            ->assertOk()
            ->assertJsonPath('data.total', $initialActiveCount + 2)
            ->assertJsonFragment(['id' => $available->id, 'is_available' => true])
            ->assertJsonFragment(['id' => $outOfStock->id, 'is_available' => false])
            ->assertJsonMissing(['name' => 'Inactive Meal']);

        $this->getJson('/api/public/products/'.$outOfStock->id)
            ->assertOk()
            ->assertJsonPath('data.product.is_available', false);
    }

    public function test_seeded_catalog_uses_real_orderable_ids_and_bilingual_content(): void
    {
        $product = Product::where('name_en', 'Crispy Meal')->firstOrFail();
        $offer = Offer::where('name_en', 'Pizza Today Offer')->with('products')->firstOrFail();

        $this->assertIsInt($product->id);
        $this->assertSame('وجبة كرسبي', $product->name_ar);
        $this->assertSame('Crispy Meal', $product->name_en);
        $this->assertSame(280.0, $product->price);
        $this->assertTrue($product->isAvailable());
        $this->assertCount(2, $offer->products);
        $this->assertTrue($offer->isCurrentlyActive());

        $this->getJson('/api/public/products')
            ->assertOk()
            ->assertJsonFragment([
                'id' => $product->id,
                'name_ar' => 'وجبة كرسبي',
                'name_en' => 'Crispy Meal',
            ]);
    }

    public function test_order_stock_errors_use_the_product_name_and_a_clear_quantity_message(): void
    {
        $registration = $this->postJson('/api/customer/auth/register', [
            'name' => 'Stock Message Customer',
            'email' => 'stock-message@example.test',
            'password' => 'password',
            'password_confirmation' => 'password',
        ])->assertCreated();
        $token = $registration->json('data.token');

        $product = Product::create([
            'name' => 'وجبة الاختبار المحدودة',
            'category' => Product::CATEGORY_MEAL,
            'price' => 100,
            'stock_quantity' => 1,
            'is_active' => true,
        ]);

        $payload = [
            'type' => 'normal',
            'items' => [[
                'item_type' => 'product',
                'reference_id' => $product->id,
                'quantity' => 2,
            ]],
        ];

        $this->withToken($token)
            ->postJson('/api/customer/orders', $payload)
            ->assertBadRequest()
            ->assertJsonPath(
                'message',
                'لا يمكن إضافة هذه الكمية من «وجبة الاختبار المحدودة». المتوفر في المطعم حالياً 1 فقط؛ خفّض الكمية ثم حاول مجدداً'
            );

        $product->update(['stock_quantity' => 0]);
        $payload['items'][0]['quantity'] = 1;

        $response = $this->withToken($token)
            ->postJson('/api/customer/orders', $payload)
            ->assertBadRequest()
            ->assertJsonPath(
                'message',
                '«وجبة الاختبار المحدودة» غير متوفر حالياً. اختر وجبة أخرى أو حاول لاحقاً'
            );

        $this->assertStringNotContainsString('رقم', $response->json('message'));
    }

    public function test_seeded_employee_can_log_in_and_use_an_authenticated_route(): void
    {
        $login = $this->postJson('/api/auth/employee/login', [
            'username' => 'admin',
            'password' => 'Admin@041',
        ])->assertOk()->assertJsonPath('success', true);

        $token = $login->json('data.token');

        $this->withToken($token)
            ->getJson('/api/auth/employee/me')
            ->assertOk()
            ->assertJsonPath('data.employee.role', 'general_manager');
    }

    public function test_communication_manager_controls_about_content_contact_details_and_footer_links(): void
    {
        $communicationLogin = $this->postJson('/api/auth/employee/login', [
            'username' => 'comm_mgr',
            'password' => 'Staff@041',
        ])->assertOk();
        $communicationToken = $communicationLogin->json('data.token');

        $payload = [
            'phone' => '+963 944 111 222',
            'whatsapp' => '+963 944 111 222',
            'email' => 'hello@taza041.test',
            'address' => 'Latakia - Agriculture Street',
            'latitude' => 35.5317123,
            'longitude' => 35.7901456,
            'instagram_url' => 'https://instagram.com/taza041',
            'telegram_url' => 'https://t.me/taza041',
            'website_content' => [
                'hero_title_ar' => 'عنوان يديره مدير التواصل',
                'hero_title_en' => 'A communication-managed title',
                'footer_description_ar' => 'وصف فوتر قابل للتعديل',
                'footer_description_en' => 'Editable footer description',
                'footer_links' => [
                    [
                        'label_ar' => 'تواصل معنا',
                        'label_en' => 'Contact us',
                        'url' => 'about.html#visit-us',
                    ],
                ],
            ],
        ];

        $this->withToken($communicationToken)
            ->putJson('/api/communication/restaurant', $payload)
            ->assertOk()
            ->assertJsonPath('data.restaurant.website_content.hero_title_ar', 'عنوان يديره مدير التواصل')
            ->assertJsonPath('data.restaurant.website_content.footer_links.0.url', 'about.html#visit-us');

        $this->getJson('/api/public/restaurant')
            ->assertOk()
            ->assertJsonPath('data.restaurant.phone', '+963 944 111 222')
            ->assertJsonPath('data.restaurant.latitude', 35.5317123)
            ->assertJsonPath('data.restaurant.longitude', 35.7901456)
            ->assertJsonPath('data.restaurant.social_links.telegram', 'https://t.me/taza041')
            ->assertJsonPath('data.restaurant.website_content.footer_description_en', 'Editable footer description')
            ->assertJsonPath('data.restaurant.website_content.footer_links.0.label_ar', 'تواصل معنا');

        $this->withToken($communicationToken)
            ->putJson('/api/communication/restaurant', [
                'website_content' => [
                    'footer_links' => [[
                        'label_ar' => 'غير آمن',
                        'label_en' => 'Unsafe',
                        'url' => 'javascript:alert(1)',
                    ]],
                ],
            ])
            ->assertStatus(422);

    }

    public function test_other_employee_roles_cannot_update_communication_content(): void
    {
        $ordersLogin = $this->postJson('/api/auth/employee/login', [
            'username' => 'order_mgr',
            'password' => 'Staff@041',
        ])->assertOk()->assertJsonPath('data.employee.role', 'order_manager');

        $this->withToken($ordersLogin->json('data.token'))
            ->putJson('/api/communication/restaurant', [
                'website_content' => [
                    'hero_title_ar' => 'تعديل غير مسموح',
                ],
            ])
            ->assertForbidden();
    }

    public function test_customer_registration_and_profile_flow_work(): void
    {
        $registration = $this->postJson('/api/customer/auth/register', [
            'name' => 'Test Customer',
            'email' => 'customer@example.test',
            'phone' => '+963900000000',
            'password' => 'password',
            'password_confirmation' => 'password',
        ])->assertCreated()->assertJsonPath('success', true);

        $token = $registration->json('data.token');

        $this->withToken($token)
            ->putJson('/api/customer/profile', [
                'name' => 'Unprotected Name Change',
            ])
            ->assertStatus(422)
            ->assertJsonPath('success', false);

        $this->withToken($token)
            ->postJson('/api/customer/avatar')
            ->assertStatus(422)
            ->assertJsonPath('success', false);

        $this->withToken($token)
            ->putJson('/api/customer/profile', [
                'name' => 'Unauthorized Name Change',
                'current_password' => 'wrong-password',
            ])
            ->assertStatus(422)
            ->assertJsonPath('success', false);

        $this->assertDatabaseMissing('customers', [
            'email' => 'customer@example.test',
            'name' => 'Unauthorized Name Change',
        ]);

        $this->withToken($token)
            ->postJson('/api/customer/avatar', [
                'current_password' => 'wrong-password',
            ])
            ->assertStatus(422)
            ->assertJsonPath('success', false);

        $this->withToken($token)
            ->getJson('/api/customer/profile')
            ->assertOk()
            ->assertJsonPath('data.customer.email', 'customer@example.test');

        $this->withToken($token)
            ->putJson('/api/customer/profile', [
                'bio' => 'Coffee lover and regular TAZA customer.',
                'date_of_birth' => '2003-02-01',
                'current_password' => 'password',
            ])
            ->assertOk()
            ->assertJsonPath('data.customer.bio', 'Coffee lover and regular TAZA customer.')
            ->assertJsonPath('data.customer.date_of_birth', '2003-02-01')
            ->assertJsonPath('data.loyalty.tier', LoyaltyAccount::TIER_BRONZE)
            ->assertJsonPath('data.loyalty.tier_catalog.1.earning_multiplier', 1.2);

        $this->withToken($token)
            ->getJson('/api/customer/profile')
            ->assertOk()
            ->assertJsonPath('data.customer.bio', 'Coffee lover and regular TAZA customer.')
            ->assertJsonPath('data.customer.date_of_birth', '2003-02-01');

        $this->assertDatabaseHas('customers', [
            'email' => 'customer@example.test',
            'bio' => 'Coffee lover and regular TAZA customer.',
        ]);

        $product = Product::where('name_en', 'Crispy Meal')->firstOrFail();

        $orderResponse = $this->withToken($token)
            ->postJson('/api/customer/orders', [
                'type' => 'normal',
                'items' => [[
                    'item_type' => 'product',
                    'reference_id' => $product->id,
                    'quantity' => 1,
                ]],
            ])
            ->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.order.items.0.reference_id', $product->id);

        $orderId = $orderResponse->json('data.order.id');
        $customer = Customer::where('email', 'customer@example.test')->firstOrFail();
        $customer->loyaltyAccount()->delete();
        $customer->update(['loyalty_points' => 100]);

        $this->withToken($token)
            ->postJson("/api/customer/orders/{$orderId}/pay", [
                'method' => 'syriatel_cash',
                'phone' => '0999999999',
                'pin_code' => '1234',
            ])
            ->assertStatus(423)
            ->assertJsonPath('success', false);

        $this->withToken($token)
            ->postJson("/api/customer/orders/{$orderId}/pay", [
                'method' => 'loyalty_points',
                'points_required' => 1,
            ])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.payment.points_used', 28)
            ->assertJsonPath('data.payment.remaining_balance', 72);

        $this->assertDatabaseHas('loyalty_accounts', [
            'customer_id' => $customer->id,
            'points_balance' => 72,
        ]);
    }

    public function test_every_order_type_keeps_customer_cancellation_pending_and_allows_manager_cancellation_during_preparation(): void
    {
        $customer = Customer::create([
            'name' => 'Flow Test Customer',
            'email' => 'flow@example.test',
            'status' => Customer::STATUS_REGISTERED,
        ]);

        foreach ([Order::TYPE_NORMAL, Order::TYPE_DELIVERY, Order::TYPE_RESERVATION] as $type) {
            $order = Order::create([
                'customer_id' => $customer->id,
                'type' => $type,
                'status' => Order::STATUS_PENDING,
                'total_price' => 100,
                'final_price' => 100,
            ]);

            $this->assertTrue($order->canChangeStatus('customer', Order::STATUS_CANCELLED));
            $this->assertTrue($order->canChangeStatus('order_manager', Order::STATUS_CANCELLED));
            $this->assertTrue($order->changeStatus(Order::STATUS_CONFIRMED, 'order_manager'));
            $this->assertFalse($order->canChangeStatus('customer', Order::STATUS_CANCELLED));
            $this->assertTrue($order->canChangeStatus('order_manager', Order::STATUS_CANCELLED));
            $this->assertTrue($order->changeStatus(Order::STATUS_READY, 'order_manager'));
            $this->assertSame('قيد التجهيز', $order->fresh()->getStatusLabel());
            $this->assertTrue($order->canChangeStatus('order_manager', Order::STATUS_CANCELLED));
            $this->assertTrue($order->changeStatus(Order::STATUS_COMPLETED, 'order_manager'));
        }
    }

    public function test_reservation_session_starts_only_after_preparation_and_ends_with_a_ready_table(): void
    {
        $customer = Customer::create([
            'name' => 'Reservation Test Customer',
            'email' => 'reservation@example.test',
            'status' => Customer::STATUS_REGISTERED,
        ]);
        $order = Order::create([
            'customer_id' => $customer->id,
            'type' => Order::TYPE_RESERVATION,
            'status' => Order::STATUS_PENDING,
            'total_price' => 150,
            'final_price' => 150,
        ]);
        $reservation = ReservationOrder::create([
            'order_id' => $order->id,
            'table_number' => 4,
            'table_type' => ReservationOrder::TABLE_NORMAL,
            'seats_count' => 2,
            'reservation_time' => now()->addHour(),
            'duration_minutes' => 60,
            'status' => ReservationOrder::STATUS_PENDING,
        ]);

        $order->load('reservationOrder');
        $this->assertTrue($order->changeStatus(Order::STATUS_CONFIRMED, 'order_manager'));
        $this->assertSame(ReservationOrder::STATUS_CONFIRMED, $reservation->fresh()->status);
        $this->assertFalse($reservation->fresh()->changeStatus(ReservationOrder::STATUS_SEATED, 'order_manager'));

        $this->assertTrue($order->changeStatus(Order::STATUS_READY, 'order_manager'));
        $this->assertTrue($order->changeStatus(Order::STATUS_COMPLETED, 'order_manager'));
        $this->assertSame(ReservationOrder::STATUS_CONFIRMED, $reservation->fresh()->status);

        $reservation = $reservation->fresh();
        $this->assertTrue($reservation->changeStatus(ReservationOrder::STATUS_SEATED, 'order_manager'));
        $this->assertSame('الجلسة قائمة', $reservation->fresh()->getStatusLabel());
        $this->assertTrue($reservation->fresh()->changeStatus(ReservationOrder::STATUS_COMPLETED, 'order_manager'));
        $this->assertSame('الطاولة جاهزة', $reservation->fresh()->getStatusLabel());
    }

    public function test_delivery_uses_the_shared_default_restaurant_location_when_an_old_record_has_no_coordinates(): void
    {
        $restaurant = RestaurantInfo::getInstance();
        $restaurant->update(['latitude' => null, 'longitude' => null]);

        $restaurant = RestaurantInfo::getInstance();
        $this->assertEqualsWithDelta(RestaurantInfo::DEFAULT_LATITUDE, $restaurant->latitude, 0.000001);
        $this->assertEqualsWithDelta(RestaurantInfo::DEFAULT_LONGITUDE, $restaurant->longitude, 0.000001);

        $destinationLatitude = RestaurantInfo::DEFAULT_LATITUDE + 0.01;
        $destinationLongitude = RestaurantInfo::DEFAULT_LONGITUDE;
        $quote = $this->getJson('/api/public/delivery/quote?latitude='.$destinationLatitude.'&longitude='.$destinationLongitude)
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.is_within_range', true)
            ->assertJsonPath('data.restaurant_location.latitude', RestaurantInfo::DEFAULT_LATITUDE)
            ->assertJsonPath('data.restaurant_location.longitude', RestaurantInfo::DEFAULT_LONGITUDE);

        $registration = $this->postJson('/api/customer/auth/register', [
            'name' => 'Delivery Test Customer',
            'email' => 'delivery@example.test',
            'password' => 'password',
            'password_confirmation' => 'password',
        ])->assertCreated();
        $token = $registration->json('data.token');
        $product = Product::where('name_en', 'Crispy Meal')->firstOrFail();

        $order = $this->withToken($token)->postJson('/api/customer/orders', [
            'type' => 'delivery',
            'items' => [[
                'item_type' => 'product',
                'reference_id' => $product->id,
                'quantity' => 1,
            ]],
            'delivery_address' => 'Pinned test destination',
            'latitude' => $destinationLatitude,
            'longitude' => $destinationLongitude,
        ])->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.order.type', 'delivery');

        $this->assertEqualsWithDelta(
            (float) $quote->json('data.delivery_cost'),
            (float) $order->json('data.order.delivery.delivery_cost'),
            0.01
        );
    }
}
