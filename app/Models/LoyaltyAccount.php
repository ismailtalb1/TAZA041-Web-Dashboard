<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class LoyaltyAccount extends Model
{
    use HasFactory;

    // ✅ مطابق لقاعدة البيانات
    protected $table = 'loyalty_accounts';

    protected $fillable = [
        'customer_id',
        'points_balance',
        'tier',
        'total_points_earned',
        'total_points_redeemed',
        'last_activity_at',
    ];

    protected $casts = [
        'points_balance' => 'integer',
        'total_points_earned' => 'integer',
        'total_points_redeemed' => 'integer',
        'last_activity_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // ─────────────────────────────────────────────
    // الثوابت — مستويات الولاء
    // ─────────────────────────────────────────────
    const TIER_BRONZE = 'bronze';

    const TIER_SILVER = 'silver';

    const TIER_GOLD = 'gold';

    const TIER_PLATINUM = 'platinum';

    // حدود المستويات حسب رصيد النقاط الحالي
    const TIER_THRESHOLDS = [
        self::TIER_BRONZE => 0,
        self::TIER_SILVER => 400,
        self::TIER_GOLD => 700,
        self::TIER_PLATINUM => 1000,
    ];

    const TIER_LABELS = [
        self::TIER_BRONZE => '🥉 برونزي',
        self::TIER_SILVER => '🥈 فضي',
        self::TIER_GOLD => '🥇 ذهبي',
        self::TIER_PLATINUM => '💎 بلاتينيوم',
    ];

    const TIER_MULTIPLIERS = [
        self::TIER_BRONZE => 1.0,
        self::TIER_SILVER => 1.2,
        self::TIER_GOLD => 1.5,
        self::TIER_PLATINUM => 2.0,
    ];

    const TIER_NAMES = [
        self::TIER_BRONZE => ['ar' => 'برونزي', 'en' => 'Bronze', 'icon' => '🥉'],
        self::TIER_SILVER => ['ar' => 'فضي', 'en' => 'Silver', 'icon' => '🥈'],
        self::TIER_GOLD => ['ar' => 'ذهبي', 'en' => 'Gold', 'icon' => '🥇'],
        self::TIER_PLATINUM => ['ar' => 'بلاتينيوم', 'en' => 'Platinum', 'icon' => '💎'],
    ];

    // معدل الأساس: 1 نقطة لكل 10 ل.س في المستوى البرونزي
    const POINTS_PER_10_SYP = 1;

    // ─────────────────────────────────────────────
    // العلاقات
    // ─────────────────────────────────────────────
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(LoyaltyTransaction::class)->latest();
    }

    public function earningTransactions(): HasMany
    {
        return $this->hasMany(LoyaltyTransaction::class)
            ->where('type', LoyaltyTransaction::TYPE_EARNING)
            ->latest();
    }

    public function redemptionTransactions(): HasMany
    {
        return $this->hasMany(LoyaltyTransaction::class)
            ->where('type', LoyaltyTransaction::TYPE_REDEMPTION)
            ->latest();
    }

    // ─────────────────────────────────────────────
    // حساب النقاط المكتسبة من مبلغ معين
    // ─────────────────────────────────────────────
    public static function calculatePointsFromAmount(float $amount, string $tier = self::TIER_BRONZE): int
    {
        $multiplier = self::multiplierForTier($tier);

        return (int) floor(($amount / 10) * self::POINTS_PER_10_SYP * $multiplier);
    }

    public static function calculateRedemptionPoints(float $amount): int
    {
        return max(1, (int) ceil(max(0, $amount) / 10));
    }

    public static function tierForBalance(int $balance): string
    {
        foreach (array_reverse(self::TIER_THRESHOLDS, true) as $tier => $threshold) {
            if (max(0, $balance) >= $threshold) {
                return $tier;
            }
        }

        return self::TIER_BRONZE;
    }

    public static function normalizeMultipliers(mixed $multipliers): array
    {
        if (is_string($multipliers)) {
            $multipliers = json_decode($multipliers, true);
        }

        $multipliers = is_array($multipliers) ? $multipliers : [];

        $normalized = [];
        foreach (self::TIER_MULTIPLIERS as $tier => $fallback) {
            $normalized[$tier] = round(
                min(10, max(0.1, (float) ($multipliers[$tier] ?? $fallback))),
                2
            );
        }

        return $normalized;
    }

    public static function configuredMultipliers(): array
    {
        try {
            return self::normalizeMultipliers(
                RestaurantInfo::query()->value('loyalty_tier_multipliers')
            );
        } catch (\Throwable) {
            // تُستخدم القيم الآمنة أثناء الترحيل أو عندما لا يكون الجدول جاهزاً بعد.
            return self::TIER_MULTIPLIERS;
        }
    }

    public static function multiplierForTier(string $tier): float
    {
        $multipliers = self::configuredMultipliers();

        return $multipliers[$tier] ?? $multipliers[self::TIER_BRONZE];
    }

    public static function tierCatalog(?array $multipliers = null): array
    {
        $multipliers = self::normalizeMultipliers($multipliers ?? self::configuredMultipliers());

        return array_map(
            fn (string $tier) => [
                'key' => $tier,
                'name_ar' => self::TIER_NAMES[$tier]['ar'],
                'name_en' => self::TIER_NAMES[$tier]['en'],
                'icon' => self::TIER_NAMES[$tier]['icon'],
                'minimum_points' => self::TIER_THRESHOLDS[$tier],
                'earning_multiplier' => $multipliers[$tier],
            ],
            array_keys(self::TIER_THRESHOLDS)
        );
    }

    // ─────────────────────────────────────────────
    // إضافة نقاط (عند إتمام الدفع)
    // ─────────────────────────────────────────────
    public function addPoints(int $amount, string $reason = 'order_payment'): void
    {
        $oldTier = $this->tier;

        $this->points_balance += $amount;
        $this->total_points_earned += $amount;
        $this->last_activity_at = now();

        $this->updateTier();
        $this->save();
        $this->syncCustomerPoints();

        // إشعار الزبون بترقي المستوى
        $newTier = $this->tier;
        if ($oldTier !== $newTier) {
            $this->notifyTierUpgrade($newTier);
        }
    }

    // ─────────────────────────────────────────────
    // استرداد النقاط (الدفع بالنقاط)
    // ─────────────────────────────────────────────
    public function redeemPoints(int $amount, int $orderId): bool
    {
        if ($this->points_balance < $amount) {
            return false;
        }

        $this->points_balance -= $amount;
        $this->total_points_redeemed += $amount;
        $this->last_activity_at = now();
        $this->updateTier();
        $this->save();
        $this->syncCustomerPoints();

        // تسجيل معاملة الاسترداد
        LoyaltyTransaction::create([
            'loyalty_account_id' => $this->id,
            'order_id' => $orderId,
            'points' => -$amount,
            'type' => LoyaltyTransaction::TYPE_REDEMPTION,
            'description' => "دفع طلب #{$orderId} بنقاط الولاء",
        ]);

        return true;
    }

    public function reverseEarnedPoints(int $amount): void
    {
        $amount = max(0, $amount);
        if ($amount === 0) {
            return;
        }

        $this->points_balance = max(0, $this->points_balance - $amount);
        $this->total_points_earned = max(0, $this->total_points_earned - $amount);
        $this->last_activity_at = now();
        $this->updateTier();
        $this->save();
        $this->syncCustomerPoints();
    }

    public function restoreRedeemedPoints(int $amount): void
    {
        $amount = max(0, $amount);
        if ($amount === 0) {
            return;
        }

        $this->points_balance += $amount;
        $this->total_points_redeemed = max(0, $this->total_points_redeemed - $amount);
        $this->last_activity_at = now();
        $this->updateTier();
        $this->save();
        $this->syncCustomerPoints();
    }

    // مزامنة الرصيد المختصر في جدول customers مع الحساب التفصيلي للولاء.
    // مهم خصوصاً عند الدفع بالنقاط حتى لا يظهر الرصيد وكأنه ازداد بعد الخصم.
    public function syncCustomerPoints(): void
    {
        Customer::where('id', $this->customer_id)
            ->where('loyalty_points', '!=', -1)
            ->update(['loyalty_points' => max(0, (int) $this->points_balance)]);
    }

    // ─────────────────────────────────────────────
    // تحديث المستوى
    // ─────────────────────────────────────────────
    public function updateTier(): void
    {
        $newTier = self::tierForBalance((int) $this->points_balance);

        $this->tier = $newTier;
    }

    // ─────────────────────────────────────────────
    // إشعار ترقي المستوى
    // ─────────────────────────────────────────────
    private function notifyTierUpgrade(string $newTier): void
    {
        Notification::create([
            'sender_type' => 'system',
            'sender_id' => null,
            'receiver_type' => 'customer',
            'receiver_id' => $this->customer_id,
            'type' => 'loyalty_tier_upgrade',
            'title' => 'مبروك! ترقيت في برنامج الولاء 🎉',
            'message' => 'وصلت إلى مستوى '.self::TIER_LABELS[$newTier].
                               '! استمتع بمزايا المستوى الجديد',
            'data' => json_encode([
                'new_tier' => $newTier,
                'tier_label' => self::TIER_LABELS[$newTier],
                'points_balance' => $this->points_balance,
            ]),
        ]);
    }

    // النقاط اللازمة للترقي للمستوى التالي
    public function getPointsToNextTier(): ?int
    {
        $thresholds = array_values(self::TIER_THRESHOLDS);
        $tierKeys = array_keys(self::TIER_THRESHOLDS);
        $currentIdx = array_search($this->tier, $tierKeys);

        if ($currentIdx === false || $currentIdx >= count($thresholds) - 1) {
            return null; // بلاتيني — أعلى مستوى
        }

        $nextThreshold = $thresholds[$currentIdx + 1];

        return max(0, $nextThreshold - $this->points_balance);
    }

    // نسبة التقدم نحو المستوى التالي
    public function getTierProgress(): float
    {
        $thresholds = array_values(self::TIER_THRESHOLDS);
        $tierKeys = array_keys(self::TIER_THRESHOLDS);
        $currentIdx = array_search($this->tier, $tierKeys);

        if ($currentIdx === false) {
            return 100.0;
        }
        if ($currentIdx >= count($thresholds) - 1) {
            return 100.0;
        }

        $currentThreshold = $thresholds[$currentIdx];
        $nextThreshold = $thresholds[$currentIdx + 1];
        $range = $nextThreshold - $currentThreshold;
        $progress = $this->points_balance - $currentThreshold;

        return round(min(100, ($progress / $range) * 100), 1);
    }

    // تفاصيل حساب الولاء للواجهة
    public function getDetails(): array
    {
        $nextTierKey = array_keys(self::TIER_THRESHOLDS);
        $currentIdx = array_search($this->tier, $nextTierKey);
        $nextTier = $nextTierKey[($currentIdx + 1)] ?? null;

        return [
            'points_balance' => $this->points_balance,
            'tier' => $this->tier,
            'tier_label' => self::TIER_LABELS[$this->tier] ?? $this->tier,
            'tier_name_ar' => self::TIER_NAMES[$this->tier]['ar'] ?? $this->tier,
            'tier_name_en' => self::TIER_NAMES[$this->tier]['en'] ?? ucfirst($this->tier),
            'tier_icon' => self::TIER_NAMES[$this->tier]['icon'] ?? '⭐',
            'minimum_points' => self::TIER_THRESHOLDS[$this->tier] ?? 0,
            'earning_multiplier' => self::multiplierForTier($this->tier),
            'total_points_earned' => $this->total_points_earned,
            'total_points_redeemed' => $this->total_points_redeemed,
            'points_to_next_tier' => $this->getPointsToNextTier(),
            'tier_progress' => $this->getTierProgress(),
            'next_tier' => $nextTier,
            'next_tier_label' => $nextTier
                                           ? self::TIER_LABELS[$nextTier]
                                           : null,
            'last_activity_at' => $this->last_activity_at?->format('Y-m-d'),
            'tier_catalog' => self::tierCatalog(),
            // معلومات الكسب للواجهة
            'earning_info' => [
                'points_per_10_syp' => self::POINTS_PER_10_SYP,
                'current_multiplier' => self::multiplierForTier($this->tier),
                'description' => 'كل 10 ل.س تساوي نقطة أساسية، وتُضاعف حسب مستوى الولاء',
            ],
        ];
    }

    // getters
    public function getPointsBalance(): int
    {
        return $this->points_balance;
    }

    public function getTier(): string
    {
        return $this->tier;
    }
}
