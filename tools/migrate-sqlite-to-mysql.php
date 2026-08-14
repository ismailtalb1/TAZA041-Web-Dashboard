<?php

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

require __DIR__.'/../vendor/autoload.php';

$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

config([
    'database.connections.sqlite_source' => [
        'driver' => 'sqlite',
        'database' => database_path('database.sqlite'),
        'prefix' => '',
        'foreign_key_constraints' => true,
    ],
]);

$source = DB::connection('sqlite_source');
$target = DB::connection('mysql');

$tables = [
    'employees',
    'customers',
    'restaurant_info',
    'products',
    'offers',
    'offer_products',
    'orders',
    'order_items',
    'payment_accounts',
    'payment_records',
    'delivery_orders',
    'reservation_orders',
    'loyalty_accounts',
    'loyalty_transactions',
    'notifications',
    'reports',
    'restaurant_images',
    'meal_suggestions',
    'ai_conversations',
    'reviews',
    'customer_password_resets',
    'personal_access_tokens',
];

$target->statement('SET FOREIGN_KEY_CHECKS=0');

try {
    foreach ($tables as $table) {
        if (! Schema::connection('sqlite_source')->hasTable($table)
            || ! Schema::connection('mysql')->hasTable($table)) {
            fwrite(STDOUT, "Skipped missing table: {$table}\n");

            continue;
        }

        $target->table($table)->truncate();
        $rows = $source->table($table)->orderBy('id')->get()
            ->map(static fn (object $row): array => (array) $row)
            ->all();

        foreach (array_chunk($rows, 250) as $chunk) {
            $target->table($table)->insert($chunk);
        }

        fwrite(STDOUT, sprintf("%-28s %d\n", $table, count($rows)));
    }
} finally {
    $target->statement('SET FOREIGN_KEY_CHECKS=1');
}

fwrite(STDOUT, "SQLite to MySQL migration completed.\n");
