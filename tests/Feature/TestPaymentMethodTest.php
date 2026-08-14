<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\LoyaltyAccount;
use App\Models\LoyaltyTransaction;
use App\Models\Notification;
use App\Models\Order;
use App\Models\PaymentAccount;
use App\Models\PaymentRecord;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TestPaymentMethodTest extends TestCase
{
    use RefreshDatabase;

    public function test_silver_customer_receives_the_configured_earning_multiplier(): void
    {
        $customer = Customer::create([
            'name' => 'Silver Customer',
            'email' => 'silver@example.test',
            'status' => Customer::STATUS_REGISTERED,
            'loyalty_points' => 400,
        ]);
        LoyaltyAccount::create([
            'customer_id' => $customer->id,
            'points_balance' => 400,
            'tier' => LoyaltyAccount::TIER_SILVER,
            'total_points_earned' => 400,
            'total_points_redeemed' => 0,
        ]);
        $order = Order::create([
            'customer_id' => $customer->id,
            'type' => Order::TYPE_NORMAL,
            'status' => Order::STATUS_PENDING,
            'total_price' => 280,
            'discount' => 0,
            'final_price' => 280,
        ]);

        $this->actingAs($customer, 'sanctum')
            ->postJson("/api/customer/orders/{$order->id}/pay", [
                'method' => PaymentRecord::METHOD_TEST_PAYMENT,
            ])
            ->assertOk()
            ->assertJsonPath('data.loyalty_points_earned', 33);

        $this->assertDatabaseHas('loyalty_accounts', [
            'customer_id' => $customer->id,
            'points_balance' => 433,
            'tier' => LoyaltyAccount::TIER_SILVER,
        ]);
        $this->assertDatabaseHas('loyalty_transactions', [
            'order_id' => $order->id,
            'points' => 33,
            'type' => LoyaltyTransaction::TYPE_EARNING,
        ]);
    }

    public function test_test_payment_completes_payment_and_awards_loyalty_points_once(): void
    {
        $customer = Customer::create([
            'name' => 'Test Payment Customer',
            'email' => 'test-payment@example.test',
            'status' => Customer::STATUS_REGISTERED,
            'loyalty_points' => 0,
        ]);
        $order = Order::create([
            'customer_id' => $customer->id,
            'type' => Order::TYPE_NORMAL,
            'status' => Order::STATUS_PENDING,
            'total_price' => 281,
            'discount' => 0,
            'final_price' => 281,
        ]);

        $this->actingAs($customer, 'sanctum')
            ->postJson("/api/customer/orders/{$order->id}/pay", [
                'method' => PaymentRecord::METHOD_TEST_PAYMENT,
            ])
            ->assertOk()
            ->assertJsonPath('data.payment.method', PaymentRecord::METHOD_TEST_PAYMENT)
            ->assertJsonPath('data.payment.status', PaymentRecord::STATUS_COMPLETED)
            ->assertJsonPath('data.loyalty_points_earned', 28);

        $this->assertDatabaseHas('payment_records', [
            'order_id' => $order->id,
            'method' => PaymentRecord::METHOD_TEST_PAYMENT,
            'status' => PaymentRecord::STATUS_COMPLETED,
            'amount' => 281,
        ]);
        $this->assertDatabaseHas('loyalty_accounts', [
            'customer_id' => $customer->id,
            'points_balance' => 28,
            'total_points_earned' => 28,
        ]);
        $this->assertDatabaseHas('loyalty_transactions', [
            'order_id' => $order->id,
            'points' => 28,
            'type' => LoyaltyTransaction::TYPE_EARNING,
        ]);
        $this->assertDatabaseHas('notifications', [
            'receiver_type' => Notification::RECEIVER_CUSTOMER,
            'receiver_id' => $customer->id,
            'type' => Notification::TYPE_PAYMENT_UPDATE,
        ]);
        $this->assertSame(Order::STATUS_PENDING, $order->fresh()->status);

        $this->actingAs($customer, 'sanctum')
            ->postJson("/api/customer/orders/{$order->id}/pay", [
                'method' => PaymentRecord::METHOD_TEST_PAYMENT,
            ])
            ->assertStatus(400)
            ->assertJsonPath('success', false);

        $this->assertSame(1, PaymentRecord::where('order_id', $order->id)->count());
        $this->assertSame(1, LoyaltyTransaction::where('order_id', $order->id)
            ->where('type', LoyaltyTransaction::TYPE_EARNING)
            ->count());
        $this->assertSame(28, LoyaltyAccount::where('customer_id', $customer->id)->value('points_balance'));

        $this->actingAs($customer, 'sanctum')
            ->deleteJson("/api/customer/orders/{$order->id}")
            ->assertOk()
            ->assertJsonPath('data.refund.kind', 'test_payment')
            ->assertJsonPath('data.refund.loyalty_points_reversed', 28);

        $this->assertDatabaseHas('payment_records', [
            'order_id' => $order->id,
            'status' => PaymentRecord::STATUS_REFUNDED,
        ]);
        $this->assertDatabaseHas('loyalty_accounts', [
            'customer_id' => $customer->id,
            'points_balance' => 0,
            'total_points_earned' => 0,
        ]);
        $this->assertDatabaseHas('loyalty_transactions', [
            'order_id' => $order->id,
            'points' => -28,
            'type' => LoyaltyTransaction::TYPE_ADJUSTMENT,
        ]);
    }

    public function test_test_payment_is_exposed_only_outside_production(): void
    {
        $this->getJson('/api/public/pricing')
            ->assertOk()
            ->assertJsonPath('data.payment.test_mode_enabled', true);

        $customer = Customer::create([
            'name' => 'Production Guard Customer',
            'email' => 'production-guard@example.test',
            'status' => Customer::STATUS_REGISTERED,
        ]);
        $order = Order::create([
            'customer_id' => $customer->id,
            'type' => Order::TYPE_NORMAL,
            'status' => Order::STATUS_PENDING,
            'total_price' => 100,
            'discount' => 0,
            'final_price' => 100,
        ]);

        config(['app.env' => 'production']);

        $this->actingAs($customer, 'sanctum')
            ->postJson("/api/customer/orders/{$order->id}/pay", [
                'method' => PaymentRecord::METHOD_TEST_PAYMENT,
            ])
            ->assertForbidden()
            ->assertJsonPath('success', false);

        $this->assertDatabaseMissing('payment_records', [
            'order_id' => $order->id,
        ]);
    }

    public function test_cancelling_loyalty_payment_restores_used_points_without_counting_them_as_earned(): void
    {
        [$customer, $order] = $this->customerAndOrder('loyalty-refund@example.test', 280, 100);
        $customer->ensureLoyaltyAccount();

        $this->actingAs($customer, 'sanctum')
            ->postJson("/api/customer/orders/{$order->id}/pay", [
                'method' => PaymentRecord::METHOD_LOYALTY_POINTS,
            ])
            ->assertOk()
            ->assertJsonPath('data.payment.points_used', 28);

        $this->assertSame(72, $customer->loyaltyAccount()->value('points_balance'));

        $this->actingAs($customer, 'sanctum')
            ->deleteJson("/api/customer/orders/{$order->id}")
            ->assertOk()
            ->assertJsonPath('data.refund.kind', 'loyalty_points')
            ->assertJsonPath('data.refund.loyalty_points_restored', 28);

        $loyalty = $customer->loyaltyAccount()->firstOrFail();
        $this->assertSame(100, $loyalty->points_balance);
        $this->assertSame(100, $loyalty->total_points_earned);
        $this->assertSame(0, $loyalty->total_points_redeemed);
        $this->assertDatabaseHas('loyalty_transactions', [
            'order_id' => $order->id,
            'points' => 28,
            'type' => LoyaltyTransaction::TYPE_ADJUSTMENT,
        ]);
    }

    public function test_cancelling_uncollected_cash_payment_does_not_change_loyalty_points(): void
    {
        [$customer, $order] = $this->customerAndOrder('cash-cancel@example.test', 280);

        $this->actingAs($customer, 'sanctum')
            ->postJson("/api/customer/orders/{$order->id}/pay", [
                'method' => PaymentRecord::METHOD_CASH,
            ])
            ->assertOk()
            ->assertJsonPath('data.payment.status', PaymentRecord::STATUS_PENDING);

        $this->actingAs($customer, 'sanctum')
            ->postJson("/api/customer/orders/{$order->id}/pay", [
                'method' => PaymentRecord::METHOD_CASH,
            ])
            ->assertStatus(400);
        $this->assertSame(1, PaymentRecord::where('order_id', $order->id)->count());

        $this->actingAs($customer, 'sanctum')
            ->deleteJson("/api/customer/orders/{$order->id}")
            ->assertOk()
            ->assertJsonPath('data.refund.kind', 'uncollected_cash')
            ->assertJsonPath('data.refund.money_refunded', 0);

        $this->assertDatabaseHas('payment_records', [
            'order_id' => $order->id,
            'method' => PaymentRecord::METHOD_CASH,
            'status' => PaymentRecord::STATUS_REFUNDED,
        ]);
        $this->assertDatabaseMissing('loyalty_transactions', [
            'order_id' => $order->id,
        ]);
    }

    public function test_cancelling_electronic_payment_reverses_points_and_payment_account_balance(): void
    {
        [$customer, $order] = $this->customerAndOrder('electronic-refund@example.test', 280);
        $account = PaymentAccount::create([
            'type' => PaymentRecord::METHOD_SHAM_CASH,
            'account_name' => 'Sham Test Account',
            'account_number' => 'TEST-SHAM-1',
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
        $loyalty = $customer->ensureLoyaltyAccount();
        $loyalty->addPoints(28, 'Order Payment');
        LoyaltyTransaction::create([
            'loyalty_account_id' => $loyalty->id,
            'order_id' => $order->id,
            'points' => 28,
            'type' => LoyaltyTransaction::TYPE_EARNING,
            'description' => "نقاط طلب #{$order->id}",
        ]);

        $this->assertSame(280.0, $account->fresh()->current_balance);
        $this->assertSame(28, $customer->loyaltyAccount()->value('points_balance'));

        $this->actingAs($customer, 'sanctum')
            ->deleteJson("/api/customer/orders/{$order->id}")
            ->assertOk()
            ->assertJsonPath('data.refund.kind', 'electronic_payment')
            ->assertJsonPath('data.refund.money_refunded', 280)
            ->assertJsonPath('data.refund.financial_balance_reversed', true);

        $this->assertSame(0.0, $account->fresh()->current_balance);
        $this->assertSame(0, $customer->loyaltyAccount()->value('points_balance'));
        $this->assertDatabaseHas('payment_records', [
            'order_id' => $order->id,
            'payment_account_id' => $account->id,
            'method' => PaymentRecord::METHOD_SHAM_CASH,
            'status' => PaymentRecord::STATUS_REFUNDED,
        ]);
    }

    private function customerAndOrder(string $email, float $amount, int $loyaltyPoints = 0): array
    {
        $customer = Customer::create([
            'name' => 'Payment Refund Customer',
            'email' => $email,
            'status' => Customer::STATUS_REGISTERED,
            'loyalty_points' => $loyaltyPoints,
        ]);
        $order = Order::create([
            'customer_id' => $customer->id,
            'type' => Order::TYPE_NORMAL,
            'status' => Order::STATUS_PENDING,
            'total_price' => $amount,
            'discount' => 0,
            'final_price' => $amount,
        ]);

        return [$customer, $order];
    }
}
