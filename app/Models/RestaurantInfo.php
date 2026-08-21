<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class RestaurantInfo extends Model
{
    use HasFactory;

    // الموقع الافتراضي المستخدم حالياً في خريطة واجهة الزبون (اللاذقية).
    // يمكن لمدير التواصل استبداله لاحقاً من لوحة الإدارة.
    public const DEFAULT_LATITUDE = 35.5317;

    public const DEFAULT_LONGITUDE = 35.7901;

    // ✅ مطابق لقاعدة البيانات — سجل واحد دائماً
    protected $table = 'restaurant_info';

    protected $fillable = [
        'name',
        'owner_name',
        'email',
        'phone',
        'whatsapp',
        'address',
        'latitude',
        'longitude',
        'about_text',
        'privacy_policy',
        'working_hours',
        'facebook_url',
        'instagram_url',
        'telegram_url',
        'website_content',
        'delivery_cost_per_100m',
        'max_delivery_distance_meters',
        'vip_table_extra_cost',
        'extra_cost_per_seat_above',
        'extra_cost_per_extra_seat',
        'loyalty_points_per_10_syp',
        'loyalty_tier_multipliers',
        'is_open',
        'logo_path',
    ];

    protected $casts = [
        'latitude' => 'float',
        'longitude' => 'float',
        'delivery_cost_per_100m' => 'float',
        'max_delivery_distance_meters' => 'integer',
        'vip_table_extra_cost' => 'float',
        'extra_cost_per_seat_above' => 'integer',
        'extra_cost_per_extra_seat' => 'float',
        'loyalty_points_per_10_syp' => 'integer',
        'loyalty_tier_multipliers' => 'array',
        'is_open' => 'boolean',
        'working_hours' => 'array',
        'website_content' => 'array',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // ─────────────────────────────────────────────
    // Singleton — دائماً سجل واحد
    // ─────────────────────────────────────────────
    public static function getInstance(): self
    {
        $info = self::firstOrCreate([], [
            'name' => 'TAZA 041',
            'latitude' => self::DEFAULT_LATITUDE,
            'longitude' => self::DEFAULT_LONGITUDE,
            'delivery_cost_per_100m' => 5.00,
            'max_delivery_distance_meters' => 10000,
            'vip_table_extra_cost' => 50.00,
            'extra_cost_per_seat_above' => 4,
            'extra_cost_per_extra_seat' => 20.00,
            'loyalty_points_per_10_syp' => 1,
            'loyalty_tier_multipliers' => LoyaltyAccount::TIER_MULTIPLIERS,
            'is_open' => true,
        ]);

        // ترقية السجلات القديمة التي أُنشئت قبل إضافة موقع المطعم الافتراضي.
        // إبقاء الإحداثيين معاً يمنع اختلاف السعر الظاهر عن السعر المعتمد عند إنشاء الطلب.
        if (is_null($info->latitude) || is_null($info->longitude)) {
            $info->update([
                'latitude' => self::DEFAULT_LATITUDE,
                'longitude' => self::DEFAULT_LONGITUDE,
            ]);
        }

        return $info;
    }

    /** @return array{latitude: float, longitude: float} */
    public function getDeliveryCoordinates(): array
    {
        return [
            'latitude' => (float) ($this->latitude ?? self::DEFAULT_LATITUDE),
            'longitude' => (float) ($this->longitude ?? self::DEFAULT_LONGITUDE),
        ];
    }

    // ─────────────────────────────────────────────

    // هل المطعم مفتوح الآن؟
    // ─────────────────────────────────────────────
    public function isOpenNow(): bool
    {
        if (! $this->is_open) {
            return false;
        }
        if (! $this->working_hours) {
            return true;
        }

        $now = now();

        // نفحص جدول اليوم وجدول الأمس كي تبقى فترة العمل بعد منتصف الليل صحيحة.
        foreach ([0, -1] as $dayOffset) {
            $scheduleDate = $now->copy()->addDays($dayOffset);
            $dayKey = strtolower($scheduleDate->englishDayOfWeek);
            $dayData = $this->getNormalizedWorkingHours()[$dayKey] ?? null;
            if (! $dayData || ! $dayData['open']) {
                continue;
            }

            $openTime = Carbon::parse($scheduleDate->toDateString().' '.$dayData['from']);
            $closeTime = Carbon::parse($scheduleDate->toDateString().' '.$dayData['to']);
            if ($closeTime->lessThanOrEqualTo($openTime)) {
                $closeTime->addDay();
            }

            if ($now->betweenIncluded($openTime, $closeTime)) {
                return true;
            }
        }

        return false;
    }

    /** @return array<string, array{open: bool, from: string, to: string}> */
    public function getNormalizedWorkingHours(): array
    {
        $normalized = [];
        foreach ((array) $this->working_hours as $day => $hours) {
            if (! is_array($hours)) {
                continue;
            }

            $openValue = $hours['open'] ?? null;
            $normalized[strtolower((string) $day)] = [
                'open' => is_bool($openValue)
                    ? $openValue
                    : ! (bool) ($hours['is_closed'] ?? false),
                'from' => (string) ($hours['from'] ?? $hours['open_time'] ?? (is_string($openValue) ? $openValue : '09:00')),
                'to' => (string) ($hours['to'] ?? $hours['close_time'] ?? $hours['close'] ?? '22:00'),
            ];
        }

        return $normalized;
    }

    // ساعات عمل اليوم
    public function getTodayHours(): ?array
    {
        if (! $this->working_hours) {
            return null;
        }

        $dayKey = strtolower(now()->englishDayOfWeek);

        return $this->getNormalizedWorkingHours()[$dayKey] ?? null;
    }

    // ─────────────────────────────────────────────
    // تحديث الأقسام المختلفة
    // (كل مدير يُحدِّث القسم الخاص به)
    // ─────────────────────────────────────────────

    // مدير التواصل يُحدِّث معلومات المطعم العامة
    public function updateContactInfo(array $data): void
    {
        // الاسم ثابت — لا يُعدَّل
        unset($data['name']);

        if (array_key_exists('working_hours', $data) && is_array($data['working_hours'])) {
            $this->working_hours = $data['working_hours'];
            $data['working_hours'] = $this->getNormalizedWorkingHours();
        }

        $allowed = [
            'owner_name', 'email', 'phone', 'whatsapp',
            'address', 'latitude', 'longitude',
            'about_text', 'privacy_policy',
            'facebook_url', 'instagram_url', 'telegram_url',
            'working_hours', 'website_content',
        ];

        $this->update(array_intersect_key(
            $data,
            array_flip($allowed)
        ));
    }

    // مدير التوصيل يُحدِّث إعدادات التوصيل
    public function updateDeliverySettings(
        float $costPer100m,
        int $maxDistanceMeters
    ): void {
        $this->update([
            'delivery_cost_per_100m' => $costPer100m,
            'max_delivery_distance_meters' => $maxDistanceMeters,
        ]);
    }

    // مدير الطلبات يُحدِّث إعدادات الحجز
    public function updateReservationSettings(
        float $vipExtraCost,
        int $seatsAbove,
        float $costPerExtraSeat
    ): void {
        $this->update([
            'vip_table_extra_cost' => $vipExtraCost,
            'extra_cost_per_seat_above' => $seatsAbove,
            'extra_cost_per_extra_seat' => $costPerExtraSeat,
        ]);
    }

    // المدير العام يفتح/يغلق المطعم
    public function toggleOpen(bool $isOpen): void
    {
        $this->update(['is_open' => $isOpen]);
    }

    // ─────────────────────────────────────────────
    // تفاصيل للواجهة
    // ─────────────────────────────────────────────

    // للزبون (معلومات عامة)
    public function getPublicDetails(): array
    {
        return [
            'name' => $this->name,
            'owner_name' => $this->owner_name,
            'phone' => $this->phone,
            'whatsapp' => $this->whatsapp,
            'email' => $this->email,
            'address' => $this->address,
            'latitude' => $this->latitude,
            'longitude' => $this->longitude,
            'about_text' => $this->about_text,
            'working_hours' => $this->getNormalizedWorkingHours(),
            'is_open' => (bool) $this->is_open,
            // واجهة الزبون تعتمد على قرار المدير العام المباشر من restaurant_info.is_open.
            // تبقى ساعات العمل معلومات عرض فقط ولا تغلق الموقع تلقائياً.
            'is_open_now' => (bool) $this->is_open,
            'today_hours' => $this->getTodayHours(),
            'social_links' => [
                'facebook' => $this->facebook_url,
                'instagram' => $this->instagram_url,
                'telegram' => $this->telegram_url,
            ],
            'website_content' => $this->website_content ?? [],
            'logo_url' => $this->logo_path
                                  ? asset('storage/'.$this->logo_path)
                                  : null,
            'privacy_policy' => $this->privacy_policy,
        ];
    }

    // للوحة الإدارة (مع الإعدادات كاملة)
    public function getAdminDetails(): array
    {
        return array_merge($this->getPublicDetails(), [
            'delivery_settings' => [
                'cost_per_100m' => $this->delivery_cost_per_100m,
                'cost_per_km' => $this->delivery_cost_per_100m * 10,
                'max_distance_meters' => $this->max_delivery_distance_meters,
                'max_distance_km' => $this->max_delivery_distance_meters / 1000,
            ],
            'reservation_settings' => [
                'vip_extra_cost' => $this->vip_table_extra_cost,
                'free_seats_count' => $this->extra_cost_per_seat_above,
                'cost_per_extra_seat' => $this->extra_cost_per_extra_seat,
            ],
            'loyalty_settings' => [
                'points_per_10_syp' => $this->loyalty_points_per_10_syp,
                'tier_multipliers' => LoyaltyAccount::normalizeMultipliers(
                    $this->loyalty_tier_multipliers
                ),
            ],
        ]);
    }
}
