<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Review extends Model
{
    use HasFactory;

    // ✅ مطابق لقاعدة البيانات
    protected $table = 'reviews';

    protected $fillable = [
        'reviewer_type',
        'reviewer_id',
        'reviewable_type',
        'reviewable_id',
        'rating',
        'comment',
        'customer_id',
    ];

    protected $casts = [
        'rating' => 'integer',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // ─────────────────────────────────────────────
    // الثوابت
    // ─────────────────────────────────────────────
    const REVIEWER_CUSTOMER = 'customer';

    const REVIEWER_EMPLOYEE = 'employee';

    const REVIEWABLE_DRIVER = 'driver';   // زبون يقيّم سائق

    const REVIEWABLE_EMPLOYEE = 'employee'; // مدير يقيّم موظف

    const REVIEWABLE_PRODUCT = 'product';  // زبون يقيّم منتج

    // ─────────────────────────────────────────────
    // العلاقات
    // ─────────────────────────────────────────────

    // الزبون المُقيِّم (إن كان المُقيِّم زبوناً)
    public function reviewerCustomer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'reviewer_id')
            ->where('reviewer_type', self::REVIEWER_CUSTOMER);
    }

    // الموظف المُقيِّم (إن كان المُقيِّم مديراً)
    public function reviewerEmployee(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'reviewer_id')
            ->where('reviewer_type', self::REVIEWER_EMPLOYEE);
    }

    // الموظف/السائق الذي يتم تقييمه
    public function reviewedEmployee(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'reviewable_id');
    }

    public function reviewedProduct(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'reviewable_id');
    }

    // ─────────────────────────────────────────────
    // Scopes
    // ─────────────────────────────────────────────
    public function scopeDriverReviews($query)
    {
        return $query->where('reviewable_type', self::REVIEWABLE_DRIVER);
    }

    public function scopeEmployeeReviews($query)
    {
        return $query->where('reviewable_type', self::REVIEWABLE_EMPLOYEE);
    }

    public function scopeForEmployee($query, int $employeeId)
    {
        return $query->where('reviewable_id', $employeeId);
    }

    // ─────────────────────────────────────────────
    // Factory Methods
    // ─────────────────────────────────────────────

    // الزبون يقيّم السائق بعد التوصيل
    public static function rateDriver(
        Customer $customer,
        int $driverId,
        int $rating,
        ?string $comment = null,
        ?DeliveryOrder $delivery = null
    ): array {

        if ($rating < 1 || $rating > 5) {
            return [
                'success' => false,
                'message' => 'التقييم يجب أن يكون بين 1 و 5',
            ];
        }

        // التحقق من أن الزبون لديه توصيل مكتمل مع هذا السائق
        if ($delivery) {
            if ($delivery->driver_id !== $driverId
                || $delivery->status !== DeliveryOrder::STATUS_DELIVERED
                || $delivery->order?->customer_id !== $customer->id) {
                return [
                    'success' => false,
                    'message' => 'لا يمكنك تقييم هذا السائق',
                ];
            }
        }

        // منع التقييم المكرر لنفس الطلب
        $exists = self::where('reviewer_type', self::REVIEWER_CUSTOMER)
            ->where('reviewer_id', $customer->id)
            ->where('reviewable_type', self::REVIEWABLE_DRIVER)
            ->where('reviewable_id', $driverId)
                      // ✅ الجديد — بسيط وصحيح
            ->when($delivery, fn ($q) => $q->where('reviewable_id', $driverId)
            )
            ->exists();

        if ($exists) {
            return [
                'success' => false,
                'message' => 'لقد قيّمت هذا السائق مسبقاً',
            ];
        }

        $review = self::create([
            'reviewer_type' => self::REVIEWER_CUSTOMER,
            'reviewer_id' => $customer->id,
            'customer_id' => $customer->id,
            'reviewable_type' => self::REVIEWABLE_DRIVER,
            'reviewable_id' => $driverId,
            'rating' => $rating,
            'comment' => $comment,
        ]);

        // تحديث تقييم السائق في سجل التوصيل
        if ($delivery) {
            $delivery->update(['driver_rating' => $rating]);
        }

        // إشعار السائق بالتقييم
        Notification::create([
            'sender_type' => Notification::SENDER_CUSTOMER,
            'sender_id' => $customer->id,
            'receiver_type' => Notification::RECEIVER_EMPLOYEE,
            'receiver_id' => $driverId,
            'type' => Notification::TYPE_MANAGER_NOTIF,
            'title' => 'تقييم جديد من زبون ⭐',
            'message' => "حصلت على تقييم {$rating}/5 من {$customer->name}",
            'data' => [
                'rating' => $rating,
                'comment' => $comment,
                'customer' => $customer->name,
            ],
        ]);

        return [
            'success' => true,
            'review_id' => $review->id,
            'message' => 'شكراً على تقييمك!',
        ];
    }

    // المدير يقيّم موظفاً
    public static function rateEmployee(
        Employee $manager,
        int $employeeId,
        int $rating,
        ?string $comment = null
    ): array {

        if ($rating < 1 || $rating > 5) {
            return ['success' => false, 'message' => 'التقييم بين 1 و 5 فقط'];
        }

        // المدير العام يقيّم أي موظف
        // باقي المدراء يقيّمون فقط من تحتهم
        $employee = Employee::find($employeeId);
        if (! $employee) {
            return ['success' => false, 'message' => 'الموظف غير موجود'];
        }

        if (! $manager->isGeneralManager()
            && $employee->created_by !== $manager->id) {
            return [
                'success' => false,
                'message' => 'يمكنك فقط تقييم الموظفين الذين أنشأت حساباتهم',
            ];
        }

        $review = self::create([
            'reviewer_type' => self::REVIEWER_EMPLOYEE,
            'reviewer_id' => $manager->id,
            'reviewable_type' => self::REVIEWABLE_EMPLOYEE,
            'reviewable_id' => $employeeId,
            'rating' => $rating,
            'comment' => $comment,
        ]);

        // إشعار الموظف
        Notification::managerToEmployee(
            from: $manager,
            to: $employee,
            title: 'تقييم أداء جديد ⭐',
            message: "قيّمك المدير {$manager->name} بـ {$rating}/5".
                       ($comment ? " — {$comment}" : ''),
            extraData: ['rating' => $rating, 'review_id' => $review->id]
        );

        return [
            'success' => true,
            'review_id' => $review->id,
            'message' => 'تم حفظ التقييم بنجاح',
        ];
    }

    // متوسط تقييم موظف/سائق
    public static function getAverageForEmployee(int $employeeId): float
    {
        return round(
            self::where('reviewable_id', $employeeId)->avg('rating') ?? 0,
            1
        );
    }

    // تفاصيل التقييم للواجهة
    public function getDetails(): array
    {
        $reviewer = $this->reviewer_type === self::REVIEWER_CUSTOMER
            ? ($this->relationLoaded('reviewerCustomer') ? $this->reviewerCustomer : Customer::find($this->reviewer_id))
            : ($this->relationLoaded('reviewerEmployee') ? $this->reviewerEmployee : Employee::find($this->reviewer_id));

        $product = $this->reviewable_type === self::REVIEWABLE_PRODUCT
            ? ($this->relationLoaded('reviewedProduct') ? $this->reviewedProduct : Product::find($this->reviewable_id))
            : null;

        return [
            'id' => $this->id,
            'reviewer_type' => $this->reviewer_type,
            'reviewer_name' => $reviewer?->name ?? 'مجهول',
            'customer_name' => $reviewer?->name ?? 'مجهول',
            'reviewable_type' => $this->reviewable_type,
            'reviewable_id' => $this->reviewable_id,
            'product_name' => $product?->name,
            'product' => $product ? [
                'id' => $product->id,
                'name' => $product->name,
                'image' => $product->image_path ? asset('storage/'.$product->image_path) : null,
            ] : null,
            'rating' => $this->rating,
            'overall_rating' => $this->rating,
            'stars' => str_repeat('⭐', $this->rating),
            'comment' => $this->comment,
            'created_at' => $this->created_at?->toIso8601String(),
            'created_at_human' => $this->created_at?->diffForHumans(),
        ];
    }
}
