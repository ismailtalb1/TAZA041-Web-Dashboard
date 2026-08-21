<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\DeliveryOrder;
use App\Models\Employee;
use App\Models\Order;
use App\Models\Product;
use App\Models\RestaurantInfo;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DeliveryRoutingTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    protected function setUp(): void
    {
        parent::setUp();

        Cache::flush();
        config([
            'services.delivery_routing.enabled' => true,
            'services.delivery_routing.base_url' => 'https://router.test',
            'services.delivery_routing.profile' => 'driving',
        ]);
    }

    public function test_road_route_drives_quote_order_persistence_and_dashboard_filters(): void
    {
        Http::fake([
            'router.test/*' => Http::response([
                'code' => 'Ok',
                'routes' => [[
                    'distance' => 1234.0,
                    'duration' => 321.0,
                    'geometry' => [
                        'coordinates' => [
                            [35.7901, 35.5317],
                            [35.7950, 35.5360],
                            [35.8000, 35.5400],
                        ],
                    ],
                ]],
            ], 200),
        ]);

        $destinationLatitude = 35.5400;
        $destinationLongitude = 35.8000;
        $this->getJson('/api/public/delivery/quote?latitude='.$destinationLatitude.'&longitude='.$destinationLongitude)
            ->assertOk()
            ->assertJsonPath('data.distance_meters', 1234)
            ->assertJsonPath('data.delivery_cost', 61.7)
            ->assertJsonPath('data.route.provider', 'osrm')
            ->assertJsonPath('data.route.is_fallback', false)
            ->assertJsonPath('data.route.duration_seconds', 321)
            ->assertJsonCount(3, 'data.route.geometry');

        $registration = $this->postJson('/api/customer/auth/register', [
            'name' => 'Route Customer',
            'email' => 'route-customer@example.test',
            'password' => 'Password123',
            'password_confirmation' => 'Password123',
        ])->assertCreated();
        $product = Product::active()->where('stock_quantity', '>', 0)->firstOrFail();

        $response = $this->withToken($registration->json('data.token'))->postJson('/api/customer/orders', [
            'type' => 'delivery',
            'items' => [[
                'item_type' => 'product',
                'reference_id' => $product->id,
                'quantity' => 1,
            ]],
            'delivery_address' => 'Road route destination',
            'latitude' => $destinationLatitude,
            'longitude' => $destinationLongitude,
        ])->assertCreated()
            ->assertJsonPath('data.order.delivery.route.provider', 'osrm')
            ->assertJsonPath('data.order.delivery.route.is_fallback', false)
            ->assertJsonPath('data.order.delivery.route.duration_seconds', 321);

        $delivery = DeliveryOrder::findOrFail($response->json('data.order.delivery.id'));
        $this->assertSame(1234.0, $delivery->distance_meters);
        $this->assertSame(321, $delivery->route_duration_seconds);
        $this->assertSame('osrm', $delivery->route_provider);
        $this->assertFalse($delivery->route_is_fallback);
        $this->assertCount(3, $delivery->route_geometry);

        $delivery->order->update(['status' => Order::STATUS_COMPLETED]);
        $driver = Employee::where('role', Employee::ROLE_DRIVER)->firstOrFail();
        $delivery->update(['driver_id' => $driver->id]);
        $manager = Employee::where('role', Employee::ROLE_DELIVERY_MANAGER)->firstOrFail();
        Sanctum::actingAs($manager);

        $this->getJson('/api/delivery?route_quality=road&driver_id='.$driver->id.'&min_distance_km=1&max_distance_km=2')
            ->assertOk()
            ->assertJsonCount(1, 'data.deliveries')
            ->assertJsonPath('data.deliveries.0.id', $delivery->id);

        $this->getJson('/api/delivery?route_quality=fallback')
            ->assertOk()
            ->assertJsonCount(0, 'data.deliveries');
    }

    public function test_configured_maximum_uses_road_distance_and_blocks_order_creation(): void
    {
        RestaurantInfo::getInstance()->update(['max_delivery_distance_meters' => 1000]);
        Http::fake([
            'router.test/*' => Http::response([
                'code' => 'Ok',
                'routes' => [[
                    'distance' => 1050.0,
                    'duration' => 300.0,
                    'geometry' => ['coordinates' => [[35.7901, 35.5317], [35.7950, 35.5360]]],
                ]],
            ], 200),
        ]);

        $latitude = 35.5360;
        $longitude = 35.7950;
        $this->getJson('/api/public/delivery/quote?latitude='.$latitude.'&longitude='.$longitude)
            ->assertOk()
            ->assertJsonPath('data.is_within_range', false)
            ->assertJsonPath('data.max_distance_km', 1)
            ->assertJsonPath('data.delivery_cost', null);

        $registration = $this->postJson('/api/customer/auth/register', [
            'name' => 'Outside Route Customer',
            'email' => 'outside-route@example.test',
            'password' => 'Password123',
            'password_confirmation' => 'Password123',
        ])->assertCreated();
        $product = Product::active()->where('stock_quantity', '>', 0)->firstOrFail();

        $this->withToken($registration->json('data.token'))->postJson('/api/customer/orders', [
            'type' => 'delivery',
            'items' => [[
                'item_type' => 'product',
                'reference_id' => $product->id,
                'quantity' => 1,
            ]],
            'delivery_address' => 'Outside configured range',
            'latitude' => $latitude,
            'longitude' => $longitude,
        ])->assertBadRequest()
            ->assertJsonPath('message', 'الموقع المحدد يتجاوز الحد الأقصى للتوصيل (1 كم)');

        $this->assertDatabaseCount('orders', 0);
    }

    public function test_routing_failure_returns_a_safe_fallback_route(): void
    {
        Http::fake(['router.test/*' => Http::response(['code' => 'Error'], 503)]);

        $response = $this->getJson('/api/public/delivery/quote?latitude=35.536&longitude=35.795')
            ->assertOk()
            ->assertJsonPath('data.route.provider', 'haversine_fallback')
            ->assertJsonPath('data.route.is_fallback', true)
            ->assertJsonCount(2, 'data.route.geometry');

        $this->assertGreaterThan(0, (float) $response->json('data.distance_meters'));
        $this->assertGreaterThan(0, (int) $response->json('data.route.duration_seconds'));
    }

    public function test_delivery_manager_is_not_listed_or_assignable_as_a_driver(): void
    {
        $manager = Employee::where('role', Employee::ROLE_DELIVERY_MANAGER)->firstOrFail();
        $driver = Employee::where('role', Employee::ROLE_DRIVER)->firstOrFail();
        Sanctum::actingAs($manager);

        $this->getJson('/api/delivery/drivers')
            ->assertOk()
            ->assertJsonPath('data.count', 1)
            ->assertJsonPath('data.all.0.id', $driver->id)
            ->assertJsonPath('data.all.0.role', Employee::ROLE_DRIVER);

        $customer = Customer::create([
            'name' => 'Driver separation customer',
            'email' => 'driver-separation@example.test',
            'status' => Customer::STATUS_REGISTERED,
        ]);
        $order = Order::create([
            'customer_id' => $customer->id,
            'type' => Order::TYPE_DELIVERY,
            'status' => Order::STATUS_COMPLETED,
            'total_price' => 280,
            'discount' => 0,
            'final_price' => 280,
        ]);
        $delivery = DeliveryOrder::create([
            'order_id' => $order->id,
            'delivery_address' => 'Damascus',
            'status' => DeliveryOrder::STATUS_PENDING,
        ]);

        $this->putJson("/api/delivery/{$delivery->id}/assign", ['driver_id' => $manager->id])
            ->assertBadRequest()
            ->assertJsonPath('success', false);

        $this->assertNull($delivery->fresh()->driver_id);
    }
}
