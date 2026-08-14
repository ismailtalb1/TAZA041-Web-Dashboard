<?php

namespace App\Http\Controllers\API;

use App\Models\Employee;
use App\Models\Order;
use App\Models\ReservationOrder;
use App\Models\RestaurantInfo;
use App\Services\OrderCancellationService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class ReservationController extends BaseController
{
    public function __construct(private readonly OrderCancellationService $cancellations) {}

    // ─────────────────────────────────────────────
    // مساعدات التحقق
    // ─────────────────────────────────────────────
    private function isOrderManager(Request $request): bool
    {
        $user = $request->user();
        if (! $user instanceof Employee) {
            return false;
        }

        return in_array($user->role, [
            Employee::ROLE_ORDER_MANAGER,
            Employee::ROLE_GENERAL_MANAGER,
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/orders/reservations
    // قائمة الحجوزات
    // ─────────────────────────────────────────────
    public function index(Request $request)
    {
        if (! $this->isOrderManager($request)) {
            return $this->unauthorized('صلاحية مدير الطلبات مطلوبة');
        }

        ReservationOrder::autoCompleteExpiredSeated();

        $query = ReservationOrder::with(['order.customer', 'order.items']);

        // فلاتر
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('table_type')) {
            $query->where('table_type', $request->table_type);
        }

        if ($request->filled('table_number')) {
            $query->where('table_number', $request->table_number);
        }

        if ($request->filled('date')) {
            $query->whereDate('reservation_time', $request->date);
        }

        $reservations = $query->orderBy('reservation_time')->get();

        return $this->success([
            'stats' => [
                'total' => $reservations->count(),
                'pending' => $reservations->where('status', ReservationOrder::STATUS_PENDING)->count(),
                'confirmed' => $reservations->where('status', ReservationOrder::STATUS_CONFIRMED)->count(),
                'seated' => $reservations->where('status', ReservationOrder::STATUS_SEATED)->count(),
                'completed' => $reservations->where('status', ReservationOrder::STATUS_COMPLETED)->count(),
                'cancelled' => $reservations->where('status', ReservationOrder::STATUS_CANCELLED)->count(),
                'no_show' => $reservations->where('status', ReservationOrder::STATUS_NO_SHOW)->count(),
                'vip_count' => $reservations->where('table_type', ReservationOrder::TABLE_VIP)
                    ->whereNotIn('status', [
                        ReservationOrder::STATUS_CANCELLED,
                        ReservationOrder::STATUS_NO_SHOW,
                    ])->count(),
            ],
            'pricing_info' => ReservationOrder::getPricingInfo(),
            'reservations' => $reservations->map(fn ($r) => array_merge(
                $r->getDetails(),
                [
                    'customer_name' => $r->order?->customer?->name ?? 'زبون',
                    'customer_phone' => $r->order?->customer?->phone,
                    'order_items' => $r->order?->items?->map->getDetails()->values(),
                    'final_price' => $r->order?->final_price,
                ]
            ))->values(),
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/orders/reservations/today
    // حجوزات اليوم
    // ─────────────────────────────────────────────
    public function today(Request $request)
    {
        if (! $this->isOrderManager($request)) {
            return $this->unauthorized();
        }

        ReservationOrder::autoCompleteExpiredSeated();

        $reservations = ReservationOrder::today()
            ->with(['order.customer'])
            ->orderBy('reservation_time')
            ->get();

        // تقسيم حسب الحالة لسهولة العرض في الـ Dashboard
        $pending = $reservations->where('status', ReservationOrder::STATUS_PENDING);
        $confirmed = $reservations->where('status', ReservationOrder::STATUS_CONFIRMED);
        $seated = $reservations->where('status', ReservationOrder::STATUS_SEATED);
        $done = $reservations->whereIn('status', [
            ReservationOrder::STATUS_COMPLETED,
            ReservationOrder::STATUS_CANCELLED,
            ReservationOrder::STATUS_NO_SHOW,
        ]);

        $mapReservation = fn ($r) => array_merge(
            $r->getDetails(),
            [
                'customer_name' => $r->order?->customer?->name ?? 'زبون',
                'customer_phone' => $r->order?->customer?->phone,
                'final_price' => $r->order?->final_price,
            ]
        );

        return $this->success([
            'date' => today()->format('Y-m-d'),
            'total' => $reservations->count(),
            'pending' => $pending->map($mapReservation)->values(),
            'confirmed' => $confirmed->map($mapReservation)->values(),
            'seated' => $seated->map($mapReservation)->values(),
            'done' => $done->map($mapReservation)->values(),
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/orders/reservations/upcoming
    // الحجوزات القادمة
    // ─────────────────────────────────────────────
    public function upcoming(Request $request)
    {
        if (! $this->isOrderManager($request)) {
            return $this->unauthorized();
        }

        ReservationOrder::autoCompleteExpiredSeated();

        $reservations = ReservationOrder::upcoming()
            ->with(['order.customer'])
            ->take(50)
            ->get();

        return $this->success([
            'count' => $reservations->count(),
            'reservations' => $reservations->map(fn ($r) => array_merge(
                $r->getDetails(),
                [
                    'customer_name' => $r->order?->customer?->name ?? 'زبون',
                    'customer_phone' => $r->order?->customer?->phone,
                    'time_until' => $r->reservation_time?->diffForHumans(),
                ]
            ))->values(),
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/orders/reservations/{id}
    // ─────────────────────────────────────────────
    public function show(Request $request, int $id)
    {
        if (! $this->isOrderManager($request)) {
            return $this->unauthorized();
        }

        $reservation = ReservationOrder::with([
            'order.customer',
            'order.items',
            'order.paymentRecord',
        ])->find($id);

        if (! $reservation) {
            return $this->notFound('الحجز غير موجود');
        }

        return $this->success([
            'reservation' => array_merge(
                $reservation->getDetails(),
                [
                    'customer' => $reservation->order?->customer
                                       ? [
                                           'id' => $reservation->order->customer->id,
                                           'name' => $reservation->order->customer->name,
                                           'phone' => $reservation->order->customer->phone,
                                           'email' => $reservation->order->customer->email,
                                       ]
                                       : null,
                    'items' => $reservation->order?->items?->map->getDetails()->values(),
                    'payment' => $reservation->order?->paymentRecord?->getDetails(),
                    'final_price' => $reservation->order?->final_price,
                    'time_until' => $reservation->reservation_time?->isFuture()
                                       ? $reservation->reservation_time->diffForHumans()
                                       : null,
                ]
            ),
        ]);
    }

    // ─────────────────────────────────────────────
    // PUT /api/orders/reservations/{id}/status
    // تغيير حالة الحجز
    // ─────────────────────────────────────────────
    public function changeStatus(Request $request, int $id)
    {
        if (! $this->isOrderManager($request)) {
            return $this->unauthorized('صلاحية مدير الطلبات مطلوبة');
        }

        $reservation = ReservationOrder::with(['order.customer'])->find($id);
        if (! $reservation) {
            return $this->notFound('الحجز غير موجود');
        }

        $validator = Validator::make($request->all(), [
            'status' => 'required|in:confirmed,seated,completed,cancelled,no_show',
        ], [
            'status.required' => 'الحالة الجديدة مطلوبة',
            'status.in' => 'الحالة: confirmed أو seated أو completed أو cancelled أو no_show',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $employee = $request->user();
        $newStatus = $request->status;
        $actorRole = Employee::ROLE_ORDER_MANAGER;

        // التحقق من صحة الانتقال
        if (! $reservation->canChangeStatus($actorRole, $newStatus)) {
            return $this->error(
                "لا يمكن تغيير حالة الحجز من \"{$reservation->getStatusLabel()}\" إلى \"{$newStatus}\""
            );
        }

        // عند التأكيد — التحقق من أن الطاولة لا تزال متاحة
        if ($newStatus === ReservationOrder::STATUS_CONFIRMED) {
            $isAvailable = ReservationOrder::isTableAvailable(
                $reservation->table_number,
                $reservation->reservation_time,
                $reservation->duration_minutes,
                $reservation->id // استثناء الحجز الحالي
            );

            if (! $isAvailable) {
                return $this->error(
                    "الطاولة رقم {$reservation->table_number} أصبحت محجوزة في هذا الوقت"
                );
            }

            // تحديث حالة الطلب الأساسية إلى confirmed
            $reservation->order?->update(['status' => Order::STATUS_CONFIRMED]);
        }

        DB::beginTransaction();
        try {
            if ($newStatus === ReservationOrder::STATUS_CANCELLED && $reservation->order) {
                $cancellation = $this->cancellations->cancel(
                    $reservation->order,
                    'employee',
                    $employee->id,
                    $request->input('reason'),
                    [
                        Order::STATUS_PENDING,
                        Order::STATUS_CONFIRMED,
                        Order::STATUS_READY,
                        Order::STATUS_COMPLETED,
                    ],
                );

                DB::commit();
                $reservation = $cancellation['order']->reservationOrder;

                return $this->success([
                    'reservation' => array_merge($reservation->getDetails(), [
                        'customer_name' => $cancellation['order']->customer?->name ?? 'زبون',
                    ]),
                    'new_status' => $reservation->getStatusLabel(),
                    'refund' => $cancellation['refund'],
                    'already_cancelled' => $cancellation['already_cancelled'],
                ], 'تم إلغاء الحجز وإتمام تسوية الدفع بنجاح');
            }

            // تنفيذ التغيير
            $changed = $reservation->changeStatus($newStatus, $actorRole);

            if (! $changed) {
                DB::rollBack();

                return $this->error('فشل في تحديث حالة الحجز');
            }

            DB::commit();
        } catch (\Exception $e) {
            DB::rollBack();

            return $this->error(
                'حدث خطأ أثناء تحديث حالة الحجز',
                500,
                config('app.debug') ? $e->getMessage() : null
            );
        }

        $reservation->load(['order.customer']);

        return $this->success([
            'reservation' => array_merge(
                $reservation->getDetails(),
                [
                    'customer_name' => $reservation->order?->customer?->name ?? 'زبون',
                ]
            ),
            'new_status' => $reservation->getStatusLabel(),
        ], 'تم تحديث حالة الحجز بنجاح');
    }

    // ─────────────────────────────────────────────
    // GET /api/orders/reservations/table/{tableNumber}/availability
    // التحقق من توفر طاولة في وقت معين
    // ─────────────────────────────────────────────
    public function tables(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'reservation_time' => 'nullable|date',
            'duration_minutes' => 'nullable|integer|in:60',
        ]);
        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $reservationTime = $request->filled('reservation_time')
            ? Carbon::parse($request->reservation_time)
            : null;
        if ($reservationTime?->lessThanOrEqualTo(now())) {
            return $this->error('وقت الحجز يجب أن يكون في المستقبل', 422);
        }
        if ($reservationTime?->greaterThan(now()->addDay())) {
            return $this->error('الحجز متاح فقط ضمن الـ 24 ساعة القادمة', 422);
        }

        ReservationOrder::autoCompleteExpiredSeated();
        $pricing = ReservationOrder::getPricingInfo();
        $tables = collect(ReservationOrder::tableCatalog())->map(function (array $table) use ($reservationTime) {
            $available = $reservationTime === null
                ? null
                : ReservationOrder::isTableAvailable(
                    $table['number'],
                    $reservationTime->toDateTimeString(),
                    ReservationOrder::RESERVATION_DURATION_MINUTES,
                );

            return [
                ...$table,
                'is_available' => $available,
                'status' => $available === null ? 'time_required' : ($available ? 'available' : 'reserved'),
            ];
        })->values();

        return $this->success([
            'tables' => $tables,
            'reservation_window_hours' => 24,
            'duration_minutes' => ReservationOrder::RESERVATION_DURATION_MINUTES,
            'pricing_info' => $pricing,
        ]);
    }

    public function tableAvailability(Request $request, int $tableNumber)
    {
        $table = ReservationOrder::tableDefinition($tableNumber);
        if (! $table) {
            return $this->notFound('الطاولة المطلوبة غير موجودة');
        }
        $validator = Validator::make($request->all(), [
            'reservation_time' => 'required|date',
            'duration_minutes' => 'nullable|integer|in:60',
        ], [
            'reservation_time.required' => 'وقت الحجز مطلوب',
            'reservation_time.date' => 'صيغة الوقت غير صحيحة',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        ReservationOrder::autoCompleteExpiredSeated();

        $duration = ReservationOrder::RESERVATION_DURATION_MINUTES;
        $reservationTime = Carbon::parse($request->reservation_time);

        if ($reservationTime->lessThanOrEqualTo(now())) {
            return $this->error('وقت الحجز يجب أن يكون في المستقبل', 422);
        }

        if ($reservationTime->greaterThan(now()->addDay())) {
            return $this->error('الحجز متاح فقط ضمن الـ 24 ساعة القادمة', 422);
        }

        $conflictQuery = ReservationOrder::conflicting(
            $tableNumber,
            $request->reservation_time,
            $duration
        );

        $liveReservation = $request->boolean('live')
            ? (clone $conflictQuery)->orderByDesc('updated_at')->first()
            : null;

        $isAvailable = ! (clone $conflictQuery)->exists();

        $tableType = $table['type'];

        // حساب التكلفة الإضافية بناءً على النوع
        $info = RestaurantInfo::getInstance();
        $extraCosts = ReservationOrder::getPricingInfo();

        // الحجوزات المتعارضة مع الوقت المحدد فقط
        $conflicts = (clone $conflictQuery)->with(['order.customer'])->get();

        return $this->success([
            'table_number' => $tableNumber,
            'table_type' => $tableType,
            'table_type_label' => $tableType === ReservationOrder::TABLE_VIP
                ? 'VIP ✨'
                : 'عادية',
            'max_seats' => $table['max_seats'],
            'requested_time' => $request->reservation_time,
            'duration_minutes' => $duration,
            'is_available' => $isAvailable,
            'status_label' => $isAvailable ? '✅ متاحة' : '❌ محجوزة',
            'locked_by_active_reservation' => (bool) $liveReservation,
            'active_reservation' => $liveReservation ? [
                'reservation_id' => $liveReservation->id,
                'status' => $liveReservation->status,
                'status_label' => $liveReservation->getStatusLabel(),
                'reservation_time' => $liveReservation->reservation_time?->format('Y-m-d H:i'),
            ] : null,
            'pricing_info' => [
                'vip_extra_cost' => $tableType === ReservationOrder::TABLE_VIP
                    ? $info->vip_table_extra_cost
                    : 0,
                'free_seats' => $info->extra_cost_per_seat_above,
                'cost_per_extra_seat' => $info->extra_cost_per_extra_seat,
            ],
            // الحجوزات المتعارضة (للمدير فقط)
            'conflicts' => $request->user() instanceof Employee
                ? $conflicts->map(fn ($c) => [
                    'reservation_id' => $c->id,
                    'customer_name' => $c->order?->customer?->name ?? 'زبون',
                    'reservation_time' => $c->reservation_time?->format('H:i'),
                    'duration_minutes' => $c->duration_minutes,
                    'status' => $c->getStatusLabel(),
                ])->values()
                : [],
        ]);
    }
}
