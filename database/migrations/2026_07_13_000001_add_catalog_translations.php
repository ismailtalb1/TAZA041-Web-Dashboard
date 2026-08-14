<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->string('name_ar')->nullable()->after('name');
            $table->string('name_en')->nullable()->after('name_ar');
            $table->text('description_ar')->nullable()->after('description');
            $table->text('description_en')->nullable()->after('description_ar');
        });

        Schema::table('offers', function (Blueprint $table) {
            $table->string('name_ar')->nullable()->after('name');
            $table->string('name_en')->nullable()->after('name_ar');
            $table->text('description_ar')->nullable()->after('description');
            $table->text('description_en')->nullable()->after('description_ar');
        });
    }

    public function down(): void
    {
        Schema::table('offers', function (Blueprint $table) {
            $table->dropColumn(['name_ar', 'name_en', 'description_ar', 'description_en']);
        });

        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn(['name_ar', 'name_en', 'description_ar', 'description_en']);
        });
    }
};
