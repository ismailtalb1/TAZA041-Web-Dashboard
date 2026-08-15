<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Report;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ReportArchiveWorkflowTest extends TestCase
{
    use RefreshDatabase;

    public function test_general_manager_has_separate_active_and_archived_report_lists(): void
    {
        $generalManager = $this->employee(Employee::ROLE_GENERAL_MANAGER, 'report-gm');
        $sender = $this->employee(Employee::ROLE_ORDER_MANAGER, 'report-sender');

        $active = $this->report($sender, $generalManager, Report::STATUS_SENT, 'Active report');
        $archived = $this->report($sender, $generalManager, Report::STATUS_ARCHIVED, 'Archived report');

        $this->actingAs($generalManager, 'sanctum')
            ->getJson('/api/admin/reports')
            ->assertOk()
            ->assertJsonCount(1, 'data.reports')
            ->assertJsonPath('data.reports.0.id', $active->id)
            ->assertJsonPath('data.stats.active_total', 1)
            ->assertJsonPath('data.stats.archive_total', 1);

        $this->getJson('/api/admin/reports?record_state=archived')
            ->assertOk()
            ->assertJsonCount(1, 'data.reports')
            ->assertJsonPath('data.reports.0.id', $archived->id);
    }

    public function test_archiving_moves_report_and_restoring_returns_its_review_state(): void
    {
        $generalManager = $this->employee(Employee::ROLE_GENERAL_MANAGER, 'archive-gm');
        $sender = $this->employee(Employee::ROLE_FINANCE_MANAGER, 'archive-sender');
        $report = $this->report($sender, $generalManager, Report::STATUS_REVIEWED, 'Reviewed report');
        $report->update(['reviewed_at' => now()]);

        $this->actingAs($generalManager, 'sanctum')
            ->putJson("/api/employee/reports/{$report->id}/archive")
            ->assertOk();

        $this->assertSame(Report::STATUS_ARCHIVED, $report->fresh()->status);
        $this->getJson('/api/admin/reports')
            ->assertOk()
            ->assertJsonCount(0, 'data.reports');

        $this->getJson('/api/admin/reports?record_state=archived')
            ->assertOk()
            ->assertJsonPath('data.reports.0.id', $report->id);

        $this->putJson("/api/employee/reports/{$report->id}/restore")
            ->assertOk()
            ->assertJsonPath('data.report.status', Report::STATUS_REVIEWED);

        $this->assertSame(Report::STATUS_REVIEWED, $report->fresh()->status);
    }

    public function test_report_cards_are_collapsible_and_archive_has_its_own_control(): void
    {
        $html = file_get_contents(public_path('dashboard/general-manager.html'));
        $javascript = file_get_contents(public_path('dashboard/assets/js/pages/general-manager/reports.js'));

        $this->assertStringContainsString('id="reports-view-archived"', $html);
        $this->assertStringContainsString('class="report-collapsible"', $javascript);
        $this->assertStringContainsString('aria-expanded="false"', $javascript);
        $this->assertStringContainsString('function toggleReportCard', $javascript);
        $this->assertStringContainsString('TAZA.API.REPORTS.RESTORE', $javascript);
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

    private function report(
        Employee $sender,
        Employee $receiver,
        string $status,
        string $title,
    ): Report {
        return Report::create([
            'title' => $title,
            'description' => 'Report summary',
            'content' => 'Full report content',
            'sender_id' => $sender->id,
            'receiver_id' => $receiver->id,
            'report_type' => Report::TYPE_GENERAL,
            'status' => $status,
        ]);
    }
}
