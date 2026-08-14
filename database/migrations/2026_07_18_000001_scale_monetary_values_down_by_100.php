<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** @var array<string, list<string>> */
    private array $moneyColumns = [
        'restaurant_info' => [
            'delivery_cost_per_100m',
            'vip_table_extra_cost',
            'extra_cost_per_extra_seat',
        ],
        'products' => ['price'],
        'offers' => ['offer_price', 'original_price'],
        'orders' => ['total_price', 'discount', 'final_price'],
        'order_items' => ['unit_price', 'subtotal'],
        'payment_accounts' => ['current_balance', 'max_balance'],
        'payment_records' => ['amount'],
        'delivery_orders' => ['delivery_cost'],
        'reservation_orders' => ['extra_cost'],
    ];

    public function up(): void
    {
        $this->scaleMoneyColumns('/ 100.0');
        $this->changeDeliveryCostDefault(5);
    }

    public function down(): void
    {
        $this->scaleMoneyColumns('* 100.0');
        $this->changeDeliveryCostDefault(500);
    }

    private function scaleMoneyColumns(string $operation): void
    {
        foreach ($this->moneyColumns as $table => $columns) {
            if (! Schema::hasTable($table)) {
                continue;
            }

            $updates = [];
            foreach ($columns as $column) {
                if (Schema::hasColumn($table, $column)) {
                    $updates[$column] = DB::raw("ROUND({$column} {$operation}, 2)");
                }
            }

            if ($updates !== []) {
                DB::table($table)->update($updates);
            }
        }
    }

    private function changeDeliveryCostDefault(float $default): void
    {
        if (! Schema::hasTable('restaurant_info')) {
            return;
        }

        Schema::table('restaurant_info', function (Blueprint $table) use ($default) {
            $table->decimal('delivery_cost_per_100m', 12, 2)
                ->default($default)
                ->change();
        });
    }
};
