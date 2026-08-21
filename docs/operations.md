# TAZA 041 operations

## Required background processes

Production must keep both commands running continuously:

```text
composer queue
composer scheduler
```

The queue worker processes `mail`, `notifications`, `reports`, then `default` in that priority order. Restart it after every deployment with `php artisan queue:restart`.

The scheduler creates a database-and-images backup every day at `02:00`, performs a real restore into an isolated directory, and only then marks the backup as verified. It also queues the AI report at `23:30` and prunes failed queue records older than seven days.

Use an operating-system service manager (Supervisor/systemd on Linux or Task Scheduler/NSSM on Windows) to restart both processes if they exit. Merely opening a terminal is not sufficient for production.

On this Windows installation, run `ops/windows/install-background-tasks.ps1` once from PowerShell to register and start the queue worker and the every-minute Laravel scheduler for the current Windows user.

## Backup commands

```text
php artisan backup:run --verify
php artisan backup:verify
php artisan backup:restore 2026-08-15_020000 --force
```

Backups are stored under `storage/app/private/backups` by default. Each backup contains a consistent SQLite snapshot, uploaded images, SHA-256 checksums, and the result of its last isolated restore test.

Live restore automatically creates a `before-restore` safety backup, enables maintenance mode, verifies the selected backup, replaces the database and uploaded images, and rolls back the replacement if it fails.

For disaster recovery, copy the backup directory to a second machine or remote encrypted storage. A backup left only on the application disk does not protect against disk loss.

## Queue checks

```text
php artisan queue:monitor mail,notifications,reports,default --max=100
php artisan queue:failed
php artisan queue:retry all
```

The database queue requires the `jobs`, `job_batches`, and `failed_jobs` migrations. Run `php artisan migrate --force` during deployment before restarting workers.
