<?php

namespace Tests\Feature;

use App\Models\Employee;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DashboardChartDataTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    public function test_general_manager_chart_endpoints_return_real_series(): void
    {
        $token = $this->employeeToken('admin', 'Admin@041');

        $this->withToken($token)
            ->getJson('/api/admin/orders/stats?period=30')
            ->assertOk()
            ->assertJsonCount(30, 'data.revenue_trend')
            ->assertJsonPath('data.period_days', 30)
            ->assertJsonStructure([
                'data' => [
                    'by_type' => ['normal', 'delivery', 'reservation'],
                    'revenue_trend' => [['date', 'label', 'revenue']],
                ],
            ]);

        $this->withToken($token)
            ->getJson('/api/products/stats')
            ->assertOk()
            ->assertJsonStructure([
                'data' => ['by_category', 'most_ordered'],
            ]);

        $this->withToken($token)
            ->getJson('/api/finance/payments/stats')
            ->assertOk()
            ->assertJsonCount(12, 'data.monthly_revenue')
            ->assertJsonStructure([
                'data' => [
                    'by_method',
                    'monthly_revenue' => [['month', 'label', 'amount']],
                ],
            ]);

        $this->withToken($token)
            ->getJson('/api/loyalty/stats')
            ->assertOk()
            ->assertJsonStructure([
                'data' => [
                    'tier_distribution' => ['bronze', 'silver', 'gold', 'platinum'],
                ],
            ]);
    }

    public function test_order_dashboard_receives_chart_ready_data(): void
    {
        $orderToken = $this->employeeToken('order_mgr', 'Staff@041');
        $this->withToken($orderToken)
            ->getJson('/api/orders/normal/stats')
            ->assertOk()
            ->assertJsonCount(14, 'data.hourly_today')
            ->assertJsonStructure([
                'data' => [
                    'hourly_today' => [['label', 'value']],
                    'status_counts' => ['pending', 'confirmed', 'ready', 'completed', 'cancelled'],
                ],
            ]);

    }

    public function test_delivery_dashboard_receives_chart_ready_data(): void
    {
        $deliveryToken = $this->employeeToken('delivery_mgr', 'Staff@041');
        $this->withToken($deliveryToken)
            ->getJson('/api/delivery/stats')
            ->assertOk()
            ->assertJsonCount(7, 'data.weekly_trend')
            ->assertJsonStructure([
                'data' => [
                    'status_counts' => ['pending', 'in_delivery', 'delivered'],
                    'weekly_trend' => [['date', 'label', 'total', 'delivered']],
                ],
            ]);

    }

    public function test_driver_dashboard_receives_a_real_weekly_trend(): void
    {
        $driver = Employee::where('username', 'driver')->firstOrFail();
        $driverToken = $this->employeeToken('driver', 'Staff@041');
        $this->withToken($driverToken)
            ->getJson('/api/delivery/driver/'.$driver->id.'/stats')
            ->assertOk()
            ->assertJsonCount(7, 'data.weekly_trend');

    }

    public function test_finance_dashboard_receives_a_real_monthly_trend(): void
    {
        $financeToken = $this->employeeToken('finance_mgr', 'Staff@041');
        $this->withToken($financeToken)
            ->getJson('/api/finance/payments/stats')
            ->assertOk()
            ->assertJsonCount(12, 'data.monthly_revenue');
    }

    private function employeeToken(string $username, string $password): string
    {
        return $this->postJson('/api/auth/employee/login', compact('username', 'password'))
            ->assertOk()
            ->json('data.token');
    }
}
