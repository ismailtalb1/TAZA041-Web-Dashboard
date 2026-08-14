<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('customers')
            ->select(['id', 'loyalty_points'])
            ->whereNotExists(function ($query) {
                $query->selectRaw('1')
                    ->from('loyalty_accounts')
                    ->whereColumn('loyalty_accounts.customer_id', 'customers.id');
            })
            ->orderBy('id')
            ->chunkById(200, function ($customers) {
                $now = now();
                $rows = $customers->map(function ($customer) use ($now) {
                    $balance = max(0, (int) $customer->loyalty_points);

                    return [
                        'customer_id' => $customer->id,
                        'points_balance' => $balance,
                        'tier' => $this->tierForBalance($balance),
                        'total_points_earned' => $balance,
                        'total_points_redeemed' => 0,
                        'last_activity_at' => $balance > 0 ? $now : null,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ];
                })->all();

                if ($rows) {
                    DB::table('loyalty_accounts')->insertOrIgnore($rows);
                }
            });
    }

    public function down(): void
    {
        // Existing loyalty balances are business data and must not be deleted on rollback.
    }

    private function tierForBalance(int $balance): string
    {
        return match (true) {
            $balance >= 1000 => 'platinum',
            $balance >= 700 => 'gold',
            $balance >= 400 => 'silver',
            default => 'bronze',
        };
    }
};
