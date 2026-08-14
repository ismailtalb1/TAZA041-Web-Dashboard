<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\DB;

class PaymentRecord extends Model
{
    use HasFactory;

    // ✅ مطابق لقاعدة البيانات
    protected $table = 'payment_records';

    protected $fillable = [
        'order_id',
        'payment_account_id',
        'method',
        'amount',
        'currency',
        'status',
        'external_ref',
        'notes',
    ];

    protected $casts = [
        'amount' => 'float',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // ─────────────────────────────────────────────
    // الثوابت — طرق الدفع
    // مطابقة لـ ENUM في قاعدة البيانات
    // ─────────────────────────────────────────────
    const METHOD_CASH = 'cash';

    const METHOD_SYRIATEL_CASH = 'syriatel_cash';

    const METHOD_SHAM_CASH = 'sham_cash';

    const METHOD_LOYALTY_POINTS = 'loyalty_points';

    const METHOD_TEST_PAYMENT = 'test_payment';

    // تسميات طرق الدفع بالعربي
    const METHOD_LABELS = [
        self::METHOD_CASH => 'كاش عند الاستلام',
        self::METHOD_SYRIATEL_CASH => 'سيريتل كاش',
        self::METHOD_SHAM_CASH => 'شام كاش',
        self::METHOD_LOYALTY_POINTS => 'نقاط الولاء',
        self::METHOD_TEST_PAYMENT => 'دفع اختباري',
    ];

    // ─────────────────────────────────────────────
    // الثوابت — حالات الدفع
    // ─────────────────────────────────────────────
    const STATUS_PENDING = 'pending';

    const STATUS_CONFIRMED = 'confirmed';

    const STATUS_COMPLETED = 'completed';

    const STATUS_FAILED = 'failed';

    const STATUS_REFUNDED = 'refunded';

    // ─────────────────────────────────────────────
    // العلاقات
    // ─────────────────────────────────────────────
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function paymentAccount(): BelongsTo
    {
        return $this->belongsTo(PaymentAccount::class);
    }

    // ─────────────────────────────────────────────
    // Scopes
    // ─────────────────────────────────────────────
    public function scopeCompleted($query)
    {
        return $query->where('status', self::STATUS_COMPLETED);
    }

    public function scopeByMethod($query, string $method)
    {
        return $query->where('method', $method);
    }

    // ─────────────────────────────────────────────
    // منطق معالجة الدفع الرئيسي
    // ─────────────────────────────────────────────
    public static function processPayment(
        int $orderId,
        string $method,
        float $amount,
        array $extraData = []
    ): array {

        $order = Order::findOrFail($orderId);

        // ── الدفع بالكاش ─────────────────────────
        if ($method === self::METHOD_CASH) {
            return self::processCash($order, $amount);
        }

        // ── الدفع بنقاط الولاء ───────────────────
        if ($method === self::METHOD_LOYALTY_POINTS) {
            return self::processLoyaltyPoints($order, $extraData);
        }

        if ($method === self::METHOD_TEST_PAYMENT) {
            return self::processTestPayment($order, $amount);
        }

        if (in_array($method, [self::METHOD_SYRIATEL_CASH, self::METHOD_SHAM_CASH], true)) {
            return self::processElectronicPayment($order, $method, $amount, $extraData);
        }

        return [
            'success' => false,
            'message' => 'طريقة الدفع غير صحيحة',
        ];
    }

    public static function testPaymentsEnabled(): bool
    {
        return in_array((string) config('app.env'), ['local', 'testing'], true);
    }

    private static function processTestPayment(Order $order, float $amount): array
    {
        if (! self::testPaymentsEnabled()) {
            return [
                'success' => false,
                'message' => 'الدفع الاختباري غير متاح في هذه البيئة',
            ];
        }

        $reference = 'TEST-'.$order->id.'-'.now()->format('YmdHis').'-'.random_int(1000, 9999);
        $record = self::create([
            'order_id' => $order->id,
            'method' => self::METHOD_TEST_PAYMENT,
            'amount' => $amount,
            'currency' => 'SYP',
            'status' => self::STATUS_COMPLETED,
            'external_ref' => $reference,
            'notes' => 'دفعة اختبار مكتملة — دون تحويل مالي حقيقي',
        ]);

        return [
            'success' => true,
            'payment_id' => $record->id,
            'status' => self::STATUS_COMPLETED,
            'message' => 'تمت محاكاة الدفع بنجاح',
            'method' => self::METHOD_TEST_PAYMENT,
            'method_label' => self::METHOD_LABELS[self::METHOD_TEST_PAYMENT],
            'transaction_ref' => $reference,
            'amount' => $amount,
        ];
    }

    // ─────────────────────────────────────────────
    // الدفع نقداً
    // ─────────────────────────────────────────────
    private static function processCash(Order $order, float $amount): array
    {
        $record = self::create([
            'order_id' => $order->id,
            'method' => self::METHOD_CASH,
            'amount' => $amount,
            'currency' => 'SYP',
            'status' => self::STATUS_PENDING,
            'notes' => 'دفع نقدي — يُؤكَّد عند الاستلام',
        ]);

        return [
            'success' => true,
            'payment_id' => $record->id,
            'status' => self::STATUS_PENDING,
            'message' => 'سيتم تأكيد دفعتك النقدية عند الاستلام',
            'method' => self::METHOD_CASH,
        ];
    }

    // ─────────────────────────────────────────────
    // الدفع بنقاط الولاء
    // ─────────────────────────────────────────────
    private static function processLoyaltyPoints(Order $order, array $data): array
    {
        // يحتسب الخادم النقاط المطلوبة ولا يثق بقيمة مرسلة من الواجهة.
        $pointsRequired = LoyaltyAccount::calculateRedemptionPoints((float) $order->final_price);

        $customer = Customer::findOrFail($order->customer_id);
        $customer->ensureLoyaltyAccount();
        $loyalty = LoyaltyAccount::where('customer_id', $order->customer_id)
            ->lockForUpdate()
            ->firstOrFail();

        if ($loyalty->points_balance < $pointsRequired) {
            return [
                'success' => false,
                'message' => 'رصيد نقاطك غير كافٍ لإتمام العملية',
                'current_balance' => $loyalty->points_balance,
                'required_points' => $pointsRequired,
                'missing_points' => $pointsRequired - $loyalty->points_balance,
            ];
        }

        // خصم النقاط
        $redeemed = $loyalty->redeemPoints($pointsRequired, $order->id);

        if (! $redeemed) {
            return [
                'success' => false,
                'message' => 'فشل في خصم النقاط — حاول مرة أخرى',
            ];
        }

        // تسجيل الدفع
        $record = self::create([
            'order_id' => $order->id,
            'method' => self::METHOD_LOYALTY_POINTS,
            'amount' => $order->final_price,
            'currency' => 'SYP',
            'status' => self::STATUS_COMPLETED,
            'external_ref' => "POINTS-{$pointsRequired}",
            'notes' => "دفع بـ {$pointsRequired} نقطة ولاء",
        ]);

        return [
            'success' => true,
            'payment_id' => $record->id,
            'status' => self::STATUS_COMPLETED,
            'message' => "تم الدفع بـ {$pointsRequired} نقطة ولاء بنجاح",
            'method' => self::METHOD_LOYALTY_POINTS,
            'points_used' => $pointsRequired,
            'remaining_balance' => $loyalty->fresh()->points_balance,
        ];
    }

    // ─────────────────────────────────────────────
    // الدفع الإلكتروني (سيريتل كاش / شام كاش)
    // 🔑 مفتاح وهمي حالياً — يُستبدل بـ API الحقيقي لاحقاً
    // ─────────────────────────────────────────────
    private static function processElectronicPayment(
        Order $order,
        string $method,
        float $amount,
        array $data
    ): array {

        // ── التحقق من الحساب المالي للمطعم ────────
        $account = PaymentAccount::where('type', $method)
            ->where('is_active', true)
            ->orderByDesc('is_primary')
            ->first();

        if (! $account) {
            return [
                'success' => false,
                'message' => 'طريقة الدفع هذه غير متاحة حالياً',
            ];
        }

        // ── محاكاة API الدفع الخارجي (وهمي) ───────
        $mockResult = self::mockExternalPaymentAPI($method, $amount, $data);

        if (! $mockResult['success']) {
            self::create([
                'order_id' => $order->id,
                'method' => $method,
                'amount' => $amount,
                'currency' => 'SYP',
                'status' => self::STATUS_FAILED,
                'notes' => $mockResult['message'],
            ]);

            return $mockResult;
        }

        // ── تسجيل الدفع الناجح ────────────────────
        $record = self::create([
            'order_id' => $order->id,
            'payment_account_id' => $account->id,
            'method' => $method,
            'amount' => $amount,
            'currency' => 'SYP',
            'status' => self::STATUS_COMPLETED,
            'external_ref' => $mockResult['transaction_ref'],
            'notes' => $mockResult['message'],
        ]);

        // تحديث رصيد الحساب المالي
        $account->increment('current_balance', $amount);

        // تحويل الحساب إذا امتلأ
        if ($account->current_balance >= $account->max_balance) {
            $account->update(['is_primary' => false]);
            $next = PaymentAccount::where('type', $method)
                ->where('is_active', true)
                ->where('id', '!=', $account->id)
                ->where('current_balance', '<', 'max_balance')
                ->first();
            $next?->update(['is_primary' => true]);
        }

        return [
            'success' => true,
            'payment_id' => $record->id,
            'status' => self::STATUS_COMPLETED,
            'message' => 'تمت عملية الدفع بنجاح',
            'method' => $method,
            'method_label' => self::METHOD_LABELS[$method],
            'transaction_ref' => $mockResult['transaction_ref'],
            'amount' => $amount,
        ];
    }

    // ─────────────────────────────────────────────
    // محاكاة API خارجي (وهمي مؤقت)
    // 🔑 استبدل هذا لاحقاً بـ API سيريتل وشام الحقيقي
    // ─────────────────────────────────────────────
    private static function mockExternalPaymentAPI(
        string $method,
        float $amount,
        array $data
    ): array {

        $phone = $data['phone'] ?? null;
        $pinCode = $data['pin_code'] ?? null;

        // التحقق من البيانات المطلوبة
        if (in_array($method, [self::METHOD_SYRIATEL_CASH, self::METHOD_SHAM_CASH])) {
            if (! $phone || ! $pinCode) {
                return [
                    'success' => false,
                    'message' => 'رقم الهاتف والرمز السري مطلوبان',
                ];
            }

            // تحقق بسيط من تنسيق الرقم
            if (strlen($pinCode) !== 4 || ! is_numeric($pinCode)) {
                return [
                    'success' => false,
                    'message' => 'الرمز السري يجب أن يكون 4 أرقام',
                ];
            }
        }

        // 🔑 هنا ستضع API الحقيقي لاحقاً
        // حالياً: نجاح دائم للتطوير والاختبار
        $prefix = match ($method) {
            self::METHOD_SYRIATEL_CASH => 'SYR',
            self::METHOD_SHAM_CASH => 'SHA',
            default => 'PAY',
        };

        return [
            'success' => true,
            'message' => 'تمت العملية بنجاح (محاكاة)',
            'transaction_ref' => $prefix.'-'.now()->format('YmdHis').'-'.rand(1000, 9999),
        ];
    }

    // ─────────────────────────────────────────────
    // استرداد الدفع عند إلغاء الطلب
    // ─────────────────────────────────────────────
    public function refund(
        string $actorType = 'system',
        ?int $actorId = null,
        ?string $reason = null,
    ): array {
        return DB::transaction(function () use ($actorType, $actorId, $reason) {
            $payment = self::query()
                ->with(['order', 'paymentAccount'])
                ->lockForUpdate()
                ->findOrFail($this->id);

            if ($payment->status === self::STATUS_REFUNDED) {
                return [
                    'success' => false,
                    'message' => 'تم استرداد هذه الدفعة مسبقاً',
                ];
            }

            if ($payment->status === self::STATUS_FAILED) {
                return [
                    'success' => false,
                    'message' => 'لا يمكن استرداد دفعة فاشلة',
                ];
            }

            $wasCompleted = $payment->status === self::STATUS_COMPLETED;
            $loyaltyPointsAdjusted = 0;
            $financialBalanceReversed = false;
            if ($wasCompleted && $payment->order?->customer_id) {
                $loyalty = LoyaltyAccount::where('customer_id', $payment->order->customer_id)
                    ->lockForUpdate()
                    ->first();

                if ($loyalty && $payment->method === self::METHOD_LOYALTY_POINTS) {
                    $pointsToRestore = abs((int) LoyaltyTransaction::where('order_id', $payment->order_id)
                        ->where('type', LoyaltyTransaction::TYPE_REDEMPTION)
                        ->lockForUpdate()
                        ->get()
                        ->sum('points'));

                    if ($pointsToRestore > 0) {
                        $loyalty->restoreRedeemedPoints($pointsToRestore);
                        LoyaltyTransaction::create([
                            'loyalty_account_id' => $loyalty->id,
                            'order_id' => $payment->order_id,
                            'points' => $pointsToRestore,
                            'type' => LoyaltyTransaction::TYPE_ADJUSTMENT,
                            'description' => "إعادة نقاط الدفع بعد استرداد الطلب #{$payment->order_id}",
                        ]);
                        $loyaltyPointsAdjusted = $pointsToRestore;
                    }
                } elseif ($loyalty) {
                    $pointsToReverse = (int) LoyaltyTransaction::where('order_id', $payment->order_id)
                        ->where('type', LoyaltyTransaction::TYPE_EARNING)
                        ->lockForUpdate()
                        ->get()
                        ->sum('points');

                    if ($pointsToReverse > 0) {
                        $loyalty->reverseEarnedPoints($pointsToReverse);
                        LoyaltyTransaction::create([
                            'loyalty_account_id' => $loyalty->id,
                            'order_id' => $payment->order_id,
                            'points' => -$pointsToReverse,
                            'type' => LoyaltyTransaction::TYPE_ADJUSTMENT,
                            'description' => "عكس نقاط الطلب المسترد #{$payment->order_id}",
                        ]);
                        $loyaltyPointsAdjusted = -$pointsToReverse;
                    }
                }

                if (in_array($payment->method, [
                    self::METHOD_SYRIATEL_CASH,
                    self::METHOD_SHAM_CASH,
                ], true)) {
                    $account = $payment->payment_account_id
                        ? PaymentAccount::whereKey($payment->payment_account_id)->lockForUpdate()->first()
                        : PaymentAccount::where('type', $payment->method)
                            ->orderByDesc('is_primary')
                            ->orderByDesc('current_balance')
                            ->lockForUpdate()
                            ->first();

                    if ($account) {
                        // A refund is an accounting outflow. A negative balance is
                        // intentional when collected funds were moved before refunding.
                        $account->current_balance -= $payment->amount;
                        $account->save();
                        $financialBalanceReversed = true;
                    }
                }
            }

            $audit = 'تم الاسترداد بسبب إلغاء الطلب بواسطة '.$actorType;
            if ($actorId) {
                $audit .= " #{$actorId}";
            }
            if ($reason) {
                $audit .= ' — '.$reason;
            }
            $payment->update([
                'status' => self::STATUS_REFUNDED,
                'notes' => trim(($payment->notes ? $payment->notes."\n" : '').$audit.' وإلغاء الأثر الولائي'),
            ]);

            Notification::paymentRefunded($payment->fresh(['order']), $loyaltyPointsAdjusted);

            return array_merge($payment->fresh()->refundSummary(), [
                'success' => true,
                'message' => $wasCompleted
                    ? 'تم استرداد الدفعة وتسوية نقاط الولاء بنجاح'
                    : 'تم إلغاء سجل الدفع غير المحصّل بنجاح',
                'loyalty_points_adjusted' => $loyaltyPointsAdjusted,
                'loyalty_points_restored' => max(0, $loyaltyPointsAdjusted),
                'loyalty_points_reversed' => abs(min(0, $loyaltyPointsAdjusted)),
                'financial_balance_reversed' => $financialBalanceReversed,
                'money_refunded' => $wasCompleted
                    && $payment->method !== self::METHOD_LOYALTY_POINTS
                    && $payment->method !== self::METHOD_TEST_PAYMENT
                        ? (float) $payment->amount
                        : 0.0,
                'kind' => match ($payment->method) {
                    self::METHOD_LOYALTY_POINTS => 'loyalty_points',
                    self::METHOD_TEST_PAYMENT => 'test_payment',
                    self::METHOD_CASH => $wasCompleted ? 'cash' : 'uncollected_cash',
                    default => 'electronic_payment',
                },
                'cancelled_by' => [
                    'type' => $actorType,
                    'id' => $actorId,
                ],
            ]);
        });
    }

    public function refundSummary(bool $alreadyRefunded = false): array
    {
        $isElectronic = in_array($this->method, [
            self::METHOD_SYRIATEL_CASH,
            self::METHOD_SHAM_CASH,
        ], true);
        $wasCollected = $this->status === self::STATUS_COMPLETED;

        $kind = match ($this->method) {
            self::METHOD_LOYALTY_POINTS => 'loyalty_points',
            self::METHOD_TEST_PAYMENT => 'test_payment',
            self::METHOD_CASH => $wasCollected ? 'cash' : 'uncollected_cash',
            default => $isElectronic ? 'electronic_payment' : 'payment',
        };

        return [
            'success' => true,
            'kind' => $kind,
            'payment_method' => $this->method,
            'payment_method_label' => self::METHOD_LABELS[$this->method] ?? $this->method,
            'payment_status' => $this->status,
            'amount' => (float) $this->amount,
            'currency' => $this->currency,
            'money_refunded' => $wasCollected && $this->method !== self::METHOD_LOYALTY_POINTS
                && $this->method !== self::METHOD_TEST_PAYMENT
                    ? (float) $this->amount
                    : 0.0,
            'already_refunded' => $alreadyRefunded || $this->status === self::STATUS_REFUNDED,
            'loyalty_points_restored' => 0,
            'loyalty_points_reversed' => 0,
            // The repository currently simulates provider APIs; this flag keeps
            // clients from claiming an external bank/wallet transfer occurred.
            'external_provider_connected' => false,
        ];
    }

    // اسم الحالة بالعربي
    public function getStatusLabel(): string
    {
        return match ($this->status) {
            self::STATUS_PENDING => 'بانتظار التأكيد',
            self::STATUS_CONFIRMED => 'مؤكدة',
            self::STATUS_COMPLETED => 'مكتملة',
            self::STATUS_FAILED => 'فشلت',
            self::STATUS_REFUNDED => 'مستردة',
            default => $this->status,
        };
    }

    // تفاصيل الدفع للواجهة
    public function getDetails(): array
    {
        return [
            'id' => $this->id,
            'payment_account_id' => $this->payment_account_id,
            'method' => $this->method,
            'method_label' => self::METHOD_LABELS[$this->method] ?? $this->method,
            'amount' => $this->amount,
            'amount_formatted' => number_format($this->amount, 0).' ل.س',
            'currency' => $this->currency,
            'status' => $this->status,
            'status_label' => $this->getStatusLabel(),
            'external_ref' => $this->external_ref,
            'notes' => $this->notes,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
