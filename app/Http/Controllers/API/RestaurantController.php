<?php

namespace App\Http\Controllers\API;

use App\Models\DeliveryOrder;
use App\Models\Employee;
use App\Models\LoyaltyAccount;
use App\Models\Offer;
use App\Models\PaymentRecord;
use App\Models\Product;
use App\Models\ReservationOrder;
use App\Models\RestaurantImage;
use App\Models\RestaurantInfo;
use App\Services\DeliveryRouteService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class RestaurantController extends BaseController
{
    // ─────────────────────────────────────────────
    // مساعدات
    // ─────────────────────────────────────────────
    private function getEmployee(Request $request): ?Employee
    {
        $user = $request->user();

        return $user instanceof Employee ? $user : null;
    }

    private function isGM(Request $request): bool
    {
        return $this->getEmployee($request)?->isGeneralManager() ?? false;
    }

    private function isCommManager(Request $request): bool
    {
        $emp = $this->getEmployee($request);
        if (! $emp) {
            return false;
        }

        return in_array($emp->role, [
            Employee::ROLE_COMMUNICATION_MANAGER,
            Employee::ROLE_GENERAL_MANAGER,
        ]);
    }

    // ═══════════════════════════════════════════════
    // مسارات عامة — بدون مصادقة
    // ═══════════════════════════════════════════════

    // ─────────────────────────────────────────────
    // GET /api/public/restaurant
    // معلومات المطعم للزبون
    // ─────────────────────────────────────────────
    public function publicInfo()
    {
        $info = RestaurantInfo::getInstance();

        return $this->success([
            'restaurant' => $info->getPublicDetails(),
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/public/restaurant/images
    // صور المطعم للزبون (مُجمَّعة حسب النوع)
    // ─────────────────────────────────────────────
    public function publicImages()
    {
        return $this->success([
            'images' => RestaurantImage::getAllGrouped(),
        ]);
    }

    public function liveData(Request $request)
    {
        $info = RestaurantInfo::getInstance();
        $revision = hash('sha256', implode('|', [
            json_encode($info->getPublicDetails()),
            Product::query()->orderBy('id')->get([
                'id', 'name', 'name_ar', 'name_en', 'description', 'description_ar', 'description_en',
                'category', 'price', 'loyalty_price', 'stock_quantity', 'is_active', 'image_path', 'updated_at',
            ])->toJson(),
            Offer::query()->orderBy('id')->get([
                'id', 'name', 'name_ar', 'name_en', 'description', 'description_ar', 'description_en',
                'category', 'offer_price', 'loyalty_price', 'original_price', 'is_active', 'image_path',
                'start_date', 'end_date', 'updated_at',
            ])->toJson(),
            RestaurantImage::query()->orderBy('id')->get()->toJson(),
        ]));

        if (hash_equals($revision, (string) $request->query('since', ''))) {
            return $this->success([
                'changed' => false,
                'revision' => $revision,
                'server_time' => now()->toIso8601String(),
            ]);
        }

        $products = Product::active()
            ->orderBy('category')
            ->orderBy('name')
            ->get();
        $offers = Offer::currentlyActive()
            ->with(['products'])
            ->latest()
            ->get();

        return $this->success([
            'changed' => true,
            'revision' => $revision,
            'server_time' => now()->toIso8601String(),
            'restaurant' => $info->getPublicDetails(),
            'images' => RestaurantImage::getAllGrouped(),
            'products' => $products->map->getDetails()->values(),
            'offers' => $offers->map->getDetails()->values(),
            'pricing' => $this->publicPricingData($info),
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/public/pricing
    // معلومات التسعير للزبون
    // ─────────────────────────────────────────────
    public function pricingInfo()
    {
        $info = RestaurantInfo::getInstance();

        return $this->success($this->publicPricingData($info));
    }

    private function publicPricingData(RestaurantInfo $info): array
    {
        return [
            'delivery' => [
                'cost_per_km' => $info->delivery_cost_per_100m * 10,
                'max_distance_km' => $info->max_delivery_distance_meters / 1000,
                'example_costs' => [
                    '1 كم' => number_format(DeliveryOrder::calculateCost(1000), 0).' ل.س',
                    '3 كم' => number_format(DeliveryOrder::calculateCost(3000), 0).' ل.س',
                    '5 كم' => number_format(DeliveryOrder::calculateCost(5000), 0).' ل.س',
                    '10 كم' => number_format(DeliveryOrder::calculateCost(10000), 0).' ل.س',
                ],
            ],
            'reservation' => ReservationOrder::getPricingInfo(),
            'loyalty' => [
                'points_per_10_syp' => $info->loyalty_points_per_10_syp,
                'description' => 'نقطة أساسية لكل 10 ل.س مشتريات، مع مضاعف حسب المستوى',
                'tiers' => LoyaltyAccount::tierCatalog(),
            ],
            'payment' => [
                'test_mode_enabled' => PaymentRecord::testPaymentsEnabled(),
            ],
        ];
    }

    // ─────────────────────────────────────────────
    // GET /api/public/delivery/quote
    // حساب تكلفة التوصيل من إحداثيات يختارها الزبون على الخريطة
    // Query: latitude, longitude
    // ─────────────────────────────────────────────
    public function deliveryQuote(Request $request, DeliveryRouteService $routeService)
    {
        $validator = Validator::make($request->all(), [
            'latitude' => 'required|numeric|between:-90,90',
            'longitude' => 'required|numeric|between:-180,180',
        ], [
            'latitude.required' => 'إحداثي خط العرض مطلوب',
            'longitude.required' => 'إحداثي خط الطول مطلوب',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $restaurant = RestaurantInfo::getInstance();
        $restaurantLocation = $restaurant->getDeliveryCoordinates();

        $route = $routeService->calculate(
            $restaurantLocation['latitude'],
            $restaurantLocation['longitude'],
            (float) $request->latitude,
            (float) $request->longitude
        );
        $distanceMeters = (float) $route['distance_meters'];

        $withinRange = DeliveryOrder::isWithinDeliveryRange($distanceMeters);
        $deliveryCost = $withinRange ? DeliveryOrder::calculateCost($distanceMeters) : null;

        return $this->success([
            'restaurant_location' => [
                'latitude' => $restaurantLocation['latitude'],
                'longitude' => $restaurantLocation['longitude'],
                'address' => $restaurant->address,
            ],
            'customer_location' => [
                'latitude' => (float) $request->latitude,
                'longitude' => (float) $request->longitude,
            ],
            'distance_meters' => $distanceMeters,
            'distance_km' => round($distanceMeters / 1000, 2),
            'delivery_cost' => $deliveryCost,
            'delivery_cost_formatted' => ! is_null($deliveryCost)
                ? number_format($deliveryCost, 0).' ل.س'
                : null,
            'is_within_range' => $withinRange,
            'max_distance_km' => DeliveryOrder::getMaxDistanceKm(),
            'cost_per_km' => DeliveryOrder::getCostPerKm(),
            'route' => [
                'provider' => $route['provider'],
                'is_fallback' => $route['is_fallback'],
                'geometry' => $route['geometry'],
                'duration_seconds' => $route['duration_seconds'],
                'duration_minutes' => (int) ceil($route['duration_seconds'] / 60),
                'calculated_at' => $route['calculated_at'],
            ],
        ], $withinRange
            ? ($route['is_fallback']
                ? 'تم حساب تقدير احتياطي للمسافة والتكلفة'
                : 'تم حساب الطريق وتكلفة التوصيل بنجاح')
            : 'الموقع خارج نطاق التوصيل الحالي'
        );
    }

    // ═══════════════════════════════════════════════
    // مسارات المدير العام
    // ═══════════════════════════════════════════════

    // ─────────────────────────────────────────────
    // GET /api/admin/restaurant
    // ─────────────────────────────────────────────
    public function adminShow(Request $request)
    {
        if (! $this->isGM($request)) {
            return $this->unauthorized('هذا المسار للمدير العام فقط');
        }

        $info = RestaurantInfo::getInstance();
        $images = RestaurantImage::active()->ordered()->get();

        return $this->success([
            'restaurant' => $info->getAdminDetails(),
            'images_count' => $images->count(),
            'images' => $images->map->getDetails()->values(),
        ]);
    }

    // ─────────────────────────────────────────────
    // PUT /api/admin/restaurant/delivery-settings
    // ─────────────────────────────────────────────
    public function updateDeliverySettings(Request $request)
    {
        if (! $this->isGM($request)) {
            return $this->unauthorized('هذا المسار للمدير العام فقط');
        }

        $validator = Validator::make($request->all(), [
            'cost_per_100m' => 'required|numeric|min:0',
            'max_distance_meters' => 'required|integer|min:1000|max:50000',
        ], [
            'cost_per_100m.required' => 'تكلفة التوصيل لكل 100م مطلوبة',
            'cost_per_100m.min' => 'التكلفة يجب أن تكون أكبر من صفر',
            'max_distance_meters.required' => 'الحد الأقصى للمسافة مطلوب',
            'max_distance_meters.min' => 'الحد الأدنى للمسافة 1 كم',
            'max_distance_meters.max' => 'الحد الأقصى للمسافة 50 كم',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $info = RestaurantInfo::getInstance();
        $info->updateDeliverySettings(
            $request->cost_per_100m,
            $request->max_distance_meters
        );

        return $this->success([
            'delivery_settings' => $info->fresh()->getAdminDetails()['delivery_settings'],
        ], 'تم تحديث إعدادات التوصيل بنجاح');
    }

    // ─────────────────────────────────────────────
    // PUT /api/admin/restaurant/reservation-settings
    // ─────────────────────────────────────────────
    public function updateReservationSettings(Request $request)
    {
        if (! $this->isGM($request)) {
            return $this->unauthorized('هذا المسار للمدير العام فقط');
        }

        $validator = Validator::make($request->all(), [
            'vip_extra_cost' => 'required|numeric|min:0',
            'seats_above' => 'required|integer|min:1|max:20',
            'cost_per_extra_seat' => 'required|numeric|min:0',
        ], [
            'vip_extra_cost.required' => 'تكلفة الطاولة VIP مطلوبة',
            'seats_above.required' => 'عدد المقاعد المجانية مطلوب',
            'cost_per_extra_seat.required' => 'تكلفة المقعد الإضافي مطلوبة',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $info = RestaurantInfo::getInstance();
        $info->updateReservationSettings(
            $request->vip_extra_cost,
            $request->seats_above,
            $request->cost_per_extra_seat
        );

        return $this->success([
            'reservation_settings' => $info->fresh()->getAdminDetails()['reservation_settings'],
        ], 'تم تحديث إعدادات الحجز بنجاح');
    }

    // ─────────────────────────────────────────────
    // PUT /api/admin/restaurant/toggle-open
    // فتح/إغلاق المطعم
    // ─────────────────────────────────────────────
    public function toggleOpen(Request $request)
    {
        if (! $this->isGM($request)) {
            return $this->unauthorized('هذا المسار للمدير العام فقط');
        }

        $validator = Validator::make($request->all(), [
            'is_open' => 'required|boolean',
        ], [
            'is_open.required' => 'حالة المطعم مطلوبة',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $info = RestaurantInfo::getInstance();
        $info->toggleOpen((bool) $request->is_open);

        $status = $info->is_open ? 'مفتوح' : 'مغلق';

        return $this->success([
            'is_open' => $info->is_open,
            'status_label' => $status,
        ], "تم تغيير حالة المطعم إلى: {$status}");
    }

    // ═══════════════════════════════════════════════
    // مسارات مدير التواصل
    // ═══════════════════════════════════════════════

    // ─────────────────────────────────────────────
    // GET /api/communication/restaurant
    // ─────────────────────────────────────────────
    public function commShow(Request $request)
    {
        if (! $this->isCommManager($request)) {
            return $this->unauthorized('هذا المسار لمدير التواصل فقط');
        }

        $info = RestaurantInfo::getInstance();

        return $this->success([
            'restaurant' => $info->getAdminDetails(),
        ]);
    }

    // ─────────────────────────────────────────────
    // PUT /api/communication/restaurant
    // تعديل معلومات الاتصال والتواصل
    // ─────────────────────────────────────────────
    public function updateContactInfo(Request $request)
    {
        if (! $this->isCommManager($request)) {
            return $this->unauthorized('هذا المسار لمدير التواصل فقط');
        }

        $websiteTextFields = [
            'hero_eyebrow_ar', 'hero_eyebrow_en',
            'hero_title_ar', 'hero_title_en',
            'hero_title_accent_ar', 'hero_title_accent_en',
            'hero_description_ar', 'hero_description_en',
            'story_title_ar', 'story_title_en',
            'story_paragraph_one_ar', 'story_paragraph_one_en',
            'story_paragraph_two_ar', 'story_paragraph_two_en',
            'value_one_title_ar', 'value_one_title_en',
            'value_one_description_ar', 'value_one_description_en',
            'value_two_title_ar', 'value_two_title_en',
            'value_two_description_ar', 'value_two_description_en',
            'value_three_title_ar', 'value_three_title_en',
            'value_three_description_ar', 'value_three_description_en',
            'visit_title_ar', 'visit_title_en',
            'visit_description_ar', 'visit_description_en',
            'footer_tagline_ar', 'footer_tagline_en',
            'footer_description_ar', 'footer_description_en',
            'hours_weekdays_ar', 'hours_weekdays_en',
            'hours_friday_ar', 'hours_friday_en',
        ];

        $rules = [
            'owner_name' => 'sometimes|nullable|string|max:255',
            'email' => 'sometimes|nullable|email|max:255',
            'phone' => 'sometimes|nullable|string|max:30',
            'whatsapp' => 'sometimes|nullable|string|max:30',
            'address' => 'sometimes|nullable|string|max:500',
            'latitude' => 'sometimes|nullable|numeric|between:-90,90',
            'longitude' => 'sometimes|nullable|numeric|between:-180,180',
            'about_text' => 'sometimes|nullable|string|max:2000',
            'privacy_policy' => 'sometimes|nullable|string|max:5000',
            'facebook_url' => 'sometimes|nullable|url|max:500',
            'instagram_url' => 'sometimes|nullable|url|max:500',
            'telegram_url' => 'sometimes|nullable|url|max:500',
            'working_hours' => 'sometimes|nullable|array',
            'working_hours.*' => 'array:open,from,to',
            'working_hours.*.open' => 'required|boolean',
            'working_hours.*.from' => 'required|date_format:H:i',
            'working_hours.*.to' => 'required|date_format:H:i',
            'website_content' => 'sometimes|nullable|array',
            'website_content.footer_links' => 'sometimes|array|max:8',
            'website_content.footer_links.*.label_ar' => 'required|string|max:100',
            'website_content.footer_links.*.label_en' => 'required|string|max:100',
            'website_content.footer_links.*.url' => [
                'required', 'string', 'max:500',
                'not_regex:/^\s*(?:javascript|data):/i',
            ],
        ];

        foreach ($websiteTextFields as $field) {
            $rules['website_content.'.$field] = 'sometimes|nullable|string|max:2000';
        }

        $validator = Validator::make($request->all(), $rules, [
            'email.email' => 'صيغة البريد الإلكتروني غير صحيحة',
            'latitude.between' => 'خط العرض يجب أن يكون بين -90 و 90',
            'longitude.between' => 'خط الطول يجب أن يكون بين -180 و 180',
            'facebook_url.url' => 'رابط Facebook غير صحيح',
            'instagram_url.url' => 'رابط Instagram غير صحيح',
            'telegram_url.url' => 'رابط Telegram غير صحيح',
            'website_content.footer_links.max' => 'الحد الأقصى لروابط الفوتر هو 8 روابط',
            'website_content.footer_links.*.url.not_regex' => 'رابط الفوتر غير آمن',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $payload = $validator->validated();
        if (isset($payload['website_content'])) {
            $allowedContentKeys = array_merge($websiteTextFields, ['footer_links']);
            $payload['website_content'] = array_intersect_key(
                $payload['website_content'],
                array_flip($allowedContentKeys)
            );
        }

        $info = RestaurantInfo::getInstance();
        $info->updateContactInfo($payload);

        return $this->success([
            'restaurant' => $info->fresh()->getPublicDetails(),
        ], 'تم تحديث معلومات المطعم بنجاح');
    }

    // ═══════════════════════════════════════════════
    // إدارة صور المطعم
    // ═══════════════════════════════════════════════

    // ─────────────────────────────────────────────
    // GET /api/communication/images
    // ─────────────────────────────────────────────
    public function imagesIndex(Request $request)
    {
        if (! $this->isCommManager($request)) {
            return $this->unauthorized();
        }

        $query = RestaurantImage::query();

        if ($request->filled('type')) {
            $query->byType($request->type);
        }

        if ($request->filled('is_active')) {
            $query->where('is_active', (bool) $request->is_active);
        }

        $images = $query->ordered()->get();

        return $this->success([
            'stats' => [
                'total' => $images->count(),
                'active' => $images->where('is_active', true)->count(),
                'inactive' => $images->where('is_active', false)->count(),
            ],
            'type_labels' => RestaurantImage::TYPE_LABELS,
            'images_grouped' => RestaurantImage::getAllGrouped(),
            'all_images' => $images->map->getDetails()->values(),
        ]);
    }

    // ─────────────────────────────────────────────
    // PUT /api/communication/images/{id}
    // تعديل بيانات صورة
    // ─────────────────────────────────────────────
    public function imageUpdate(Request $request, int $id)
    {
        if (! $this->isCommManager($request)) {
            return $this->unauthorized();
        }

        $image = RestaurantImage::find($id);
        if (! $image) {
            return $this->notFound('الصورة غير موجودة');
        }

        $validator = Validator::make($request->all(), [
            'type' => 'sometimes|in:exterior,interior,food,banner,logo',
            'caption' => 'sometimes|nullable|string|max:255',
            'sort_order' => 'sometimes|integer|min:0',
        ], [
            'type.in' => 'النوع: exterior أو interior أو food أو banner أو logo',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $image->fill($request->only(['type', 'caption', 'sort_order']));
        $image->save();

        return $this->success([
            'image' => $image->getDetails(),
        ], 'تم تحديث بيانات الصورة');
    }

    // ─────────────────────────────────────────────
    // PATCH /api/communication/images/{id}/order
    // تعديل ترتيب الصورة
    // ─────────────────────────────────────────────
    public function imageReorder(Request $request, int $id)
    {
        if (! $this->isCommManager($request)) {
            return $this->unauthorized();
        }

        $image = RestaurantImage::find($id);
        if (! $image) {
            return $this->notFound('الصورة غير موجودة');
        }

        $validator = Validator::make($request->all(), [
            'sort_order' => 'required|integer|min:0',
        ], [
            'sort_order.required' => 'الترتيب مطلوب',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $image->update(['sort_order' => $request->sort_order]);

        return $this->success([
            'image' => $image->getDetails(),
        ], 'تم تحديث ترتيب الصورة');
    }

    // ─────────────────────────────────────────────
    // PATCH /api/communication/images/{id}/toggle
    // إظهار/إخفاء صورة
    // ─────────────────────────────────────────────
    public function imageToggle(Request $request, int $id)
    {
        if (! $this->isCommManager($request)) {
            return $this->unauthorized();
        }

        $image = RestaurantImage::find($id);
        if (! $image) {
            return $this->notFound('الصورة غير موجودة');
        }

        $image->update(['is_active' => ! $image->is_active]);

        $status = $image->is_active ? 'إظهار' : 'إخفاء';
        $message = "تم {$status} الصورة";

        return $this->success([
            'image' => $image->getDetails(),
            'is_active' => $image->is_active,
        ], $message);
    }

    // ─────────────────────────────────────────────
    // DELETE /api/communication/images/{id}
    // ─────────────────────────────────────────────
    public function imageDestroy(Request $request, int $id)
    {
        if (! $this->isCommManager($request)) {
            return $this->unauthorized();
        }

        $image = RestaurantImage::find($id);
        if (! $image) {
            return $this->notFound('الصورة غير موجودة');
        }

        // حذف الملف من التخزين
        if ($image->image_path) {
            $fullPath = storage_path('app/public/'.$image->image_path);
            if (file_exists($fullPath)) {
                unlink($fullPath);
            }
        }

        $typeLabel = RestaurantImage::TYPE_LABELS[$image->type] ?? $image->type;
        $image->delete();

        return $this->success(null, "تم حذف صورة {$typeLabel}");
    }
}
