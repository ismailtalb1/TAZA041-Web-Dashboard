<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('payment_records') || ! Schema::hasTable('payment_accounts')) {
            return;
        }

        // Preserve the audit trail of old simulated transactions without
        // presenting them as bank transfers after this payment type is removed.
        DB::table('payment_records')
            ->where('method', 'bemo_bank')
            ->update([
                'method' => 'test_payment',
                'payment_account_id' => null,
            ]);

        DB::table('payment_accounts')
            ->where('type', 'bemo_bank')
            ->delete();
    }

    public function down(): void
    {
        // The removed simulated payment type and its accounts are not restored.
    }
};
