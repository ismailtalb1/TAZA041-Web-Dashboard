<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employees', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('username')->unique();
            $table->string('password_hash');
            $table->string('role')->index();
            $table->string('email')->nullable()->unique();
            $table->string('phone', 30)->nullable();
            $table->string('avatar')->nullable();
            $table->boolean('is_active')->default(true)->index();
            $table->foreignId('created_by')->nullable()->constrained('employees')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('customers', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('email')->nullable()->unique();
            $table->string('phone', 30)->nullable()->unique();
            $table->string('password_hash')->nullable();
            $table->string('avatar')->nullable();
            $table->text('address')->nullable();
            $table->date('date_of_birth')->nullable();
            $table->string('status')->default('registered')->index();
            $table->integer('loyalty_points')->default(0)->index();
            $table->timestamps();
        });

        Schema::create('restaurant_info', function (Blueprint $table) {
            $table->id();
            $table->string('name')->default('TAZA 041');
            $table->string('owner_name')->nullable();
            $table->string('email')->nullable();
            $table->string('phone', 30)->nullable();
            $table->string('whatsapp', 30)->nullable();
            $table->text('address')->nullable();
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->text('about_text')->nullable();
            $table->longText('privacy_policy')->nullable();
            $table->json('working_hours')->nullable();
            $table->string('facebook_url')->nullable();
            $table->string('instagram_url')->nullable();
            $table->string('telegram_url')->nullable();
            $table->json('website_content')->nullable();
            $table->decimal('delivery_cost_per_100m', 12, 2)->default(5);
            $table->unsignedInteger('max_delivery_distance_meters')->default(15000);
            $table->decimal('vip_table_extra_cost', 12, 2)->default(0);
            $table->unsignedInteger('extra_cost_per_seat_above')->default(4);
            $table->decimal('extra_cost_per_extra_seat', 12, 2)->default(0);
            $table->unsignedInteger('loyalty_points_per_10_syp')->default(1);
            $table->boolean('is_open')->default(true);
            $table->string('logo_path')->nullable();
            $table->timestamps();
        });

        Schema::create('products', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('category')->index();
            $table->decimal('price', 12, 2);
            $table->unsignedInteger('loyalty_price')->nullable();
            $table->unsignedInteger('stock_quantity')->default(0)->index();
            $table->boolean('is_active')->default(true)->index();
            $table->string('image_path')->nullable();
            $table->timestamps();
        });

        Schema::create('offers', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('category')->nullable()->index();
            $table->decimal('offer_price', 12, 2);
            $table->unsignedInteger('loyalty_price')->nullable();
            $table->decimal('original_price', 12, 2)->default(0);
            $table->boolean('is_active')->default(true)->index();
            $table->string('image_path')->nullable();
            $table->dateTime('start_date')->nullable();
            $table->dateTime('end_date')->nullable();
            $table->timestamps();
            $table->index(['is_active', 'start_date', 'end_date']);
        });

        Schema::create('offer_products', function (Blueprint $table) {
            $table->id();
            $table->foreignId('offer_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('quantity')->default(1);
            $table->timestamps();
            $table->unique(['offer_id', 'product_id']);
        });

        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained()->restrictOnDelete();
            $table->string('type')->index();
            $table->string('status')->default('pending')->index();
            $table->decimal('total_price', 12, 2)->default(0);
            $table->decimal('discount', 12, 2)->default(0);
            $table->decimal('final_price', 12, 2)->default(0);
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->index(['customer_id', 'status']);
        });

        Schema::create('order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->string('item_type');
            $table->unsignedBigInteger('reference_id');
            $table->unsignedInteger('quantity')->default(1);
            $table->decimal('unit_price', 12, 2);
            $table->decimal('subtotal', 12, 2);
            $table->timestamps();
            $table->index(['item_type', 'reference_id']);
        });

        Schema::create('payment_accounts', function (Blueprint $table) {
            $table->id();
            $table->string('type')->index();
            $table->string('account_name');
            $table->string('account_number');
            $table->decimal('current_balance', 14, 2)->default(0);
            $table->decimal('max_balance', 14, 2)->default(0);
            $table->boolean('is_active')->default(true)->index();
            $table->boolean('is_primary')->default(false)->index();
            $table->timestamps();
            $table->unique(['type', 'account_number']);
        });

        Schema::create('payment_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->string('method')->index();
            $table->decimal('amount', 12, 2);
            $table->string('currency', 10)->default('SYP');
            $table->string('status')->default('pending')->index();
            $table->string('external_ref')->nullable()->index();
            $table->text('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('delivery_orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->unique()->constrained()->cascadeOnDelete();
            $table->text('delivery_address');
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->foreignId('driver_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->decimal('distance_meters', 12, 2)->nullable();
            $table->decimal('delivery_cost', 12, 2)->default(0);
            $table->string('status')->default('pending')->index();
            $table->unsignedTinyInteger('driver_rating')->nullable();
            $table->text('driver_feedback')->nullable();
            $table->dateTime('estimated_delivery_time')->nullable();
            $table->dateTime('actual_delivery_time')->nullable();
            $table->timestamps();
            $table->index(['driver_id', 'status']);
        });

        Schema::create('reservation_orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->unique()->constrained()->cascadeOnDelete();
            $table->unsignedInteger('table_number');
            $table->string('table_type')->default('regular');
            $table->unsignedInteger('seats_count');
            $table->dateTime('reservation_time')->index();
            $table->text('special_notes')->nullable();
            $table->decimal('extra_cost', 12, 2)->default(0);
            $table->string('status')->default('pending')->index();
            $table->unsignedInteger('duration_minutes')->default(120);
            $table->dateTime('actual_arrival_time')->nullable();
            $table->dateTime('actual_departure_time')->nullable();
            $table->timestamps();
            $table->index(['table_number', 'reservation_time']);
        });

        Schema::create('loyalty_accounts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->unique()->constrained()->cascadeOnDelete();
            $table->integer('points_balance')->default(0);
            $table->string('tier')->default('bronze')->index();
            $table->unsignedInteger('total_points_earned')->default(0);
            $table->unsignedInteger('total_points_redeemed')->default(0);
            $table->dateTime('last_activity_at')->nullable();
            $table->timestamps();
        });

        Schema::create('loyalty_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('loyalty_account_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
            $table->integer('points');
            $table->string('type')->index();
            $table->string('description')->nullable();
            $table->timestamps();
        });

        Schema::create('notifications', function (Blueprint $table) {
            $table->id();
            $table->string('sender_type');
            $table->unsignedBigInteger('sender_id')->nullable();
            $table->string('receiver_type');
            $table->unsignedBigInteger('receiver_id');
            $table->string('type')->index();
            $table->string('title');
            $table->text('message');
            $table->json('data')->nullable();
            $table->string('status')->default('sent')->index();
            $table->dateTime('read_at')->nullable();
            $table->timestamps();
            $table->index(['receiver_type', 'receiver_id', 'status'], 'notifications_receiver_status_index');
        });

        Schema::create('reports', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->text('description')->nullable();
            $table->longText('content')->nullable();
            $table->foreignId('sender_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->foreignId('receiver_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->string('report_type')->index();
            $table->string('status')->default('sent')->index();
            $table->dateTime('reviewed_at')->nullable();
            $table->timestamps();
        });

        Schema::create('restaurant_images', function (Blueprint $table) {
            $table->id();
            $table->string('type')->index();
            $table->string('image_path');
            $table->string('caption')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true)->index();
            $table->timestamps();
        });

        Schema::create('meal_suggestions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->text('suggestion_text');
            $table->string('status')->default('pending')->index();
            $table->text('admin_note')->nullable();
            $table->timestamps();
        });

        Schema::create('ai_conversations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('employee_id')->nullable()->constrained()->nullOnDelete();
            $table->text('user_message');
            $table->longText('ai_response');
            $table->string('intent')->index();
            $table->json('metadata')->nullable();
            $table->timestamps();
        });

        Schema::create('reviews', function (Blueprint $table) {
            $table->id();
            $table->string('reviewer_type');
            $table->unsignedBigInteger('reviewer_id');
            $table->string('reviewable_type');
            $table->unsignedBigInteger('reviewable_id');
            $table->unsignedTinyInteger('rating');
            $table->text('comment')->nullable();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
            $table->index(['reviewable_type', 'reviewable_id']);
            $table->index(['reviewer_type', 'reviewer_id']);
        });

        Schema::create('customer_password_resets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->string('identifier')->index();
            $table->string('channel', 20);
            $table->string('code_hash');
            $table->string('reset_token_hash')->nullable()->unique();
            $table->dateTime('expires_at')->index();
            $table->dateTime('used_at')->nullable();
            $table->unsignedTinyInteger('attempts')->default(0);
            $table->timestamps();
        });

        Schema::create('personal_access_tokens', function (Blueprint $table) {
            $table->id();
            $table->morphs('tokenable');
            $table->text('name');
            $table->string('token', 64)->unique();
            $table->text('abilities')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('expires_at')->nullable()->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('personal_access_tokens');
        Schema::dropIfExists('customer_password_resets');
        Schema::dropIfExists('reviews');
        Schema::dropIfExists('ai_conversations');
        Schema::dropIfExists('meal_suggestions');
        Schema::dropIfExists('restaurant_images');
        Schema::dropIfExists('reports');
        Schema::dropIfExists('notifications');
        Schema::dropIfExists('loyalty_transactions');
        Schema::dropIfExists('loyalty_accounts');
        Schema::dropIfExists('reservation_orders');
        Schema::dropIfExists('delivery_orders');
        Schema::dropIfExists('payment_records');
        Schema::dropIfExists('payment_accounts');
        Schema::dropIfExists('order_items');
        Schema::dropIfExists('orders');
        Schema::dropIfExists('offer_products');
        Schema::dropIfExists('offers');
        Schema::dropIfExists('products');
        Schema::dropIfExists('restaurant_info');
        Schema::dropIfExists('customers');
        Schema::dropIfExists('employees');
    }
};
