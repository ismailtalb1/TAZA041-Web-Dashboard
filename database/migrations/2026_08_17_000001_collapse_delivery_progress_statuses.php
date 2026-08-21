<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('delivery_orders')) {
            return;
        }

        DB::table('delivery_orders')
            ->whereIn('status', ['assigned', 'picked_up'])
            ->update([
                'status' => 'in_delivery',
                'updated_at' => now(),
            ]);
    }

    public function down(): void
    {
        // The two legacy statuses cannot be reconstructed after being merged.
    }
};
