<?php

namespace App\Http\Controllers\API;

use App\Models\Customer;
use App\Models\Employee;
use App\Models\LoyaltyAccount;
use App\Models\LoyaltyTransaction;
use App\Models\Notification;
use App\Models\Offer;
use App\Models\Product;
use App\Models\RestaurantInfo;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class LoyaltyController extends BaseController
{
    // ─────────────────────────────────────────────
    // مساعدات التحقق
    // ─────────────────────────────────────────────
    private function isAdmin(Request $request): bool
    {
        $user = $request->user();
        if (! $user instanceof Employee) {
            return false;
        }

        return in_array($user->role, [
            Employee::ROLE_GENERAL_MANAGER,
            Employee::ROLE_FINANCE_MANAGER,
        ]);
    }

    private function isCustomer(Request $request): bool
    {
        return $request->user() instanceof Customer;
    }

    // ─────────────────────────────────────────────
    // GET /api/loyalty
    // المدير العام — قائمة حسابات الولاء
    // ─────────────────────────────────────────────
    public function index(Request $request)
    {
        if (! $this->isAdmin($request)) {
            return $this->unauthorized('صلاحية المدير العام أو المالي مطلوبة');
        }

        $query = LoyaltyAccount::with(['customer'])
            ->whereHas('customer', fn ($q) => $q->where('status', Customer::STATUS_REGISTERED)
            );

        // فلترة حسب المستوى
        if ($request->filled('tier')) {
            $query->where('tier', $request->tier);
        }

        // فلترة حسب رصيد النقاط
        if ($request->filled('min_points')) {
            $query->where('points_balance', '>=', $request->min_points);
        }

        // بحث باسم الزبون
        if ($request->filled('search')) {
            $search = $request->search;
            $query->whereHas('customer', fn ($q) => $q->where('name', 'like', "%{$search}%")
                ->orWhere('phone', 'like', "%{$search}%")
            );
        }

        // ترتيب
        $sort = $request->get('sort', 'points_desc');
        match ($sort) {
            'points_asc' => $query->orderBy('points_balance'),
            'tier' => $query->orderByDesc('total_points_earned'),
            'recent' => $query->orderByDesc('last_activity_at'),
            default => $query->orderByDesc('points_balance'),
        };

        $accounts = $query->get();

        // إحصائيات
        $allAccounts = LoyaltyAccount::all();

        return $this->success([
            'stats' => [
                'total_accounts' => $allAccounts->count(),
                'total_points_issued' => $allAccounts->sum('total_points_earned'),
                'total_points_active' => $allAccounts->sum('points_balance'),
                'total_redeemed' => $allAccounts->sum('total_points_redeemed'),
                'by_tier' => [
                    LoyaltyAccount::TIER_BRONZE => $allAccounts->where('tier', LoyaltyAccount::TIER_BRONZE)->count(),
                    LoyaltyAccount::TIER_SILVER => $allAccounts->where('tier', LoyaltyAccount::TIER_SILVER)->count(),
                    LoyaltyAccount::TIER_GOLD => $allAccounts->where('tier', LoyaltyAccount::TIER_GOLD)->count(),
                    LoyaltyAccount::TIER_PLATINUM => $allAccounts->where('tier', LoyaltyAccount::TIER_PLATINUM)->count(),
                ],
            ],
            'tier_thresholds' => LoyaltyAccount::TIER_THRESHOLDS,
            'tier_labels' => LoyaltyAccount::TIER_LABELS,
            'tier_multipliers' => LoyaltyAccount::configuredMultipliers(),
            'tier_catalog' => LoyaltyAccount::tierCatalog(),
            'earning_info' => [
                'points_per_10_syp' => LoyaltyAccount::POINTS_PER_10_SYP,
                'description' => 'نقطة أساسية لكل 10 ل.س، مع مضاعف حسب المستوى',
            ],
            'count' => $accounts->count(),
            'accounts' => $accounts->map(fn ($acc) => array_merge(
                $acc->getDetails(),
                [
                    'customer' => [
                        'id' => $acc->customer->id,
                        'name' => $acc->customer->name,
                        'phone' => $acc->customer->phone,
                        'email' => $acc->customer->email,
                        'avatar' => $acc->customer->avatar
                                       ? asset('storage/'.$acc->customer->avatar)
                                       : null,
                    ],
                ]
            ))->values(),
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/loyalty/stats
    // إحصائيات نظام الولاء
    // ─────────────────────────────────────────────
    public function stats(Request $request)
    {
        if (! $this->isAdmin($request)) {
            return $this->unauthorized();
        }

        $month = now()->startOfMonth();

        // أكثر الزبائن نقاطاً
        $topCustomers = LoyaltyAccount::with('customer')
            ->orderByDesc('points_balance')
            ->take(5)
            ->get()
            ->map(fn ($acc) => [
                'customer_name' => $acc->customer->name,
                'tier' => $acc->tier,
                'tier_label' => LoyaltyAccount::TIER_LABELS[$acc->tier],
                'points' => $acc->points_balance,
            ]);

        // معاملات هذا الشهر
        $monthlyEarning = LoyaltyTransaction::where('type', LoyaltyTransaction::TYPE_EARNING)
            ->where('created_at', '>=', $month)
            ->sum('points');

        $monthlyRedemption = LoyaltyTransaction::where('type', LoyaltyTransaction::TYPE_REDEMPTION)
            ->where('created_at', '>=', $month)
            ->sum('points');

        // المنتجات التي يمكن الدفع بنقاط
        $productsWithPoints = Product::active()
            ->whereNotNull('loyalty_price')
            ->get()
            ->map(fn ($p) => [
                'name' => $p->name,
                'category' => $p->getCategoryLabel(),
                'price' => number_format($p->price, 0).' ل.س',
                'loyalty_price' => $p->loyalty_price.' نقطة',
            ]);

        $offersWithPoints = Offer::currentlyActive()
            ->whereNotNull('loyalty_price')
            ->get()
            ->map(fn ($o) => [
                'name' => $o->name,
                'offer_price' => number_format($o->offer_price, 0).' ل.س',
                'loyalty_price' => $o->loyalty_price.' نقطة',
            ]);

        return $this->success([
            'overview' => [
                'total_active_accounts' => LoyaltyAccount::count(),
                'total_points_in_system' => LoyaltyAccount::sum('points_balance'),
                'total_points_ever_issued' => LoyaltyAccount::sum('total_points_earned'),
                'total_points_redeemed' => LoyaltyAccount::sum('total_points_redeemed'),
            ],
            'tier_distribution' => [
                LoyaltyAccount::TIER_BRONZE => LoyaltyAccount::where('tier', LoyaltyAccount::TIER_BRONZE)->count(),
                LoyaltyAccount::TIER_SILVER => LoyaltyAccount::where('tier', LoyaltyAccount::TIER_SILVER)->count(),
                LoyaltyAccount::TIER_GOLD => LoyaltyAccount::where('tier', LoyaltyAccount::TIER_GOLD)->count(),
                LoyaltyAccount::TIER_PLATINUM => LoyaltyAccount::where('tier', LoyaltyAccount::TIER_PLATINUM)->count(),
            ],
            'this_month' => [
                'points_earned' => $monthlyEarning,
                'points_redeemed' => abs($monthlyRedemption),
            ],
            'top_customers' => $topCustomers->values(),
            'redeemable_products' => $productsWithPoints->values(),
            'redeemable_offers' => $offersWithPoints->values(),
            'tier_multipliers' => LoyaltyAccount::configuredMultipliers(),
            'tier_catalog' => LoyaltyAccount::tierCatalog(),
            'earning_info' => [
                'points_per_10_syp' => LoyaltyAccount::POINTS_PER_10_SYP,
                'description' => 'نقطة أساسية لكل 10 ل.س، مع مضاعف حسب المستوى',
            ],
        ]);
    }

    // ─────────────────────────────────────────────
    // PUT /api/loyalty/settings
    // المدير العام فقط — تعديل معاملات كسب المستويات
    // ─────────────────────────────────────────────
    public function updateSettings(Request $request)
    {
        $user = $request->user();
        if (! $user instanceof Employee || ! $user->isGeneralManager()) {
            return $this->unauthorized('هذه العملية للمدير العام فقط');
        }

        $validator = Validator::make($request->all(), [
            'multipliers' => 'required|array',
            'multipliers.bronze' => 'required|numeric|min:0.1|max:10',
            'multipliers.silver' => 'required|numeric|min:0.1|max:10',
            'multipliers.gold' => 'required|numeric|min:0.1|max:10',
            'multipliers.platinum' => 'required|numeric|min:0.1|max:10',
        ], [
            'multipliers.required' => 'معاملات المستويات مطلوبة',
            'multipliers.*.required' => 'يجب إدخال معامل لكل مستوى',
            'multipliers.*.numeric' => 'معامل المستوى يجب أن يكون رقماً',
            'multipliers.*.min' => 'أقل معامل مسموح هو 0.1',
            'multipliers.*.max' => 'أعلى معامل مسموح هو 10',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $multipliers = LoyaltyAccount::normalizeMultipliers($request->input('multipliers'));
        $restaurant = RestaurantInfo::getInstance();
        $restaurant->update(['loyalty_tier_multipliers' => $multipliers]);

        return $this->success([
            'tier_multipliers' => $multipliers,
            'tier_catalog' => LoyaltyAccount::tierCatalog($multipliers),
        ], 'تم حفظ معاملات مستويات الولاء بنجاح');
    }

    // ─────────────────────────────────────────────
    // GET /api/loyalty/{customerId}
    // حساب زبون محدد
    // ─────────────────────────────────────────────
    public function show(Request $request, int $customerId)
    {
        if (! $this->isAdmin($request)) {
            return $this->unauthorized();
        }

        $customer = Customer::find($customerId);
        if (! $customer) {
            return $this->notFound('الزبون غير موجود');
        }

        $loyalty = LoyaltyAccount::with('customer')
            ->where('customer_id', $customerId)
            ->first();

        if (! $loyalty) {
            return $this->success([
                'customer' => $customer->getProfileDetails(),
                'has_account' => false,
                'message' => 'لم يتسجّل هذا الزبون في برنامج الولاء بعد',
            ]);
        }

        // آخر 10 معاملات
        $recentTransactions = LoyaltyTransaction::where('loyalty_account_id', $loyalty->id)
            ->latest()
            ->take(10)
            ->get()
            ->map->getDetails()
            ->values();

        // المنتجات التي يمكنه شراؤها بنقاطه الحالية
        $affordableProducts = Product::active()
            ->whereNotNull('loyalty_price')
            ->where('loyalty_price', '<=', $loyalty->points_balance)
            ->get()
            ->map(fn ($p) => [
                'name' => $p->name,
                'loyalty_price' => $p->loyalty_price,
            ])
            ->values();

        return $this->success([
            'has_account' => true,
            'customer' => $customer->getProfileDetails(),
            'loyalty' => $loyalty->getDetails(),
            'recent_transactions' => $recentTransactions,
            'affordable_products' => $affordableProducts,
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/loyalty/{customerId}/transactions
    // حركة نقاط زبون معين
    // ─────────────────────────────────────────────
    public function transactions(Request $request, int $customerId)
    {
        if (! $this->isAdmin($request)) {
            return $this->unauthorized();
        }

        $customer = Customer::find($customerId);
        if (! $customer) {
            return $this->notFound('الزبون غير موجود');
        }

        $loyalty = LoyaltyAccount::where('customer_id', $customerId)->first();
        if (! $loyalty) {
            return $this->error('لا يوجد حساب ولاء لهذا الزبون');
        }

        $query = LoyaltyTransaction::where('loyalty_account_id', $loyalty->id);

        // فلترة حسب النوع
        if ($request->filled('type')) {
            $query->where('type', $request->type);
        }

        // فلترة حسب التاريخ
        if ($request->filled('from_date') && $request->filled('to_date')) {
            $query->whereBetween('created_at', [
                $request->from_date.' 00:00:00',
                $request->to_date.' 23:59:59',
            ]);
        }

        $transactions = $query->latest()->get();

        return $this->success([
            'customer_name' => $customer->name,
            'current_balance' => $loyalty->points_balance,
            'summary' => [
                'total_earned' => $transactions->where('type', LoyaltyTransaction::TYPE_EARNING)
                    ->sum('points'),
                'total_redeemed' => abs($transactions->where('type', LoyaltyTransaction::TYPE_REDEMPTION)
                    ->sum('points')),
                'total_adjusted' => $transactions->where('type', LoyaltyTransaction::TYPE_ADJUSTMENT)
                    ->sum('points'),
            ],
            'type_labels' => LoyaltyTransaction::TYPE_LABELS,
            'transactions' => $transactions->map->getDetails()->values(),
        ]);
    }

    // ─────────────────────────────────────────────
    // POST /api/loyalty/{customerId}/adjust
    // تعديل يدوي للنقاط (المدير العام فقط)
    // ─────────────────────────────────────────────
    public function adjust(Request $request, int $customerId)
    {
        $user = $request->user();
        if (! $user instanceof Employee || ! $user->isGeneralManager()) {
            return $this->unauthorized('هذه العملية للمدير العام فقط');
        }

        $customer = Customer::find($customerId);
        if (! $customer) {
            return $this->notFound('الزبون غير موجود');
        }

        $loyalty = LoyaltyAccount::where('customer_id', $customerId)->first();
        if (! $loyalty) {
            return $this->error('لا يوجد حساب ولاء لهذا الزبون');
        }

        $validator = Validator::make($request->all(), [
            'points' => 'required|integer|not_in:0',
            'reason' => 'required|string|min:5|max:500',
        ], [
            'points.required' => 'عدد النقاط مطلوب',
            'points.not_in' => 'عدد النقاط لا يمكن أن يكون صفراً',
            'reason.required' => 'سبب التعديل مطلوب',
            'reason.min' => 'سبب التعديل يجب أن يكون 5 أحرف على الأقل',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $points = (int) $request->points;
        $isDeduction = $points < 0;
        $absPoints = abs($points);

        // التحقق عند خصم النقاط
        if ($isDeduction && $loyalty->points_balance < $absPoints) {
            return $this->error(
                "لا يمكن خصم {$absPoints} نقطة — الرصيد الحالي: {$loyalty->points_balance} نقطة فقط"
            );
        }

        // تطبيق التعديل
        if ($isDeduction) {
            $loyalty->points_balance -= $absPoints;
            $loyalty->total_points_redeemed += $absPoints;
            $loyalty->last_activity_at = now();
            $loyalty->updateTier();
            $loyalty->save();
            $loyalty->syncCustomerPoints();
        } else {
            $loyalty->addPoints($absPoints, $request->reason);
        }

        // تسجيل المعاملة
        LoyaltyTransaction::create([
            'loyalty_account_id' => $loyalty->id,
            'order_id' => null,
            'points' => $points,
            'type' => LoyaltyTransaction::TYPE_ADJUSTMENT,
            'description' => "تعديل يدوي من المدير: {$request->reason}",
        ]);

        // إشعار الزبون
        $action = $isDeduction ? 'خُصم منه' : 'أُضيف إليه';
        Notification::create([
            'sender_type' => Notification::SENDER_EMPLOYEE,
            'sender_id' => $user->id,
            'receiver_type' => Notification::RECEIVER_CUSTOMER,
            'receiver_id' => $customerId,
            'type' => Notification::TYPE_LOYALTY_UPGRADE,
            'title' => 'تحديث رصيد نقاط الولاء',
            'message' => "{$action} {$absPoints} نقطة. الرصيد الحالي: {$loyalty->fresh()->points_balance} نقطة",
            'data' => [
                'points' => $points,
                'reason' => $request->reason,
                'new_balance' => $loyalty->fresh()->points_balance,
                'adjusted_by' => $user->name,
            ],
        ]);
        $actionWord = $isDeduction ? 'خصم' : 'إضافة';

        return $this->success([
            'loyalty' => $loyalty->fresh()->getDetails(),
            'adjustment' => [
                'points' => $points,
                'type' => $isDeduction ? 'خصم' : 'إضافة',
                'reason' => $request->reason,
                'new_balance' => $loyalty->fresh()->points_balance,
            ],
        ], "تم {$actionWord} {$absPoints} نقطة بنجاح");
    }

    // ─────────────────────────────────────────────
    // GET /api/customer/loyalty
    // الزبون يعرض حساب ولائه
    // ─────────────────────────────────────────────
    public function customerAccount(Request $request)
    {
        if (! $this->isCustomer($request)) {
            return $this->unauthorized('هذا المسار للزبائن فقط');
        }

        $customer = $request->user();

        $loyalty = LoyaltyAccount::where('customer_id', $customer->id)->first();

        if (! $loyalty) {
            return $this->success([
                'has_account' => false,
                'points' => 0,
                'message' => 'قدّم طلبك الأول واكسب نقاط الولاء!',
                'earning_info' => [
                    'description' => 'كل 10 ل.س تنفقها = نقطة أساسية، وتُضاعف حسب المستوى',
                    'points_per_10_syp' => LoyaltyAccount::POINTS_PER_10_SYP,
                    'current_multiplier' => LoyaltyAccount::TIER_MULTIPLIERS[LoyaltyAccount::TIER_BRONZE],
                    'tier_catalog' => LoyaltyAccount::tierCatalog(),
                ],
            ]);
        }

        // آخر 5 معاملات
        $recentTransactions = LoyaltyTransaction::where('loyalty_account_id', $loyalty->id)
            ->latest()
            ->take(5)
            ->get()
            ->map->getDetails()
            ->values();

        // المنتجات التي يستطيع شراؤها بنقاطه
        $affordableProducts = Product::available()
            ->whereNotNull('loyalty_price')
            ->where('loyalty_price', '<=', $loyalty->points_balance)
            ->get()
            ->map(fn ($p) => [
                'id' => $p->id,
                'name' => $p->name,
                'category' => $p->getCategoryLabel(),
                'regular_price' => number_format($p->price, 0).' ل.س',
                'loyalty_price' => $p->loyalty_price.' نقطة',
                'image_url' => $p->image_path
                                       ? asset('storage/'.$p->image_path)
                                       : null,
            ])
            ->values();

        // العروض التي يستطيع الحصول عليها بنقاطه
        $affordableOffers = Offer::currentlyActive()
            ->whereNotNull('loyalty_price')
            ->where('loyalty_price', '<=', $loyalty->points_balance)
            ->get()
            ->map(fn ($o) => [
                'id' => $o->id,
                'name' => $o->name,
                'regular_price' => number_format($o->offer_price, 0).' ل.س',
                'loyalty_price' => $o->loyalty_price.' نقطة',
                'image_url' => $o->image_path
                                       ? asset('storage/'.$o->image_path)
                                       : null,
            ])
            ->values();

        return $this->success([
            'has_account' => true,
            'loyalty' => $loyalty->getDetails(),
            'recent_transactions' => $recentTransactions,
            'what_you_can_redeem' => [
                'products' => $affordableProducts,
                'offers' => $affordableOffers,
            ],
            'earning_info' => [
                'description' => 'كل 10 ل.س تنفقها = نقطة أساسية، وتُضاعف حسب المستوى',
                'points_per_10_syp' => LoyaltyAccount::POINTS_PER_10_SYP,
                'current_multiplier' => LoyaltyAccount::TIER_MULTIPLIERS[$loyalty->tier] ?? 1.0,
                'tier_catalog' => LoyaltyAccount::tierCatalog(),
            ],
        ]);
    }
}
