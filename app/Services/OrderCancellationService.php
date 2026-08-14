<?php

namespace App\Services;

use App\Models\Order;
use Illuminate\Support\Facades\DB;

class OrderCancellationService
{
    /**
     * Cancel an order and reverse every financial/inventory side effect once.
     *
     * @param  array<int, string>|null  $allowedStatuses
     */
    public function cancel(
        Order $order,
        string $actorType,
        ?int $actorId = null,
        ?string $reason = null,
        ?array $allowedStatuses = null,
    ): array {
        return DB::transaction(function () use ($order, $actorType, $actorId, $reason, $allowedStatuses) {
            $lockedOrder = Order::query()
                ->with(['customer', 'items', 'paymentRecord', 'deliveryOrder', 'reservationOrder'])
                ->lockForUpdate()
                ->findOrFail($order->id);

            // Repeated or concurrent cancellation requests must never restore stock,
            // money, or loyalty points for a second time.
            if ($lockedOrder->status === Order::STATUS_CANCELLED) {
                return [
                    'order' => $lockedOrder,
                    'refund' => $lockedOrder->cancellationRefundSummary(true),
                    'already_cancelled' => true,
                ];
            }

            if ($allowedStatuses !== null && ! in_array($lockedOrder->status, $allowedStatuses, true)) {
                throw new \DomainException(
                    "لا يمكن إلغاء طلب بحالة \"{$lockedOrder->getStatusLabel()}\""
                );
            }

            $refund = $lockedOrder->releaseCancellationResources(
                $actorType,
                $actorId,
                $reason,
            );

            $lockedOrder->forceFill(['status' => Order::STATUS_CANCELLED])->save();
            $lockedOrder->notifyCancellation();

            return [
                'order' => $lockedOrder->fresh([
                    'customer', 'items', 'paymentRecord', 'deliveryOrder', 'reservationOrder',
                ]),
                'refund' => $refund,
                'already_cancelled' => false,
            ];
        });
    }
}
