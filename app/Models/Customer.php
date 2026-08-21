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
        'last_ip_address',
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

    const SECURITY_HIGH_RISK_THRESHOLD = 7;

    const SECURITY_SAFE = 'safe';

    const SECURITY_WATCH = 'watch';

    const SECURITY_HIGH_RISK = 'high_risk';

    const SECURITY_BLOCKED = 'blocked';

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

    public function blockedIpAddresses(): HasMany
    {
        return $this->hasMany(CustomerBlockedIp::class, 'customer_id');
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

    public function scopeSecurityStatus($query, string $status)
    {
        return match ($status) {
            self::SECURITY_BLOCKED => $query->banned(),
            self::SECURITY_HIGH_RISK => $query
                ->where('loyalty_points', '!=', -1)
                ->whereHas(
                    'cancelledOrders',
                    fn ($orders) => $orders->where('updated_at', '>=', now()->subDays(self::CANCELLATION_BAN_WINDOW_DAYS)),
                    '>=',
                    self::SECURITY_HIGH_RISK_THRESHOLD
                ),
            self::SECURITY_WATCH => $query
                ->where('loyalty_points', '!=', -1)
                ->whereHas('cancelledOrders', null, '>=', self::CANCELLATION_WARNING_THRESHOLD)
                ->whereHas(
                    'cancelledOrders',
                    fn ($orders) => $orders->where('updated_at', '>=', now()->subDays(self::CANCELLATION_BAN_WINDOW_DAYS)),
                    '<',
                    self::SECURITY_HIGH_RISK_THRESHOLD
                ),
            self::SECURITY_SAFE => $query
                ->where('loyalty_points', '!=', -1)
                ->whereHas('cancelledOrders', null, '<', self::CANCELLATION_WARNING_THRESHOLD),
            default => $query,
        };
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

        $this->activateIpBlock($bannedBy, $reason);

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

        $this->blockedIpAddresses()
            ->where('is_active', true)
            ->update(['is_active' => false, 'released_at' => now()]);

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
        $this->activateIpBlock(null, 'حظر تلقائي بسبب كثرة إلغاء الطلبات');
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

    public function recordAccessIp(?string $ipAddress): void
    {
        $ipAddress = CustomerBlockedIp::normalize($ipAddress);
        if ($ipAddress === null || $this->last_ip_address === $ipAddress) {
            return;
        }

        $this->forceFill(['last_ip_address' => $ipAddress])->save();
    }

    public function activateIpBlock(?Employee $bannedBy, string $reason): void
    {
        $ipAddress = CustomerBlockedIp::normalize($this->last_ip_address);
        if ($ipAddress === null) {
            return;
        }

        $this->blockedIpAddresses()->updateOrCreate(
            ['ip_address' => $ipAddress],
            [
                'banned_by' => $bannedBy?->id,
                'reason' => $reason,
                'is_active' => true,
                'banned_at' => now(),
                'released_at' => null,
            ]
        );
    }

    public function getSecurityStatus(?int $cancelCount = null, ?int $recentCancelCount = null): string
    {
        if ($this->isBanned()) {
            return self::SECURITY_BLOCKED;
        }

        $cancelCount ??= $this->getCancellationCount();
        $recentCancelCount ??= $this->getRecentCancellationCount();

        if ($recentCancelCount >= self::SECURITY_HIGH_RISK_THRESHOLD) {
            return self::SECURITY_HIGH_RISK;
        }

        return $cancelCount >= self::CANCELLATION_WARNING_THRESHOLD
            ? self::SECURITY_WATCH
            : self::SECURITY_SAFE;
    }

    /** @return array{title: string, message: string} */
    public function getSuggestedSecurityWarning(?string $securityStatus = null): array
    {
        $securityStatus ??= $this->getSecurityStatus();

        return match ($securityStatus) {
            self::SECURITY_BLOCKED => [
                'title' => 'تنبيه بخصوص تعليق الحساب',
                'message' => 'حسابك موقوف حالياً. يرجى التواصل مع إدارة مطعم TAZA 041 لمراجعة سبب التعليق قبل محاولة إنشاء حساب آخر.',
            ],
            self::SECURITY_HIGH_RISK => [
                'title' => 'تحذير أخير بخصوص الطلبات',
                'message' => 'لاحظنا عدداً مرتفعاً من إلغاءات الطلبات خلال فترة قصيرة. استمرار الإلغاءات قد يؤدي إلى تعليق الحساب والجهاز المتصل به. يرجى تأكيد الطلب فقط عند الجدية.',
            ],
            self::SECURITY_WATCH => [
                'title' => 'تنبيه بخصوص تكرار الإلغاء',
                'message' => 'لاحظنا تكرار إلغاء الطلبات في حسابك. نرجو مراجعة تفاصيل الطلب قبل تأكيده، لأن استمرار الإلغاءات قد يؤدي إلى تقييد الحساب.',
            ],
            default => [
                'title' => 'تنبيه أمني احترازي',
                'message' => 'نذكّرك بالحفاظ على بيانات حسابك وعدم مشاركتها، والتأكد من تفاصيل الطلب قبل إرساله. شكراً لتعاونك مع TAZA 041.',
            ],
        };
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
        $securityStatus = $this->getSecurityStatus($cancelCount, $recentCancelCount);
        $suggestedWarning = $this->getSuggestedSecurityWarning($securityStatus);

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
            'security_status' => $securityStatus,
            'security_warning' => $suggestedWarning,
            'last_ip_address' => $this->last_ip_address,
            'is_ip_blocked' => $this->blockedIpAddresses()
                ->where('is_active', true)
                ->exists(),
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
        $expiration = (int) config('sanctum.customer_token_expiration', 43200);

        // لكل جهاز/متصفح جلسة مستقلة. حذف كل التوكنات هنا كان يؤدي إلى
        // تسجيل خروج تطبيق الموبايل بمجرد دخول الزبون من الموقع أو جهاز آخر.
        $this->tokens()
            ->whereNotNull('expires_at')
            ->where('expires_at', '<=', now())
            ->delete();

        return $this->createToken(
            name: 'customer-token',
            abilities: ['place_orders', 'view_menu', 'manage_profile'],
            expiresAt: now()->addMinutes($expiration)
        )->plainTextToken;
    }
}
