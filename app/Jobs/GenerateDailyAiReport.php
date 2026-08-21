<?php

namespace App\Jobs;

use App\Models\AiConversation;
use App\Models\Report;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class GenerateDailyAiReport implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 180;

    public int $uniqueFor = 3600;

    public function __construct(
        public readonly bool $force = false,
        public readonly ?string $requestId = null,
    ) {}

    public function uniqueId(): string
    {
        return $this->force && $this->requestId
            ? 'ai-report-'.$this->requestId
            : 'ai-report-'.now()->toDateString();
    }

    public function handle(): void
    {
        $alreadyGenerated = Report::byType(Report::TYPE_AI_GENERATED)
            ->whereDate('created_at', today())
            ->exists();

        if (! $alreadyGenerated || $this->force) {
            AiConversation::generateDailyReport();
        }
    }
}
