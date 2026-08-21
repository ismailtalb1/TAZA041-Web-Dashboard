<?php

namespace Tests\Feature;

use App\Services\BackupManager;
use Illuminate\Filesystem\Filesystem;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PDO;
use Tests\TestCase;

class BackupAndRestoreTest extends TestCase
{
    private string $root;

    private string $database;

    private string $originalConnection;

    protected function setUp(): void
    {
        parent::setUp();

        $this->root = storage_path('framework/testing/backup-'.Str::uuid());
        $this->database = $this->root.'/live.sqlite';
        $this->originalConnection = (string) config('database.default');

        mkdir($this->root.'/images/products', 0777, true);
        file_put_contents($this->root.'/images/products/meal.jpg', 'original-image');

        $pdo = new PDO('sqlite:'.$this->database);
        $pdo->exec('CREATE TABLE recovery_probe (id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
        $pdo->exec("INSERT INTO recovery_probe (value) VALUES ('before-backup')");

        config([
            'database.default' => 'backup_test',
            'database.connections.backup_test' => [
                'driver' => 'sqlite',
                'database' => $this->database,
                'prefix' => '',
                'foreign_key_constraints' => true,
                'busy_timeout' => 5000,
                'journal_mode' => null,
                'synchronous' => null,
            ],
            'backup.path' => $this->root.'/backups',
            'backup.images_path' => $this->root.'/images',
            'backup.retention_days' => 30,
            'backup.keep_minimum' => 7,
        ]);
        DB::purge('backup_test');
    }

    protected function tearDown(): void
    {
        DB::purge('backup_test');
        config(['database.default' => $this->originalConnection]);
        (new Filesystem)->deleteDirectory($this->root);

        parent::tearDown();
    }

    public function test_backup_is_really_restored_and_can_replace_live_data(): void
    {
        $backups = app(BackupManager::class);
        $backup = $backups->create('automated-test');

        $this->assertFileExists($backup['path'].'/database.sqlite');
        $this->assertFileExists($backup['path'].'/images/products/meal.jpg');
        $this->assertFileExists($backup['path'].'/manifest.json');

        $verification = $backups->testRestore($backup['name']);
        $this->assertTrue($verification['restore_tested']);
        $this->assertSame(1, $verification['database_tables']);
        $this->assertSame(1, $verification['images']);
        $this->assertFileExists($backup['path'].'/last-restore-test.json');

        DB::connection('backup_test')->table('recovery_probe')->insert(['value' => 'after-backup']);
        file_put_contents($this->root.'/images/products/meal.jpg', 'changed-image');

        $backups->restoreLive($backup['name']);

        $restored = new PDO('sqlite:'.$this->database);
        $this->assertSame(1, (int) $restored->query('SELECT COUNT(*) FROM recovery_probe')->fetchColumn());
        $this->assertSame('before-backup', $restored->query('SELECT value FROM recovery_probe')->fetchColumn());
        $this->assertSame('original-image', file_get_contents($this->root.'/images/products/meal.jpg'));
    }
}
