<?php

namespace App\Console\Commands;

use App\Services\BackupManager;
use Illuminate\Console\Command;

class RunBackup extends Command
{
    protected $signature = 'backup:run {--verify : Restore into an isolated directory and verify the result}';

    protected $description = 'Create a consistent database and uploaded-images backup';

    public function handle(BackupManager $backups): int
    {
        $backup = $backups->create();
        $this->info('تم إنشاء النسخة: '.$backup['name']);

        if ($this->option('verify')) {
            $result = $backups->testRestore($backup['path']);
            $this->info("نجحت تجربة الاستعادة: {$result['database_tables']} جدول و {$result['images']} صورة/ملف.");
        }

        return self::SUCCESS;
    }
}
