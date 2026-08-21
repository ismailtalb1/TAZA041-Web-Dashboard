<?php

namespace App\Jobs;

use App\Models\Employee;
use App\Models\Notification;
use App\Models\Product;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class BroadcastNewProduct implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 120;

    public function __construct(
        public readonly int $productId,
        public readonly int $employeeId,
    ) {}

    public function backoff(): array
    {
        return [10, 60, 300];
    }

    public function handle(): void
    {
        $product = Product::find($this->productId);
        $employee = Employee::find($this->employeeId);

        if ($product && $employee) {
            Notification::broadcastNewProduct($product, $employee);
        }
    }
}
