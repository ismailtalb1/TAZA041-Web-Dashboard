<?php

namespace App\Services;

use Illuminate\Filesystem\Filesystem;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PDO;
use RuntimeException;
use Throwable;

class BackupManager
{
    private const MANIFEST = 'manifest.json';

    private const DATABASE = 'database.sqlite';

    private const IMAGES = 'images';

    public function __construct(private readonly Filesystem $files) {}

    public function create(?string $label = null): array
    {
        $this->ensureSqlite();

        $root = $this->backupRoot();
        $this->files->ensureDirectoryExists($root);

        $suffix = $label ? '-'.$this->safeName($label) : '';
        $name = now()->format('Y-m-d_His').$suffix;
        $destination = $root.DIRECTORY_SEPARATOR.$name;
        if ($this->files->exists($destination)) {
            $name .= '-'.Str::lower(Str::random(6));
            $destination = $root.DIRECTORY_SEPARATOR.$name;
        }

        $staging = $root.DIRECTORY_SEPARATOR.'.creating-'.Str::uuid();
        $this->files->ensureDirectoryExists($staging);

        try {
            $databasePath = $staging.DIRECTORY_SEPARATOR.self::DATABASE;
            $this->snapshotSqlite($databasePath);

            $imageFiles = $this->copyTreeWithHashes(
                $this->imagesRoot(),
                $staging.DIRECTORY_SEPARATOR.self::IMAGES,
            );

            $manifest = [
                'format_version' => 1,
                'name' => $name,
                'created_at' => now()->toIso8601String(),
                'database' => [
                    'driver' => 'sqlite',
                    'file' => self::DATABASE,
                    'size' => $this->files->size($databasePath),
                    'sha256' => hash_file('sha256', $databasePath),
                ],
                'images' => [
                    'directory' => self::IMAGES,
                    'count' => count($imageFiles),
                    'files' => $imageFiles,
                ],
            ];

            $this->files->put(
                $staging.DIRECTORY_SEPARATOR.self::MANIFEST,
                json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
            );

            if (! $this->files->moveDirectory($staging, $destination)) {
                throw new RuntimeException('تعذر تثبيت النسخة الاحتياطية في مجلدها النهائي.');
            }

            $this->prune();

            return $manifest + ['path' => $destination];
        } catch (Throwable $exception) {
            $this->files->deleteDirectory($staging);

            throw $exception;
        }
    }

    public function verify(string $backup): array
    {
        $path = $this->resolveBackup($backup);
        $manifest = $this->manifest($path);
        $database = $path.DIRECTORY_SEPARATOR.$manifest['database']['file'];

        $this->assertFileMatches($database, $manifest['database']);

        $pdo = new PDO('sqlite:'.$database);
        $integrity = $pdo->query('PRAGMA integrity_check')->fetchColumn();
        if ($integrity !== 'ok') {
            throw new RuntimeException('فشل فحص سلامة قاعدة البيانات: '.$integrity);
        }

        $tableCount = (int) $pdo->query(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
        )->fetchColumn();

        $imagesRoot = $path.DIRECTORY_SEPARATOR.$manifest['images']['directory'];
        foreach ($manifest['images']['files'] as $file) {
            $this->assertFileMatches(
                $imagesRoot.DIRECTORY_SEPARATOR.str_replace('/', DIRECTORY_SEPARATOR, $file['path']),
                $file,
            );
        }

        return [
            'name' => $manifest['name'],
            'database_tables' => $tableCount,
            'images' => count($manifest['images']['files']),
            'verified_at' => now()->toIso8601String(),
        ];
    }

    public function testRestore(string $backup): array
    {
        $path = $this->resolveBackup($backup);
        $verificationRoot = storage_path('app/private/backup-verification/'.Str::uuid());
        $databaseTarget = $verificationRoot.DIRECTORY_SEPARATOR.self::DATABASE;
        $imagesTarget = $verificationRoot.DIRECTORY_SEPARATOR.self::IMAGES;

        try {
            $this->restoreTo($path, $databaseTarget, $imagesTarget);

            $pdo = new PDO('sqlite:'.$databaseTarget);
            $integrity = $pdo->query('PRAGMA integrity_check')->fetchColumn();
            $tableCount = (int) $pdo->query(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
            )->fetchColumn();

            if ($integrity !== 'ok' || $tableCount === 0) {
                throw new RuntimeException('فشلت تجربة فتح قاعدة البيانات المستعادة.');
            }

            $result = $this->verify($path) + [
                'restore_tested' => true,
                'restored_database_tables' => $tableCount,
            ];

            $this->files->put(
                $path.DIRECTORY_SEPARATOR.'last-restore-test.json',
                json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
            );

            return $result;
        } finally {
            $this->files->deleteDirectory($verificationRoot);
        }
    }

