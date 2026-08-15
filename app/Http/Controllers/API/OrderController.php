<?php

namespace App\Http\Controllers\API;

use App\Models\Customer;
use App\Models\DeliveryOrder;
use App\Models\Employee;
use App\Models\Notification;
use App\Models\Offer;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\ReservationOrder;
use App\Models\RestaurantInfo;
use App\Services\DeliveryRouteService;
use App\Services\OrderCancellationService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class OrderController extends BaseController
{
    public function __construct(private readonly OrderCancellationService $cancellations) {}

    // ─────────────────────────────────────────────
    // مساعدات التحقق من الأدوار
    // ─────────────────────────────────────────────
    private function isOrderManager(Request $request): bool
    {
        $user = $request->user();

        return $user instanceof Employee && in_array($user->role, [
            Employee::ROLE_ORDER_MANAGER,
            Employee::ROLE_GENERAL_MANAGER,
        ]);
    }

    private function isGeneralManager(Request $request): bool
    {
        $user = $request->user();

        return $user instanceof Employee && $user->isGeneralManager();
    }

    private function isCustomer(Request $request): bool
    {
        return $request->user() instanceof Customer;
    }

    private function applyRecordState($query, Request $request): void
    {
        match ($request->input('record_state', 'active')) {
            'archived' => $query->whereNotNull('archived_at'),
            'all' => null,
            default => $query->whereNull('archived_at'),
        };
    }

    // ─────────────────────────────────────────────
    // GET /api/orders
    // مدير الطلبات — طلباته المسؤول عنها
    // ─────────────────────────────────────────────
    public function index(Request $request)
    {
        if (! $this->isOrderManager($request)) {
            return $this->unauthorized('صلاحية مدير الطلبات مطلوبة');
        }

        $query = ($request->input('record_state') === 'archived'
            ? Order::query()
            : Order::forOrderManager())
            ->with(['customer', 'items', 'paymentRecord',
                'deliveryOrder', 'reservationOrder']);

        $this->applyRecordState($query, $request);

        // فلاتر
        if ($request->filled('type')) {
            $query->where('type', $request->type);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('date')) {
            $query->whereDate('created_at', $request->date);
        }

        if ($request->filled('search')) {
            $search = $request->search;
            $query->whereHas('customer', fn ($q) => $q->where('name', 'like', "%{$search}%")
                ->orWhere('phone', 'like', "%{$search}%")
            );
        }

        $orders = $query->latest()->get();

        return $this->success([
            'stats' => [
                'total' => $orders->count(),
                'pending' => $orders->where('status', Order::STATUS_PENDING)->count(),
                'confirmed' => $orders->where('status', Order::STATUS_CONFIRMED)->count(),
                'ready' => $orders->where('status', Order::STATUS_READY)->count(),
                'completed' => $orders->where('status', Order::STATUS_COMPLETED)->count(),
                'cancelled' => $orders->where('status', Order::STATUS_CANCELLED)->count(),
            ],
            'orders' => $orders->map->getDetails()->values(),
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/orders/pending
    // الطلبات المعلقة (تنبيه للمدير)
    // ─────────────────────────────────────────────
    public function pending(Request $request)
    {
        if (! $this->isOrderManager($request)) {
            return $this->unauthorized();
        }

        $orders = Order::forOrderManager()
            ->pending()
            ->with(['customer', 'items'])
            ->oldest() // الأقدم أولاً
            ->get();

        return $this->success([
            'count' => $orders->count(),
            'orders' => $orders->map->getDetails()->values(),
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/orders/normal — الطلبات العادية فقط
    // ─────────────────────────────────────────────
    public function normalOrders(Request $request)
    {
        if (! $this->isOrderManager($request)) {
            return $this->unauthorized();
        }

        $query = Order::normal()
            ->with(['customer', 'items', 'paymentRecord']);

        $this->applyRecordState($query, $request);

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('date')) {
            $query->whereDate('created_at', $request->date);
        }

        $orders = $query->latest()->get();

        return $this->success([
            'count' => $orders->count(),
            'orders' => $orders->map->getDetails()->values(),
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/orders/normal/stats
    // ─────────────────────────────────────────────
    public function normalStats(Request $request)
    {
        if (! $this->isOrderManager($request)) {
            return $this->unauthorized();
        }

        $today = Order::normal()->whereDate('created_at', today());
        $week = Order::normal()->whereBetween('created_at', [
            now()->startOfWeek(), now()->endOfWeek(),
        ]);

        $todayOrders = Order::normal()
            ->whereDate('created_at', today())
            ->get(['status', 'created_at']);

        $hourly = collect(range(10, 23))->map(fn (int $hour) => [
            'label' => sprintf('%02d:00', $hour),
            'value' => $todayOrders->filter(
                fn (Order $order) => (int) $order->created_at->format('H') === $hour
            )->count(),
        ]);

        $statusCounts = collect([
            Order::STATUS_PENDING,
            Order::STATUS_CONFIRMED,
            Order::STATUS_READY,
            Order::STATUS_COMPLETED,
            Order::STATUS_CANCELLED,
        ])->mapWithKeys(fn (string $status) => [
            $status => $todayOrders->where('status', $status)->count(),
        ]);

        return $this->success([
            'today' => [
                'total' => (clone $today)->count(),
                'pending' => (clone $today)->pending()->count(),
                'completed' => (clone $today)->where('status', Order::STATUS_COMPLETED)->count(),
                'revenue' => (clone $today)->where('status', Order::STATUS_COMPLETED)->sum('final_price'),
            ],
            'this_week' => [
                'total' => (clone $week)->count(),
                'revenue' => (clone $week)->where('status', Order::STATUS_COMPLETED)->sum('final_price'),
            ],
            'hourly_today' => $hourly->values(),
            'status_counts' => $statusCounts,
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/orders/{id}
    // ─────────────────────────────────────────────
    public function show(Request $request, int $id)
    {
        if (! $this->isOrderManager($request)) {
            return $this->unauthorized();
        }

        $order = Order::with([
            'customer',
            'items',
            'paymentRecord',
            'deliveryOrder.driver',
            'reservationOrder',
        ])->find($id);

        if (! $order) {
            return $this->notFound('الطلب غير موجود');
        }

        return $this->success(['order' => $order->getDetails()]);
    }

    // ─────────────────────────────────────────────
    // PUT /api/orders/{id}/status
    // تغيير حالة الطلب
    // ─────────────────────────────────────────────
    public function changeStatus(Request $request, int $id)
    {
        if (! $this->isOrderManager($request)) {
            return $this->unauthorized();
        }

        $order = Order::with(['deliveryOrder', 'reservationOrder'])->find($id);
        if (! $order) {
            return $this->notFound('الطلب غير موجود');
        }

        $validator = Validator::make($request->all(), [
            'status' => 'required|string|in:confirmed,ready,completed,cancelled',
        ], [
            'status.required' => 'الحالة الجديدة مطلوبة',
            'status.in' => 'الحالة يجب أن تكون: confirmed أو ready أو completed أو cancelled',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $employee = $request->user();
        $newStatus = $request->status;
        // المدير العام يستخدم نفس مسار الصلاحيات التشغيلي لمدير الطلبات.
        $actorRole = Employee::ROLE_ORDER_MANAGER;

        // التحقق من صحة الانتقال
        if (! $order->canChangeStatus($actorRole, $newStatus)) {
            return $this->error(
                "لا يمكن تغيير حالة الطلب من \"{$order->getStatusLabel()}\" إلى \"{$newStatus}\""
            );
        }

        DB::beginTransaction();
        try {
            if ($newStatus === Order::STATUS_CANCELLED) {
                $cancellation = $this->cancellations->cancel(
                    $order,
                    'employee',
                    $employee->id,
                    $request->input('reason'),
                    [Order::STATUS_PENDING, Order::STATUS_CONFIRMED, Order::STATUS_READY],
                );

                DB::commit();

                return $this->success([
                    'order' => $cancellation['order']->getDetails(),
                    'new_status' => $cancellation['order']->getStatusLabel(),
                    'refund' => $cancellation['refund'],
                    'already_cancelled' => $cancellation['already_cancelled'],
                ], 'تم إلغاء الطلب وإتمام تسوية الدفع بنجاح');
            }

            $changed = $order->changeStatus($newStatus, $actorRole);

            if (! $changed) {
                DB::rollBack();

                return $this->error('فشل في تغيير حالة الطلب');
            }

            // تمنح النقاط عند نهاية خدمة المطعم للطلب العادي فقط.
            // طلب التوصيل تُمنح نقاطه بعد "تم التسليم"، والحجز بعد "الطاولة جاهزة".
            if ($newStatus === Order::STATUS_COMPLETED
                && $order->type === Order::TYPE_NORMAL) {
                $order->awardLoyaltyPoints();
            }

            DB::commit();

            $order->load(['customer', 'items', 'paymentRecord',
                'deliveryOrder', 'reservationOrder']);

            return $this->success([
                'order' => $order->getDetails(),
                'new_status' => $order->getStatusLabel(),
            ], 'تم تحديث حالة الطلب بنجاح');

        } catch (\Exception $e) {
            DB::rollBack();

            return $this->error(
                'حدث خطأ أثناء تحديث الحالة',
                500,
                config('app.debug') ? $e->getMessage() : null
            );
        }
    }

    // ─────────────────────────────────────────────
    // POST /api/orders/{id}/notify-customer
    // إشعار يدوي للزبون
    // ─────────────────────────────────────────────
    public function notifyCustomer(Request $request, int $id)
    {
        if (! $this->isOrderManager($request)) {
            return $this->unauthorized();
        }

        $order = Order::find($id);
        if (! $order) {
            return $this->notFound('الطلب غير موجود');
        }

        if (! $order->customer_id) {
            return $this->error('هذا الطلب لا يرتبط بزبون مسجل');
        }

        $validator = Validator::make($request->all(), [
            'message' => 'required|string|max:500',
            'title' => 'nullable|string|max:255',
        ], [
            'message.required' => 'نص الإشعار مطلوب',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $employee = $request->user();

        Notification::create([
            'sender_type' => Notification::SENDER_EMPLOYEE,
            'sender_id' => $employee->id,
            'receiver_type' => Notification::RECEIVER_CUSTOMER,
            'receiver_id' => $order->customer_id,
            'type' => Notification::TYPE_ORDER_UPDATE,
            'title' => $request->get('title', "تحديث طلب #{$order->id}"),
            'message' => $request->message,
            'data' => ['order_id' => $order->id],
        ]);

        return $this->success(null, 'تم إرسال الإشعار للزبون');
    }

    // ─────────────────────────────────────────────
    // إدارة سجل الطلب — مدير الطلبات والمدير العام
    // ─────────────────────────────────────────────
    public function archive(Request $request, int $id)
    {
        if (! $this->isOrderManager($request)) {
            return $this->unauthorized('صلاحية إدارة سجلات الطلبات مطلوبة');
        }

        $order = Order::with(['customer', 'items', 'paymentRecord',
            'deliveryOrder', 'reservationOrder'])->find($id);
        if (! $order) {
            return $this->notFound('الطلب غير موجود');
        }

        if (! $order->isOperationallyClosed()) {
            return $this->error('لا يمكن أرشفة طلب نشط. ألغِ الطلب أو أكمل خدمته أولاً.', 422);
        }

        if (! $order->archived_at) {
            $order->forceFill([
                'archived_at' => now(),
                'archived_by' => $request->user()->id,
            ])->save();
        }

        return $this->success([
            'order' => $order->fresh()->load([
                'customer', 'items', 'paymentRecord', 'deliveryOrder', 'reservationOrder',
            ])->getDetails(),
        ], 'تمت أرشفة الطلب وإخفاؤه من القوائم النشطة');
    }

    public function restoreArchive(Request $request, int $id)
    {
        if (! $this->isOrderManager($request)) {
            return $this->unauthorized('صلاحية إدارة سجلات الطلبات مطلوبة');
        }

        $order = Order::find($id);
        if (! $order) {
            return $this->notFound('الطلب غير موجود');
        }

        $order->forceFill([
            'archived_at' => null,
            'archived_by' => null,
        ])->save();

        return $this->success(null, 'تمت إعادة الطلب إلى السجلات النشطة');
    }

    public function destroy(Request $request, int $id)
    {
        if (! $this->isOrderManager($request)) {
            return $this->unauthorized('صلاحية حذف سجلات الطلبات مطلوبة');
        }

        $order = Order::with(['deliveryOrder', 'reservationOrder'])->find($id);
        if (! $order) {
            return $this->notFound('الطلب غير موجود');
        }

        if (! $order->isOperationallyClosed()) {
            return $this->error('لا يمكن حذف طلب نشط. ألغِ الطلب أو أكمل خدمته أولاً.', 422);
        }

        DB::transaction(function () use ($order) {
            // حذف منطقي قابل للتدقيق: يخفي الطلب وملحقاته عن كل لوحات الموظفين
            // مع إبقاء السجلات المالية وعناصر الطلب محفوظة للمراجعة المحاسبية.
            $order->deliveryOrder?->delete();
            $order->reservationOrder?->delete();
            $order->delete();
        });

        return $this->success(['id' => $id], 'تم حذف الطلب من جميع واجهات الموقع');
    }

    // ─────────────────────────────────────────────
    // GET /api/admin/orders
    // المدير العام — كل الطلبات
    // ─────────────────────────────────────────────
    public function adminIndex(Request $request)
    {
        if (! $this->isGeneralManager($request)) {
            return $this->unauthorized('هذا المسار للمدير العام فقط');
        }

        $query = Order::with(['customer', 'items', 'paymentRecord',
            'deliveryOrder', 'reservationOrder']);

        $this->applyRecordState($query, $request);

        if ($request->filled('type')) {
            $query->where('type', $request->type);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('date')) {
            $query->whereDate('created_at', $request->date);
        }

        if ($request->filled('from_date') && $request->filled('to_date')) {
            $query->whereBetween('created_at', [
                $request->from_date.' 00:00:00',
                $request->to_date.' 23:59:59',
            ]);
        }

        $statsQuery = clone $query;
        $perPage = max(1, min(100, $request->integer('per_page', 25)));
        $orders = $query->latest()->paginate($perPage);
        $orders->getCollection()->transform(fn (Order $order) => $order->getDetails());

        return $this->success([
            'stats' => [
                'total' => (clone $statsQuery)->count(),
                'normal' => (clone $statsQuery)->where('type', Order::TYPE_NORMAL)->count(),
                'delivery' => (clone $statsQuery)->where('type', Order::TYPE_DELIVERY)->count(),
                'reservation' => (clone $statsQuery)->where('type', Order::TYPE_RESERVATION)->count(),
                'pending' => (clone $statsQuery)->where('status', Order::STATUS_PENDING)->count(),
                'completed' => (clone $statsQuery)->where('status', Order::STATUS_COMPLETED)->count(),
                'cancelled' => (clone $statsQuery)->where('status', Order::STATUS_CANCELLED)->count(),
                'total_revenue' => (clone $statsQuery)->where('status', Order::STATUS_COMPLETED)
                    ->sum('final_price'),
            ],
            'orders' => $orders->items(),
            'pagination' => [
                'current_page' => $orders->currentPage(),
                'last_page' => $orders->lastPage(),
                'per_page' => $orders->perPage(),
                'total' => $orders->total(),
                'from' => $orders->firstItem(),
                'to' => $orders->lastItem(),
            ],
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/admin/orders/stats
    // ─────────────────────────────────────────────
    public function stats(Request $request)
    {
        if (! $this->isGeneralManager($request)) {
            return $this->unauthorized();
        }

        $week = now()->startOfWeek();
        $month = now()->startOfMonth();
        $days = max(7, min(90, (int) $request->integer('period', 7)));
        $trendStart = now()->startOfDay()->subDays($days - 1);

        $base = fn () => Order::where('status', Order::STATUS_COMPLETED);
        $completedForTrend = (clone $base())
            ->where('created_at', '>=', $trendStart)
            ->get(['final_price', 'created_at']);
        $revenueTrend = collect(range($days - 1, 0))->map(function (int $offset) use ($completedForTrend) {
            $date = now()->startOfDay()->subDays($offset);

            return [
                'date' => $date->toDateString(),
                'label' => $date->locale('ar')->translatedFormat('d M'),
                'revenue' => (float) $completedForTrend
                    ->filter(fn (Order $order) => $order->created_at->isSameDay($date))
                    ->sum('final_price'),
            ];
        });

        return $this->success([
            'revenue' => [
                'today' => (clone $base())->whereDate('created_at', today())->sum('final_price'),
                'this_week' => (clone $base())->where('created_at', '>=', $week)->sum('final_price'),
                'this_month' => (clone $base())->where('created_at', '>=', $month)->sum('final_price'),
            ],
            'orders_count' => [
                'today' => Order::whereDate('created_at', today())->count(),
                'this_week' => Order::where('created_at', '>=', $week)->count(),
                'this_month' => Order::where('created_at', '>=', $month)->count(),
            ],
            'by_type' => [
                'normal' => Order::normal()->where('created_at', '>=', $month)->count(),
                'delivery' => Order::delivery()->where('created_at', '>=', $month)->count(),
                'reservation' => Order::reservation()->where('created_at', '>=', $month)->count(),
            ],
            'pending_now' => Order::pending()->count(),
            'revenue_trend' => $revenueTrend->values(),
            'period_days' => $days,
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/admin/orders/{id}
    // ─────────────────────────────────────────────
    public function adminShow(Request $request, int $id)
    {
        if (! $this->isGeneralManager($request)) {
            return $this->unauthorized();
        }

        $order = Order::with([
            'customer',
            'items',
            'paymentRecord',
            'deliveryOrder.driver',
            'reservationOrder',
        ])->find($id);

        if (! $order) {
            return $this->notFound('الطلب غير موجود');
        }

        return $this->success(['order' => $order->getDetails()]);
    }

    // ─────────────────────────────────────────────
    // GET /api/customer/orders
    // الزبون يعرض طلباته
    // ─────────────────────────────────────────────
    public function customerOrders(Request $request)
    {
        if (! $this->isCustomer($request)) {
            return $this->unauthorized('هذا المسار للزبائن فقط');
        }

        $customer = $request->user();

        $query = Order::where('customer_id', $customer->id)
            ->with(['items', 'paymentRecord',
                'deliveryOrder.driver', 'reservationOrder']);

        if ($request->filled('type')) {
            $query->where('type', $request->type);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        $orders = $query->latest()->get();

        return $this->success([
            'stats' => [
                'total' => $orders->count(),
                'active' => $orders->whereNotIn('status',
                    [Order::STATUS_COMPLETED, Order::STATUS_CANCELLED])->count(),
                'completed' => $orders->where('status', Order::STATUS_COMPLETED)->count(),
                'cancelled' => $orders->where('status', Order::STATUS_CANCELLED)->count(),
            ],
            'orders' => $orders->map->getDetails()->values(),
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/customer/orders/{id}
    // ─────────────────────────────────────────────
    public function customerShow(Request $request, int $id)
    {
        if (! $this->isCustomer($request)) {
            return $this->unauthorized();
        }

        $customer = $request->user();

        $order = Order::where('customer_id', $customer->id)
            ->with(['items', 'paymentRecord',
                'deliveryOrder.driver', 'reservationOrder'])
            ->find($id);

        if (! $order) {
            return $this->notFound('الطلب غير موجود');
        }

        return $this->success(['order' => $order->getDetails()]);
    }

    // ─────────────────────────────────────────────
    // POST /api/customer/orders
    // الزبون ينشئ طلباً جديداً
    // ─────────────────────────────────────────────
    public function customerStore(Request $request, DeliveryRouteService $routeService)
    {
        if (! $this->isCustomer($request)) {
            return $this->unauthorized();
        }

        $customer = $request->user();

        if ($customer->isBanned()) {
            return $this->error('حسابك موقوف — لا يمكنك تقديم طلبات', 403);
        }

        $restaurantStatus = RestaurantInfo::getInstance();
        if (! $restaurantStatus->is_open) {
            return $this->error('المطعم مغلق الآن — لا يمكن استقبال طلبات جديدة حالياً', 423);
        }

        // ── التحقق الأساسي ────────────────────────
        $validator = Validator::make($request->all(), [
            'type' => 'required|in:normal,delivery,reservation',
            'notes' => 'nullable|string|max:500',
            'items' => 'required|array|min:1',
            'items.*.item_type' => 'required|in:product,offer',
            'items.*.reference_id' => 'required|integer|min:1',
            'items.*.quantity' => 'required|integer|min:1',
            // بيانات التوصيل
            'delivery_address' => 'required_if:type,delivery|string|max:500',
            'latitude' => 'required_if:type,delivery|numeric|between:-90,90',
            'longitude' => 'required_if:type,delivery|numeric|between:-180,180',
            // بيانات الحجز
            'table_number' => 'required_if:type,reservation|integer|min:1',
            'table_type' => 'nullable|in:normal,vip',
            'seats_count' => 'required_if:type,reservation|integer|min:1|max:10',
            'reservation_time' => 'required_if:type,reservation|date|after:now',
            'duration_minutes' => 'nullable|integer|in:60',
            'special_notes' => 'nullable|string|max:500',
        ], [
            'type.required' => 'نوع الطلب مطلوب',
            'type.in' => 'النوع: normal أو delivery أو reservation',
            'items.required' => 'يجب إضافة عناصر للطلب',
            'items.min' => 'يجب إضافة عنصر واحد على الأقل',
            'items.*.item_type.required' => 'نوع العنصر مطلوب',
            'items.*.reference_id.required' => 'معرف العنصر مطلوب',
            'items.*.quantity.required' => 'الكمية مطلوبة',
            'delivery_address.required_if' => 'عنوان التوصيل مطلوب',
            'latitude.required_if' => 'تحديد الموقع على الخريطة مطلوب للتوصيل',
            'longitude.required_if' => 'تحديد الموقع على الخريطة مطلوب للتوصيل',
            'table_number.required_if' => 'رقم الطاولة مطلوب للحجز',
            'seats_count.required_if' => 'عدد المقاعد مطلوب للحجز',
            'seats_count.max' => 'الحد الأقصى للحجز هو 10 مقاعد',
            'reservation_time.required_if' => 'وقت الحجز مطلوب',
            'reservation_time.after' => 'وقت الحجز يجب أن يكون في المستقبل',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        if ($request->type === Order::TYPE_RESERVATION) {
            $table = ReservationOrder::tableDefinition((int) $request->table_number);
            if (! $table) {
                return $this->error('الطاولة المطلوبة غير موجودة', 422);
            }
            $request->merge([
                'table_type' => $table['type'],
                'duration_minutes' => ReservationOrder::RESERVATION_DURATION_MINUTES,
            ]);
            $reservationTime = Carbon::parse($request->reservation_time);
            if ($reservationTime->lessThanOrEqualTo(now())) {
                return $this->error('وقت الحجز يجب أن يكون في المستقبل', 422);
            }
            if ($reservationTime->greaterThan(now()->addDay())) {
                return $this->error('الحجز متاح فقط ضمن الـ 24 ساعة القادمة', 422);
            }
        }

        $deliveryRoute = null;
        $restaurantLocation = null;
        $distanceMeters = null;
        $deliveryCost = 0.0;
        if ($request->type === Order::TYPE_DELIVERY) {
            $restaurant = RestaurantInfo::getInstance();
            $restaurantLocation = $restaurant->getDeliveryCoordinates();
            $deliveryRoute = $routeService->calculate(
                $restaurantLocation['latitude'],
                $restaurantLocation['longitude'],
                (float) $request->latitude,
                (float) $request->longitude
            );
            $distanceMeters = (float) $deliveryRoute['distance_meters'];

            if (! DeliveryOrder::isWithinDeliveryRange($distanceMeters)) {
                return $this->error(
                    'الموقع المحدد يتجاوز الحد الأقصى للتوصيل '.
                    '('.DeliveryOrder::getMaxDistanceKm().' كم)'
                );
            }
            $deliveryCost = DeliveryOrder::calculateCost($distanceMeters);
        }

        DB::beginTransaction();
        try {
            // ── حساب العناصر والسعر الكلي ──────────
            $itemsData = [];
            $totalPrice = 0.0;
            $stockDeductions = [];

            foreach ($request->items as $item) {
                if ($item['item_type'] === OrderItem::TYPE_PRODUCT) {
                    $product = Product::find($item['reference_id']);

                    if (! $product) {
                        DB::rollBack();

                        return $this->error(
                            'المنتج المطلوب لم يعد موجوداً في قائمة المطعم'
                        );
                    }

                    if (! $product->isAvailable()) {
                        DB::rollBack();

                        return $this->error(
                            "«{$product->name}» غير متوفر حالياً. اختر وجبة أخرى أو حاول لاحقاً"
                        );
                    }

                    $alreadyReserved = $stockDeductions[$product->id] ?? 0;
                    $requestedQuantity = (int) $item['quantity'];
                    $requestedTotal = $alreadyReserved + $requestedQuantity;
                    if ($product->stock_quantity < $requestedTotal) {
                        DB::rollBack();

                        $remainingQuantity = max(0, $product->stock_quantity - $alreadyReserved);

                        return $this->error(
                            "لا يمكن إضافة هذه الكمية من «{$product->name}». ".
                            "المتوفر في المطعم حالياً {$remainingQuantity} فقط؛ خفّض الكمية ثم حاول مجدداً"
                        );
                    }
                    $stockDeductions[$product->id] = $requestedTotal;

                    $unitPrice = $product->price;
                    $subtotal = $unitPrice * $item['quantity'];
                    $totalPrice += $subtotal;

                    $itemsData[] = [
                        'item_type' => OrderItem::TYPE_PRODUCT,
                        'reference_id' => $product->id,
                        'quantity' => $item['quantity'],
                        'unit_price' => $unitPrice,
                        'subtotal' => $subtotal,
                    ];

                } else {
                    // عرض
                    $offer = Offer::with('products')->find($item['reference_id']);

                    if (! $offer) {
                        DB::rollBack();

                        return $this->error(
                            'العرض المطلوب لم يعد موجوداً في قائمة المطعم'
                        );
                    }

                    if (! $offer->isCurrentlyActive()) {
                        DB::rollBack();

                        return $this->error(
                            "انتهى توفر عرض «{$offer->name}» أو تم إيقافه حالياً"
                        );
                    }

                    if ($offer->products->isEmpty()) {
                        DB::rollBack();

                        return $this->error(
                            "العرض {$offer->name} غير متاح حالياً"
                        );
                    }

                    foreach ($offer->products as $offerProduct) {
                        $requiredQty = (int) $item['quantity'] * (int) $offerProduct->pivot->quantity;
                        $requestedTotal = ($stockDeductions[$offerProduct->id] ?? 0) + $requiredQty;
                        if (! $offerProduct->isAvailable() || $offerProduct->stock_quantity < $requestedTotal) {
                            DB::rollBack();

                            return $this->error(
                                "لا يمكن إضافة هذه الكمية من عرض «{$offer->name}» حالياً، ".
                                "لأن الكمية المتوفرة من «{$offerProduct->name}» لا تكفي"
                            );
                        }
                        $stockDeductions[$offerProduct->id] = $requestedTotal;
                    }

                    $unitPrice = $offer->offer_price;
                    $subtotal = $unitPrice * $item['quantity'];
                    $totalPrice += $subtotal;

                    $itemsData[] = [
                        'item_type' => OrderItem::TYPE_OFFER,
                        'reference_id' => $offer->id,
                        'quantity' => $item['quantity'],
                        'unit_price' => $unitPrice,
                        'subtotal' => $subtotal,
                    ];
                }
            }

            // ── حساب تكاليف إضافية ──────────────────
            $extraCost = 0.0;
            $finalPrice = $totalPrice;

            // تكلفة التوصيل — تُحسب من موقع المطعم المخزن في لوحة الإدارة إلى موقع الزبون المختار على الخريطة
            if ($request->type === Order::TYPE_DELIVERY) {
                $extraCost += $deliveryCost;
                $finalPrice += $deliveryCost;
            }

            // تكلفة الحجز
            if ($request->type === Order::TYPE_RESERVATION) {
                $reservationExtraCost = ReservationOrder::calculateExtraCost(
                    $request->table_type,
                    $request->seats_count
                );
                $extraCost += $reservationExtraCost;
                $finalPrice += $reservationExtraCost;

                // التحقق من توفر الطاولة
                if (! ReservationOrder::isTableAvailable(
                    $request->table_number,
                    $request->reservation_time,
                    ReservationOrder::RESERVATION_DURATION_MINUTES
                )) {
                    DB::rollBack();

                    return $this->error(
                        "الطاولة رقم {$request->table_number} محجوزة في هذا الوقت"
                    );
                }
            }

            // ── إنشاء الطلب ─────────────────────────
            $order = Order::create([
                'customer_id' => $customer->id,
                'type' => $request->type,
                'status' => Order::STATUS_PENDING,
                'total_price' => $totalPrice,
                'discount' => 0.00,
                'final_price' => $finalPrice,
                'notes' => $request->notes,
            ]);

            // ── إنشاء العناصر ────────────────────────
            foreach ($itemsData as $itemData) {
                OrderItem::create(array_merge(
                    $itemData,
                    ['order_id' => $order->id]
                ));
            }

            // ── تقليل المخزون ────────────────────────
            foreach ($stockDeductions as $productId => $quantity) {
                Product::find($productId)?->decreaseStock((int) $quantity);
            }

            // ── إنشاء ملحق التوصيل ───────────────────
            if ($request->type === Order::TYPE_DELIVERY) {
                DeliveryOrder::create([
                    'order_id' => $order->id,
                    'delivery_address' => $request->delivery_address,
                    'latitude' => $request->latitude,
                    'longitude' => $request->longitude,
                    'distance_meters' => $distanceMeters ?? null,
                    'delivery_cost' => $deliveryCost ?? 0,
                    'status' => DeliveryOrder::STATUS_PENDING,
                    'estimated_delivery_time' => now()->addSeconds($deliveryRoute['duration_seconds'] ?? 2700),
                    'origin_latitude' => $restaurantLocation['latitude'],
                    'origin_longitude' => $restaurantLocation['longitude'],
                    'route_geometry' => $deliveryRoute['geometry'] ?? null,
                    'route_duration_seconds' => $deliveryRoute['duration_seconds'] ?? null,
                    'route_provider' => $deliveryRoute['provider'] ?? null,
                    'route_is_fallback' => $deliveryRoute['is_fallback'] ?? true,
                    'route_calculated_at' => $deliveryRoute['calculated_at'] ?? now(),
                ]);
            }

            // ── إنشاء ملحق الحجز ─────────────────────
            if ($request->type === Order::TYPE_RESERVATION) {
                ReservationOrder::create([
                    'order_id' => $order->id,
                    'table_number' => $request->table_number,
                    'table_type' => $request->table_type,
                    'seats_count' => $request->seats_count,
                    'reservation_time' => $request->reservation_time,
                    'special_notes' => $request->special_notes,
                    'extra_cost' => $reservationExtraCost ?? 0,
                    'duration_minutes' => ReservationOrder::RESERVATION_DURATION_MINUTES,
                    'status' => ReservationOrder::STATUS_PENDING,
                ]);
            }

            // ── إشعار مدير الطلبات ───────────────────
            Notification::orderPlaced($order);

            DB::commit();

            $order->load(['items', 'paymentRecord',
                'deliveryOrder', 'reservationOrder']);

            return $this->success([
                'order' => $order->getDetails(),
                'summary' => [
                    'items_total' => number_format($totalPrice, 0).' ل.س',
                    'extra_cost' => number_format($extraCost, 0).' ل.س',
                    'final_price' => number_format($finalPrice, 0).' ل.س',
                ],
            ], 'تم تقديم طلبك بنجاح', 201);

        } catch (\Exception $e) {
            DB::rollBack();

            return $this->error(
                'حدث خطأ أثناء إنشاء الطلب',
                500,
                config('app.debug') ? $e->getMessage() : null
            );
        }
    }

    // ─────────────────────────────────────────────
    // DELETE /api/customer/orders/{id}
    // الزبون يلغي طلبه
    // ─────────────────────────────────────────────
    public function customerCancel(Request $request, int $id)
    {
        if (! $this->isCustomer($request)) {
            return $this->unauthorized();
        }

        $customer = $request->user();

        $order = Order::where('customer_id', $customer->id)->find($id);
        if (! $order) {
            return $this->notFound('الطلب غير موجود');
        }

        // التحقق من صحة الإلغاء
        if (! $order->canChangeStatus('customer', Order::STATUS_CANCELLED)) {
            return $this->error(
                "لا يمكن إلغاء طلب بحالة \"{$order->getStatusLabel()}\""
            );
        }

        DB::beginTransaction();
        try {
            $cancellation = $this->cancellations->cancel(
                $order,
                'customer',
                $customer->id,
                $request->input('reason'),
                [Order::STATUS_PENDING],
            );

            // حظر تلقائي عند الإلغاء المتكرر خلال فترة قصيرة
            $customer->refresh();
            $customer->autoBanForCancellations();

            // إشعار مدير الطلبات
            $orderManager = Employee::active()
                ->byRole(Employee::ROLE_ORDER_MANAGER)
                ->first();
            if ($orderManager) {
                Notification::create([
                    'sender_type' => Notification::SENDER_CUSTOMER,
                    'sender_id' => $customer->id,
                    'receiver_type' => Notification::RECEIVER_EMPLOYEE,
                    'receiver_id' => $orderManager->id,
                    'type' => Notification::TYPE_ORDER_UPDATE,
                    'title' => "إلغاء طلب #{$order->id}",
                    'message' => "قام الزبون {$customer->name} بإلغاء الطلب #{$order->id}",
                    'data' => [
                        'order_id' => $order->id,
                        'customer_name' => $customer->name,
                    ],
                ]);
            }

            DB::commit();

            return $this->success([
                'order' => $cancellation['order']->getDetails(),
                'refund' => $cancellation['refund'],
                'already_cancelled' => $cancellation['already_cancelled'],
            ], 'تم إلغاء طلبك وإتمام تسوية الدفع بنجاح');

        } catch (\Exception $e) {
            DB::rollBack();

            return $this->error(
                'حدث خطأ أثناء إلغاء الطلب',
                500,
                config('app.debug') ? $e->getMessage() : null
            );
        }
    }
}
