<?php

namespace App\Jobs;

use App\Models\Employee;
use App\Models\PaymentAccount;
use App\Models\PaymentRecord;
use App\Models\Report;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class GenerateFinancialReport implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 180;

    public int $uniqueFor = 300;

    public function __construct(public readonly int $employeeId) {}

    public function uniqueId(): string
    {
        return 'financial-report-'.$this->employeeId;
    }

    public function handle(): void
    {
        $employee = Employee::find($this->employeeId);
        if (! $employee) {
            return;
        }

        $month = now()->startOfMonth();
        $completed = PaymentRecord::completed();
        $content = '📊 التقرير المالي — '.now()->format('F Y')."\n";
        $content .= "━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";

        $totalRevenue = (clone $completed)->where('created_at', '>=', $month)->sum('amount');
        $content .= 'إجمالي الإيرادات هذا الشهر: '.number_format($totalRevenue, 0)." ل.س\n\n";
        $content .= "توزيع طرق الدفع:\n";

        foreach (PaymentRecord::METHOD_LABELS as $method => $label) {
            $count = (clone $completed)->byMethod($method)->where('created_at', '>=', $month)->count();
            $amount = (clone $completed)->byMethod($method)->where('created_at', '>=', $month)->sum('amount');
            if ($count > 0) {
                $content .= "  {$label}: {$count} عملية — ".number_format($amount, 0)." ل.س\n";
            }
        }

        $content .= "\nأرصدة الحسابات الحالية:\n";
        foreach (PaymentAccount::active()->get() as $account) {
            $content .= "  {$account->getTypeLabel()} — {$account->account_name}: ".
                number_format($account->current_balance, 0).' ل.س';
            if ($account->isNearCapacity()) {
                $content .= ' ⚠️ قريب من الامتلاء';
            }
            $content .= "\n";
        }

        Report::sendToGeneralManager(
            sender: $employee,
            type: Report::TYPE_FINANCIAL,
            title: 'التقرير المالي — '.now()->format('m/Y'),
            content: $content,
            description: 'تقرير مالي شهري مُولَّد تلقائياً',
        );
    }
}