    public function restoreLive(string $backup): void
    {
        $this->ensureSqlite();
        $path = $this->resolveBackup($backup);
        $this->verify($path);

        $staging = storage_path('app/private/restore-staging/'.Str::uuid());
        $databaseStaging = $staging.DIRECTORY_SEPARATOR.self::DATABASE;
        $imagesStaging = $staging.DIRECTORY_SEPARATOR.self::IMAGES;
        $databaseTarget = $this->sqlitePath();
        $imagesTarget = $this->imagesRoot();
        $databaseRollback = $databaseTarget.'.before-restore';
        $imagesRollback = $imagesTarget.'-before-restore';

        $this->restoreTo($path, $databaseStaging, $imagesStaging);
        DB::purge($this->connectionName());

        try {
            $this->files->delete($databaseRollback);
            $this->files->deleteDirectory($imagesRollback);

            if ($this->files->exists($databaseTarget) && ! $this->files->move($databaseTarget, $databaseRollback)) {
                throw new RuntimeException('تعذر حفظ قاعدة البيانات الحالية قبل الاستعادة.');
            }
            if ($this->files->isDirectory($imagesTarget) && ! $this->files->moveDirectory($imagesTarget, $imagesRollback)) {
                throw new RuntimeException('تعذر حفظ الصور الحالية قبل الاستعادة.');
            }

            $this->files->ensureDirectoryExists(dirname($databaseTarget));
            if (! $this->files->copy($databaseStaging, $databaseTarget)) {
                throw new RuntimeException('تعذر استعادة قاعدة البيانات.');
            }
            if (! $this->files->moveDirectory($imagesStaging, $imagesTarget)) {
                throw new RuntimeException('تعذر استعادة الصور.');
            }

            $this->files->delete($databaseRollback);
            $this->files->deleteDirectory($imagesRollback);
        } catch (Throwable $exception) {
            $this->files->delete($databaseTarget);
            $this->files->deleteDirectory($imagesTarget);
            if ($this->files->exists($databaseRollback)) {
                $this->files->move($databaseRollback, $databaseTarget);
            }
            if ($this->files->isDirectory($imagesRollback)) {
                $this->files->moveDirectory($imagesRollback, $imagesTarget);
            }

            throw $exception;
        } finally {
            $this->files->deleteDirectory($staging);
        }
    }

    public function latest(): ?string
    {
        $directories = collect($this->files->directories($this->backupRoot()))
            ->reject(fn (string $path) => str_starts_with(basename($path), '.'))
            ->sortDesc()
            ->values();

        return $directories->first();
    }

    private function restoreTo(string $backup, string $databaseTarget, string $imagesTarget): void
    {
        $manifest = $this->manifest($backup);
        $this->files->ensureDirectoryExists(dirname($databaseTarget));
        $this->files->ensureDirectoryExists($imagesTarget);

        $sourceDatabase = $backup.DIRECTORY_SEPARATOR.$manifest['database']['file'];
        if (! $this->files->copy($sourceDatabase, $databaseTarget)) {
            throw new RuntimeException('تعذر نسخ قاعدة البيانات أثناء الاستعادة.');
        }

        $this->copyTree(
            $backup.DIRECTORY_SEPARATOR.$manifest['images']['directory'],
            $imagesTarget,
        );

        $this->assertFileMatches($databaseTarget, $manifest['database']);
        foreach ($manifest['images']['files'] as $file) {
            $this->assertFileMatches(
                $imagesTarget.DIRECTORY_SEPARATOR.str_replace('/', DIRECTORY_SEPARATOR, $file['path']),
                $file,
            );
        }
    }

    private function snapshotSqlite(string $destination): void
    {
        $escaped = str_replace("'", "''", str_replace('\\', '/', $destination));
        DB::connection($this->connectionName())->getPdo()->exec("VACUUM INTO '{$escaped}'");
    }

    private function copyTreeWithHashes(string $source, string $destination): array
    {
        if (! $this->files->isDirectory($source)) {
            $this->files->ensureDirectoryExists($destination);

            return [];
        }

        $this->copyTree($source, $destination);

        return collect($this->files->allFiles($destination))
            ->map(function ($file) use ($destination) {
                $relative = str_replace('\\', '/', Str::after($file->getPathname(), $destination.DIRECTORY_SEPARATOR));

                return [
                    'path' => $relative,
                    'size' => $file->getSize(),
                    'sha256' => hash_file('sha256', $file->getPathname()),
                ];
            })
            ->sortBy('path')
            ->values()
            ->all();
    }

