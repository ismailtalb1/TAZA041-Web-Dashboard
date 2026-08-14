<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('restaurant_info', function (Blueprint $table) {
            $table->json('loyalty_tier_multipliers')
                ->nullable()
                ->after('loyalty_points_per_10_syp');
        });
    }

    public function down(): void
    {
        Schema::table('restaurant_info', function (Blueprint $table) {
            $table->dropColumn('loyalty_tier_multipliers');
        });
    }
};
