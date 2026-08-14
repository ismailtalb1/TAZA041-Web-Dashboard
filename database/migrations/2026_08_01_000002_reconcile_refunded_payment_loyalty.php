<?php

use App\Models\LoyaltyAccount;
use App\Models\LoyaltyTransaction;
use App\Models\PaymentAccount;
use App\Models\PaymentRecord;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        PaymentRecord::query()
            ->where('status', PaymentRecord::STATUS_REFUNDED)
            ->with('order')
            ->chunkById(100, function ($payments) {
                foreach ($payments as $payment) {
                    if (str_contains((string) $payment->notes, 'تم الاسترداد وإلغاء الأثر الولائي')) {
                        continue;
                    }

                    DB::transaction(function () use ($payment) {
                        $customerId = $payment->order?->customer_id;
                        $loyalty = $customerId
                            ? LoyaltyAccount::where('customer_id', $customerId)->lockForUpdate()->first()
                            : null;

                        if ($loyalty && $payment->method === PaymentRecord::METHOD_LOYALTY_POINTS) {
                            $points = abs((int) LoyaltyTransaction::where('order_id', $payment->order_id)
                                ->where('type', LoyaltyTransaction::TYPE_REDEMPTION)
                                ->lockForUpdate()
                                ->get()
                                ->sum('points'));
                            $oldAdjustmentExists = LoyaltyTransaction::where('order_id', $payment->order_id)
                                ->where('type', LoyaltyTransaction::TYPE_ADJUSTMENT)
                                ->where('points', '>', 0)
                                ->exists();

                            if ($points > 0 && $oldAdjustmentExists) {
                                $loyalty->total_points_earned = max(0, $loyalty->total_points_earned - $points);
                                $loyalty->total_points_redeemed = max(0, $loyalty->total_points_redeemed - $points);
                                $loyalty->updateTier();
                                $loyalty->save();
                                $loyalty->syncCustomerPoints();
                            } elseif ($points > 0) {
                                $loyalty->restoreRedeemedPoints($points);
                                LoyaltyTransaction::create([
                                    'loyalty_account_id' => $loyalty->id,
                                    'order_id' => $payment->order_id,
                                    'points' => $points,
                                    'type' => LoyaltyTransaction::TYPE_ADJUSTMENT,
                                    'description' => "إعادة نقاط الدفع بعد استرداد الطلب #{$payment->order_id}",
                                ]);
                            }
                        } elseif ($loyalty) {
                            $points = (int) LoyaltyTransaction::where('order_id', $payment->order_id)
                                ->where('type', LoyaltyTransaction::TYPE_EARNING)
                                ->lockForUpdate()
                                ->get()
                                ->sum('points');
                            $reversalExists = LoyaltyTransaction::where('order_id', $payment->order_id)
                                ->where('type', LoyaltyTransaction::TYPE_ADJUSTMENT)
                                ->where('points', '<', 0)
                                ->exists();

                            if ($points > 0 && ! $reversalExists) {
                                $loyalty->reverseEarnedPoints($points);
                                LoyaltyTransaction::create([
                                    'loyalty_account_id' => $loyalty->id,
                                    'order_id' => $payment->order_id,
                                    'points' => -$points,
                                    'type' => LoyaltyTransaction::TYPE_ADJUSTMENT,
                                    'description' => "عكس نقاط الطلب المسترد #{$payment->order_id}",
                                ]);
                            }
                        }

                        if (in_array($payment->method, [
                            PaymentRecord::METHOD_SYRIATEL_CASH,
                            PaymentRecord::METHOD_SHAM_CASH,
                        ], true)) {
                            $account = $payment->payment_account_id
                                ? PaymentAccount::whereKey($payment->payment_account_id)->lockForUpdate()->first()
                                : PaymentAccount::where('type', $payment->method)
                                    ->orderByDesc('is_primary')
                                    ->orderByDesc('current_balance')
                                    ->lockForUpdate()
                                    ->first();

                            if ($account) {
                                $account->current_balance = max(0, $account->current_balance - $payment->amount);
                                $account->save();
                            }
                        }

                        $payment->update([
                            'notes' => trim(($payment->notes ? $payment->notes."\n" : '').'تم الاسترداد وإلغاء الأثر الولائي'),
                        ]);
                    });
                }
            });
    }

    public function down(): void
    {
        // Data reconciliation is intentionally irreversible.
    }
};
