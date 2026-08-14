<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('employees')
            || ! Schema::hasTable('products')
            || ! Schema::hasTable('notifications')) {
            return;
        }

        $manager = DB::table('employees')
            ->where('role', 'inventory_manager')
            ->where('is_active', true)
            ->first();

        if (! $manager) {
            return;
        }

        $alreadyAlerted = DB::table('notifications')
            ->where('receiver_type', 'employee')
            ->where('receiver_id', $manager->id)
            ->where('type', 'stock_alert')
            ->whereIn('status', ['sent', 'delivered'])
            ->pluck('data')
            ->map(function ($data) {
                $decoded = is_array($data) ? $data : json_decode((string) $data, true);
                if (is_string($decoded)) {
                    $decoded = json_decode($decoded, true);
                }

                return (int) ($decoded['product_id'] ?? 0);
            })
            ->filter()
            ->all();

        $now = now();
        $rows = DB::table('products')
            ->where('is_active', true)
            ->where('stock_quantity', '<=', 10)
            ->whereNotIn('id', $alreadyAlerted)
            ->get()
            ->map(function ($product) use ($manager, $now) {
                $isOutOfStock = (int) $product->stock_quantity <= 0;

                return [
                    'sender_type' => 'system',
                    'sender_id' => null,
                    'receiver_type' => 'employee',
                    'receiver_id' => $manager->id,
                    'type' => 'stock_alert',
                    'title' => $isOutOfStock ? '⛔ نفد المنتج من المخزون' : '⚠️ تنبيه مخزون منخفض',
                    'message' => $isOutOfStock
                        ? "نفدت كمية منتج «{$product->name}» ويحتاج إلى إعادة تعبئة فورية"
                        : "كمية منتج «{$product->name}» وصلت إلى {$product->stock_quantity} وحدة",
                    'data' => json_encode([
                        'product_id' => $product->id,
                        'product_name' => $product->name,
                        'stock' => (int) $product->stock_quantity,
                        'category' => $product->category,
                        'severity' => $isOutOfStock ? 'critical' : 'warning',
                        'source' => 'inventory_alert_backfill_v1',
                    ], JSON_UNESCAPED_UNICODE),
                    'status' => 'sent',
                    'read_at' => null,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            })
            ->all();

        if ($rows) {
            DB::table('notifications')->insert($rows);
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('notifications')) {
            return;
        }

        $ids = DB::table('notifications')
            ->where('type', 'stock_alert')
            ->get(['id', 'data'])
            ->filter(function ($notification) {
                $data = json_decode((string) $notification->data, true);

                return ($data['source'] ?? null) === 'inventory_alert_backfill_v1';
            })
            ->pluck('id')
            ->all();

        if ($ids) {
            DB::table('notifications')->whereIn('id', $ids)->delete();
        }
    }
};
