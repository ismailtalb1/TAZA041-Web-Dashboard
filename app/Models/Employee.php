<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class Employee extends Authenticatable
{
    use HasApiTokens, HasFactory;

    // ─────────────────────────────────────────────
    // إعدادات الجدول
    // ─────────────────────────────────────────────
    protected $table = 'employees';

    protected $fillable = [
        'name',
        'username',
        'password_hash',
        'role',
        'email',
        'phone',
        'avatar',
        'is_active',
        'created_by',
    ];

    protected $hidden = [
        'password_hash',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // ─────────────────────────────────────────────
    // Sanctum يبحث عن حقل password افتراضياً
    // نخبره أن حقلنا اسمه password_hash
    // ─────────────────────────────────────────────
    public function getAuthPassword(): string
    {
        return $this->password_hash;
    }

    // ─────────────────────────────────────────────
    // العلاقات — Relationships
    // ─────────────────────────────────────────────

    // المدير العام الذي أنشأ هذا الموظف
    public function creator(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'created_by');
    }

    // الموظفون الذين أنشأهم هذا المدير
    public function managedEmployees(): HasMany
    {
        return $this->hasMany(Employee::class, 'created_by');
    }

    // طلبات التوصيل المسندة لهذا السائق
    public function deliveryOrders(): HasMany
    {
        return $this->hasMany(DeliveryOrder::class, 'driver_id');
    }

    // التقارير التي أرسلها هذا الموظف
    public function sentReports(): HasMany
    {
        return $this->hasMany(Report::class, 'sender_id');
    }

    // التقارير التي استلمها هذا الموظف
    public function receivedReports(): HasMany
    {
        return $this->hasMany(Report::class, 'receiver_id');
    }

    // ─────────────────────────────────────────────
    // Scopes — فلاتر جاهزة
    // ─────────────────────────────────────────────

    // جلب الموظفين النشطين فقط
    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    // جلب موظفين حسب الدور
    public function scopeByRole($query, string $role)
    {
        return $query->where('role', $role);
    }

    // جلب كل موظف ما عدا المدير العام
    public function scopeStaffOnly($query)
    {
        return $query->where('role', '!=', 'general_manager');
    }

    // ─────────────────────────────────────────────
    // الثوابت — Roles
    // ─────────────────────────────────────────────
    const ROLE_GENERAL_MANAGER = 'general_manager';

    const ROLE_ORDER_MANAGER = 'order_manager';

    const ROLE_DELIVERY_MANAGER = 'delivery_manager';

    const ROLE_FINANCE_MANAGER = 'finance_manager';

    const ROLE_INVENTORY_MANAGER = 'inventory_manager';

    const ROLE_COMMUNICATION_MANAGER = 'communication_manager';

    const ROLE_DRIVER = 'driver';

    const ALL_ROLES = [
        self::ROLE_GENERAL_MANAGER,
        self::ROLE_ORDER_MANAGER,
        self::ROLE_DELIVERY_MANAGER,
        self::ROLE_FINANCE_MANAGER,
        self::ROLE_INVENTORY_MANAGER,
        self::ROLE_COMMUNICATION_MANAGER,
        self::ROLE_DRIVER,
    ];

    // ─────────────────────────────────────────────
    // الصلاحيات حسب الدور
    // ─────────────────────────────────────────────
    public function getAbilities(): array
    {
        return match ($this->role) {
            self::ROLE_GENERAL_MANAGER => [
                'manage_employees',
                'manage_products',
                'manage_offers',
                'manage_restaurant_info',
                'view_all_orders',
                'view_all_reports',
                'manage_customers',
                'send_notifications',
            ],
            self::ROLE_ORDER_MANAGER => [
                'manage_orders',
                'manage_reservations',
                'send_notifications',
                'view_own_profile',
            ],
            self::ROLE_DELIVERY_MANAGER => [
                'manage_delivery',
                'view_delivery_orders',
                'send_notifications',
                'view_own_profile',
            ],
            self::ROLE_INVENTORY_MANAGER => [
                'manage_products',
                'manage_offers',
                'manage_stock',
                'view_own_profile',
            ],
            self::ROLE_FINANCE_MANAGER => [
                'manage_payment_accounts',
                'view_financial_reports',
                'view_own_profile',
            ],
            self::ROLE_COMMUNICATION_MANAGER => [
                'manage_restaurant_info',
                'manage_restaurant_images',
                'view_ai_reports',
                'forward_reports',
                'view_own_profile',
            ],
            self::ROLE_DRIVER => [
                'view_assigned_deliveries',
                'update_delivery_status',
                'view_own_profile',
            ],
            default => [],
        };
    }

    // ─────────────────────────────────────────────
    // التوابع — Methods (من UML)
    // ─────────────────────────────────────────────

    // اسم الدور بالعربي للعرض في الـ Dashboard
    public function getRoleLabel(): string
    {
        return match ($this->role) {
            self::ROLE_GENERAL_MANAGER => 'المدير العام',
            self::ROLE_ORDER_MANAGER => 'مدير الطلبات',
            self::ROLE_DELIVERY_MANAGER => 'مدير التوصيل',
            self::ROLE_FINANCE_MANAGER => 'المدير المالي',
            self::ROLE_INVENTORY_MANAGER => 'مدير المخزون والعروض',
            self::ROLE_COMMUNICATION_MANAGER => 'مدير التواصل',
            self::ROLE_DRIVER => 'سائق',
            default => 'موظف',
        };
    }

    // الدور (من UML: getRole)
    public function getRole(): string
    {
        return $this->role;
    }

    // تفاصيل الموظف الكاملة (من UML: getDetails)
    // تُستخدم في AuthController عند تسجيل الدخول
    public function getDetails(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'username' => $this->username,
            'role' => $this->role,
            'role_label' => $this->getRoleLabel(),
            'email' => $this->email,
            'phone' => $this->phone,
            'avatar' => $this->avatar
                                ? asset('storage/'.$this->avatar)
                                : null,
            'is_active' => $this->is_active,
            'abilities' => $this->getAbilities(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }

    // إنشاء توكن مصادقة للموظف مع صلاحياته
    public function generateAuthToken(): string
    {
        // حذف التوكنات القديمة أولاً
        $this->tokens()->delete();

        $expiration = (int) config('sanctum.employee_token_expiration', 480);

        return $this->createToken(
            name: 'employee-'.$this->role,
            abilities: $this->getAbilities(),
            expiresAt: now()->addMinutes($expiration)
        )->plainTextToken;
    }

    // التحقق من أن الموظف يملك صلاحية معينة
    public function hasAbility(string $ability): bool
    {
        return in_array($ability, $this->getAbilities());
    }

    // هل هو المدير العام؟
    public function isGeneralManager(): bool
    {
        return $this->role === self::ROLE_GENERAL_MANAGER;
    }

    // هل هو سائق؟
    public function isDriver(): bool
    {
        return $this->role === self::ROLE_DRIVER;
    }

    // متوسط تقييم السائق (لو كان driver)
    public function getAverageDriverRating(): ?float
    {
        if (! $this->isDriver()) {
            return null;
        }

        $avg = DeliveryOrder::where('driver_id', $this->id)
            ->whereNotNull('driver_rating')
            ->avg('driver_rating');

        return $avg ? round($avg, 1) : null;
    }

    // عدد التوصيلات المكتملة (للسائق)
    public function getCompletedDeliveriesCount(): int
    {
        return DeliveryOrder::where('driver_id', $this->id)
            ->where('status', 'delivered')
            ->count();
    }
}
