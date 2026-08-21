<?php

namespace App\Console\Commands;

use App\Services\BackupManager;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Artisan;
use Throwable;

class RestoreBackup extends Command
{
    protected $signature = 'backup:restore {backup : Backup directory name} {--force : Confirm destructive live restore}';

    protected $description = 'Restore the live SQLite database and uploaded images from a verified backup';

    public function handle(BackupManager $backups): int
    {
        if (! $this->option('force')) {
            $this->error('أضف --force بعد التأكد من اسم النسخة؛ الاستعادة تستبدل البيانات والصور الحالية.');

            return self::INVALID;
        }

        $wasDown = app()->isDownForMaintenance();

        try {
            $safety = $backups->create('before-restore');
            $this->info('تم إنشاء نسخة أمان قبل الاستعادة: '.$safety['name']);

            if (! $wasDown) {
                Artisan::call('down');
            }

            $backups->restoreLive($this->argument('backup'));
            $this->info('اكتملت استعادة قاعدة البيانات والصور بنجاح.');

            return self::SUCCESS;
        } catch (Throwable $exception) {
            $this->error('فشلت الاستعادة وتمت محاولة إعادة الحالة السابقة: '.$exception->getMessage());

            return self::FAILURE;
        } finally {
            if (! $wasDown) {
                Artisan::call('up');
            }
        }
    }
}
