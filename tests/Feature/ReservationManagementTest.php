<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Order;
use App\Models\ReservationOrder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReservationManagementTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    public function test_order_manager_can_load_reservations_and_check_table_conflicts(): void
    {
        $this->travelTo(now()->startOfDay()->addHours(12));

        $customer = Customer::create([
            'name' => 'Reservation Dashboard Customer',
            'email' => 'reservation-dashboard@example.test',
            'status' => Customer::STATUS_REGISTERED,
        ]);

        $expired = $this->createReservation($customer, 1, now()->subHours(2));
        $upcoming = $this->createReservation($customer, 2, now()->addHours(2));

        $login = $this->postJson('/api/auth/employee/login', [
            'username' => 'order_mgr',
            'password' => 'Staff@041',
        ])->assertOk();

        $token = $login->json('data.token');

        $this->withToken($token)
            ->getJson('/api/orders/reservations/today')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.pending.0.id', $upcoming->id);

        $this->assertSame(
            ReservationOrder::STATUS_NO_SHOW,
            $expired->fresh()->status
        );

        $this->withToken($token)
            ->getJson('/api/orders/reservations/table/2/availability?'.http_build_query([
                'reservation_time' => now()->addHours(2)->toIso8601String(),
                'duration_minutes' => 60,
            ]))
            ->assertOk()
            ->assertJsonPath('data.is_available', false);
    }

    private function createReservation(Customer $customer, int $tableNumber, $reservationTime): ReservationOrder
    {
        $order = Order::create([
            'customer_id' => $customer->id,
            'type' => Order::TYPE_RESERVATION,
            'status' => Order::STATUS_PENDING,
            'total_price' => 100,
            'discount' => 0,
            'final_price' => 100,
        ]);

        return ReservationOrder::create([
            'order_id' => $order->id,
            'table_number' => $tableNumber,
            'table_type' => ReservationOrder::TABLE_NORMAL,
            'seats_count' => 2,
            'reservation_time' => $reservationTime,
            'duration_minutes' => 60,
            'status' => ReservationOrder::STATUS_PENDING,
        ]);
    }
}