    private function copyTree(string $source, string $destination): void
    {
        $this->files->ensureDirectoryExists($destination);
        foreach ($this->files->allDirectories($source) as $directory) {
            $relative = Str::after($directory, $source.DIRECTORY_SEPARATOR);
            $this->files->ensureDirectoryExists($destination.DIRECTORY_SEPARATOR.$relative);
        }
        foreach ($this->files->allFiles($source) as $file) {
            $relative = Str::after($file->getPathname(), $source.DIRECTORY_SEPARATOR);
            $target = $destination.DIRECTORY_SEPARATOR.$relative;
            $this->files->ensureDirectoryExists(dirname($target));
            if (! $this->files->copy($file->getPathname(), $target)) {
                throw new RuntimeException('تعذر نسخ الملف: '.$relative);
            }
        }
    }

    private function assertFileMatches(string $path, array $expected): void
    {
        if (! $this->files->isFile($path)) {
            throw new RuntimeException('ملف مفقود من النسخة الاحتياطية: '.$path);
        }
        if ($this->files->size($path) !== (int) $expected['size']) {
            throw new RuntimeException('حجم ملف غير مطابق في النسخة الاحتياطية: '.$path);
        }
        if (! hash_equals((string) $expected['sha256'], hash_file('sha256', $path))) {
            throw new RuntimeException('بصمة ملف غير مطابقة في النسخة الاحتياطية: '.$path);
        }
    }

    private function manifest(string $path): array
    {
        $manifestPath = $path.DIRECTORY_SEPARATOR.self::MANIFEST;
        if (! $this->files->isFile($manifestPath)) {
            throw new RuntimeException('ملف تعريف النسخة الاحتياطية غير موجود.');
        }

        $manifest = json_decode($this->files->get($manifestPath), true, flags: JSON_THROW_ON_ERROR);
        if (($manifest['format_version'] ?? null) !== 1) {
            throw new RuntimeException('إصدار النسخة الاحتياطية غير مدعوم.');
        }

        return $manifest;
    }

    private function resolveBackup(string $backup): string
    {
        $candidate = $this->files->isDirectory($backup)
            ? $backup
            : $this->backupRoot().DIRECTORY_SEPARATOR.$this->safeName($backup);
        $realRoot = realpath($this->backupRoot());
        $realCandidate = realpath($candidate);

        if ($realRoot === false || $realCandidate === false || ! str_starts_with($realCandidate, $realRoot.DIRECTORY_SEPARATOR)) {
            throw new RuntimeException('النسخة الاحتياطية المطلوبة غير موجودة أو خارج المسار المسموح.');
        }

        return $realCandidate;
    }

    private function prune(): void
    {
        $retentionDays = max(1, (int) config('backup.retention_days'));
        $keepMinimum = max(1, (int) config('backup.keep_minimum'));
        $directories = collect($this->files->directories($this->backupRoot()))
            ->reject(fn (string $path) => str_starts_with(basename($path), '.'))
            ->sortDesc()
            ->values();

        $directories->slice($keepMinimum)->each(function (string $path) use ($retentionDays) {
            $createdAt = filemtime($path);
            if ($createdAt !== false && $createdAt < now()->subDays($retentionDays)->getTimestamp()) {
                $this->files->deleteDirectory($path);
            }
        });
    }

    private function ensureSqlite(): void
    {
        if (config('database.connections.'.$this->connectionName().'.driver') !== 'sqlite') {
            throw new RuntimeException('مدير النسخ الحالي يدعم SQLite فقط.');
        }
        if ($this->sqlitePath() === ':memory:') {
            throw new RuntimeException('لا يمكن إنشاء نسخة تشغيلية من قاعدة SQLite الموجودة في الذاكرة.');
        }
    }

    private function sqlitePath(): string
    {
        $database = (string) config('database.connections.'.$this->connectionName().'.database');

        return $database === ':memory:' || Str::startsWith($database, ['/', '\\']) || preg_match('/^[A-Za-z]:[\\\\\/]/', $database)
            ? $database
            : base_path($database);
    }

    private function connectionName(): string
    {
        return (string) config('database.default');
    }

    private function backupRoot(): string
    {
        return rtrim((string) config('backup.path'), '\\/');
    }

    private function imagesRoot(): string
    {
        return rtrim((string) config('backup.images_path'), '\\/');
    }

    private function safeName(string $name): string
    {
        $safe = preg_replace('/[^A-Za-z0-9_.-]/', '-', basename($name));

        return trim((string) $safe, '.-');
    }
}
