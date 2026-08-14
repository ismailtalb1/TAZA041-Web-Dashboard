<?php

namespace App\Http\Controllers\API;

use App\Models\DeliveryOrder;
use App\Models\Employee;
use App\Models\Notification;
use App\Models\Order;
use App\Models\RestaurantInfo;
use App\Models\Review;
use App\Services\OrderCancellationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class DeliveryController extends BaseController
{
    public function __construct(private readonly OrderCancellationService $cancellations) {}

    // ─────────────────────────────────────────────
    // مساعدات التحقق من الأدوار
    // ─────────────────────────────────────────────
    private function canManageDelivery(Request $request): bool
    {
        $user = $request->user();
        if (! $user instanceof Employee) {
            return false;
        }

        return in_array($user->role, [
            Employee::ROLE_DELIVERY_MANAGER,
            Employee::ROLE_GENERAL_MANAGER,
        ]);
    }

    private function isDriver(Request $request): bool
    {
        $user = $request->user();

        return $user instanceof Employee
            && in_array($user->role, [
                Employee::ROLE_DRIVER,
                Employee::ROLE_DELIVERY_MANAGER,
            ]);
    }

    private function canViewDelivery(Request $request): bool
    {
        $user = $request->user();
        if (! $user instanceof Employee) {
            return false;
        }

        return in_array($user->role, [
            Employee::ROLE_DELIVERY_MANAGER,
            Employee::ROLE_DRIVER,
            Employee::ROLE_GENERAL_MANAGER,
            Employee::ROLE_ORDER_MANAGER,
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/delivery
    // قائمة طلبات التوصيل
    // ─────────────────────────────────────────────
    public function index(Request $request)
    {
        if (! $this->canViewDelivery($request)) {
            return $this->unauthorized('صلاحية مدير التوصيل مطلوبة');
        }

        $user = $request->user();
        $query = DeliveryOrder::with([
            'order.customer',
            'order.items',
            'driver',
        ]);

        // تظهر طلبات التوصيل لمدير التوصيل بعد اكتمال تجهيزها من مدير الطلبات،
        // أو إذا كانت قد خرجت من مرحلة الانتظار سابقاً.
        if ($user->role !== Employee::ROLE_DRIVER) {
            $query->where(function ($q) {
                $q->where('status', '!=', DeliveryOrder::STATUS_PENDING)
                    ->orWhereHas('order', fn ($oq) => $oq->where('status', Order::STATUS_COMPLETED));
            });
        }

        // السائق يرى فقط الطلبات المسندة له
        if ($user->role === Employee::ROLE_DRIVER) {
            $query->assignedToDriver($user->id);
        }

        // فلاتر
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('driver_id')) {
            $query->where('driver_id', $request->driver_id);
        }

        if ($request->filled('date')) {
            $query->whereDate('created_at', $request->date);
        }

        if ($request->filled('route_quality')) {
            if ($request->route_quality === 'road') {
                $query->where('route_is_fallback', false);
            } elseif ($request->route_quality === 'fallback') {
                $query->where('route_is_fallback', true);
            }
        }

        if ($request->filled('min_distance_km') && is_numeric($request->min_distance_km)) {
            $query->where('distance_meters', '>=', max(0, (float) $request->min_distance_km) * 1000);
        }

        if ($request->filled('max_distance_km') && is_numeric($request->max_distance_km)) {
            $query->where('distance_meters', '<=', max(0, (float) $request->max_distance_km) * 1000);
        }

        $deliveries = $query->latest()->get();

        return $this->success([
            'stats' => [
                'total' => $deliveries->count(),
                'pending' => $deliveries->where('status', DeliveryOrder::STATUS_PENDING)->count(),
                'assigned' => $deliveries->where('status', DeliveryOrder::STATUS_ASSIGNED)->count(),
                'in_delivery' => $deliveries->where('status', DeliveryOrder::STATUS_IN_DELIVERY)->count(),
                'delivered' => $deliveries->where('status', DeliveryOrder::STATUS_DELIVERED)->count(),
                'cancelled' => $deliveries->where('status', DeliveryOrder::STATUS_CANCELLED)->count(),
            ],
            'deliveries' => $deliveries->map->getDetails()->values(),
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/delivery/active
    // الطلبات النشطة فقط
    // ─────────────────────────────────────────────
    public function active(Request $request)
    {
        if (! $this->canViewDelivery($request)) {
            return $this->unauthorized();
        }

        $user = $request->user();
        $query = DeliveryOrder::active()
            ->with(['order.customer', 'order.items', 'driver']);

        if ($user->role !== Employee::ROLE_DRIVER) {
            $query->where(function ($q) {
                $q->where('status', '!=', DeliveryOrder::STATUS_PENDING)
                    ->orWhereHas('order', fn ($oq) => $oq->where('status', Order::STATUS_COMPLETED));
            });
        }

        if ($user->role === Employee::ROLE_DRIVER) {
            $query->assignedToDriver($user->id);
        }

        $deliveries = $query->oldest()->get();

        return $this->success([
            'count' => $deliveries->count(),
            'deliveries' => $deliveries->map->getDetails()->values(),
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/delivery/assigned
    // الطلبات المسندة للسائق الحالي
    // ─────────────────────────────────────────────
    public function assigned(Request $request)
    {
        if (! $this->isDriver($request)) {
            return $this->unauthorized('هذا المسار للسائقين فقط');
        }

        $user = $request->user();

        $deliveries = DeliveryOrder::assignedToDriver($user->id)
            ->active()
            ->with(['order.customer', 'order.items', 'driver'])
            ->oldest()
            ->get();

        return $this->success([
            'count' => $deliveries->count(),
            'deliveries' => $deliveries->map->getDetails()->values(),
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/delivery/stats
    // إحصائيات التوصيل
    // ─────────────────────────────────────────────
    public function stats(Request $request)
    {
        if (! $this->canManageDelivery($request)) {
            return $this->unauthorized();
        }

        $today = now()->startOfDay();
        $week = now()->startOfWeek();

        // أداء السائقين
        $drivers = Employee::active()
            ->whereIn('role', [
                Employee::ROLE_DRIVER,
                Employee::ROLE_DELIVERY_MANAGER,
            ])
            ->get()
            ->map(fn ($driver) => [
                'id' => $driver->id,
                'name' => $driver->name,
                'role_label' => $driver->getRoleLabel(),
                'avatar' => $driver->avatar
                                             ? asset('storage/'.$driver->avatar)
                                             : null,
                'active_deliveries' => DeliveryOrder::assignedToDriver($driver->id)
                    ->active()->count(),
                'completed_today' => DeliveryOrder::assignedToDriver($driver->id)
                    ->where('status', DeliveryOrder::STATUS_DELIVERED)
                    ->whereDate('actual_delivery_time', today())
                    ->count(),
                'total_completed' => $driver->getCompletedDeliveriesCount(),
                'average_rating' => $driver->getAverageDriverRating(),
            ]);

        $allDeliveries = DeliveryOrder::all();
        $statusCounts = collect([
            DeliveryOrder::STATUS_PENDING,
            DeliveryOrder::STATUS_ASSIGNED,
            DeliveryOrder::STATUS_PICKED_UP,
            DeliveryOrder::STATUS_IN_DELIVERY,
        ])->mapWithKeys(fn (string $status) => [
            $status => $allDeliveries->where('status', $status)->count(),
        ])->put(
            DeliveryOrder::STATUS_DELIVERED,
            $allDeliveries->filter(fn (DeliveryOrder $delivery) => $delivery->status === DeliveryOrder::STATUS_DELIVERED
                && ($delivery->actual_delivery_time?->isToday() ?? false)
            )->count()
        );
        $weeklyTrend = collect(range(6, 0))->map(function (int $offset) use ($allDeliveries) {
            $date = now()->startOfDay()->subDays($offset);

            return [
                'date' => $date->toDateString(),
                'label' => $date->locale('ar')->translatedFormat('D d'),
                'total' => $allDeliveries->filter(
                    fn (DeliveryOrder $delivery) => $delivery->created_at->isSameDay($date)
                )->count(),
                'delivered' => $allDeliveries->filter(
                    fn (DeliveryOrder $delivery) => $delivery->status === DeliveryOrder::STATUS_DELIVERED
                        && ($delivery->actual_delivery_time?->isSameDay($date) ?? false)
                )->count(),
            ];
        });

        return $this->success([
            'overview' => [
                'total_today' => DeliveryOrder::whereDate('created_at', today())->count(),
                'delivered_today' => DeliveryOrder::where('status', DeliveryOrder::STATUS_DELIVERED)
                    ->whereDate('actual_delivery_time', today())
                    ->count(),
                'pending_assignment' => DeliveryOrder::where('status', DeliveryOrder::STATUS_PENDING)
                    ->whereHas('order', fn ($q) => $q->where('status', Order::STATUS_COMPLETED))
                    ->count(),
                'currently_delivering' => DeliveryOrder::where('status', DeliveryOrder::STATUS_IN_DELIVERY)->count(),
                'average_rating' => round(
                    DeliveryOrder::whereNotNull('driver_rating')->avg('driver_rating') ?? 0,
                    1
                ),
                'total_revenue' => Order::delivery()
                    ->where('status', Order::STATUS_COMPLETED)
                    ->sum('final_price'),
            ],
            'drivers' => $drivers->values(),
            'status_counts' => $statusCounts,
            'weekly_trend' => $weeklyTrend->values(),
            'delivery_settings' => [
                'cost_per_km' => DeliveryOrder::getCostPerKm(),
                'max_distance_km' => DeliveryOrder::getMaxDistanceKm(),
            ],
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/delivery/{id}
    // ─────────────────────────────────────────────
    public function show(Request $request, int $id)
    {
        if (! $this->canViewDelivery($request)) {
            return $this->unauthorized();
        }

        $user = $request->user();
        $delivery = DeliveryOrder::with([
            'order.customer',
            'order.items',
            'driver',
        ])->find($id);

        if (! $delivery) {
            return $this->notFound('طلب التوصيل غير موجود');
        }

        // السائق يرى فقط طلباته
        if ($user->role === Employee::ROLE_DRIVER
            && $delivery->driver_id !== $user->id) {
            return $this->unauthorized('ليس لديك صلاحية لعرض هذا الطلب');
        }

        return $this->success([
            'delivery' => $delivery->getDetails(),
            'order' => $delivery->order->getDetails(),
        ]);
    }

    // ─────────────────────────────────────────────
    // PUT /api/delivery/{id}/assign
    // تعيين سائق لطلب توصيل
    // ─────────────────────────────────────────────
    public function assignDriver(Request $request, int $id)
    {
        if (! $this->canManageDelivery($request)) {
            return $this->unauthorized('صلاحية مدير التوصيل مطلوبة');
        }

        $delivery = DeliveryOrder::with(['order'])->find($id);
        if (! $delivery) {
            return $this->notFound('طلب التوصيل غير موجود');
        }

        if ($delivery->order?->status !== Order::STATUS_COMPLETED) {
            return $this->error('لا يمكن تعيين سائق قبل اكتمال تجهيز الطلب من مدير الطلبات');
        }

        if ($delivery->status !== DeliveryOrder::STATUS_PENDING) {
            return $this->error(
                "لا يمكن تعيين سائق لطلب بحالة \"{$delivery->getStatusLabel()}\""
            );
        }

        $validator = Validator::make($request->all(), [
            'driver_id' => 'required|integer|exists:employees,id',
        ], [
            'driver_id.required' => 'معرف السائق مطلوب',
            'driver_id.exists' => 'السائق غير موجود',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $driver = Employee::find($request->driver_id);

        if (! in_array($driver->role, [
            Employee::ROLE_DRIVER,
            Employee::ROLE_DELIVERY_MANAGER,
        ])) {
            return $this->error('الموظف المحدد ليس سائقاً');
        }

        if (! $driver->is_active) {
            return $this->error('هذا السائق غير نشط حالياً');
        }

        $result = $delivery->assignDriver($request->driver_id);

        if (! $result) {
            return $this->error('فشل في تعيين السائق');
        }

        $delivery->load(['driver']);

        return $this->success([
            'delivery' => $delivery->getDetails(),
            'driver_name' => $driver->name,
        ], "تم تعيين السائق {$driver->name} للتوصيل");
    }

    // ─────────────────────────────────────────────
    // PUT /api/delivery/{id}/status
    // تغيير حالة التوصيل
    // ─────────────────────────────────────────────
    public function changeStatus(Request $request, int $id)
    {
        if (! $this->isDriver($request)) {
            return $this->unauthorized('هذا المسار للسائقين ومدير التوصيل فقط');
        }

        $user = $request->user();
        $delivery = DeliveryOrder::with(['order.customer'])->find($id);

        if (! $delivery) {
            return $this->notFound('طلب التوصيل غير موجود');
        }

        // السائق يعدّل فقط طلباته
        if ($user->role === Employee::ROLE_DRIVER
            && $delivery->driver_id !== $user->id) {
            return $this->unauthorized('ليس لديك صلاحية تعديل هذا الطلب');
        }

        $validator = Validator::make($request->all(), [
            'status' => 'required|in:in_delivery,delivered,cancelled',
        ], [
            'status.required' => 'الحالة الجديدة مطلوبة',
            'status.in' => 'الحالة: in_delivery أو delivered أو cancelled',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        if ($request->status === DeliveryOrder::STATUS_CANCELLED) {
            if (! $this->canManageDelivery($request)) {
                return $this->unauthorized('إلغاء التوصيل متاح لمدير التوصيل فقط');
            }
            if (in_array($delivery->status, [
                DeliveryOrder::STATUS_DELIVERED,
                DeliveryOrder::STATUS_CANCELLED,
            ], true)) {
                return $this->error("لا يمكن إلغاء توصيل بحالة \"{$delivery->getStatusLabel()}\"");
            }

            try {
                $cancellation = $this->cancellations->cancel(
                    $delivery->order,
                    'employee',
                    $user->id,
                    $request->input('reason'),
                    [
                        Order::STATUS_PENDING,
                        Order::STATUS_CONFIRMED,
                        Order::STATUS_READY,
                        Order::STATUS_COMPLETED,
                    ],
                );
            } catch (\Throwable $e) {
                return $this->error(
                    'تعذر إلغاء التوصيل وتسوية الدفع',
                    500,
                    config('app.debug') ? $e->getMessage() : null,
                );
            }

            $cancelledDelivery = $cancellation['order']->deliveryOrder;

            return $this->success([
                'delivery' => $cancelledDelivery->getDetails(),
                'new_status' => $cancelledDelivery->getStatusLabel(),
                'refund' => $cancellation['refund'],
                'already_cancelled' => $cancellation['already_cancelled'],
            ], 'تم إلغاء التوصيل وإتمام تسوية الدفع بنجاح');
        }

        $changed = $delivery->changeStatus($request->status, $user->role);

        if (! $changed) {
            return $this->error(
                "لا يمكن تغيير حالة التوصيل من \"{$delivery->getStatusLabel()}\" إلى \"{$request->status}\""
            );
        }

        $delivery->load(['driver', 'order.customer']);

        return $this->success([
            'delivery' => $delivery->getDetails(),
            'new_status' => $delivery->getStatusLabel(),
        ], 'تم تحديث حالة التوصيل');
    }

    // ─────────────────────────────────────────────
    // POST /api/delivery/{id}/notify-customer
    // إشعار يدوي للزبون
    // ─────────────────────────────────────────────
    public function notifyCustomer(Request $request, int $id)
    {
        if (! $this->isDriver($request)) {
            return $this->unauthorized();
        }

        $delivery = DeliveryOrder::with(['order'])->find($id);
        if (! $delivery) {
            return $this->notFound('طلب التوصيل غير موجود');
        }

        $customerId = $delivery->order?->customer_id;
        if (! $customerId) {
            return $this->error('لا يوجد زبون مرتبط بهذا الطلب');
        }

        $validator = Validator::make($request->all(), [
            'message' => 'required|string|max:500',
        ], [
            'message.required' => 'نص الإشعار مطلوب',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $user = $request->user();

        Notification::create([
            'sender_type' => Notification::SENDER_EMPLOYEE,
            'sender_id' => $user->id,
            'receiver_type' => Notification::RECEIVER_CUSTOMER,
            'receiver_id' => $customerId,
            'type' => Notification::TYPE_DELIVERY_UPDATE,
            'title' => "تحديث توصيل #{$delivery->order_id} 🚗",
            'message' => $request->message,
            'data' => [
                'order_id' => $delivery->order_id,
                'delivery_order_id' => $delivery->id,
                'driver_name' => $user->name,
            ],
        ]);

        return $this->success(null, 'تم إرسال الإشعار للزبون');
    }

    // ─────────────────────────────────────────────
    // GET /api/delivery/driver/{id}/ratings
    // تقييمات سائق معين
    // ─────────────────────────────────────────────
    public function driverRatings(Request $request, int $id)
    {
        $user = $request->user();
        $isOwnData = $user instanceof Employee
                      && $user->role === Employee::ROLE_DRIVER
                      && $user->id === $id;

        if (! $this->canManageDelivery($request) && ! $isOwnData) {
            return $this->unauthorized('يمكنك فقط عرض تقييماتك الخاصة');
        }
        $driver = Employee::find($id);
        if (! $driver) {
            return $this->notFound('السائق غير موجود');
        }

        if (! in_array($driver->role, [
            Employee::ROLE_DRIVER,
            Employee::ROLE_DELIVERY_MANAGER,
        ])) {
            return $this->error('الموظف المحدد ليس سائقاً');
        }

        $deliveries = DeliveryOrder::assignedToDriver($id)
            ->whereNotNull('driver_rating')
            ->with(['order.customer'])
            ->latest()
            ->get();

        $ratingsDistribution = [1 => 0, 2 => 0, 3 => 0, 4 => 0, 5 => 0];
        foreach ($deliveries as $d) {
            if ($d->driver_rating) {
                $ratingsDistribution[$d->driver_rating]++;
            }
        }

        $reviews = Review::driverReviews()
            ->forEmployee($id)
            ->latest()
            ->get()
            ->map->getDetails()
            ->values();

        return $this->success([
            'driver' => [
                'id' => $driver->id,
                'name' => $driver->name,
                'avatar' => $driver->avatar
                               ? asset('storage/'.$driver->avatar)
                               : null,
            ],
            'summary' => [
                'average_rating' => $driver->getAverageDriverRating(),
                'total_ratings' => $deliveries->count(),
                'total_deliveries' => $driver->getCompletedDeliveriesCount(),
                'distribution' => $ratingsDistribution,
            ],
            'rated_deliveries' => $deliveries->map(fn ($d) => [
                'order_id' => $d->order_id,
                'customer_name' => $d->order?->customer?->name ?? 'مجهول',
                'rating' => $d->driver_rating,
                'feedback' => $d->driver_feedback,
                'delivered_at' => $d->actual_delivery_time?->format('Y-m-d H:i'),
            ])->values(),
            'reviews' => $reviews,
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/delivery/driver/{id}/stats
    // إحصائيات سائق
    // ─────────────────────────────────────────────
    public function driverStats(Request $request, int $id)
    {
        if (! $this->canViewDelivery($request)) {
            return $this->unauthorized();
        }

        $user = $request->user();

        // السائق يرى فقط إحصائياته
        if ($user->role === Employee::ROLE_DRIVER && $user->id !== $id) {
            return $this->unauthorized('يمكنك فقط عرض إحصائياتك الخاصة');
        }

        $driver = Employee::find($id);
        if (! $driver) {
            return $this->notFound('السائق غير موجود');
        }

        $allDeliveries = DeliveryOrder::assignedToDriver($id);
        $todayDeliveries = (clone $allDeliveries)->whereDate('created_at', today());
        $driverDeliveries = (clone $allDeliveries)->get();
        $weeklyTrend = collect(range(6, 0))->map(function (int $offset) use ($driverDeliveries) {
            $date = now()->startOfDay()->subDays($offset);

            return [
                'date' => $date->toDateString(),
                'label' => $date->locale('ar')->translatedFormat('D d'),
                'total' => $driverDeliveries->filter(
                    fn (DeliveryOrder $delivery) => $delivery->created_at->isSameDay($date)
                )->count(),
                'delivered' => $driverDeliveries->filter(
                    fn (DeliveryOrder $delivery) => $delivery->status === DeliveryOrder::STATUS_DELIVERED
                        && ($delivery->actual_delivery_time?->isSameDay($date) ?? false)
                )->count(),
            ];
        });

        return $this->success([
            'driver' => [
                'id' => $driver->id,
                'name' => $driver->name,
                'role_label' => $driver->getRoleLabel(),
                'avatar' => $driver->avatar
                                    ? asset('storage/'.$driver->avatar)
                                    : null,
            ],
            'stats' => [
                'today' => [
                    'assigned' => (clone $todayDeliveries)->count(),
                    'completed' => (clone $todayDeliveries)
                        ->where('status', DeliveryOrder::STATUS_DELIVERED)
                        ->count(),
                ],
                'all_time' => [
                    'total_assigned' => (clone $allDeliveries)->count(),
                    'total_completed' => $driver->getCompletedDeliveriesCount(),
                    'total_cancelled' => (clone $allDeliveries)
                        ->where('status', DeliveryOrder::STATUS_CANCELLED)
                        ->count(),
                    'average_rating' => $driver->getAverageDriverRating(),
                ],
                'active_now' => DeliveryOrder::assignedToDriver($id)->active()->count(),
            ],
            'weekly_trend' => $weeklyTrend->values(),
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/delivery/settings
    // إعدادات التوصيل الحالية
    // ─────────────────────────────────────────────
    public function settings(Request $request)
    {
        if (! $this->canViewDelivery($request)) {
            return $this->unauthorized();
        }

        $info = RestaurantInfo::getInstance();

        return $this->success([
            'cost_per_100m' => $info->delivery_cost_per_100m,
            'cost_per_km' => $info->delivery_cost_per_100m * 10,
            'max_distance_meters' => $info->max_delivery_distance_meters,
            'max_distance_km' => $info->max_delivery_distance_meters / 1000,
            'cost_per_km_formatted' => number_format($info->delivery_cost_per_100m * 10, 0).' ل.س/كم',
            'max_distance_formatted' => ($info->max_delivery_distance_meters / 1000).' كم',
            'example_costs' => [
                '1_km' => number_format(DeliveryOrder::calculateCost(1000), 0).' ل.س',
                '3_km' => number_format(DeliveryOrder::calculateCost(3000), 0).' ل.س',
                '5_km' => number_format(DeliveryOrder::calculateCost(5000), 0).' ل.س',
                '10_km' => number_format(DeliveryOrder::calculateCost(10000), 0).' ل.س',
            ],
        ]);
    }

    // ─────────────────────────────────────────────────────────
    // GET /api/delivery/drivers
    // قائمة السائقين المتاحين لمدير التوصيل
    // ─────────────────────────────────────────────────────────
    public function getDrivers(Request $request)
    {
        if (! $this->canManageDelivery($request)) {
            return $this->unauthorized('صلاحية مدير التوصيل مطلوبة');
        }

        $drivers = Employee::active()
            ->whereIn('role', [
                Employee::ROLE_DRIVER,
                Employee::ROLE_DELIVERY_MANAGER,
            ])
            ->get()
            ->map(fn ($d) => [
                'id' => $d->id,
                'name' => $d->name,
                'role' => $d->role,
                'role_label' => $d->getRoleLabel(),
                'avatar' => $d->avatar
                                         ? asset('storage/'.$d->avatar)
                                         : null,
                'average_rating' => $d->getAverageDriverRating(),
                'active_deliveries' => DeliveryOrder::assignedToDriver($d->id)
                    ->active()->count(),
                'total_completed' => $d->getCompletedDeliveriesCount(),
                'total_ratings' => DeliveryOrder::assignedToDriver($d->id)
                    ->whereNotNull('driver_rating')
                    ->count(),
            ]);

        return $this->success([
            'all' => $drivers->values(),
            'count' => $drivers->count(),
        ]);
    }

    // ─────────────────────────────────────────────
    // PUT /api/delivery/settings
    // تعديل إعدادات التوصيل
    // ─────────────────────────────────────────────
    public function updateSettings(Request $request)
    {
        if (! $this->canManageDelivery($request)) {
            return $this->unauthorized('صلاحية مدير التوصيل مطلوبة');
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
            'cost_per_100m' => $info->delivery_cost_per_100m,
            'cost_per_km' => $info->delivery_cost_per_100m * 10,
            'max_distance_km' => $info->max_delivery_distance_meters / 1000,
        ], 'تم تحديث إعدادات التوصيل بنجاح');
    }
}
