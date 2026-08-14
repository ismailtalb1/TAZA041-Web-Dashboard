<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PaymentAccount extends Model
{
    use HasFactory;

    // ✅ مطابق لقاعدة البيانات
    protected $table = 'payment_accounts';

    protected $fillable = [
        'type',
        'account_name',
        'account_number',
        'current_balance',
        'max_balance',
        'is_active',
        'is_primary',
    ];

    protected $casts = [
        'current_balance' => 'float',
        'max_balance' => 'float',
        'is_active' => 'boolean',
        'is_primary' => 'boolean',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // ─────────────────────────────────────────────
    // الثوابت — أنواع الحسابات
    // مطابقة لـ ENUM في قاعدة البيانات
    // ─────────────────────────────────────────────
    const TYPE_SYRIATEL = 'syriatel_cash';

    const TYPE_SHAM = 'sham_cash';

    const TYPE_LABELS = [
        self::TYPE_SYRIATEL => 'سيريتل كاش',
        self::TYPE_SHAM => 'شام كاش',
    ];

    // حد أدنى للرصيد يُطلق تحذير الامتلاء (90%)
    const CAPACITY_WARNING_THRESHOLD = 0.90;

    // ─────────────────────────────────────────────
    // Scopes
    // ─────────────────────────────────────────────
    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    public function scopePrimary($query)
    {
        return $query->where('is_primary', true);
    }

    public function scopeByType($query, string $type)
    {
        return $query->where('type', $type);
    }

    // ─────────────────────────────────────────────
    // التوابع
    // ─────────────────────────────────────────────

    // نسبة امتلاء الحساب
    public function getCapacityPercentage(): float
    {
        if ($this->max_balance <= 0) {
            return 0;
        }

        return round(($this->current_balance / $this->max_balance) * 100, 1);
    }

    // هل الحساب على وشك الامتلاء؟
    public function isNearCapacity(): bool
    {
        return $this->getCapacityPercentage() >=
               (self::CAPACITY_WARNING_THRESHOLD * 100);
    }

    // هل الحساب ممتلئ؟
    public function isFull(): bool
    {
        return $this->current_balance >= $this->max_balance;
    }

    // سحب مبلغ من الحساب
    public function withdraw(float $amount): array
    {
        if ($amount <= 0) {
            return ['success' => false, 'message' => 'المبلغ يجب أن يكون أكبر من صفر'];
        }

        if ($this->current_balance < $amount) {
            return [
                'success' => false,
                'message' => 'الرصيد غير كافٍ. المتاح: '.
                             number_format($this->current_balance, 0).' ل.س',
            ];
        }

        $this->decrement('current_balance', $amount);
        $this->refresh();

        return [
            'success' => true,
            'amount' => $amount,
            'new_balance' => $this->current_balance,
            'message' => 'تم السحب بنجاح',
        ];
    }

    // تحديث الرصيد يدوياً (المدير المالي)
    public function updateBalance(float $newBalance, Employee $updatedBy): void
    {
        $old = $this->current_balance;
        $this->update(['current_balance' => $newBalance]);

        // إشعار إذا اقترب من الحد
        if ($this->isNearCapacity()) {
            $gm = Employee::active()
                ->byRole(Employee::ROLE_GENERAL_MANAGER)
                ->first();
            if ($gm) {
                Notification::managerToEmployee(
                    from: $updatedBy,
                    to: $gm,
                    title: "⚠️ حساب {$this->getTypeLabel()} على وشك الامتلاء",
                    message: "حساب {$this->account_name} وصل إلى ".
                               $this->getCapacityPercentage().'% من طاقته',
                    extraData: ['account_id' => $this->id]
                );
            }
        }
    }

    // تعيين حساب آخر كـ Primary لنفس النوع
    public function makePrimary(): void
    {
        // إلغاء الـ Primary من الحسابات الأخرى من نفس النوع
        self::where('type', $this->type)
            ->where('id', '!=', $this->id)
            ->update(['is_primary' => false]);

        $this->update(['is_primary' => true]);
    }

    // اسم النوع بالعربي
    public function getTypeLabel(): string
    {
        return self::TYPE_LABELS[$this->type] ?? $this->type;
    }

    // جلب ملخص كل حسابات نوع معين
    public static function getSummaryByType(): array
    {
        $summary = [];

        foreach (self::TYPE_LABELS as $type => $label) {
            $accounts = self::byType($type)->get();
            $summary[$type] = [
                'label' => $label,
                'total_accounts' => $accounts->count(),
                'active_accounts' => $accounts->where('is_active', true)->count(),
                'total_balance' => $accounts->sum('current_balance'),
                'total_capacity' => $accounts->sum('max_balance'),
                'primary' => $accounts
                    ->where('is_primary', true)
                    ->first()
                    ?->getDetails(),
            ];
        }

        return $summary;
    }

    // تفاصيل الحساب للواجهة
    public function getDetails(): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'type_label' => $this->getTypeLabel(),
            'account_name' => $this->account_name,
            'account_number' => $this->account_number,
            'current_balance' => $this->current_balance,
            'balance_formatted' => number_format($this->current_balance, 0).' ل.س',
            'max_balance' => $this->max_balance,
            'max_balance_formatted' => number_format($this->max_balance, 0).' ل.س',
            'capacity_percentage' => $this->getCapacityPercentage(),
            'is_near_capacity' => $this->isNearCapacity(),
            'is_full' => $this->isFull(),
            'is_active' => $this->is_active,
            'is_primary' => $this->is_primary,
            'created_at' => $this->created_at?->format('Y-m-d'),
        ];
    }
}
