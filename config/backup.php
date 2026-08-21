<?php

return [
    'path' => env('BACKUP_PATH', storage_path('app/private/backups')),

    'images_path' => env('BACKUP_IMAGES_PATH', storage_path('app/public')),

    'daily_at' => env('BACKUP_DAILY_AT', '02:00'),

    'retention_days' => (int) env('BACKUP_RETENTION_DAYS', 30),

    'keep_minimum' => (int) env('BACKUP_KEEP_MINIMUM', 7),
];
