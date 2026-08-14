<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LoyaltyTransaction extends Model
{
    use HasFactory;

    // ✅ مطابق لقاعدة البيانات
    protected $table = 'loyalty_transactions';

    protected $fillable = [
        'loyalty_account_id',
        'order_id',
        'points',
        'type',
        'description',
    ];

    protected $casts = [
        'points' => 'integer',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // ─────────────────────────────────────────────
    // الثوابت — أنواع المعاملة
    // مطابقة لـ ENUM في قاعدة البيانات
    // ─────────────────────────────────────────────
    const TYPE_EARNING = 'earning';     // اكتساب نقاط

    const TYPE_REDEMPTION = 'redemption';  // استرداد نقاط

    const TYPE_ADJUSTMENT = 'adjustment';  // تعديل يدوي (المدير)

    const TYPE_EXPIRATION = 'expiration';  // انتهاء صلاحية

    const TYPE_LABELS = [
        self::TYPE_EARNING => 'نقاط مكتسبة',
        self::TYPE_REDEMPTION => 'نقاط مستخدمة',
        self::TYPE_ADJUSTMENT => 'تعديل يدوي',
        self::TYPE_EXPIRATION => 'نقاط منتهية',
    ];

    // ─────────────────────────────────────────────
    // العلاقات
    // ─────────────────────────────────────────────
    public function loyaltyAccount(): BelongsTo
    {
        return $this->belongsTo(LoyaltyAccount::class);
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    // ─────────────────────────────────────────────
    // Scopes
    // ─────────────────────────────────────────────
    public function scopeEarnings($query)
    {
        return $query->where('type', self::TYPE_EARNING);
    }

    public function scopeRedemptions($query)
    {
        return $query->where('type', self::TYPE_REDEMPTION);
    }

    // ─────────────────────────────────────────────
    // التوابع
    // ─────────────────────────────────────────────

    // هل هذه معاملة إيجابية (كسب نقاط)؟
    public function isPositive(): bool
    {
        return $this->points > 0;
    }

    // النقاط بعلامة + أو -
    public function getPointsFormatted(): string
    {
        return $this->points > 0
            ? '+'.$this->points.' نقطة'
            : $this->points.' نقطة';
    }

    // تفاصيل المعاملة للواجهة
    public function getDetails(): array
    {
        return [
            'id' => $this->id,
            'points' => $this->points,
            'points_formatted' => $this->getPointsFormatted(),
            'type' => $this->type,
            'type_label' => self::TYPE_LABELS[$this->type] ?? $this->type,
            'is_positive' => $this->isPositive(),
            'description' => $this->description,
            'order_id' => $this->order_id,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
