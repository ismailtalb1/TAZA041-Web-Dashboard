<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->string('last_ip_address', 45)->nullable()->index()->after('status');
        });

        Schema::create('customer_blocked_ips', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained('customers')->cascadeOnDelete();
            $table->string('ip_address', 45)->index();
            $table->foreignId('banned_by')->nullable()->constrained('employees')->nullOnDelete();
            $table->text('reason')->nullable();
            $table->boolean('is_active')->default(true)->index();
            $table->timestamp('banned_at')->nullable();
            $table->timestamp('released_at')->nullable();
            $table->timestamps();

            $table->unique(['customer_id', 'ip_address']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_blocked_ips');

        Schema::table('customers', function (Blueprint $table) {
            $table->dropIndex(['last_ip_address']);
            $table->dropColumn('last_ip_address');
        });
    }
};
