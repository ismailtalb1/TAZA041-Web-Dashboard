<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReservationOrder extends Model
{
    use HasFactory;

    // ✅ اسم الجدول مطابق لقاعدة البيانات
    protected $table = 'reservation_orders';

    protected $fillable = [
        'order_id',
        'table_number',
        'table_type',
        'seats_count',
        'reservation_time',
        'special_notes',
        'extra_cost',
        'status',
        'duration_minutes',
        'actual_arrival_time',
        'actual_departure_time',
    ];

    protected $casts = [
        'table_number' => 'integer',
        'seats_count' => 'integer',
        'extra_cost' => 'float',
        'duration_minutes' => 'integer',
        'reservation_time' => 'datetime',
        'actual_arrival_time' => 'datetime',
        'actual_departure_time' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // ─────────────────────────────────────────────
    // الثوابت — حالات الحجز
    // مطابقة تماماً لـ ENUM في قاعدة البيانات
    // ─────────────────────────────────────────────
    const STATUS_PENDING = 'pending';    // معلق

    const STATUS_CONFIRMED = 'confirmed';  // مؤكد

    const STATUS_SEATED = 'seated';     // الجلسة قائمة

    const STATUS_COMPLETED = 'completed';  // انتهت مدة الحجز

    const STATUS_CANCELLED = 'cancelled';  // ملغى من الزبون

    const STATUS_NO_SHOW = 'no_show';   // الزبون لم يحضر

    // أنواع الطاولات
    const TABLE_NORMAL = 'normal';

    const TABLE_VIP = 'vip';

    public const RESERVATION_DURATION_MINUTES = 60;

    public const MAX_SEATS = 10;

    /**
     * The single table catalogue shared by the dashboard, web and mobile app.
     */
    public static function tableCatalog(): array
    {
        return collect(range(1, 8))->map(fn (int $number) => [
            'number' => $number,
            'name' => "T{$number}",
            'type' => $number >= 5 ? self::TABLE_VIP : self::TABLE_NORMAL,
            'type_label_ar' => $number >= 5 ? 'VIP' : 'عادية',
            'type_label_en' => $number >= 5 ? 'VIP' : 'Standard',
            'max_seats' => self::MAX_SEATS,
            'duration_minutes' => self::RESERVATION_DURATION_MINUTES,
        ])->all();
    }

    public static function tableDefinition(int $number): ?array
    {
        return collect(self::tableCatalog())->firstWhere('number', $number);
    }

    // تسلسل الحالات — مدير الطلبات يدير كل المراحل
    const STATUS_FLOW = [
        'order_manager' => [
            self::STATUS_PENDING => [self::STATUS_CONFIRMED, self::STATUS_CANCELLED],
            self::STATUS_CONFIRMED => [self::STATUS_SEATED, self::STATUS_CANCELLED, self::STATUS_NO_SHOW],
            self::STATUS_SEATED => [self::STATUS_COMPLETED, self::STATUS_CANCELLED],
        ],
        'customer' => [
            self::STATUS_PENDING => [self::STATUS_CANCELLED],
        ],
    ];

    // ─────────────────────────────────────────────
    // العلاقات
    // ─────────────────────────────────────────────
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    // ─────────────────────────────────────────────
    // Scopes
    // ─────────────────────────────────────────────
    public function scopeActive($query)
    {
        return $query->whereNotIn('status', [
            self::STATUS_COMPLETED,
            self::STATUS_CANCELLED,
            self::STATUS_NO_SHOW,
        ]);
    }

    public function scopeToday($query)
    {
        return $query->whereDate('reservation_time', today());
    }

    public function scopeUpcoming($query)
    {
        return $query->where('reservation_time', '>=', now())
            ->whereIn('status', [
                self::STATUS_PENDING,
                self::STATUS_CONFIRMED,
            ])
            ->orderBy('reservation_time');
    }

    /**
     * SQL expression for the reservation end time on the active database.
     */
    private static function endTimeExpression(): string
    {
        $driver = (new static)->getConnection()->getDriverName();

        return match ($driver) {
            'sqlite' => "datetime(reservation_time, '+' || duration_minutes || ' minutes')",
            'mysql', 'mariadb' => 'DATE_ADD(reservation_time, INTERVAL duration_minutes MINUTE)',
            'pgsql' => "reservation_time + (duration_minutes * interval '1 minute')",
            'sqlsrv' => 'DATEADD(minute, duration_minutes, reservation_time)',
            default => throw new \RuntimeException("Unsupported database driver: {$driver}"),
        };
    }

    // التحقق من تعارض الحجوزات لنفس الطاولة
    public function scopeConflicting($query, int $tableNumber, string $reservationTime, int $durationMinutes, ?int $excludeId = null)
    {
        $start = Carbon::parse($reservationTime);
        $end = $start->copy()->addMinutes($durationMinutes);

        // نعتمد تعارض فترات نصف مفتوحة [start, end):
        // حجز 03:18-04:18 لا يتعارض مع حجز يبدأ 04:18 تماماً.
        return $query->where('table_number', $tableNumber)
            ->whereNotIn('status', [
                self::STATUS_CANCELLED,
                self::STATUS_COMPLETED,
                self::STATUS_NO_SHOW,
            ])
            ->when($excludeId, fn ($q) => $q->where('id', '!=', $excludeId))
            ->where('reservation_time', '<', $end)
            ->whereRaw(
                self::endTimeExpression().' > ?',
                [$start]
            );
    }

    // ─────────────────────────────────────────────
    // حساب تكلفة الحجز الإضافية
    // ─────────────────────────────────────────────

    // جلب إعدادات الحجز من restaurant_info
    private static function getReservationSettings(): object
    {
        return RestaurantInfo::first() ?? (object) [
            'vip_table_extra_cost' => 50.00,
            'extra_cost_per_seat_above' => 4,
            'extra_cost_per_extra_seat' => 20.00,
        ];
    }

    // حساب التكلفة الإضافية للحجز
    // VIP    → +vip_table_extra_cost
    // مقاعد → +extra_cost_per_extra_seat لكل مقعد يتجاوز extra_cost_per_seat_above
    public static function calculateExtraCost(
        string $tableType,
        int $seatsCount
    ): float {
        $settings = self::getReservationSettings();
        $extraCost = 0.0;

        // إضافة تكلفة VIP
        if ($tableType === self::TABLE_VIP) {
            $extraCost += $settings->vip_table_extra_cost;
        }

        // إضافة تكلفة المقاعد الزائدة
        $extraSeats = $seatsCount - $settings->extra_cost_per_seat_above;
        if ($extraSeats > 0) {
            $extraCost += $extraSeats * $settings->extra_cost_per_extra_seat;
        }

        return round($extraCost, 2);
    }

    // معلومات التسعير للعرض في واجهة الزبون
    public static function getPricingInfo(): array
    {
        $settings = self::getReservationSettings();

        return [
            'vip_extra_cost' => $settings->vip_table_extra_cost,
            'vip_extra_cost_formatted' => number_format($settings->vip_table_extra_cost, 0).' ل.س',
            'free_seats' => $settings->extra_cost_per_seat_above,
            'cost_per_extra_seat' => $settings->extra_cost_per_extra_seat,
            'cost_per_extra_seat_formatted' => number_format($settings->extra_cost_per_extra_seat, 0).' ل.س',
        ];
    }

    // ─────────────────────────────────────────────
    // التوابع
    // ─────────────────────────────────────────────

    // تحرير الطاولات التي انتهت مدة حجزها تلقائياً عند أي فحص للحجوزات أو الطاولات.
    // مدة الحجز ساعة افتراضياً من reservation_time؛ بعدها تتحرر الطاولة بدون تعديل قاعدة البيانات.
    public static function autoCompleteExpiredSeated(): int
    {
        $expired = self::whereIn('status', [
            self::STATUS_PENDING,
            self::STATUS_CONFIRMED,
            self::STATUS_SEATED,
        ])
            ->whereRaw(self::endTimeExpression().' <= ?', [now()])
            ->with('order')
            ->get();

        foreach ($expired as $reservation) {
            $wasSeated = $reservation->status === self::STATUS_SEATED;
            $reservation->status = $wasSeated ? self::STATUS_COMPLETED : self::STATUS_NO_SHOW;
            $reservation->actual_departure_time = $reservation->actual_departure_time ?: now();
            $reservation->save();

            if ($reservation->order && $reservation->order->status !== Order::STATUS_COMPLETED) {
                $reservation->order->update(['status' => Order::STATUS_COMPLETED]);
            }

            if ($wasSeated) {
                $reservation->order?->awardLoyaltyPoints();
            }
        }

        return $expired->count();
    }

    // هل هذه الطاولة متاحة في الوقت المطلوب؟
    public static function isTableAvailable(
        int $tableNumber,
        string $reservationTime,
        int $durationMinutes = 60,
        ?int $excludeId = null
    ): bool {
        self::autoCompleteExpiredSeated();

        return ! self::conflicting(
            $tableNumber,
            $reservationTime,
            $durationMinutes,
            $excludeId
        )->exists();
    }

    // هل يمكن لهذا الدور تغيير الحالة؟
    public function canChangeStatus(string $role, string $newStatus): bool
    {
        $flow = self::STATUS_FLOW[$role] ?? [];
        $allowed = $flow[$this->status] ?? [];

        return in_array($newStatus, $allowed);
    }

    // تغيير حالة الحجز مع الإشعارات
    public function changeStatus(string $newStatus, string $actorRole): bool
    {
        if (! $this->canChangeStatus($actorRole, $newStatus)) {
            return false;
        }

        // لا تبدأ الجلسة قبل اكتمال مراحل تجهيز الطلب في المطعم.
        if ($newStatus === self::STATUS_SEATED
            && $this->order?->status !== Order::STATUS_COMPLETED) {
            return false;
        }

        $this->status = $newStatus;

        if ($newStatus === self::STATUS_SEATED) {
            $this->actual_arrival_time = now();
        }

        if ($newStatus === self::STATUS_COMPLETED) {
            $this->actual_departure_time = now();
            $this->order?->update(['status' => Order::STATUS_COMPLETED]);
            // منح نقاط الولاء عند انتهاء الحجز إذا لم تُمنح مسبقاً
            $this->order?->awardLoyaltyPoints();
        }

        if ($newStatus === self::STATUS_CANCELLED) {
            $this->order?->update(['status' => Order::STATUS_CANCELLED]);
        }

        $this->save();

        // إشعار الزبون
        $this->notifyCustomer($newStatus);

        return true;
    }

    // إشعار الزبون بتغيير حالة الحجز
    private function notifyCustomer(string $status): void
    {
        $customerId = $this->order?->customer_id;
        if (! $customerId) {
            return;
        }

        $tableLabel = $this->table_type === self::TABLE_VIP ? 'VIP' : 'عادية';

        $messages = [
            self::STATUS_CONFIRMED => "تم تأكيد حجزك! طاولة رقم {$this->table_number} ({$tableLabel}) في {$this->reservation_time?->format('H:i — d/m/Y')}",
            self::STATUS_SEATED => "أهلاً بك! جلستك قائمة الآن على الطاولة رقم {$this->table_number}",
            self::STATUS_COMPLETED => 'أصبحت الطاولة جاهزة من جديد، شكراً لزيارتك ونأمل أن تعود قريباً 🌟',
            self::STATUS_CANCELLED => "تم إلغاء حجز الطاولة رقم {$this->table_number}",
            self::STATUS_NO_SHOW => "انتهى وقت حجزك للطاولة رقم {$this->table_number}",
        ];

        $message = $messages[$status] ?? 'تم تحديث حالة حجزك';

        Notification::create([
            'sender_type' => 'system',
            'sender_id' => null,
            'receiver_type' => 'customer',
            'receiver_id' => $customerId,
            'type' => 'reservation_update',
            'title' => "حجز طاولة #{$this->order_id}",
            'message' => $message,
            'data' => json_encode([
                'order_id' => $this->order_id,
                'reservation_id' => $this->id,
                'table_number' => $this->table_number,
                'table_type' => $this->table_type,
                'reservation_time' => $this->reservation_time?->toIso8601String(),
                'status' => $status,
            ]),
        ]);
    }

    // اسم الحالة بالعربي
    public function getStatusLabel(): string
    {
        return match ($this->status) {
            self::STATUS_PENDING => 'معلق',
            self::STATUS_CONFIRMED => 'مؤكد',
            self::STATUS_SEATED => 'الجلسة قائمة',
            self::STATUS_COMPLETED => 'الطاولة جاهزة',
            self::STATUS_CANCELLED => 'ملغى',
            self::STATUS_NO_SHOW => 'لم يحضر',
            default => $this->status,
        };
    }

    // تفاصيل الحجز للواجهة
    public function getDetails(): array
    {
        return [
            'id' => $this->id,
            'order_id' => $this->order_id,
            'table_number' => $this->table_number,
            'table_type' => $this->table_type,
            'table_type_label' => $this->table_type === self::TABLE_VIP
                                           ? 'VIP ✨'
                                           : 'عادية',
            'seats_count' => $this->seats_count,
            'reservation_time' => $this->reservation_time?->toIso8601String(),
            'reservation_time_formatted' => $this->reservation_time?->format('h:i A — d/m/Y'),
            'duration_minutes' => $this->duration_minutes,
            'special_notes' => $this->special_notes,
            'extra_cost' => $this->extra_cost,
            'extra_cost_formatted' => number_format($this->extra_cost, 0).' ل.س',
            'status' => $this->status,
            'status_label' => $this->getStatusLabel(),
            'order_status' => $this->order?->status,
            'actual_arrival_time' => $this->actual_arrival_time
                ?->toIso8601String(),
            'actual_departure_time' => $this->actual_departure_time
                ?->toIso8601String(),
            // معلومات التسعير للعرض في الواجهة
            'pricing_info' => self::getPricingInfo(),
        ];
    }
}
