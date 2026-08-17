<?php

namespace App\Http\Controllers\API;

use App\Models\Customer;
use App\Models\DeliveryOrder;
use App\Models\Employee;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\Review;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class ReviewController extends BaseController
{
    // ─────────────────────────────────────────────
    // مساعدات
    // ─────────────────────────────────────────────
    private function getEmployee(Request $request): ?Employee
    {
        $user = $request->user();

        return $user instanceof Employee ? $user : null;
    }

    private function getCustomer(Request $request): ?Customer
    {
        $user = $request->user();

        return $user instanceof Customer ? $user : null;
    }

    private function isAdmin(Request $request): bool
    {
        $emp = $this->getEmployee($request);
        if (! $emp) {
            return false;
        }

        return in_array($emp->role, [
            Employee::ROLE_GENERAL_MANAGER,
            Employee::ROLE_DELIVERY_MANAGER,
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/reviews/drivers
    // تقييمات كل السائقين
    // ─────────────────────────────────────────────
    public function driverReviews(Request $request)
    {
        if (! $this->isAdmin($request)) {
            return $this->unauthorized('صلاحية مدير التوصيل أو المدير العام مطلوبة');
        }

        // جلب كل السائقين
        $drivers = Employee::active()
            ->where('role', Employee::ROLE_DRIVER)
            ->get();

        $driversData = $drivers->map(function ($driver) {
            $reviews = Review::driverReviews()
                ->forEmployee($driver->id)
                ->with(['reviewerCustomer'])
                ->latest()
                ->get();

            $distribution = [1 => 0, 2 => 0, 3 => 0, 4 => 0, 5 => 0];
            foreach ($reviews as $r) {
                if (isset($distribution[$r->rating])) {
                    $distribution[$r->rating]++;
                }
            }

            return [
                'driver' => [
                    'id' => $driver->id,
                    'name' => $driver->name,
                    'role_label' => $driver->getRoleLabel(),
                    'avatar' => $driver->avatar
                                       ? asset('storage/'.$driver->avatar)
                                       : null,
                ],
                'stats' => [
                    'average_rating' => Review::getAverageForEmployee($driver->id),
                    'total_reviews' => $reviews->count(),
                    'completed_deliveries' => $driver->getCompletedDeliveriesCount(),
                    'rating_distribution' => $distribution,
                ],
                'latest_reviews' => $reviews->take(3)->map->getDetails()->values(),
            ];
        });

        return $this->success([
            'total_drivers' => $drivers->count(),
            'overall_average' => round(
                Review::driverReviews()->avg('rating') ?? 0,
                1
            ),
            'drivers' => $driversData->values(),
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/reviews/employees
    // تقييمات الموظفين (من المدير العام)
    // ─────────────────────────────────────────────
    public function employeeReviews(Request $request)
    {
        $employee = $this->getEmployee($request);
        if (! $employee || ! $employee->isGeneralManager()) {
            return $this->unauthorized('هذا المسار للمدير العام فقط');
        }

        $query = Review::employeeReviews()
            ->with(['reviewerEmployee', 'reviewedEmployee']);

        if ($request->filled('reviewable_id')) {
            $query->forEmployee($request->reviewable_id);
        }

        $reviews = $query->latest()->get();

        // تجميع حسب الموظف المُقيَّم
        $byEmployee = $reviews->groupBy('reviewable_id')
            ->map(function ($group) {
                $employee = Employee::find($group->first()->reviewable_id);

                return [
                    'employee' => [
                        'id' => $employee?->id,
                        'name' => $employee?->name,
                        'role_label' => $employee?->getRoleLabel(),
                    ],
                    'average_rating' => round(
                        $group->avg('rating'), 1
                    ),
                    'total_reviews' => $group->count(),
                    'reviews' => $group->map->getDetails()->values(),
                ];
            })->values();

        return $this->success([
            'total_reviews' => $reviews->count(),
            'overall_average' => round($reviews->avg('rating') ?? 0, 1),
            'by_employee' => $byEmployee,
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/reviews/driver/{id}/summary
    // ملخص تقييمات سائق واحد
    // ─────────────────────────────────────────────
    public function driverSummary(Request $request, int $id)
    {
        $user = $request->user();

        // السائق يرى ملخص نفسه / المدير يرى أي سائق
        if ($user instanceof Employee) {
            if ($user->role === Employee::ROLE_DRIVER && $user->id !== $id) {
                return $this->unauthorized('يمكنك فقط عرض تقييماتك الخاصة');
            }
        } else {
            return $this->unauthorized();
        }

        $driver = Employee::find($id);
        if (! $driver) {
            return $this->notFound('السائق غير موجود');
        }

        if ($driver->role !== Employee::ROLE_DRIVER) {
            return $this->error('الموظف المحدد ليس سائقاً');
        }

        $reviews = Review::driverReviews()
            ->forEmployee($id)
            ->latest()
            ->get();

        $distribution = [1 => 0, 2 => 0, 3 => 0, 4 => 0, 5 => 0];
        foreach ($reviews as $r) {
            if (isset($distribution[$r->rating])) {
                $distribution[$r->rating]++;
            }
        }

        // حساب نسبة كل تقييم
        $total = $reviews->count();
        $distributionPercent = [];
        foreach ($distribution as $star => $count) {
            $distributionPercent[$star] = [
                'count' => $count,
                'percent' => $total > 0
                    ? round(($count / $total) * 100, 1)
                    : 0,
            ];
        }

        return $this->success([
            'driver' => [
                'id' => $driver->id,
                'name' => $driver->name,
                'role_label' => $driver->getRoleLabel(),
                'avatar' => $driver->avatar
                                   ? asset('storage/'.$driver->avatar)
                                   : null,
            ],
            'summary' => [
                'average_rating' => Review::getAverageForEmployee($id),
                'total_reviews' => $total,
                'total_deliveries' => $driver->getCompletedDeliveriesCount(),
                'rating_distribution' => $distributionPercent,
            ],
            'recent_reviews' => $reviews->take(10)->map->getDetails()->values(),
        ]);
    }

    // ─────────────────────────────────────────────────────────
    // GET /api/reviews/customers
    // تقييمات الزبائن — لمدير التواصل والمدير العام
    // ─────────────────────────────────────────────────────────
    public function customerProductReviews(Request $request)
    {
        $employee = $this->getEmployee($request);
        if (! $employee) {
            return $this->unauthorized();
        }

        if (! in_array($employee->role, [
            Employee::ROLE_COMMUNICATION_MANAGER,
            Employee::ROLE_GENERAL_MANAGER,
            Employee::ROLE_INVENTORY_MANAGER,
        ])) {
            return $this->unauthorized('صلاحية مدير التواصل مطلوبة');
        }

        $query = Review::where('reviewer_type', Review::REVIEWER_CUSTOMER)
            ->where('reviewable_type', Review::REVIEWABLE_PRODUCT)
            ->with(['reviewerCustomer', 'reviewedProduct']);

        // فلتر التقييم
        if ($request->filled('rating')) {
            $query->where('rating', (int) $request->rating);
        }

        // فلتر المنتج
        if ($request->filled('product_id')) {
            $query->where('reviewable_id', $request->product_id);
        }

        $reviews = $query->latest()->get();

        // توزيع التقييمات
        $distribution = [5 => 0, 4 => 0, 3 => 0, 2 => 0, 1 => 0];
        foreach ($reviews as $r) {
            if (isset($distribution[$r->rating])) {
                $distribution[$r->rating]++;
            }
        }

        $avg = $reviews->count() > 0
            ? round($reviews->avg('rating'), 1)
            : 0;

        return $this->success([
            'stats' => [
                'total' => $reviews->count(),
                'average_rating' => $avg,
                'rating_distribution' => $distribution,
            ],
            'reviews' => $reviews->map->getDetails()->values(),
        ]);
    }
    // ─────────────────────────────────────────────
    // GET /api/admin/employees/{id}/reviews
    // تقييمات موظف محدد (من الـ EmployeeController)
    // ─────────────────────────────────────────────
    // هذا الميثود موجود في EmployeeController::employeeReviews()

    // ─────────────────────────────────────────────
    // POST /api/admin/employees/{id}/review
    // المدير يقيّم موظفاً
    // ─────────────────────────────────────────────
    public function rateEmployee(Request $request, int $id)
    {
        $manager = $this->getEmployee($request);
        if (! $manager) {
            return $this->unauthorized();
        }

        // فقط المدير العام يقيّم
        if (! $manager->isGeneralManager()) {
            return $this->unauthorized('هذا المسار للمدير العام فقط');
        }

        $validator = Validator::make($request->all(), [
            'rating' => 'required|integer|min:1|max:5',
            'comment' => 'nullable|string|max:500',
        ], [
            'rating.required' => 'التقييم مطلوب',
            'rating.min' => 'التقييم يجب أن يكون بين 1 و 5',
            'rating.max' => 'التقييم يجب أن يكون بين 1 و 5',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $result = Review::rateEmployee(
            manager: $manager,
            employeeId: $id,
            rating: (int) $request->rating,
            comment: $request->comment
        );

        if (! $result['success']) {
            return $this->error($result['message']);
        }

        return $this->success(null, $result['message']);
    }

    // ─────────────────────────────────────────────
    // POST /api/customer/delivery/{id}/rate
    // الزبون يقيّم السائق بعد التوصيل
    // ─────────────────────────────────────────────
    public function customerRateDriver(Request $request, int $id)
    {
        $customer = $this->getCustomer($request);
        if (! $customer) {
            return $this->unauthorized('هذا المسار للزبائن فقط');
        }

        if ($customer->isBanned()) {
            return $this->error('حسابك موقوف', 403);
        }

        // جلب طلب التوصيل والتحقق منه
        $delivery = DeliveryOrder::where('id', $id)
            ->whereHas('order', fn ($q) => $q->where('customer_id', $customer->id)
            )
            ->with(['order', 'driver'])
            ->first();

        if (! $delivery) {
            return $this->notFound('طلب التوصيل غير موجود');
        }

        // التحقق من اكتمال التوصيل
        if ($delivery->status !== DeliveryOrder::STATUS_DELIVERED) {
            return $this->error(
                'يمكنك تقييم السائق فقط بعد اكتمال التوصيل'
            );
        }

        if (! $delivery->driver_id) {
            return $this->error('لا يوجد سائق مرتبط بهذا الطلب');
        }

        // التحقق من عدم وجود تقييم مسبق لهذا التوصيل
        $alreadyRated = Review::where('reviewer_type', Review::REVIEWER_CUSTOMER)
            ->where('reviewer_id', $customer->id)
            ->where('reviewable_type', Review::REVIEWABLE_DRIVER)
            ->where('reviewable_id', $delivery->driver_id)
            ->whereDate('created_at', $delivery->actual_delivery_time?->toDateString())
            ->exists();

        if ($alreadyRated) {
            return $this->error('لقد قيّمت هذا السائق مسبقاً لهذا الطلب');
        }

        $validator = Validator::make($request->all(), [
            'rating' => 'required|integer|min:1|max:5',
            'feedback' => 'nullable|string|max:500',
        ], [
            'rating.required' => 'التقييم مطلوب',
            'rating.min' => 'التقييم من 1 إلى 5',
            'rating.max' => 'التقييم من 1 إلى 5',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $rating = (int) $request->rating;

        // حفظ التقييم في جدول reviews
        $review = Review::create([
            'reviewer_type' => Review::REVIEWER_CUSTOMER,
            'reviewer_id' => $customer->id,
            'customer_id' => $customer->id,
            'reviewable_type' => Review::REVIEWABLE_DRIVER,
            'reviewable_id' => $delivery->driver_id,
            'rating' => $rating,
            'comment' => $request->feedback,
        ]);

        // تحديث تقييم السائق في سجل التوصيل
        $delivery->rateDriver($rating, $request->feedback);

        $stars = str_repeat('⭐', $rating);
        $driver = $delivery->driver;

        return $this->success([
            'review' => $review->getDetails(),
            'driver' => [
                'name' => $driver?->name,
                'average_rating' => Review::getAverageForEmployee($delivery->driver_id),
            ],
        ], "شكراً على تقييمك {$stars}");
    }

    // ─────────────────────────────────────────────
    // POST /api/customer/orders/{orderId}/products/{productId}/rate
    // الزبون يقيّم الوجبة نفسها بعد اكتمال الطلب
    // ─────────────────────────────────────────────
    public function customerRateProduct(Request $request, int $orderId, int $productId)
    {
        $customer = $this->getCustomer($request);
        if (! $customer) {
            return $this->unauthorized('هذا المسار للزبائن فقط');
        }

        if ($customer->isBanned()) {
            return $this->error('حسابك موقوف', 403);
        }

        $order = Order::where('customer_id', $customer->id)
            ->with(['items', 'deliveryOrder'])
            ->find($orderId);

        if (! $order) {
            return $this->notFound('الطلب غير موجود');
        }

        $mealIsDelivered = $order->type === Order::TYPE_DELIVERY
            ? $order->deliveryOrder?->status === DeliveryOrder::STATUS_DELIVERED
            : $order->status === Order::STATUS_COMPLETED;

        if (! $mealIsDelivered) {
            return $this->error('يمكنك تقييم الوجبة بعد اكتمال الطلب فقط');
        }

        $hasProduct = $order->items
            ->where('item_type', OrderItem::TYPE_PRODUCT)
            ->where('reference_id', $productId)
            ->isNotEmpty();

        if (! $hasProduct || ! Product::find($productId)) {
            return $this->error('هذه الوجبة غير موجودة ضمن الطلب');
        }

        $validator = Validator::make($request->all(), [
            'rating' => 'required|integer|min:1|max:5',
            'comment' => 'nullable|string|max:500',
        ], [
            'rating.required' => 'التقييم مطلوب',
            'rating.min' => 'التقييم من 1 إلى 5',
            'rating.max' => 'التقييم من 1 إلى 5',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $alreadyRated = Review::where('reviewer_type', Review::REVIEWER_CUSTOMER)
            ->where('reviewer_id', $customer->id)
            ->where('reviewable_type', Review::REVIEWABLE_PRODUCT)
            ->where('reviewable_id', $productId)
            ->exists();

        if ($alreadyRated) {
            return $this->error('لقد قيّمت هذه الوجبة مسبقاً');
        }

        $review = Review::create([
            'reviewer_type' => Review::REVIEWER_CUSTOMER,
            'reviewer_id' => $customer->id,
            'customer_id' => $customer->id,
            'reviewable_type' => Review::REVIEWABLE_PRODUCT,
            'reviewable_id' => $productId,
            'rating' => (int) $request->rating,
            'comment' => $request->comment,
        ]);

        return $this->success([
            'review' => $review->getDetails(),
            'product' => [
                'id' => $productId,
                'average_rating' => round(
                    Review::where('reviewable_type', Review::REVIEWABLE_PRODUCT)
                        ->where('reviewable_id', $productId)
                        ->avg('rating') ?? 0,
                    1
                ),
            ],
        ], 'شكراً على تقييم الوجبة');
    }
}
