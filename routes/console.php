<?php

use App\Models\AiConversation;
use Illuminate\Support\Facades\Schedule;

// ─────────────────────────────────────────────
// التقرير اليومي للـ AI — يُرسَل كل 24 ساعة
// ─────────────────────────────────────────────
Schedule::call(function () {
    AiConversation::generateDailyReport();
})->dailyAt('23:30')
    ->name('ai-daily-report')
    ->withoutOverlapping();
