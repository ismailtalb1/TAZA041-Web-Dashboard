<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\DeliveryOrder;
use App\Models\Employee;
use App\Models\LoyaltyAccount;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\PaymentAccount;
use App\Models\PaymentRecord;
use App\Models\Product;
use App\Models\ReservationOrder;
use App\Services\OrderCancellationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class CancellationRefundWorkflowTest extends TestCase
{
    use RefreshDatabase;

    public function test_order_manager_cancellation_refunds_all_order_types(): void
    {
        $manager = $this->employee(Employee::ROLE_ORDER_MANAGER, 'refund-order-manager');

        foreach ([Order::TYPE_NORMAL, Order::TYPE_DELIVERY, Order::TYPE_RESERVATION] as $index => $type) {
            [$customer, $order] = $this->customerAndOrder("manager-{$type}@example.test", $type);
            $this->createSubtype($order);

            $this->actingAs($customer, 'sanctum')
                ->postJson("/api/customer/orders/{$order->id}/pay", [
                    'method' => PaymentRecord::METHOD_TEST_PAYMENT,
                ])
                ->assertOk();

            $order->update(['status' => Order::STATUS_CONFIRMED]);
            $pointsBefore = LoyaltyAccount::where('customer_id', $customer->id)
                ->value('points_balance');
            $this->assertGreaterThan(0, $pointsBefore);

            $this->actingAs($manager, 'sanctum')
                ->putJson("/api/orders/{$order->id}/status", ['status' => Order::STATUS_CANCELLED])
                ->assertOk()
                ->assertJsonPath('data.order.status', Order::STATUS_CANCELLED)
                ->assertJsonPath('data.refund.kind', 'test_payment')
                ->assertJsonPath('data.refund.cancelled_by.type', 'employee');

            $this->assertSame(0, LoyaltyAccount::where('customer_id', $customer->id)
                ->value('points_balance'));
            $this->assertSame(PaymentRecord::STATUS_REFUNDED, $order->paymentRecord()->value('status'));
            $this->assertSame(Order::STATUS_CANCELLED, $order->fresh()->status);

            if ($type === Order::TYPE_DELIVERY) {
                $this->assertSame(DeliveryOrder::STATUS_CANCELLED, $order->deliveryOrder()->value('status'));
            }
            if ($type === Order::TYPE_RESERVATION) {
                $this->assertSame(ReservationOrder::STATUS_CANCELLED, $order->reservationOrder()->value('status'));
            }
        }
    }

    public function test_reservation_manager_cancellation_after_confirmation_refunds_payment(): void
    {
        $manager = $this->employee(Employee::ROLE_ORDER_MANAGER, 'refund-reservation-manager');
        [$customer, $order] = $this->customerAndOrder(
            'confirmed-reservation-refund@example.test',
            Order::TYPE_RESERVATION,
        );
        $reservation = ReservationOrder::create([
            'order_id' => $order->id,
            'table_number' => 2,
            'table_type' => ReservationOrder::TABLE_NORMAL,
            'seats_count' => 3,
            'reservation_time' => now()->addDay(),
            'duration_minutes' => 60,
            'status' => ReservationOrder::STATUS_CONFIRMED,
        ]);

        $this->actingAs($customer, 'sanctum')
            ->postJson("/api/customer/orders/{$order->id}/pay", [
                'method' => PaymentRecord::METHOD_TEST_PAYMENT,
            ])->assertOk();
        $order->update(['status' => Order::STATUS_COMPLETED]);

        $this->actingAs($manager, 'sanctum')
            ->putJson("/api/orders/reservations/{$reservation->id}/status", [
                'status' => ReservationOrder::STATUS_CANCELLED,
            ])
            ->assertOk()
            ->assertJsonPath('data.reservation.status', ReservationOrder::STATUS_CANCELLED)
            ->assertJsonPath('data.refund.kind', 'test_payment');

        $this->assertSame(Order::STATUS_CANCELLED, $order->fresh()->status);
        $this->assertSame(PaymentRecord::STATUS_REFUNDED, $order->paymentRecord()->value('status'));
        $this->assertSame(0, LoyaltyAccount::where('customer_id', $customer->id)->value('points_balance'));
    }

    public function test_delivery_manager_cancellation_before_delivery_refunds_electronic_payment(): void
    {
        $manager = $this->employee(Employee::ROLE_DELIVERY_MANAGER, 'refund-delivery-manager');
        [$customer, $order] = $this->customerAndOrder(
            'active-delivery-refund@example.test',
            Order::TYPE_DELIVERY,
        );
        $delivery = DeliveryOrder::create([
            'order_id' => $order->id,
            'delivery_address' => 'Damascus',
            'status' => DeliveryOrder::STATUS_IN_DELIVERY,
        ]);

        $account = PaymentAccount::create([
            'type' => PaymentRecord::METHOD_SHAM_CASH,
            'account_name' => 'Sham refund account',
            'account_number' => 'SHAM-REFUND-1',
            'current_balance' => 280,
            'max_balance' => 10000,
            'is_active' => true,
            'is_primary' => true,
        ]);
        PaymentRecord::create([
            'order_id' => $order->id,
            'payment_account_id' => $account->id,
            'method' => PaymentRecord::METHOD_SHAM_CASH,
            'amount' => 280,
            'currency' => 'SYP',
            'status' => PaymentRecord::STATUS_COMPLETED,
        ]);
        $order->update(['status' => Order::STATUS_COMPLETED]);

        $this->actingAs($manager, 'sanctum')
            ->putJson("/api/delivery/{$delivery->id}/status", [
                'status' => DeliveryOrder::STATUS_CANCELLED,
            ])
            ->assertOk()
            ->assertJsonPath('data.delivery.status', DeliveryOrder::STATUS_CANCELLED)
            ->assertJsonPath('data.refund.kind', 'electronic_payment')
            ->assertJsonPath('data.refund.money_refunded', 280)
            ->assertJsonPath('data.refund.financial_balance_reversed', true);

        $this->assertSame(0.0, $account->fresh()->current_balance);
        $this->assertSame(Order::STATUS_CANCELLED, $order->fresh()->status);
        $this->assertSame(PaymentRecord::STATUS_REFUNDED, $order->paymentRecord()->value('status'));
    }

    public function test_repeated_cancellation_never_restores_stock_or_points_twice(): void
    {
        [$customer, $order] = $this->customerAndOrder(
            'idempotent-cancellation@example.test',
            Order::TYPE_NORMAL,
        );
        $product = Product::create([
            'name' => 'Cancellation stock item',
            'description' => 'Test product',
            'category' => 'test',
            'price' => 140,
            'stock_quantity' => 3,
            'is_active' => true,
        ]);
        OrderItem::create([
            'order_id' => $order->id,
            'item_type' => OrderItem::TYPE_PRODUCT,
            'reference_id' => $product->id,
            'quantity' => 2,
            'unit_price' => 140,
            'subtotal' => 280,
        ]);
        $this->actingAs($customer, 'sanctum')
            ->postJson("/api/customer/orders/{$order->id}/pay", [
                'method' => PaymentRecord::METHOD_TEST_PAYMENT,
            ])->assertOk();

        $service = app(OrderCancellationService::class);
        $first = $service->cancel($order, 'customer', $customer->id, null, [Order::STATUS_PENDING]);
        $second = $service->cancel($order, 'customer', $customer->id, null, [Order::STATUS_PENDING]);

        $this->assertFalse($first['already_cancelled']);
        $this->assertTrue($second['already_cancelled']);
        $this->assertSame(5, $product->fresh()->stock_quantity);
        $this->assertSame(0, LoyaltyAccount::where('customer_id', $customer->id)->value('points_balance'));
        $this->assertSame(1, $order->paymentRecord()->where('status', PaymentRecord::STATUS_REFUNDED)->count());
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

    private function customerAndOrder(string $email, string $type): array
    {
        $customer = Customer::create([
            'name' => 'Refund customer',
            'email' => $email,
            'status' => Customer::STATUS_REGISTERED,
            'loyalty_points' => 0,
        ]);
        $order = Order::create([
            'customer_id' => $customer->id,
            'type' => $type,
            'status' => Order::STATUS_PENDING,
            'total_price' => 280,
            'discount' => 0,
            'final_price' => 280,
        ]);

        return [$customer, $order];
    }

    private function createSubtype(Order $order): void
    {
        if ($order->type === Order::TYPE_DELIVERY) {
            DeliveryOrder::create([
                'order_id' => $order->id,
                'delivery_address' => 'Damascus',
                'status' => DeliveryOrder::STATUS_PENDING,
            ]);
        }
        if ($order->type === Order::TYPE_RESERVATION) {
            ReservationOrder::create([
                'order_id' => $order->id,
                'table_number' => 1,
                'table_type' => ReservationOrder::TABLE_NORMAL,
                'seats_count' => 2,
                'reservation_time' => now()->addDay(),
                'duration_minutes' => 60,
                'status' => ReservationOrder::STATUS_PENDING,
            ]);
        }
    }
}
