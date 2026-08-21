<?php

namespace App\Jobs;

use App\Models\Customer;
use App\Models\Employee;
use App\Models\Notification;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class BroadcastCustomerAnnouncement implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 120;

    public function __construct(
        public readonly int $senderId,
        public readonly string $broadcastId,
        public readonly string $title,
        public readonly string $message,
    ) {}

    public function backoff(): array
    {
        return [10, 60, 300];
    }

    public function handle(): void
    {
        $sender = Employee::find($this->senderId);
        if (! $sender) {
            return;
        }

        Customer::registered()->active()->select('id')->chunkById(500, function ($customers) use ($sender) {
            $now = now();
            $rows = $customers->map(fn (Customer $customer) => [
                'sender_type' => Notification::SENDER_EMPLOYEE,
                'sender_id' => $sender->id,
                'receiver_type' => Notification::RECEIVER_CUSTOMER,
                'receiver_id' => $customer->id,
                'type' => Notification::TYPE_SYSTEM_ANNOUNCEMENT,
                'title' => $this->title,
                'message' => $this->message,
                'data' => json_encode([
                    'broadcast' => true,
                    'broadcast_id' => $this->broadcastId,
                    'sent_by' => $sender->name,
                ], JSON_THROW_ON_ERROR),
                'deduplication_key' => "broadcast:{$this->broadcastId}:customer:{$customer->id}",
                'status' => Notification::STATUS_SENT,
                'read_at' => null,
                'created_at' => $now,
                'updated_at' => $now,
            ])->all();

            Notification::query()->insertOrIgnore($rows);
        });
    }
}
