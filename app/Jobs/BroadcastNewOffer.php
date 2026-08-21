<?php

namespace App\Jobs;

use App\Models\Employee;
use App\Models\Notification;
use App\Models\Offer;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class BroadcastNewOffer implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 120;

    public function __construct(
        public readonly int $offerId,
        public readonly int $employeeId,
    ) {}

    public function backoff(): array
    {
        return [10, 60, 300];
    }

    public function handle(): void
    {
        $offer = Offer::with('products')->find($this->offerId);
        $employee = Employee::find($this->employeeId);

        if ($offer && $employee) {
            Notification::broadcastNewOffer($offer, $employee);
        }
    }
}
