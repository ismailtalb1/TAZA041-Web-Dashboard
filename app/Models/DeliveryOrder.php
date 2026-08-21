<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class DeliveryOrder extends Model
{
    use HasFactory, SoftDeletes;

    // ✅ اسم الجدول مطابق لقاعدة البيانات

    protected $table = 'delivery_orders';

    protected $fillable = [
        'order_id',
        'delivery_address',
        'latitude',
        'longitude',
        'driver_id',
        'distance_meters',
        'delivery_cost',
        'status',
        'driver_rating',
        'driver_feedback',
        'estimated_delivery_time',
        'actual_delivery_time',
        'origin_latitude',
        'origin_longitude',
        'route_geometry',
        'route_duration_seconds',
        'route_provider',
        'route_is_fallback',
        'route_calculated_at',
    ];

    protected $casts = [
        'latitude' => 'float',
        'longitude' => 'float',
        'distance_meters' => 'float',
        'delivery_cost' => 'float',
        'driver_rating' => 'integer',
        'estimated_delivery_time' => 'datetime',
        'actual_delivery_time' => 'datetime',
        'origin_latitude' => 'float',
        'origin_longitude' => 'float',
        'route_geometry' => 'array',
        'route_duration_seconds' => 'integer',
        'route_is_fallback' => 'boolean',
        'route_calculated_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // ─────────────────────────────────────────────
    // الثوابت — حالات التوصيل
    // مطابقة تماماً لـ ENUM في قاعدة البيانات
    // ─────────────────────────────────────────────
    const STATUS_PENDING = 'pending';      // بانتظار تعيين سائق

    const STATUS_ASSIGNED = 'assigned';     // حالة قديمة تُدمج في in_delivery

    const STATUS_PICKED_UP = 'picked_up';    // حالة قديمة تُدمج في in_delivery

    const STATUS_IN_DELIVERY = 'in_delivery';  // جاري التوصيل

    const STATUS_DELIVERED = 'delivered';    // تم التسليم

    const STATUS_CANCELLED = 'cancelled';    // ملغى

    // قيمة احتياطية فقط؛ الحد الفعلي يأتي من إعدادات المطعم.
    const MAX_DELIVERY_DISTANCE_METERS = 10000;

    // تسلسل الحالات المسموح به
    // مدير التوصيل يدير التعيين والإلغاء، أما التنفيذ الميداني فللسائق فقط.
    const STATUS_FLOW = [
        'order_manager' => [
            self::STATUS_PENDING => [self::STATUS_IN_DELIVERY],
        ],
        'delivery_manager' => [
            self::STATUS_PENDING => [self::STATUS_CANCELLED],
            self::STATUS_IN_DELIVERY => [self::STATUS_CANCELLED],
        ],
        'driver' => [
            self::STATUS_ASSIGNED => [self::STATUS_DELIVERED], // دعم بيانات قديمة قبل الترحيل
            self::STATUS_PICKED_UP => [self::STATUS_DELIVERED], // دعم بيانات قديمة قبل الترحيل
            self::STATUS_IN_DELIVERY => [self::STATUS_DELIVERED],
        ],
    ];

    // ─────────────────────────────────────────────
    // العلاقات
    // ─────────────────────────────────────────────
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    // السائق
    public function driver(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'driver_id');
    }

    // ─────────────────────────────────────────────
    // Scopes
    // ─────────────────────────────────────────────
    public function scopeActive($query)
    {
        return $query->whereNotIn('status', [
            self::STATUS_DELIVERED,
            self::STATUS_CANCELLED,
        ]);
    }

    public function scopeAssignedToDriver($query, int $driverId)
    {
        return $query->where('driver_id', $driverId);
    }

    // ─────────────────────────────────────────────
    // حساب تكلفة التوصيل
    // ─────────────────────────────────────────────

    // الحصول على إعدادات التوصيل من restaurant_info
    private static function getDeliverySettings(): object
    {
        return RestaurantInfo::first() ?? (object) [
            'delivery_cost_per_100m' => 5.00,
            'max_delivery_distance_meters' => 10000,
        ];
    }

    // حساب التكلفة بناءً على المسافة
    // المعادلة: (distance_meters / 100) × delivery_cost_per_100m
    public static function calculateCost(float $distanceMeters): float
    {
        $settings = self::getDeliverySettings();
        $cost = ($distanceMeters / 100) * $settings->delivery_cost_per_100m;

        return round($cost, 2);
    }

    /**
     * حساب المسافة التقريبية بين نقطتين على الخريطة بالمتر باستخدام معادلة Haversine.
     * تُستخدم في واجهة الزبون عند اختيار موقع التوصيل من الخريطة.
     */
    public static function calculateDistanceMeters(
        float $fromLatitude,
        float $fromLongitude,
        float $toLatitude,
        float $toLongitude
    ): float {
        $earthRadius = 6371000; // meters

        $latFrom = deg2rad($fromLatitude);
        $lonFrom = deg2rad($fromLongitude);
        $latTo = deg2rad($toLatitude);
        $lonTo = deg2rad($toLongitude);

        $latDelta = $latTo - $latFrom;
        $lonDelta = $lonTo - $lonFrom;

        $angle = 2 * asin(sqrt(
            pow(sin($latDelta / 2), 2) +
            cos($latFrom) * cos($latTo) * pow(sin($lonDelta / 2), 2)
        ));

        return round($earthRadius * $angle, 2);
    }

    // التحقق من أن الموقع ضمن الحد الأقصى للمسافة
    public static function isWithinDeliveryRange(float $distanceMeters): bool
    {
        return $distanceMeters <= self::getMaxDistanceMeters();
    }

    public static function getMaxDistanceMeters(): int
    {
        $settings = self::getDeliverySettings();

        return max(0, (int) ($settings->max_delivery_distance_meters ?? self::MAX_DELIVERY_DISTANCE_METERS));
    }

    // الحد الأقصى للمسافة المسموح بها (بالكيلومتر — للعرض في الواجهة)
    public static function getMaxDistanceKm(): float
    {
        return round(self::getMaxDistanceMeters() / 1000, 1);
    }

    // سعر التوصيل لكل كيلومتر (للعرض في الواجهة)
    public static function getCostPerKm(): float
    {
        $settings = self::getDeliverySettings();

        return $settings->delivery_cost_per_100m * 10;
    }

    // ─────────────────────────────────────────────
    // التوابع
    // ─────────────────────────────────────────────

    // تعيين سائق للطلب
    public function assignDriver(int $driverId): bool
    {
        $driver = Employee::find($driverId);
        if (! $driver || $driver->role !== Employee::ROLE_DRIVER) {
            return false;
        }

        $this->driver_id = $driverId;
        // بمجرد اعتماد السائق يصبح الطلب في الطريق مع السائق
        $this->status = self::STATUS_IN_DELIVERY;
        $this->save();

        // إشعار السائق
        Notification::create([
            'sender_type' => 'system',
            'sender_id' => null,
            'receiver_type' => 'employee',
            'receiver_id' => $driverId,
            'type' => 'delivery_update',
            'title' => "طلب توصيل جديد #{$this->order_id}",
            'message' => "تم تعيينك لتوصيل طلب رقم #{$this->order_id}. العنوان: {$this->delivery_address}",
            'data' => json_encode([
                'delivery_order_id' => $this->id,
                'order_id' => $this->order_id,
                'address' => $this->delivery_address,
                'latitude' => $this->latitude,
                'longitude' => $this->longitude,
                'delivery_coordinates' => [
                    'latitude' => $this->latitude,
                    'longitude' => $this->longitude,
                ],
            ]),
        ]);

        // إشعار الزبون بأن الطلب أصبح في الطريق مع السائق
        $this->loadMissing(['order.customer', 'driver']);
        $this->notifyCustomer(self::STATUS_IN_DELIVERY);

        return true;
    }

    // تغيير حالة التوصيل مع التحقق
    public function changeStatus(string $newStatus, string $actorRole): bool
    {
        $flow = self::STATUS_FLOW[$actorRole] ?? [];
        $allowed = $flow[$this->status] ?? [];

        if (! in_array($newStatus, $allowed)) {
            return false;
        }

        $this->status = $newStatus;

        if ($newStatus === self::STATUS_DELIVERED) {
            $this->actual_delivery_time = now();
            // إكمال الطلب الأساسي
            $this->order->update(['status' => Order::STATUS_COMPLETED]);
            // منح نقاط الولاء
            $this->order->awardLoyaltyPoints();
        }

        $this->save();

        // إشعار الزبون
        $this->notifyCustomer($newStatus);

        return true;
    }

    // تقييم السائق (من الزبون بعد التوصيل)
    public function rateDriver(int $rating, ?string $feedback = null): bool
    {
        if ($this->status !== self::STATUS_DELIVERED) {
            return false;
        }
        if ($rating < 1 || $rating > 5) {
            return false;
        }

        $this->driver_rating = $rating;
        $this->driver_feedback = $feedback;
        $this->save();

        return true;
    }

    // إشعار الزبون بتغيير حالة التوصيل
    private function notifyCustomer(string $status): void
    {
        $customerId = $this->order?->customer_id;
        if (! $customerId) {
            return;
        }

        $messages = [
            self::STATUS_ASSIGNED => 'طلبك الآن في الطريق مع السائق 🚗',
            self::STATUS_PICKED_UP => 'طلبك الآن في الطريق مع السائق 🚗',
            self::STATUS_IN_DELIVERY => 'طلبك الآن في الطريق مع السائق 🚗',
            self::STATUS_DELIVERED => 'تم تسليم طلبك بنجاح! نتمنى أن ينال إعجابك 🎉',
            self::STATUS_CANCELLED => 'تم إلغاء توصيل طلبك',
        ];

        $message = $messages[$status] ?? 'تم تحديث حالة توصيل طلبك';

        Notification::create([
            'sender_type' => 'system',
            'sender_id' => null,
            'receiver_type' => 'customer',
            'receiver_id' => $customerId,
            'type' => 'delivery_update',
            'title' => "توصيل طلب #{$this->order_id}",
            'message' => $message,
            'data' => json_encode([
                'order_id' => $this->order_id,
                'delivery_order_id' => $this->id,
                'status' => $status,
                'driver_name' => $this->driver?->name,
            ]),
        ]);
    }

    // هل يمكن تقييم السائق؟
    public function canBeRated(): bool
    {
        return $this->status === self::STATUS_DELIVERED
            && ! is_null($this->driver_id)
            && is_null($this->driver_rating);
    }

    // اسم الحالة بالعربي
    public function getStatusLabel(): string
    {
        return match ($this->status) {
            self::STATUS_PENDING => 'بانتظار السائق',
            self::STATUS_ASSIGNED => 'في الطريق مع السائق',
            self::STATUS_PICKED_UP => 'في الطريق مع السائق',
            self::STATUS_IN_DELIVERY => 'في الطريق مع السائق',
            self::STATUS_DELIVERED => 'تم التسليم',
            self::STATUS_CANCELLED => 'ملغى',
            default => $this->status,
        };
    }

    // تفاصيل التوصيل للواجهة
    public function getDetails(): array
    {
        $customer = $this->order?->customer;
        $items = $this->order?->items;

        return [
            'id' => $this->id,
            'order_id' => $this->order_id,
            'delivery_address' => $this->delivery_address,
            'latitude' => $this->latitude,
            'longitude' => $this->longitude,
            'delivery_coordinates' => ! is_null($this->latitude) && ! is_null($this->longitude) ? [
                'latitude' => (float) $this->latitude,
                'longitude' => (float) $this->longitude,
            ] : null,
            'distance_meters' => $this->distance_meters,
            'distance_km' => $this->distance_meters
                                             ? round($this->distance_meters / 1000, 2)
                                             : null,
            'delivery_cost' => $this->delivery_cost,
            'delivery_cost_formatted' => number_format($this->delivery_cost, 0).' ل.س',
            'status' => $this->status,
            'status_label' => $this->getStatusLabel(),
            'driver_id' => $this->driver_id,
            'driver' => $this->driver ? [
                'id' => $this->driver->id,
                'name' => $this->driver->name,
                'phone' => $this->driver->phone,
                'avatar' => $this->driver->avatar
                                ? asset('storage/'.$this->driver->avatar)
                                : null,
                'rating' => $this->driver->getAverageDriverRating(),
            ] : null,
            'order' => $this->order ? [
                'id' => $this->order->id,
                'status' => $this->order->status,
                'notes' => $this->order->notes,
                'customer' => $customer ? [
                    'id' => $customer->id,
                    'name' => $customer->name,
                    'phone' => $customer->phone,
                    'email' => $customer->email,
                ] : null,
                'items' => $items ? $items->map(fn ($item) => [
                    'id' => $item->id,
                    'name' => method_exists($item, 'getItemName') ? $item->getItemName() : 'Item',
                    'quantity' => $item->quantity,
                    'subtotal' => $item->subtotal ?? null,
                ])->values() : [],
            ] : null,
            'driver_rating' => $this->driver_rating,
            'driver_feedback' => $this->driver_feedback,
            'can_be_rated' => $this->canBeRated(),
            'estimated_delivery_time' => $this->estimated_delivery_time
                ?->format('H:i'),
            'route' => [
                'provider' => $this->route_provider,
                'is_fallback' => (bool) $this->route_is_fallback,
                'geometry' => $this->route_geometry ?: [],
                'duration_seconds' => $this->route_duration_seconds,
                'duration_minutes' => $this->route_duration_seconds
                    ? (int) ceil($this->route_duration_seconds / 60)
                    : null,
                'calculated_at' => $this->route_calculated_at?->toIso8601String(),
                'origin' => ! is_null($this->origin_latitude) && ! is_null($this->origin_longitude) ? [
                    'latitude' => (float) $this->origin_latitude,
                    'longitude' => (float) $this->origin_longitude,
                ] : null,
                'destination' => ! is_null($this->latitude) && ! is_null($this->longitude) ? [
                    'latitude' => (float) $this->latitude,
                    'longitude' => (float) $this->longitude,
                ] : null,
            ],
            'actual_delivery_time' => $this->actual_delivery_time
                ?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
            // معلومات التسعير للعرض في الواجهة
            'pricing_info' => [
                'cost_per_km' => self::getCostPerKm(),
                'max_distance_km' => self::getMaxDistanceKm(),
            ],
        ];
    }
}
