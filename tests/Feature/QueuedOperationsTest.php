<?php

namespace Tests\Feature;

use App\Jobs\BroadcastCustomerAnnouncement;
use App\Jobs\BroadcastNewProduct;
use App\Jobs\GenerateDailyAiReport;
use App\Jobs\GenerateFinancialReport;
use App\Models\AiConversation;
use App\Models\Customer;
use App\Models\Employee;
use App\Models\Notification;
use App\Models\Product;
use App\Notifications\CustomerResetPasswordNotification;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class QueuedOperationsTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    public function test_bulk_notifications_and_reports_are_dispatched_to_named_queues(): void
    {
        Queue::fake();
        Customer::create([
            'name' => 'زبون الطابور',
            'email' => 'queue-customer@example.test',
            'status' => Customer::STATUS_REGISTERED,
            'loyalty_points' => 0,
        ]);

        $this->actingAs(Employee::where('username', 'inventory_mgr')->firstOrFail(), 'sanctum')
            ->postJson('/api/products', [
                'name' => 'منتج الطابور',
                'category' => 'meal',
                'price' => 100,
                'stock_quantity' => 10,
                'is_active' => true,
            ])->assertCreated();
        Queue::assertPushedOn('notifications', BroadcastNewProduct::class);

        $this->actingAs(Employee::where('username', 'admin')->firstOrFail(), 'sanctum')
            ->postJson('/api/admin/customers/broadcast', [
                'title' => 'إعلان مجدول',
                'message' => 'هذا الإعلان يُرسل من عامل الطابور.',
            ])->assertOk()->assertJsonPath('data.queued', true);
        Queue::assertPushedOn('notifications', BroadcastCustomerAnnouncement::class);

        $this->actingAs(Employee::where('username', 'finance_mgr')->firstOrFail(), 'sanctum')
            ->getJson('/api/finance/report')
            ->assertOk()
            ->assertJsonPath('data.queued', true);
        Queue::assertPushedOn('reports', GenerateFinancialReport::class);

        AiConversation::create([
            'user_message' => 'أريد وجبة',
            'ai_response' => 'تفضل اقتراحاً',
            'intent' => 'meal_suggestion',
        ]);
        $this->actingAs(Employee::where('username', 'comm_mgr')->firstOrFail(), 'sanctum')
            ->postJson('/api/ai/generate-report')
            ->assertOk()
            ->assertJsonPath('data.queued', true);
        Queue::assertPushedOn('reports', GenerateDailyAiReport::class);
    }

    public function test_password_reset_mail_uses_the_queue_and_operational_tables_exist(): void
    {
        $notification = new CustomerResetPasswordNotification('secret-token');

        $this->assertInstanceOf(ShouldQueue::class, $notification);
        $this->assertDatabaseCount('jobs', 0);
        $this->assertDatabaseCount('failed_jobs', 0);
        $this->assertDatabaseCount('job_batches', 0);
    }

    public function test_retried_bulk_notification_jobs_do_not_create_duplicates(): void
    {
        $customer = Customer::create([
            'name' => 'زبون منع التكرار',
            'email' => 'deduplication@example.test',
            'status' => Customer::STATUS_REGISTERED,
            'loyalty_points' => 0,
        ]);
        $employee = Employee::where('username', 'inventory_mgr')->firstOrFail();
        $product = Product::create([
            'name' => 'منتج منع التكرار',
            'category' => Product::CATEGORY_MEAL,
            'price' => 100,
            'stock_quantity' => 10,
            'is_active' => true,
        ]);

        $job = new BroadcastNewProduct($product->id, $employee->id);
        $job->handle();
        $job->handle();

        $this->assertSame(1, Notification::forCustomer($customer->id)
            ->byType(Notification::TYPE_NEW_PRODUCT)
            ->count());
    }

    public function test_scheduler_contains_verified_backup_and_queued_daily_report(): void
    {
        $schedule = file_get_contents(base_path('routes/console.php'));

        $this->assertStringContainsString('backup:run --verify', $schedule);
        $this->assertStringContainsString('GenerateDailyAiReport', $schedule);
        $this->assertStringContainsString("'reports'", $schedule);
        $this->assertStringContainsString('QUEUE_CONNECTION=database', file_get_contents(base_path('.env.example')));
    }
}
