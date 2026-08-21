<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Notification extends Model
{
    use HasFactory;

    // ✅ مطابق لقاعدة البيانات
    protected $table = 'notifications';

    protected $fillable = [
        'sender_type',
        'sender_id',
        'receiver_type',
        'receiver_id',
        'type',
        'title',
        'message',
        'data',
        'deduplication_key',
        'status',
        'read_at',
    ];

    protected $casts = [
        'data' => 'array',
        'read_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // ─────────────────────────────────────────────
    // الثوابت — أنواع المُرسِل والمُستقبِل
    // ─────────────────────────────────────────────
    const SENDER_SYSTEM = 'system';

    const SENDER_EMPLOYEE = 'employee';

    const SENDER_CUSTOMER = 'customer';

    const RECEIVER_CUSTOMER = 'customer';

    const RECEIVER_EMPLOYEE = 'employee';

    // ─────────────────────────────────────────────
    // الثوابت — أنواع الإشعارات
    // مطابقة لـ ENUM في قاعدة البيانات
    // ─────────────────────────────────────────────
    const TYPE_ORDER_UPDATE = 'order_update';

    const TYPE_DELIVERY_UPDATE = 'delivery_update';

    const TYPE_RESERVATION_UPDATE = 'reservation_update';

    const TYPE_PAYMENT_UPDATE = 'payment_update';

    const TYPE_LOYALTY_UPGRADE = 'loyalty_tier_upgrade';

    const TYPE_NEW_OFFER = 'new_offer';

    const TYPE_NEW_PRODUCT = 'new_product';

    const TYPE_STOCK_ALERT = 'stock_alert';

    const TYPE_MANAGER_NOTIF = 'manager_notification';

    const TYPE_SYSTEM_ANNOUNCEMENT = 'system_announcement';

    // أيقونات الإشعارات للـ Dashboard
    const TYPE_ICONS = [
        self::TYPE_ORDER_UPDATE => '🛒',
        self::TYPE_DELIVERY_UPDATE => '🚗',
        self::TYPE_RESERVATION_UPDATE => '🪑',
        self::TYPE_PAYMENT_UPDATE => '💳',
        self::TYPE_LOYALTY_UPGRADE => '🏆',
        self::TYPE_NEW_OFFER => '🎯',
        self::TYPE_NEW_PRODUCT => '🍽️',
        self::TYPE_STOCK_ALERT => '⚠️',
        self::TYPE_MANAGER_NOTIF => '📋',
        self::TYPE_SYSTEM_ANNOUNCEMENT => '📢',
    ];

    // ─────────────────────────────────────────────
    // الثوابت — الحالات
    // ─────────────────────────────────────────────
    const STATUS_SENT = 'sent';

    const STATUS_DELIVERED = 'delivered';

    const STATUS_READ = 'read';

    // ─────────────────────────────────────────────
    // العلاقات
    // ─────────────────────────────────────────────
    public function senderEmployee(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'sender_id')
            ->where('sender_type', self::SENDER_EMPLOYEE);
    }

    public function receiverCustomer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'receiver_id')
            ->where('receiver_type', self::RECEIVER_CUSTOMER);
    }

    public function receiverEmployee(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'receiver_id')
            ->where('receiver_type', self::RECEIVER_EMPLOYEE);
    }

    // ─────────────────────────────────────────────
    // Scopes
    // ─────────────────────────────────────────────
    public function scopeForCustomer($query, int $customerId)
    {
        return $query->where('receiver_type', self::RECEIVER_CUSTOMER)
            ->where('receiver_id', $customerId);
    }

    public function scopeForEmployee($query, int $employeeId)
    {
        return $query->where('receiver_type', self::RECEIVER_EMPLOYEE)
            ->where('receiver_id', $employeeId);
    }

    public function scopeUnread($query)
    {
        return $query->whereIn('status', [
            self::STATUS_SENT,
            self::STATUS_DELIVERED,
        ]);
    }

    public function scopeRead($query)
    {
        return $query->where('status', self::STATUS_READ);
    }

    public function scopeByType($query, string $type)
    {
        return $query->where('type', $type);
    }

    // ─────────────────────────────────────────────
    // التوابع — الإجراءات
    // ─────────────────────────────────────────────
    public function markAsRead(): void
    {
        if ($this->status === self::STATUS_READ) {
            return;
        }

        $this->update([
            'status' => self::STATUS_READ,
            'read_at' => now(),
        ]);
    }

    public function markAsDelivered(): void
    {
        if ($this->status !== self::STATUS_SENT) {
            return;
        }
        $this->update(['status' => self::STATUS_DELIVERED]);
    }

    // ─────────────────────────────────────────────
    // Factory Methods — إنشاء إشعارات محددة بسهولة
    // ─────────────────────────────────────────────

    // ── 1. إشعارات الطلبات ───────────────────────

    public static function orderPlaced(Order $order): void
    {
        // أ) إشعار مدير الطلبات بطلب جديد
        $orderManager = Employee::active()
            ->byRole(Employee::ROLE_ORDER_MANAGER)
            ->first();
        if ($orderManager) {
            self::create([
                'sender_type' => self::SENDER_CUSTOMER,
                'sender_id' => $order->customer_id,
                'receiver_type' => self::RECEIVER_EMPLOYEE,
                'receiver_id' => $orderManager->id,
                'type' => self::TYPE_ORDER_UPDATE,
                'title' => "طلب جديد #{$order->id}",
                'message' => "طلب {$order->type_label} جديد بقيمة ".
                                   number_format($order->final_price, 0).' ل.س',
                'data' => [
                    'order_id' => $order->id,
                    'order_type' => $order->type,
                    'customer_name' => $order->customer?->name ?? 'زبون',
                    'final_price' => $order->final_price,
                ],
            ]);
        }

        // ب) إشعار الزبون بتأكيد استلام الطلب
        if ($order->customer_id) {
            self::create([
                'sender_type' => self::SENDER_SYSTEM,
                'sender_id' => null,
                'receiver_type' => self::RECEIVER_CUSTOMER,
                'receiver_id' => $order->customer_id,
                'type' => self::TYPE_ORDER_UPDATE,
                'title' => "تم استلام طلبك #{$order->id} ✅",
                'message' => 'تم استلام طلبك بنجاح وسيتم مراجعته قريباً',
                'data' => [
                    'order_id' => $order->id,
                    'order_type' => $order->type,
                    'final_price' => $order->final_price,
                ],
            ]);
        }
    }

    public static function orderStatusChanged(
        Order $order,
        string $newStatus,
        Employee $changedBy
    ): void {
        if (! $order->customer_id) {
            return;
        }

        $labels = [
            'confirmed' => ['title' => 'تم تأكيد طلبك ✅',        'msg' => "طلبك رقم #{$order->id} قيد التجهيز الآن"],
            'ready' => ['title' => 'طلبك قيد التجهيز',         'msg' => "بدأ تجهيز طلبك رقم #{$order->id}"],
            'cancelled' => ['title' => 'تم إلغاء طلبك ❌',         'msg' => "تم إلغاء طلبك رقم #{$order->id}"],
        ];

        $content = $labels[$newStatus] ?? [
            'title' => "تحديث طلب #{$order->id}",
            'msg' => "تم تحديث حالة طلبك إلى: {$newStatus}",
        ];

        self::create([
            'sender_type' => self::SENDER_EMPLOYEE,
            'sender_id' => $changedBy->id,
            'receiver_type' => self::RECEIVER_CUSTOMER,
            'receiver_id' => $order->customer_id,
            'type' => self::TYPE_ORDER_UPDATE,
            'title' => $content['title'],
            'message' => $content['msg'],
            'data' => [
                'order_id' => $order->id,
                'order_type' => $order->type,
                'new_status' => $newStatus,
                'changed_by' => $changedBy->name,
            ],
        ]);
    }

    // ── 2. إشعارات التوصيل ───────────────────────

    public static function deliveryStatusChanged(
        DeliveryOrder $delivery,
        string $newStatus,
        ?Employee $changedBy = null
    ): void {
        $customerId = $delivery->order?->customer_id;
        if (! $customerId) {
            return;
        }

        $labels = [
            'assigned' => ['title' => 'طلبك في الطريق إليك 🚀',  'msg' => 'طلبك الآن في الطريق مع السائق'],
            'picked_up' => ['title' => 'طلبك في الطريق إليك 🚀',  'msg' => 'طلبك الآن في الطريق مع السائق'],
            'in_delivery' => ['title' => 'طلبك في الطريق إليك 🚀',  'msg' => "الوقت المتوقع للوصول: {$delivery->estimated_delivery_time?->format('H:i')}"],
            'delivered' => ['title' => 'وصل طلبك! 🎉',            'msg' => 'تم توصيل طلبك بنجاح. نتمنى أن ينال إعجابك ⭐'],
            'cancelled' => ['title' => 'تم إلغاء التوصيل ❌',      'msg' => "تم إلغاء توصيل طلب #{$delivery->order_id}"],
        ];

        $content = $labels[$newStatus] ?? [
            'title' => 'تحديث التوصيل',
            'msg' => 'تم تحديث حالة توصيل طلبك',
        ];

        self::create([
            'sender_type' => $changedBy ? self::SENDER_EMPLOYEE : self::SENDER_SYSTEM,
            'sender_id' => $changedBy?->id,
            'receiver_type' => self::RECEIVER_CUSTOMER,
            'receiver_id' => $customerId,
            'type' => self::TYPE_DELIVERY_UPDATE,
            'title' => $content['title'],
            'message' => $content['msg'],
            'data' => [
                'order_id' => $delivery->order_id,
                'delivery_order_id' => $delivery->id,
                'status' => $newStatus,
                'driver_name' => $delivery->driver?->name,
                'driver_phone' => $delivery->driver?->phone,
            ],
        ]);
    }

    // ── 3. إشعارات الحجز ─────────────────────────

    public static function reservationStatusChanged(
        ReservationOrder $reservation,
        string $newStatus,
        ?Employee $changedBy = null
    ): void {
        $customerId = $reservation->order?->customer_id;
        if (! $customerId) {
            return;
        }

        $tableLabel = $reservation->table_type === 'vip' ? 'VIP ✨' : 'عادية';
        $timeFormatted = $reservation->reservation_time?->format('h:i A — d/m/Y');

        $labels = [
            'confirmed' => [
                'title' => 'تم تأكيد حجزك ✅',
                'msg' => "طاولة رقم {$reservation->table_number} ({$tableLabel}) محجوزة لك في {$timeFormatted}",
            ],
            'seated' => [
                'title' => 'أهلاً بك! 🪑',
                'msg' => 'تم تسجيل وصولك. استمتع بتجربتك في TAZA 041',
            ],
            'completed' => [
                'title' => 'انتهت الجلسة 💚',
                'msg' => 'شكراً لزيارتك، ونتمنى أن تكون تجربتك ممتازة. نراك قريباً!',
            ],
            'cancelled' => [
                'title' => 'تم إلغاء حجزك ❌',
                'msg' => "تم إلغاء حجز الطاولة رقم {$reservation->table_number}",
            ],
            'no_show' => [
                'title' => 'انتهى وقت حجزك ⏰',
                'msg' => 'للأسف انتهى وقت الحجز. يسعدنا استقبالك في وقت آخر',
            ],
        ];

        $content = $labels[$newStatus] ?? [
            'title' => 'تحديث الحجز',
            'msg' => 'تم تحديث حالة حجزك',
        ];

        self::create([
            'sender_type' => $changedBy ? self::SENDER_EMPLOYEE : self::SENDER_SYSTEM,
            'sender_id' => $changedBy?->id,
            'receiver_type' => self::RECEIVER_CUSTOMER,
            'receiver_id' => $customerId,
            'type' => self::TYPE_RESERVATION_UPDATE,
            'title' => $content['title'],
            'message' => $content['msg'],
            'data' => [
                'order_id' => $reservation->order_id,
                'reservation_id' => $reservation->id,
                'table_number' => $reservation->table_number,
                'table_type' => $reservation->table_type,
                'reservation_time' => $reservation->reservation_time?->toIso8601String(),
                'status' => $newStatus,
            ],
        ]);
    }

    // ── 4. إشعارات الدفع ─────────────────────────

    public static function paymentCompleted(
        PaymentRecord $payment,
        int $loyaltyPointsEarned = 0
    ): void {
        $customerId = $payment->order?->customer_id;
        if (! $customerId) {
            return;
        }

        $methodLabel = PaymentRecord::METHOD_LABELS[$payment->method] ?? $payment->method;
        $msg = 'تم استلام دفعتك بمبلغ '.
               number_format($payment->amount, 0)." ل.س عبر {$methodLabel}";

        if ($loyaltyPointsEarned > 0) {
            $msg .= " — كسبت {$loyaltyPointsEarned} نقطة ولاء 🎁";
        }

        self::create([
            'sender_type' => self::SENDER_SYSTEM,
            'sender_id' => null,
            'receiver_type' => self::RECEIVER_CUSTOMER,
            'receiver_id' => $customerId,
            'type' => self::TYPE_PAYMENT_UPDATE,
            'title' => 'تم استلام دفعتك ✅',
            'message' => $msg,
            'data' => [
                'order_id' => $payment->order_id,
                'payment_id' => $payment->id,
                'amount' => $payment->amount,
                'method' => $payment->method,
                'loyalty_points_earned' => $loyaltyPointsEarned,
                'transaction_ref' => $payment->external_ref,
            ],
        ]);
    }

    public static function paymentRefunded(
        PaymentRecord $payment,
        int $loyaltyPointsAdjusted = 0
    ): void {
        $customerId = $payment->order?->customer_id;
        if (! $customerId) {
            return;
        }

        $message = 'تم استرداد دفعة الطلب #'.$payment->order_id;
        if ($loyaltyPointsAdjusted < 0) {
            $message .= ' وسحب '.abs($loyaltyPointsAdjusted).' نقطة كانت مكتسبة منه';
        } elseif ($loyaltyPointsAdjusted > 0) {
            $message .= ' وإعادة '.$loyaltyPointsAdjusted.' نقطة مستخدمة إلى رصيدك';
        }

        self::create([
            'sender_type' => self::SENDER_SYSTEM,
            'sender_id' => null,
            'receiver_type' => self::RECEIVER_CUSTOMER,
            'receiver_id' => $customerId,
            'type' => self::TYPE_PAYMENT_UPDATE,
            'title' => 'تم استرداد الدفعة',
            'message' => $message,
            'data' => [
                'order_id' => $payment->order_id,
                'payment_id' => $payment->id,
                'amount' => $payment->amount,
                'method' => $payment->method,
                'status' => PaymentRecord::STATUS_REFUNDED,
                'loyalty_points_adjusted' => $loyaltyPointsAdjusted,
            ],
        ]);
    }

    // ── 5. إشعار عرض جديد لكل الزبائن ───────────

    public static function broadcastNewOffer(Offer $offer, Employee $addedBy): int
    {
        $alreadyNotifiedCustomerIds = self::query()
            ->where('receiver_type', self::RECEIVER_CUSTOMER)
            ->where('type', self::TYPE_NEW_OFFER)
            ->get(['receiver_id', 'data'])
            ->filter(fn (self $notification) => (int) ($notification->data['offer_id'] ?? 0) === $offer->id)
            ->pluck('receiver_id')
            ->unique();

        $customers = Customer::registered()
            ->active()
            ->whereNotIn('id', $alreadyNotifiedCustomerIds)
            ->get(['id']);

        foreach ($customers->chunk(100) as $chunk) {
            $rows = $chunk->map(fn ($c) => [
                'sender_type' => self::SENDER_EMPLOYEE,
                'sender_id' => $addedBy->id,
                'receiver_type' => self::RECEIVER_CUSTOMER,
                'receiver_id' => $c->id,
                'type' => self::TYPE_NEW_OFFER,
                'title' => 'عرض جديد! 🎯',
                'message' => "{$offer->name} — وفر ".
                                   number_format($offer->getDiscountAmount(), 0).' ل.س',
                'data' => json_encode([
                    'offer_id' => $offer->id,
                    'offer_name' => $offer->name,
                    'offer_price' => $offer->offer_price,
                    'original_price' => $offer->original_price,
                    'discount_percentage' => $offer->getDiscountPercentage(),
                    'image_url' => $offer->image_path
                                                ? asset('storage/'.$offer->image_path)
                                                : null,
                    'end_date' => $offer->end_date?->format('Y-m-d'),
                ]),
                'deduplication_key' => "offer:{$offer->id}:customer:{$c->id}",
                'status' => self::STATUS_SENT,
                'read_at' => null,
                'created_at' => now(),
                'updated_at' => now(),
            ])->toArray();

            // Bulk insert لأداء أفضل
            self::query()->insertOrIgnore($rows);
        }

        return $customers->count();
    }

    // ── 6. إشعار المدير العام ← موظف ────────────

    public static function broadcastNewProduct(Product $product, Employee $addedBy): int
    {
        $customers = Customer::registered()->active()->get(['id']);
        $itemLabel = match ($product->category) {
            Product::CATEGORY_DRINK => 'مشروب',
            Product::CATEGORY_SANDWICH => 'ساندويش',
            default => 'وجبة',
        };

        foreach ($customers->chunk(100) as $chunk) {
            $rows = $chunk->map(fn ($customer) => [
                'sender_type' => self::SENDER_EMPLOYEE,
                'sender_id' => $addedBy->id,
                'receiver_type' => self::RECEIVER_CUSTOMER,
                'receiver_id' => $customer->id,
                'type' => self::TYPE_NEW_PRODUCT,
                'title' => "{$itemLabel} جديد! 🍽️",
                'message' => "أضفنا {$product->name} إلى المنيو بسعر ".
                    number_format($product->price, 0).' ل.س',
                'data' => json_encode([
                    'product_id' => $product->id,
                    'product_name' => $product->name,
                    'price' => $product->price,
                    'category' => $product->category,
                    'image_url' => $product->image_path
                        ? asset('storage/'.$product->image_path)
                        : null,
                ]),
                'deduplication_key' => "product:{$product->id}:customer:{$customer->id}",
                'status' => self::STATUS_SENT,
                'read_at' => null,
                'created_at' => now(),
                'updated_at' => now(),
            ])->toArray();

            self::query()->insertOrIgnore($rows);
        }

        return $customers->count();
    }

    public static function managerToEmployee(
        Employee $from,
        Employee $to,
        string $title,
        string $message,
        array $extraData = []
    ): self {
        return self::create([
            'sender_type' => self::SENDER_EMPLOYEE,
            'sender_id' => $from->id,
            'receiver_type' => self::RECEIVER_EMPLOYEE,
            'receiver_id' => $to->id,
            'type' => self::TYPE_MANAGER_NOTIF,
            'title' => $title,
            'message' => $message,
            'data' => array_merge([
                'from_role' => $from->role,
                'from_name' => $from->name,
            ], $extraData),
        ]);
    }

    // ── 7. إشعار تعديل بيانات الموظف ────────────

    public static function employeeProfileUpdated(
        Employee $employee,
        Employee $updatedBy,
        array $changes
    ): void {
        self::create([
            'sender_type' => self::SENDER_EMPLOYEE,
            'sender_id' => $updatedBy->id,
            'receiver_type' => self::RECEIVER_EMPLOYEE,
            'receiver_id' => $employee->id,
            'type' => self::TYPE_MANAGER_NOTIF,
            'title' => 'تم تحديث بيانات حسابك 🔔',
            'message' => 'قام المدير العام بتحديث بيانات حسابك. راجع معلوماتك.',
            'data' => [
                'updated_by' => $updatedBy->name,
                'changes' => $changes,
            ],
        ]);
    }

    // ── 8. إشعار طرد موظف ────────────────────────

    public static function employeeFired(
        Employee $employee,
        Employee $firedBy,
        string $reason
    ): void {
        self::create([
            'sender_type' => self::SENDER_EMPLOYEE,
            'sender_id' => $firedBy->id,
            'receiver_type' => self::RECEIVER_EMPLOYEE,
            'receiver_id' => $employee->id,
            'type' => self::TYPE_SYSTEM_ANNOUNCEMENT,
            'title' => 'إشعار إنهاء الخدمة',
            'message' => "تم إنهاء خدمتك في مطعم TAZA 041. السبب: {$reason}",
            'data' => [
                'fired_by' => $firedBy->name,
                'reason' => $reason,
                'date' => now()->format('Y-m-d'),
            ],
        ]);
    }

    // ── 9. إشعار نقاط الولاء ─────────────────────

    public static function loyaltyPointsEarned(
        int $customerId,
        int $points,
        int $orderId
    ): void {
        self::create([
            'sender_type' => self::SENDER_SYSTEM,
            'sender_id' => null,
            'receiver_type' => self::RECEIVER_CUSTOMER,
            'receiver_id' => $customerId,
            'type' => self::TYPE_LOYALTY_UPGRADE,
            'title' => "كسبت {$points} نقطة ولاء 🎁",
            'message' => "تم إضافة {$points} نقطة لحساب ولائك من طلب #{$orderId}",
            'data' => [
                'points' => $points,
                'order_id' => $orderId,
            ],
        ]);
    }

    // ── 10. إشعار تنبيه مخزون ────────────────────

    public static function stockAlert(
        Product $product,
        Employee $inventoryManager
    ): self {
        $isOutOfStock = $product->stock_quantity <= 0;
        $payload = [
            'sender_type' => self::SENDER_SYSTEM,
            'sender_id' => null,
            'receiver_type' => self::RECEIVER_EMPLOYEE,
            'receiver_id' => $inventoryManager->id,
            'type' => self::TYPE_STOCK_ALERT,
            'title' => $isOutOfStock ? '⛔ نفد المنتج من المخزون' : '⚠️ تنبيه مخزون منخفض',
            'message' => $isOutOfStock
                ? "نفدت كمية منتج «{$product->name}» ويحتاج إلى إعادة تعبئة فورية"
                : "كمية منتج «{$product->name}» وصلت إلى {$product->stock_quantity} وحدة",
            'data' => [
                'product_id' => $product->id,
                'product_name' => $product->name,
                'stock' => $product->stock_quantity,
                'category' => $product->category,
                'severity' => $isOutOfStock ? 'critical' : 'warning',
            ],
            'status' => self::STATUS_SENT,
            'read_at' => null,
        ];

        // حدّث التنبيه غير المقروء لنفس المنتج بدلاً من إغراق المدير بتنبيهات مكررة.
        $existing = self::stockAlertsForProduct($product, $inventoryManager)->first();
        if ($existing) {
            $existing->update($payload);

            return $existing->fresh();
        }

        return self::create($payload);
    }

    public static function customerReportedUnavailable(Product $product, Customer $customer): ?self
    {
        $inventoryManager = Employee::active()
            ->byRole(Employee::ROLE_INVENTORY_MANAGER)
            ->first();

        if (! $inventoryManager) {
            return null;
        }

        $existing = self::stockAlertsForProduct($product, $inventoryManager)->first();
        $previousData = $existing?->data ?? [];
        $reportCount = max(0, (int) ($previousData['customer_reports_count'] ?? 0)) + 1;
        $payload = [
            'sender_type' => self::SENDER_CUSTOMER,
            'sender_id' => $customer->id,
            'receiver_type' => self::RECEIVER_EMPLOYEE,
            'receiver_id' => $inventoryManager->id,
            'type' => self::TYPE_STOCK_ALERT,
            'title' => '📣 بلاغ زبون: وجبة غير متوفرة',
            'message' => "أبلغ {$customer->name} أن «{$product->name}» غير متوفرة ويرجى مراجعة المخزون",
            'data' => [
                'product_id' => $product->id,
                'product_name' => $product->name,
                'stock' => $product->stock_quantity,
                'category' => $product->category,
                'severity' => 'critical',
                'source' => 'customer_report',
                'reported_by_customer_id' => $customer->id,
                'reported_by_customer_name' => $customer->name,
                'customer_reports_count' => $reportCount,
                'last_reported_at' => now()->toIso8601String(),
            ],
            'status' => self::STATUS_SENT,
            'read_at' => null,
        ];

        if ($existing) {
            $existing->update($payload);

            return $existing->fresh();
        }

        return self::create($payload);
    }

    public static function resolveStockAlert(
        Product $product,
        Employee $inventoryManager
    ): void {
        self::stockAlertsForProduct($product, $inventoryManager)
            ->each(fn (self $notification) => $notification->markAsRead());
    }

    private static function stockAlertsForProduct(
        Product $product,
        Employee $inventoryManager
    ) {
        return self::forEmployee($inventoryManager->id)
            ->byType(self::TYPE_STOCK_ALERT)
            ->unread()
            ->latest()
            ->get()
            ->filter(function (self $notification) use ($product) {
                $data = $notification->data;
                if (is_string($data)) {
                    $data = json_decode($data, true) ?: [];
                }

                return (int) ($data['product_id'] ?? 0) === $product->id;
            });
    }

    // ── 11. إرسال إشعار للمدير العام (من موظف) ──

    public static function employeeToGeneralManager(
        Employee $from,
        string $title,
        string $message,
        array $data = []
    ): void {
        $gm = Employee::active()
            ->byRole(Employee::ROLE_GENERAL_MANAGER)
            ->first();
        if (! $gm) {
            return;
        }

        self::create([
            'sender_type' => self::SENDER_EMPLOYEE,
            'sender_id' => $from->id,
            'receiver_type' => self::RECEIVER_EMPLOYEE,
            'receiver_id' => $gm->id,
            'type' => self::TYPE_MANAGER_NOTIF,
            'title' => $title,
            'message' => $message,
            'data' => array_merge([
                'from_name' => $from->name,
                'from_role' => $from->getRoleLabel(),
            ], $data),
        ]);
    }

    // ─────────────────────────────────────────────
    // عدد الإشعارات غير المقروءة
    // ─────────────────────────────────────────────
    public static function unreadCountForCustomer(int $customerId): int
    {
        return self::forCustomer($customerId)->unread()->count();
    }

    public static function unreadCountForEmployee(int $employeeId): int
    {
        return self::forEmployee($employeeId)->unread()->count();
    }

    // تعيين كل الإشعارات مقروءة
    public static function markAllReadForCustomer(int $customerId): void
    {
        self::forCustomer($customerId)
            ->unread()
            ->update([
                'status' => self::STATUS_READ,
                'read_at' => now(),
            ]);
    }

    public static function markAllReadForEmployee(int $employeeId): void
    {
        self::forEmployee($employeeId)
            ->unread()
            ->update([
                'status' => self::STATUS_READ,
                'read_at' => now(),
            ]);
    }

    // ─────────────────────────────────────────────
    // تفاصيل الإشعار للواجهة
    // ─────────────────────────────────────────────
    public function getDetails(): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'icon' => self::TYPE_ICONS[$this->type] ?? '🔔',
            'title' => $this->title,
            'message' => $this->message,
            'data' => $this->data,
            'status' => $this->status,
            'is_read' => $this->status === self::STATUS_READ,
            'read_at' => $this->read_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            'created_at_human' => $this->created_at?->diffForHumans(),
            'created_at_full' => $this->created_at?->toIso8601String(),
        ];
    }
}
