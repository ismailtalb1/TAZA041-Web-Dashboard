<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\DeliveryOrder;
use App\Models\Order;
use App\Models\Product;
use App\Models\ReservationOrder;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TableCatalogAndOrderStatusTest extends TestCase
{
    use RefreshDatabase;

    public function test_all_clients_receive_the_same_eight_table_catalogue(): void
    {
        $time = now()->addHours(2)->seconds(0);
        $response = $this->getJson('/api/public/reservations/tables?'.http_build_query([
            'reservation_time' => $time->toIso8601String(),
            'duration_minutes' => 60,
        ]))->assertOk()->assertJsonCount(8, 'data.tables');

        $tables = collect($response->json('data.tables'));
        $this->assertSame([1, 2, 3, 4, 5, 6, 7, 8], $tables->pluck('number')->all());
        $this->assertSame(['normal'], $tables->take(4)->pluck('type')->unique()->values()->all());
        $this->assertSame(['vip'], $tables->skip(4)->pluck('type')->unique()->values()->all());
        $this->assertTrue($tables->every(fn (array $table) => $table['is_available'] === true));

        $this->getJson('/api/public/reservations/table/9/availability?'.http_build_query([
            'reservation_time' => $time->toIso8601String(),
        ]))->assertNotFound();
    }

    public function test_table_catalogue_reflects_live_reservation_conflicts(): void
    {
        $customer = $this->customer();
        $time = now()->addHours(3)->seconds(0);
        $order = $this->order($customer, Order::TYPE_RESERVATION, Order::STATUS_CONFIRMED);
        ReservationOrder::create([
            'order_id' => $order->id,
            'table_number' => 5,
            'table_type' => ReservationOrder::TABLE_VIP,
            'seats_count' => 4,
            'reservation_time' => $time,
            'duration_minutes' => 60,
            'status' => ReservationOrder::STATUS_CONFIRMED,
        ]);

        $tables = collect($this->getJson('/api/public/reservations/tables?'.http_build_query([
            'reservation_time' => $time->copy()->addMinutes(30)->toIso8601String(),
        ]))->assertOk()->json('data.tables'));

        $this->assertFalse($tables->firstWhere('number', 5)['is_available']);
        $this->assertTrue($tables->firstWhere('number', 4)['is_available']);
    }

    public function test_past_times_are_rejected_by_all_public_availability_endpoints(): void
    {
        $this->travelTo(Carbon::parse('2026-08-21 12:00:00', config('app.timezone')));
        $pastTime = '2026-08-21 10:00:00';

        $this->getJson('/api/public/reservations/tables?'.http_build_query([
            'reservation_time' => $pastTime,
            'duration_minutes' => 60,
        ]))
            ->assertUnprocessable()
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'وقت الحجز يجب أن يكون في المستقبل');

        $this->getJson('/api/public/reservations/table/1/availability?'.http_build_query([
            'reservation_time' => $pastTime,
            'duration_minutes' => 60,
        ]))
            ->assertUnprocessable()
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'وقت الحجز يجب أن يكون في المستقبل');
    }

    public function test_order_payload_exposes_full_status_flow_for_each_type(): void
    {
        $customer = $this->customer();

        $normal = $this->order($customer, Order::TYPE_NORMAL, Order::STATUS_READY);
        $this->assertSame('ready', $normal->getDetails()['customer_status']['key']);
        $this->assertCount(4, $normal->getDetails()['customer_status']['steps']);

        $delivery = $this->order($customer, Order::TYPE_DELIVERY, Order::STATUS_COMPLETED);
        DeliveryOrder::create([
            'order_id' => $delivery->id,
            'delivery_address' => 'Test address',
            'status' => DeliveryOrder::STATUS_ASSIGNED,
        ]);
        $delivery->load('deliveryOrder');
        $this->assertSame('in_delivery', $delivery->getDetails()['customer_status']['key']);
        $this->assertSame(5, $delivery->getDetails()['customer_status']['current_index']);
        $this->assertCount(7, $delivery->getDetails()['customer_status']['steps']);

        $reservation = $this->order($customer, Order::TYPE_RESERVATION, Order::STATUS_COMPLETED);
        ReservationOrder::create([
            'order_id' => $reservation->id,
            'table_number' => 5,
            'table_type' => ReservationOrder::TABLE_VIP,
            'seats_count' => 4,
            'reservation_time' => now()->addHour(),
            'duration_minutes' => 60,
            'status' => ReservationOrder::STATUS_SEATED,
        ]);
        $reservation->load('reservationOrder');
        $details = $reservation->getDetails()['customer_status'];
        $this->assertSame('seated', $details['key']);
        $this->assertSame(4, $details['current_index']);
        $this->assertCount(6, $details['steps']);
    }

    public function test_reservation_creation_uses_server_table_type_and_rejects_unknown_tables(): void
    {
        $customer = $this->customer();
        $product = Product::create([
            'name' => 'Reservation test meal',
            'category' => Product::CATEGORY_MEAL,
            'price' => 100,
            'stock_quantity' => 20,
            'is_active' => true,
        ]);
        $payload = [
            'type' => 'reservation',
            'items' => [[
                'item_type' => 'product',
                'reference_id' => $product->id,
                'quantity' => 1,
            ]],
            'table_number' => 5,
            'table_type' => 'normal',
            'seats_count' => 4,
            'reservation_time' => now()->addHours(2)->toIso8601String(),
            'duration_minutes' => 60,
        ];

        $this->actingAs($customer, 'sanctum')
            ->postJson('/api/customer/orders', $payload)
            ->assertCreated()
            ->assertJsonPath('data.order.reservation.table_number', 5)
            ->assertJsonPath('data.order.reservation.table_type', 'vip');

        $this->actingAs($customer, 'sanctum')
            ->postJson('/api/customer/orders', [
                ...$payload,
                'table_number' => 9,
                'reservation_time' => now()->addHours(4)->toIso8601String(),
            ])
            ->assertUnprocessable()
            ->assertJsonPath('success', false);
    }

    private function customer(): Customer
    {
        return Customer::create([
            'name' => 'Table Status Customer',
            'email' => uniqid('tables-', true).'@example.test',
            'status' => Customer::STATUS_REGISTERED,
        ]);
    }

    private function order(Customer $customer, string $type, string $status): Order
    {
        return Order::create([
            'customer_id' => $customer->id,
            'type' => $type,
            'status' => $status,
            'total_price' => 100,
            'final_price' => 100,
        ]);
    }
}
