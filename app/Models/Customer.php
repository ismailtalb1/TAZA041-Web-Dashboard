<?php

namespace App\Models;

use App\Notifications\CustomerResetPasswordNotification;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\HasApiTokens;

class Customer extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    // ─────────────────────────────────────────────
    // إعدادات الجدول
    // ─────────────────────────────────────────────
    protected $table = 'customers';

    protected $fillable = [
        'name',
        'email',
        'phone',
        'password_hash',
        'avatar',
        'address',
        'bio',
        'date_of_birth',
        'status',
        'loyalty_points',
    ];

    protected $hidden = [
        'password_hash',
    ];

    protected $casts = [
        'date_of_birth' => 'date',
        'loyalty_points' => 'integer',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // ─────────────────────────────────────────────
    // Sanctum — حقل كلمة المرور
    // ─────────────────────────────────────────────
    public function getAuthPassword(): string
    {
        return $this->password_hash ?? '';
    }

    // ─────────────────────────────────────────────
    // الثوابت
    // ─────────────────────────────────────────────
    const STATUS_GUEST = 'guest';

    const STATUS_REGISTERED = 'registered';

    // عدد الإلغاءات الذي يُشغّل تحذير الحظر
    const CANCELLATION_WARNING_THRESHOLD = 3;

    const CANCELLATION_BAN_THRESHOLD = 10;

    const CANCELLATION_BAN_WINDOW_DAYS = 5;

    /**
     * تنظيف البريد أو رقم الهاتف قبل التخزين أو البحث.
     */
    public static function normalizeContact(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $value = trim($value);

        return $value === '' ? null : $value;
    }

    /**
     * البحث عن زبون مسجل باستخدام البريد الإلكتروني أو رقم الهاتف.
     */
    public static function findByIdentifier(string $identifier): ?self
    {
        $identifier = trim($identifier);
        $field = filter_var($identifier, FILTER_VALIDATE_EMAIL) ? 'email' : 'phone';

        return self::where($field, $identifier)
            ->where('status', self::STATUS_REGISTERED)
            ->first();
    }

    /**
     * تغيير كلمة مرور الزبون بطريقة موحدة.
     */
    public function setPassword(string $password): void
    {
        $this->password_hash = Hash::make($password);
        $this->save();
    }

    public function sendPasswordResetNotification($token): void
    {
        $this->notify(new CustomerResetPasswordNotification($token));
    }

    // ─────────────────────────────────────────────
    // العلاقات — Relationships
    // ─────────────────────────────────────────────

    // كل طلبات الزبون
    public function orders(): HasMany
    {
        return $this->hasMany(Order::class, 'customer_id');
    }

    public function savedAddresses(): HasMany
    {
        return $this->hasMany(CustomerSavedAddress::class, 'customer_id');
    }

    // الطلبات المكتملة فقط
    public function completedOrders(): HasMany
    {
        return $this->hasMany(Order::class, 'customer_id')
            ->where('status', 'completed');
    }

    // الطلبات الملغاة فقط
    public function cancelledOrders(): HasMany
    {
        return $this->hasMany(Order::class, 'customer_id')
            ->where('status', 'cancelled');
    }

    // حساب الولاء
    public function loyaltyAccount(): HasOne
    {
        return $this->hasOne(LoyaltyAccount::class, 'customer_id');
    }

    public function ensureLoyaltyAccount(): LoyaltyAccount
    {
        $balance = $this->isBanned() ? 0 : max(0, (int) $this->loyalty_points);

        return LoyaltyAccount::firstOrCreate(
            ['customer_id' => $this->id],
            [
                'points_balance' => $balance,
                'tier' => LoyaltyAccount::tierForBalance($balance),
                'total_points_earned' => $balance,
                'total_points_redeemed' => 0,
                'last_activity_at' => $balance > 0 ? now() : null,
            ]
        );
    }

    // إشعارات الزبون
    public function notifications(): HasMany
    {
        return $this->hasMany(Notification::class, 'receiver_id')
            ->where('receiver_type', 'customer')
            ->latest();
    }

    // تقييمات الزبون
    public function reviews(): HasMany
    {
        return $this->hasMany(Review::class, 'customer_id');
    }

    // اقتراحات الوجبات
    public function mealSuggestions(): HasMany
    {
        return $this->hasMany(MealSuggestion::class, 'customer_id');
    }

    // محادثات الذكاء الاصطناعي
    public function aiConversations(): HasMany
    {
        return $this->hasMany(AiConversation::class, 'customer_id');
    }

    // ─────────────────────────────────────────────
    // Scopes — فلاتر جاهزة للمدير العام
    // ─────────────────────────────────────────────

    // الزبائن المسجلين فقط
    public function scopeRegistered($query)
    {
        return $query->where('status', self::STATUS_REGISTERED);
    }

    // الزبائن المحظورين (loyalty_points = -1 علامة الحظر)
    public function scopeBanned($query)
    {
        return $query->where('loyalty_points', -1);
    }

    // الزبائن النشطين (غير محظورين)
    public function scopeActive($query)
    {
        return $query->where('loyalty_points', '!=', -1)
            ->where('status', self::STATUS_REGISTERED);
    }

    // الزبائن الأكثر طلباً
    public function scopeMostOrders($query)
    {
        return $query->withCount('completedOrders')
            ->orderByDesc('completed_orders_count');
    }

    // الزبائن الأكثر إنفاقاً
    public function scopeTopSpenders($query)
    {
        return $query->withSum(
            ['orders as total_spent' => fn ($q) => $q->where('status', 'completed')],
            'final_price'
        )->orderByDesc('total_spent');
    }

    // الزبائن الأكثر نقاط ولاء
    public function scopeTopLoyalty($query)
    {
        return $query->orderByDesc('loyalty_points');
    }

    // الزبائن المشبوهين (إلغاءات كثيرة)
    public function scopeSuspicious($query)
    {
        return $query->whereHas(
            'cancelledOrders',
            null,
            '>=',
            self::CANCELLATION_WARNING_THRESHOLD
        )->withCount('cancelledOrders')
            ->orderByDesc('cancelled_orders_count');
    }

    // ─────────────────────────────────────────────
    // التوابع — Methods
    // ─────────────────────────────────────────────

    // هل الزبون مسجل؟
    public function isRegistered(): bool
    {
        return $this->status === self::STATUS_REGISTERED;
    }

    // هل الزبون محظور؟
    public function isBanned(): bool
    {
        return $this->loyalty_points === -1;
    }

    // حظر الزبون (المدير العام فقط)
    // السبب يُحفظ في الإشعار ويُرسل للزبون
    public function ban(Employee $bannedBy, string $reason): void
    {
        $originalPoints = $this->loyalty_points;
        $this->loyalty_points = -1;
        $this->save();

        // إشعار للزبون بالحظر
        Notification::create([
            'sender_type' => 'employee',
            'sender_id' => $bannedBy->id,
            'receiver_type' => 'customer',
            'receiver_id' => $this->id,
            'type' => 'system_announcement',
            'title' => 'تم تعليق حسابك',
            'message' => 'تم تعليق حسابك في مطعم TAZA 041. السبب: '.$reason,
            'data' => json_encode([
                'reason' => $reason,
                'banned_by' => $bannedBy->name,
                'original_points' => $originalPoints,
            ]),
        ]);

        // حذف توكنات الزبون فوراً
        $this->tokens()->delete();
    }

    // رفع الحظر
    public function unban(Employee $unbannedBy): void
    {
        $this->loyalty_points = 0;
        $this->save();

        Notification::create([
            'sender_type' => 'employee',
            'sender_id' => $unbannedBy->id,
            'receiver_type' => 'customer',
            'receiver_id' => $this->id,
            'type' => 'system_announcement',
            'title' => 'تم رفع تعليق حسابك',
            'message' => 'تم رفع التعليق عن حسابك في مطعم TAZA 041. أهلاً بك من جديد!',
            'data' => json_encode([
                'unbanned_by' => $unbannedBy->name,
            ]),
        ]);
    }

    // عدد الإلغاءات — يستخدمها المدير للقرار
    public function getCancellationCount(): int
    {
        return $this->cancelledOrders()->count();
    }

    // هل الزبون مرشح للحظر؟
    public function isSuspicious(): bool
    {
        return $this->getCancellationCount() >= self::CANCELLATION_WARNING_THRESHOLD;
    }

    public function getRecentCancellationCount(int $days = self::CANCELLATION_BAN_WINDOW_DAYS): int
    {
        return $this->cancelledOrders()
            ->where('updated_at', '>=', now()->subDays($days))
            ->count();
    }

    public function shouldAutoBanForCancellations(
        int $threshold = self::CANCELLATION_BAN_THRESHOLD,
        int $days = self::CANCELLATION_BAN_WINDOW_DAYS
    ): bool {
        return ! $this->isBanned() && $this->getRecentCancellationCount($days) >= $threshold;
    }

    public function autoBanForCancellations(
        int $threshold = self::CANCELLATION_BAN_THRESHOLD,
        int $days = self::CANCELLATION_BAN_WINDOW_DAYS
    ): bool {
        if (! $this->shouldAutoBanForCancellations($threshold, $days)) {
            return false;
        }

        $this->loyalty_points = -1;
        $this->save();
        $this->tokens()->delete();

        Notification::create([
            'sender_type' => 'system',
            'sender_id' => null,
            'receiver_type' => 'customer',
            'receiver_id' => $this->id,
            'type' => 'system_announcement',
            'title' => 'تم تعليق حسابك مؤقتاً',
            'message' => "تم تعليق حسابك تلقائياً بسبب إلغاء {$threshold} طلبات خلال {$days} أيام. يرجى التواصل مع إدارة المطعم للمراجعة.",
            'data' => json_encode([
                'reason' => 'excessive_cancellations',
                'threshold' => $threshold,
                'window_days' => $days,
            ]),
        ]);

        return true;
    }

    // إجمالي ما أنفقه الزبون
    public function getTotalSpent(): float
    {
        return (float) $this->orders()
            ->where('status', 'completed')
            ->sum('final_price');
    }

    // تفاصيل الزبون للمدير العام
    public function getDetailsForAdmin(): array
    {
        $totalOrders = $this->getAttribute('total_orders');
        $completedOrders = $this->getAttribute('completed_orders');
        $cancelCount = $this->getAttribute('cancelled_orders');
        $totalSpent = $this->getAttribute('total_spent');
        $recentCancelCount = $this->getAttribute('recent_cancelled_orders');

        $totalOrders = $totalOrders !== null ? (int) $totalOrders : $this->orders()->count();
        $completedOrders = $completedOrders !== null ? (int) $completedOrders : $this->completedOrders()->count();
        $cancelCount = $cancelCount !== null ? (int) $cancelCount : $this->getCancellationCount();
        $totalSpent = $totalSpent !== null ? (float) $totalSpent : $this->getTotalSpent();
        $recentCancelCount = $recentCancelCount !== null
            ? (int) $recentCancelCount
            : $this->getRecentCancellationCount();

        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'phone' => $this->phone,
            'avatar' => $this->avatar
                                      ? asset('storage/'.$this->avatar)
                                      : null,
            'address' => $this->address,
            'status' => $this->status,
            'is_banned' => $this->isBanned(),
            'is_suspicious' => $cancelCount >= self::CANCELLATION_WARNING_THRESHOLD,
            'loyalty_points' => $this->isBanned() ? 0 : $this->loyalty_points,
            'loyalty_tier' => $this->loyaltyAccount?->tier ?? 'bronze',
            'total_orders' => $totalOrders,
            'completed_orders' => $completedOrders,
            'cancelled_orders' => $cancelCount,
            'total_spent' => $totalSpent,
            'recent_cancelled_orders' => $recentCancelCount,
            'cancellation_risk' => match (true) {
                $recentCancelCount >= self::CANCELLATION_BAN_THRESHOLD => 'high',
                $cancelCount >= self::CANCELLATION_WARNING_THRESHOLD => 'medium',
                default => 'low',
            },
            'created_at' => $this->created_at?->format('Y-m-d'),
        ];
    }

    // تفاصيل الزبون لنفسه
    public function getProfileDetails(): array
    {
        $savedAddresses = $this->getSavedAddressesPayload();

        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'phone' => $this->phone,
            'avatar' => $this->avatar
                                    ? asset('storage/'.$this->avatar)
                                    : null,
            'address' => $this->address,
            'bio' => $this->bio,
            'date_of_birth' => $this->date_of_birth?->format('Y-m-d'),
            'loyalty_points' => $this->loyaltyAccount?->points_balance ?? $this->loyalty_points,
            'loyalty_tier' => $this->loyaltyAccount?->tier ?? 'bronze',
            // Keep both names for web/mobile clients released against either API shape.
            'saved_addresses' => $savedAddresses,
            'addresses' => $savedAddresses,
            'created_at' => $this->created_at?->toDateString(),
        ];
    }

    public function getSavedAddressesPayload(): array
    {
        return $this->savedAddresses()
            ->orderByRaw("CASE type WHEN 'home' THEN 1 WHEN 'work' THEN 2 ELSE 3 END")
            ->get()
            ->map(fn (CustomerSavedAddress $address) => $address->toCustomerPayload())
            ->all();
    }

    // إنشاء توكن للزبون
    public function generateAuthToken(): string
    {
        $this->tokens()->delete();

        $expiration = (int) config('sanctum.customer_token_expiration', 43200);

        return $this->createToken(
            name: 'customer-token',
            abilities: ['place_orders', 'view_menu', 'manage_profile'],
            expiresAt: now()->addMinutes($expiration)
        )->plainTextToken;
    }
}
