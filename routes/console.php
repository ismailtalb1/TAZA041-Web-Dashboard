<?php

use App\Jobs\GenerateDailyAiReport;
use Illuminate\Support\Facades\Schedule;

Schedule::command('backup:run --verify')
    ->dailyAt((string) config('backup.daily_at'))
    ->name('daily-verified-backup')
    ->withoutOverlapping();

Schedule::job(new GenerateDailyAiReport, 'reports')
    ->dailyAt('23:30')
    ->name('ai-daily-report')
    ->withoutOverlapping();

Schedule::command('queue:prune-failed --hours=168')->daily();
