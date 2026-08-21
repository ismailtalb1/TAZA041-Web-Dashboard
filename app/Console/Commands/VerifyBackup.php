<?php

namespace App\Console\Commands;

use App\Services\BackupManager;
use Illuminate\Console\Command;

class VerifyBackup extends Command
{
    protected $signature = 'backup:verify {backup? : Backup directory name; defaults to latest}';

    protected $description = 'Perform a real isolated restore test for a backup';

    public function handle(BackupManager $backups): int
    {
        $backup = $this->argument('backup') ?: $backups->latest();
        if (! $backup) {
            $this->error('لا توجد نسخة احتياطية لفحصها.');

            return self::FAILURE;
        }

        $result = $backups->testRestore($backup);
        $this->info("النسخة سليمة وقابلة للاستعادة: {$result['database_tables']} جدول و {$result['images']} صورة/ملف.");

        return self::SUCCESS;
    }
}
