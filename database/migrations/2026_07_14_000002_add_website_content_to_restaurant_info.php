<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('restaurant_info', 'website_content')) {
            Schema::table('restaurant_info', function (Blueprint $table) {
                $table->json('website_content')->nullable()->after('telegram_url');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('restaurant_info', 'website_content')) {
            Schema::table('restaurant_info', function (Blueprint $table) {
                $table->dropColumn('website_content');
            });
        }
    }
};
