<?php

namespace App\Http\Controllers\API;

use App\Jobs\GenerateFinancialReport;
use App\Models\Customer;
use App\Models\Employee;
use App\Models\LoyaltyAccount;
use App\Models\LoyaltyTransaction;
use App\Models\Notification;
use App\Models\Order;
use App\Models\PaymentAccount;
use App\Models\PaymentRecord;
use App\Models\Report;
use App\Support\CustomerInputRules;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class PaymentController extends BaseController
{
    // ─────────────────────────────────────────────
    // مساعدات التحقق
    // ─────────────────────────────────────────────
    private function isFinanceManager(Request $request): bool
    {
        $user = $request->user();
        if (! $user instanceof Employee) {
            return false;
        }

        return in_array($user->role, [
            Employee::ROLE_FINANCE_MANAGER,
            Employee::ROLE_GENERAL_MANAGER,
        ]);
    }

    private function isCustomer(Request $request): bool
    {
        return $request->user() instanceof Customer;
    }

    // ═══════════════════════════════════════════════
    // حسابات الدفع — Payment Accounts
    // ═══════════════════════════════════════════════

    // ─────────────────────────────────────────────
    // GET /api/finance/accounts
    // ─────────────────────────────────────────────
    public function accountsIndex(Request $request)
    {
        if (! $this->isFinanceManager($request)) {
            return $this->unauthorized('صلاحية المدير المالي مطلوبة');
        }

        $query = PaymentAccount::query();

        if ($request->filled('type')) {
            $query->byType($request->type);
        }

        if ($request->filled('is_active')) {
            $query->where('is_active', (bool) $request->is_active);
        }

        $accounts = $query->orderBy('type')
            ->orderByDesc('is_primary')
            ->get();

        return $this->success([
            'stats' => [
                'total_accounts' => $accounts->count(),
                'active_accounts' => $accounts->where('is_active', true)->count(),
                'near_capacity' => $accounts->filter->isNearCapacity()->count(),
                'total_balance' => $accounts->sum('current_balance'),
            ],
            'accounts' => $accounts->map->getDetails()->values(),
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/finance/accounts/summary
    // ملخص مُجمَّع حسب النوع
    // ─────────────────────────────────────────────
    public function accountsSummary(Request $request)
    {
        if (! $this->isFinanceManager($request)) {
            return $this->unauthorized();
        }

        return $this->success([
            'summary' => PaymentAccount::getSummaryByType(),
            'total_balance' => PaymentAccount::active()->sum('current_balance'),
            'near_capacity_alert' => PaymentAccount::active()
                ->get()
                ->filter->isNearCapacity()
                ->map->getDetails()
                ->values(),
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/finance/accounts/{id}
    // ─────────────────────────────────────────────
    public function accountShow(Request $request, int $id)
    {
        if (! $this->isFinanceManager($request)) {
            return $this->unauthorized();
        }

        $account = PaymentAccount::find($id);
        if (! $account) {
            return $this->notFound('الحساب غير موجود');
        }

        // آخر المعاملات عبر هذا الحساب
        $recentPayments = PaymentRecord::byMethod($account->type)
            ->where('status', PaymentRecord::STATUS_COMPLETED)
            ->latest()
            ->take(10)
            ->get()
            ->map->getDetails()
            ->values();

        return $this->success([
            'account' => $account->getDetails(),
            'recent_payments' => $recentPayments,
        ]);
    }

    // ─────────────────────────────────────────────
    // POST /api/finance/accounts
    // ─────────────────────────────────────────────
    public function accountStore(Request $request)
    {
        if (! $this->isFinanceManager($request)) {
            return $this->unauthorized();
        }

        $validator = Validator::make($request->all(), [
            'type' => 'required|in:syriatel_cash,sham_cash',
            'account_name' => 'required|string|max:255',
            'account_number' => 'required|string|max:255',
            'max_balance' => 'required|numeric|min:1',
            'current_balance' => 'nullable|numeric|min:0',
            'is_primary' => 'sometimes|boolean',
        ], [
            'type.required' => 'نوع الحساب مطلوب',
            'type.in' => 'النوع: syriatel_cash أو sham_cash',
            'account_name.required' => 'اسم الحساب مطلوب',
            'account_number.required' => 'رقم الحساب مطلوب',
            'max_balance.required' => 'الحد الأقصى للرصيد مطلوب',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $account = PaymentAccount::create([
            'type' => $request->type,
            'account_name' => $request->account_name,
            'account_number' => $request->account_number,
            'max_balance' => $request->max_balance,
            'current_balance' => $request->get('current_balance', 0),
            'is_active' => true,
            'is_primary' => $request->get('is_primary', false),
        ]);

        if ($request->get('is_primary')) {
            $account->makePrimary();
        }

        return $this->success([
            'account' => $account->getDetails(),
        ], 'تم إضافة الحساب بنجاح', 201);
    }

    // ─────────────────────────────────────────────
    // PUT /api/finance/accounts/{id}
    // ─────────────────────────────────────────────
    public function accountUpdate(Request $request, int $id)
    {
        if (! $this->isFinanceManager($request)) {
            return $this->unauthorized();
        }

        $account = PaymentAccount::find($id);
        if (! $account) {
            return $this->notFound('الحساب غير موجود');
        }

        $validator = Validator::make($request->all(), [
            'account_name' => 'sometimes|string|max:255',
            'account_number' => 'sometimes|string|max:255',
            'max_balance' => 'sometimes|numeric|min:1',
            'is_active' => 'sometimes|boolean',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $account->fill($request->only([
            'account_name',
            'account_number',
            'max_balance',
            'is_active',
        ]));
        $account->save();

        return $this->success([
            'account' => $account->getDetails(),
        ], 'تم تحديث الحساب بنجاح');
    }

    // ─────────────────────────────────────────────
    // PATCH /api/finance/accounts/{id}/balance
    // ─────────────────────────────────────────────
    public function updateBalance(Request $request, int $id)
    {
        if (! $this->isFinanceManager($request)) {
            return $this->unauthorized();
        }

        $account = PaymentAccount::find($id);
        if (! $account) {
            return $this->notFound('الحساب غير موجود');
        }

        $validator = Validator::make($request->all(), [
            'balance' => 'required|numeric|min:0',
        ], [
            'balance.required' => 'الرصيد الجديد مطلوب',
            'balance.min' => 'الرصيد لا يمكن أن يكون سالباً',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        if ($request->balance > $account->max_balance) {
            return $this->error(
                'الرصيد المدخل يتجاوز الحد الأقصى: '.
                number_format($account->max_balance, 0).' ل.س'
            );
        }

        $oldBalance = $account->current_balance;
        $account->updateBalance($request->balance, $request->user());

        return $this->success([
            'account' => $account->getDetails(),
            'old_balance' => $oldBalance,
            'new_balance' => $account->current_balance,
        ], 'تم تحديث الرصيد بنجاح');
    }

    // ─────────────────────────────────────────────
    // PATCH /api/finance/accounts/{id}/primary
    // ─────────────────────────────────────────────
    public function makePrimary(Request $request, int $id)
    {
        if (! $this->isFinanceManager($request)) {
            return $this->unauthorized();
        }

        $account = PaymentAccount::find($id);
        if (! $account) {
            return $this->notFound('الحساب غير موجود');
        }

        if (! $account->is_active) {
            return $this->error('لا يمكن تعيين حساب معطّل كحساب أساسي');
        }

        $account->makePrimary();

        return $this->success([
            'account' => $account->getDetails(),
        ], "تم تعيين حساب {$account->account_name} كحساب أساسي");
    }

    // ─────────────────────────────────────────────
    // POST /api/finance/accounts/{id}/withdraw
    // ─────────────────────────────────────────────
    public function withdraw(Request $request, int $id)
    {
        if (! $this->isFinanceManager($request)) {
            return $this->unauthorized();
        }

        $account = PaymentAccount::find($id);
        if (! $account) {
            return $this->notFound('الحساب غير موجود');
        }

        $validator = Validator::make($request->all(), [
            'amount' => 'required|numeric|min:1',
            'reason' => 'nullable|string|max:500',
        ], [
            'amount.required' => 'مبلغ السحب مطلوب',
            'amount.min' => 'مبلغ السحب يجب أن يكون أكبر من صفر',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $result = $account->withdraw($request->amount);

        if (! $result['success']) {
            return $this->error($result['message']);
        }

        return $this->success([
            'account' => $account->fresh()->getDetails(),
            'withdrawn' => $request->amount,
            'new_balance' => $result['new_balance'],
        ], $result['message']);
    }

    // ─────────────────────────────────────────────
    // DELETE /api/finance/accounts/{id}
    // ─────────────────────────────────────────────
    public function accountDestroy(Request $request, int $id)
    {
        if (! $this->isFinanceManager($request)) {
            return $this->unauthorized();
        }

        $account = PaymentAccount::find($id);
        if (! $account) {
            return $this->notFound('الحساب غير موجود');
        }

        if ($account->is_primary) {
            return $this->error(
                'لا يمكن حذف الحساب الأساسي — عيّن حساباً آخر أساسياً أولاً'
            );
        }

        if ($account->current_balance > 0) {
            return $this->error(
                'لا يمكن حذف حساب يحتوي على رصيد. '.
                'الرصيد الحالي: '.number_format($account->current_balance, 0).' ل.س'
            );
        }

        $accountName = $account->account_name;
        $account->delete();

        return $this->success(null, "تم حذف حساب {$accountName}");
    }

    // ═══════════════════════════════════════════════
    // سجلات المدفوعات — Payment Records
    // ═══════════════════════════════════════════════

    // ─────────────────────────────────────────────
    // GET /api/finance/payments
    // ─────────────────────────────────────────────
    public function paymentsIndex(Request $request)
    {
        if (! $this->isFinanceManager($request)) {
            return $this->unauthorized();
        }

        $query = PaymentRecord::with(['order.customer']);

        if ($request->filled('method')) {
            $query->byMethod($request->method);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('from_date') && $request->filled('to_date')) {
            $query->whereBetween('created_at', [
                $request->from_date.' 00:00:00',
                $request->to_date.' 23:59:59',
            ]);
        }

        if ($request->filled('date')) {
            $query->whereDate('created_at', $request->date);
        }

        $payments = $query->latest()->get();

        return $this->success([
            'stats' => [
                'total' => $payments->count(),
                'completed' => $payments->where('status', PaymentRecord::STATUS_COMPLETED)->count(),
                'pending' => $payments->where('status', PaymentRecord::STATUS_PENDING)->count(),
                'failed' => $payments->where('status', PaymentRecord::STATUS_FAILED)->count(),
                'refunded' => $payments->where('status', PaymentRecord::STATUS_REFUNDED)->count(),
                'total_amount' => $payments->where('status', PaymentRecord::STATUS_COMPLETED)
                    ->sum('amount'),
            ],
            'payments' => $payments->map(fn ($p) => array_merge(
                $p->getDetails(),
                [
                    'customer_name' => $p->order?->customer?->name ?? 'زبون',
                    'order_type' => $p->order?->type,
                ]
            ))->values(),
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/finance/payments/stats
    // إحصائيات مالية
    // ─────────────────────────────────────────────
    public function stats(Request $request)
    {
        if (! $this->isFinanceManager($request)) {
            return $this->unauthorized();
        }

        $completed = fn () => PaymentRecord::completed();
        $today = now()->startOfDay();
        $week = now()->startOfWeek();
        $month = now()->startOfMonth();

        // توزيع حسب طريقة الدفع
        $byMethod = collect(PaymentRecord::METHOD_LABELS)
            ->map(fn ($label, $method) => [
                'label' => $label,
                'count' => (clone $completed())->byMethod($method)->count(),
                'amount' => (clone $completed())->byMethod($method)->sum('amount'),
            ])->filter(fn ($m) => $m['count'] > 0);
        $monthlyRevenue = collect(range(11, 0))->map(function (int $offset) use ($completed) {
            $date = now()->startOfMonth()->subMonths($offset);

            return [
                'month' => $date->format('Y-m'),
                'label' => $date->locale('ar')->translatedFormat('M Y'),
                'amount' => (float) (clone $completed())
                    ->whereBetween('created_at', [$date->copy()->startOfMonth(), $date->copy()->endOfMonth()])
                    ->sum('amount'),
            ];
        });

        return $this->success([
            'revenue' => [
                'today' => (clone $completed())->whereDate('created_at', today())->sum('amount'),
                'this_week' => (clone $completed())->where('created_at', '>=', $week)->sum('amount'),
                'this_month' => (clone $completed())->where('created_at', '>=', $month)->sum('amount'),
                'all_time' => (clone $completed())->sum('amount'),
            ],
            'by_method' => $byMethod->values(),
            'monthly_revenue' => $monthlyRevenue->values(),
            'accounts' => PaymentAccount::getSummaryByType(),
            'loyalty_redeemed_this_month' => (clone $completed())
                ->byMethod(PaymentRecord::METHOD_LOYALTY_POINTS)
                ->where('created_at', '>=', $month)
                ->count(),
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/finance/payments/{id}
    // ─────────────────────────────────────────────
    public function paymentShow(Request $request, int $id)
    {
        if (! $this->isFinanceManager($request)) {
            return $this->unauthorized();
        }

        $payment = PaymentRecord::with(['order.customer'])->find($id);
        if (! $payment) {
            return $this->notFound('سجل الدفع غير موجود');
        }

        return $this->success([
            'payment' => array_merge(
                $payment->getDetails(),
                [
                    'customer' => $payment->order?->customer
                                     ? [
                                         'name' => $payment->order->customer->name,
                                         'phone' => $payment->order->customer->phone,
                                     ]
                                     : null,
                    'order' => $payment->order?->getDetails(),
                ]
            ),
        ]);
    }

    // ─────────────────────────────────────────────
    // POST /api/finance/payments/{id}/refund
    // استرداد دفعة
    // ─────────────────────────────────────────────
    public function refund(Request $request, int $id)
    {
        if (! $this->isFinanceManager($request)) {
            return $this->unauthorized();
        }

        $payment = PaymentRecord::with(['order'])->find($id);
        if (! $payment) {
            return $this->notFound('سجل الدفع غير موجود');
        }

        $result = $payment->refund();

        if (! $result['success']) {
            return $this->error($result['message']);
        }

        return $this->success([
            'payment' => $payment->fresh()->getDetails(),
        ], $result['message']);
    }

    // ─────────────────────────────────────────────
    // GET /api/finance/report
    // توليد تقرير مالي
    // ─────────────────────────────────────────────
    public function generateReport(Request $request)
    {
        if (! $this->isFinanceManager($request)) {
            return $this->unauthorized();
        }

        $employee = $request->user();
        $totalRevenue = PaymentRecord::completed()
            ->where('created_at', '>=', now()->startOfMonth())
            ->sum('amount');
        GenerateFinancialReport::dispatch($employee->id)->onQueue('reports');

        return $this->success([
            'queued' => true,
            'total_revenue' => $totalRevenue,
        ], 'تمت جدولة التقرير المالي وسيصل للمدير العام بعد توليده');
    }

    // ═══════════════════════════════════════════════
    // دفع الزبون — Customer Payment
    // ═══════════════════════════════════════════════

    // ─────────────────────────────────────────────
    // POST /api/customer/orders/{id}/pay
    // ─────────────────────────────────────────────
    public function customerPay(Request $request, int $id)
    {
        if (! $this->isCustomer($request)) {
            return $this->unauthorized('هذا المسار للزبائن فقط');
        }

        $customer = $request->user();

        if ($customer->isBanned()) {
            return $this->error('حسابك موقوف', 403);
        }

        $order = Order::where('customer_id', $customer->id)
            ->with(['items'])
            ->find($id);

        if (! $order) {
            return $this->notFound('الطلب غير موجود');
        }

        // التحقق من أن الطلب لم يُدفع مسبقاً
        $existingPayment = PaymentRecord::where('order_id', $id)
            ->whereIn('status', [
                PaymentRecord::STATUS_PENDING,
                PaymentRecord::STATUS_COMPLETED,
                PaymentRecord::STATUS_CONFIRMED,
            ])->first();

        if ($existingPayment) {
            return $this->error('يوجد لهذا الطلب سجل دفع قائم مسبقاً');
        }

        // التحقق من حالة الطلب
        if (in_array($order->status, [
            Order::STATUS_COMPLETED,
            Order::STATUS_CANCELLED,
        ])) {
            return $this->error(
                "لا يمكن الدفع لطلب بحالة \"{$order->getStatusLabel()}\""
            );
        }

        $validator = Validator::make($request->all(), [
            'method' => 'required|in:cash,syriatel_cash,sham_cash,loyalty_points,test_payment',
            // للدفع الإلكتروني
            'phone' => ['required_if:method,syriatel_cash', 'required_if:method,sham_cash', ...CustomerInputRules::phone()],
            'pin_code' => 'required_if:method,syriatel_cash|required_if:method,sham_cash|string|size:4|regex:/^[0-9]{4}$/',
            // للدفع بالنقاط
            'points_required' => 'nullable|integer|min:1',
        ], [
            'method.required' => 'طريقة الدفع مطلوبة',
            'method.in' => 'طريقة الدفع غير صحيحة',
            'phone.required_if' => 'رقم الهاتف مطلوب لهذه الطريقة',
            'pin_code.required_if' => 'الرمز السري مطلوب',
            'pin_code.size' => 'الرمز السري يجب أن يكون 4 أرقام',
            'phone.regex' => 'رقم الهاتف يجب أن يكون 10 أرقام ويبدأ بـ 09',
            'points_required.required_if' => 'عدد النقاط المطلوبة مطلوب',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        if ($request->method === PaymentRecord::METHOD_TEST_PAYMENT
            && ! PaymentRecord::testPaymentsEnabled()) {
            return $this->error('الدفع الاختباري غير متاح في بيئة الإنتاج', 403);
        }

        if (in_array($request->method, [
            PaymentRecord::METHOD_SYRIATEL_CASH,
            PaymentRecord::METHOD_SHAM_CASH,
        ], true)) {
            return $this->error('طريقة الدفع هذه غير متاحة حالياً', 423);
        }

        DB::beginTransaction();
        try {
            $result = PaymentRecord::processPayment(
                orderId: $order->id,
                method: $request->method,
                amount: $order->final_price,
                extraData: [
                    'phone' => $request->phone,
                    'pin_code' => $request->pin_code,
                    'points_required' => $request->method === PaymentRecord::METHOD_LOYALTY_POINTS
                        ? LoyaltyAccount::calculateRedemptionPoints((float) $order->final_price)
                        : null,
                ]
            );

            if (! $result['success']) {
                DB::rollBack();

                return $this->error($result['message']);
            }

            // منح نقاط الولاء للمدفوعات الإلكترونية فوراً، أما الكاش فيُمنح عند اكتمال الطلب
            $loyaltyPointsEarned = 0;
            if (! in_array($request->method, [PaymentRecord::METHOD_LOYALTY_POINTS, PaymentRecord::METHOD_CASH], true)
                && ! LoyaltyTransaction::where('order_id', $order->id)
                    ->where('type', LoyaltyTransaction::TYPE_EARNING)
                    ->exists()) {

                $loyalty = LoyaltyAccount::firstOrCreate(
                    ['customer_id' => $customer->id],
                    [
                        'points_balance' => 0,
                        'tier' => LoyaltyAccount::TIER_BRONZE,
                        'total_points_earned' => 0,
                        'total_points_redeemed' => 0,
                    ]
                );

                $points = LoyaltyAccount::calculatePointsFromAmount($order->final_price, $loyalty->tier);

                if ($points > 0) {
                    $loyalty->addPoints($points, 'Order Payment');

                    LoyaltyTransaction::create([
                        'loyalty_account_id' => $loyalty->id,
                        'order_id' => $order->id,
                        'points' => $points,
                        'type' => LoyaltyTransaction::TYPE_EARNING,
                        'description' => "نقاط طلب #{$order->id}",
                    ]);

                    $loyaltyPointsEarned = $points;
                }
            }

            // إشعار الزبون بنجاح الدفع
            $payment = PaymentRecord::where('order_id', $order->id)->latest()->first();
            if ($payment && $payment->status === PaymentRecord::STATUS_COMPLETED) {
                Notification::paymentCompleted($payment, $loyaltyPointsEarned);
            }

            DB::commit();

            return $this->success([
                'payment' => $result,
                'loyalty_points_earned' => $loyaltyPointsEarned,
                'order_status' => $order->fresh()->getStatusLabel(),
            ], $result['message']);

        } catch (\Exception $e) {
            DB::rollBack();

            return $this->error(
                'حدث خطأ أثناء معالجة الدفع',
                500,
                config('app.debug') ? $e->getMessage() : null
            );
        }
    }
}
