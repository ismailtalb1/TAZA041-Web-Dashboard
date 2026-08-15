<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class Order extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'orders';

    protected $fillable = [
        'customer_id',
        'type',
        'status',
        'total_price',
        'discount',
        'final_price',
        'notes',
        'archived_at',
        'archived_by',
    ];

    protected $casts = [
        'total_price' => 'float',
        'discount' => 'float',
        'final_price' => 'float',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
        'archived_at' => 'datetime',
    ];

    // ─────────────────────────────────────────────
    // الثوابت — أنواع الطلبات
    // ─────────────────────────────────────────────
    const TYPE_NORMAL = 'normal';

    const TYPE_DELIVERY = 'delivery';

    const TYPE_RESERVATION = 'reservation';

    // ─────────────────────────────────────────────
    // الثوابت — حالات الطلب
    // ─────────────────────────────────────────────

    // مشتركة بين الأنواع الثلاثة
    const STATUS_PENDING = 'pending';    // معلق — بانتظار التأكيد

    const STATUS_CONFIRMED = 'confirmed';  // مؤكد — يجهَّز في المطعم

    const STATUS_CANCELLED = 'cancelled';  // ملغى — من الزبون فقط

    const STATUS_COMPLETED = 'completed';

    // خاصة بالطلب العادي
    const STATUS_READY = 'ready';      // قيد التجهيز

    // خاصة بطلب التوصيل (تُدار في delivery_orders)
    // in_delivery و delivered موجودة في DeliveryOrder

    // خاصة بطلب الحجز (تُدار في reservation_orders)
    // seated و completed موجودة في ReservationOrder

    // ─────────────────────────────────────────────
    // تدفق الحالات المسموح به لكل نوع ودور
    // ─────────────────────────────────────────────
    // المفتاح: role → [from_status => [to_statuses]]
    const STATUS_FLOW = [

        // الطلب العادي: الزبون يستطيع الإلغاء فقط وهو معلق؛ بعد التأكيد القرار بيد مدير الطلبات
        self::TYPE_NORMAL => [
            'order_manager' => [
                self::STATUS_PENDING => [self::STATUS_CONFIRMED, self::STATUS_CANCELLED],
                self::STATUS_CONFIRMED => [self::STATUS_READY, self::STATUS_CANCELLED],
                self::STATUS_READY => [self::STATUS_COMPLETED, self::STATUS_CANCELLED],
            ],
            'customer' => [
                self::STATUS_PENDING => [self::STATUS_CANCELLED],
            ],
        ],

        // طلب التوصيل: ينهي مدير الطلبات مرحلة المطعم، ثم يظهر لدى مدير التوصيل للتعيين
        self::TYPE_DELIVERY => [
            'order_manager' => [
                self::STATUS_PENDING => [self::STATUS_CONFIRMED, self::STATUS_CANCELLED],
                self::STATUS_CONFIRMED => [self::STATUS_READY, self::STATUS_CANCELLED],
                self::STATUS_READY => [self::STATUS_COMPLETED, self::STATUS_CANCELLED],
            ],
            'customer' => [
                self::STATUS_PENDING => [self::STATUS_CANCELLED],
            ],
        ],

        // طلب الحجز: يمر بمرحلة تجهيز الطلب ثم ينتقل لإجلاس الزبون ضمن reservation_orders
        self::TYPE_RESERVATION => [
            'order_manager' => [
                self::STATUS_PENDING => [self::STATUS_CONFIRMED, self::STATUS_CANCELLED],
                self::STATUS_CONFIRMED => [self::STATUS_READY, self::STATUS_CANCELLED],
                self::STATUS_READY => [self::STATUS_COMPLETED, self::STATUS_CANCELLED],
            ],
            'customer' => [
                self::STATUS_PENDING => [self::STATUS_CANCELLED],
            ],
        ],
    ];

    // ─────────────────────────────────────────────
    // العلاقات
    // ─────────────────────────────────────────────
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function archivedBy(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'archived_by');
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    public function paymentRecord(): HasOne
    {
        return $this->hasOne(PaymentRecord::class);
    }

    // ملحق التوصيل (موجود فقط إذا type = delivery)
    public function deliveryOrder(): HasOne
    {
        return $this->hasOne(DeliveryOrder::class);
    }

    // ملحق الحجز (موجود فقط إذا type = reservation)
    public function reservationOrder(): HasOne
    {
        return $this->hasOne(ReservationOrder::class);
    }

    // ─────────────────────────────────────────────
    // Scopes
    // ─────────────────────────────────────────────
    public function scopeNormal($query)
    {
        return $query->where('type', self::TYPE_NORMAL);
    }

    public function scopeDelivery($query)
    {
        return $query->where('type', self::TYPE_DELIVERY);
    }

    public function scopeReservation($query)
    {
        return $query->where('type', self::TYPE_RESERVATION);
    }

    public function scopePending($query)
    {
        return $query->where('status', self::STATUS_PENDING);
    }

    public function scopeActive($query)
    {
        return $query->whereNotIn('status', [
            self::STATUS_CANCELLED,
        ]);
    }

    // طلبات مدير الطلبات (عادي + توصيل مرحلة التجهيز + حجز)
    public function scopeForOrderManager($query)
    {
        return $query->where(function ($q) {
            // الطلبات العادية كلها
            $q->where('type', self::TYPE_NORMAL)
            // طلبات التوصيل قبل مرحلة التسليم
                ->orWhere(function ($q2) {
                    $q2->where('type', self::TYPE_DELIVERY)
                        ->whereIn('status', [
                            self::STATUS_PENDING,
                            self::STATUS_CONFIRMED,
                            self::STATUS_READY,
                        ]);
                })
            // طلبات الحجز كلها
                ->orWhere('type', self::TYPE_RESERVATION);
        });
    }

    // ─────────────────────────────────────────────
    // التوابع
    // ─────────────────────────────────────────────

    // هل يمكن لهذا الدور تغيير الحالة؟
    public function canChangeStatus(string $role, string $newStatus): bool
    {
        $flow = self::STATUS_FLOW[$this->type][$role] ?? [];
        $allowed = $flow[$this->status] ?? [];

        return in_array($newStatus, $allowed);
    }

    public function isOperationallyClosed(): bool
    {
        if ($this->status === self::STATUS_CANCELLED) {
            return true;
        }

        if ($this->type === self::TYPE_DELIVERY) {
            return in_array($this->deliveryOrder?->status, [
                DeliveryOrder::STATUS_DELIVERED,
                DeliveryOrder::STATUS_CANCELLED,
            ], true);
        }

        if ($this->type === self::TYPE_RESERVATION) {
            return in_array($this->reservationOrder?->status, [
                ReservationOrder::STATUS_COMPLETED,
                ReservationOrder::STATUS_CANCELLED,
                ReservationOrder::STATUS_NO_SHOW,
            ], true);
        }

        return $this->status === self::STATUS_COMPLETED;
    }

    // تغيير حالة الطلب مع التحقق من الصلاحية
    public function changeStatus(string $newStatus, string $actorRole): bool
    {
        if (! $this->canChangeStatus($actorRole, $newStatus)) {
            return false;
        }

        $this->status = $newStatus;
        $this->save();

        // إشعار الزبون بتغيير الحالة
        $this->notifyCustomer($newStatus);

        // إذا طلب توصيل واكتملت مرحلة المطعم → أعلم مدير التوصيل
        if ($this->type === self::TYPE_DELIVERY
            && $newStatus === self::STATUS_COMPLETED) {
            $this->notifyDeliveryManager();
        }

        // مزامنة حالة طلب الحجز الرئيسي مع ملحق الحجز
        if ($this->type === self::TYPE_RESERVATION && $this->reservationOrder) {
            if ($newStatus === self::STATUS_CONFIRMED
                && $this->reservationOrder->status === ReservationOrder::STATUS_PENDING) {
                $this->reservationOrder->changeStatus(ReservationOrder::STATUS_CONFIRMED, $actorRole);
            }

            // انتهاء تجهيز طلب الحجز لا يعني أن الزبون جلس فعلياً.
            // تبقى مرحلة «الجلسة قائمة» إجراءً مستقلاً من مدير الطلبات.
        }

        return true;
    }

    // حساب السعر الكلي من العناصر
    public function calculateTotal(): float
    {
        return (float) $this->items()->sum('subtotal');
    }

    // تحديث الأسعار بعد إضافة/حذف عنصر
    public function syncPrices(): void
    {
        $total = $this->calculateTotal();
        $this->total_price = $total;
        $this->final_price = $total - $this->discount;
        $this->save();
    }

    public function releaseCancellationResources(
        string $actorType = 'system',
        ?int $actorId = null,
        ?string $reason = null,
    ): array {
        $this->loadMissing(['items', 'paymentRecord', 'deliveryOrder', 'reservationOrder']);

        $restoredStockUnits = 0;
        foreach ($this->items as $item) {
            if ($item->item_type === OrderItem::TYPE_PRODUCT) {
                Product::find($item->reference_id)?->increaseStock($item->quantity);
                $restoredStockUnits += (int) $item->quantity;
            }
        }

        $refund = $this->cancellationRefundSummary();
        if ($this->paymentRecord
            && ! in_array($this->paymentRecord->status, [
                PaymentRecord::STATUS_FAILED,
                PaymentRecord::STATUS_REFUNDED,
            ], true)) {
            $refund = $this->paymentRecord->refund($actorType, $actorId, $reason);
            if (! $refund['success']) {
                throw new \RuntimeException($refund['message']);
            }
        }

        $this->deliveryOrder?->update(['status' => DeliveryOrder::STATUS_CANCELLED]);
        $this->reservationOrder?->update(['status' => ReservationOrder::STATUS_CANCELLED]);

        return array_merge($refund, [
            'stock_units_restored' => $restoredStockUnits,
        ]);
    }

    public function cancellationRefundSummary(bool $alreadyCancelled = false): array
    {
        $this->loadMissing('paymentRecord');
        $payment = $this->paymentRecord;

        if (! $payment) {
            return [
                'success' => true,
                'kind' => 'no_payment',
                'message' => 'لا توجد دفعة مرتبطة بالطلب',
                'already_refunded' => $alreadyCancelled,
                'money_refunded' => 0.0,
                'loyalty_points_restored' => 0,
                'loyalty_points_reversed' => 0,
            ];
        }

        return $payment->refundSummary($alreadyCancelled);
    }

    public function notifyCancellation(): void
    {
        $this->notifyCustomer(self::STATUS_CANCELLED);
    }

    // إشعار الزبون بتغيير حالة طلبه
    private function notifyCustomer(string $newStatus): void
    {
        if (! $this->customer_id) {
            return;
        }

        $messages = [
            self::STATUS_CONFIRMED => 'تم تأكيد طلبك',
            self::STATUS_READY => 'طلبك قيد التجهيز الآن',
            self::STATUS_COMPLETED => $this->type === self::TYPE_DELIVERY
                ? 'اكتمل تجهيز طلبك وسيتم تحويله للتوصيل'
                : 'تم اكتمال طلبك',
            self::STATUS_CANCELLED => 'تم إلغاء طلبك',
        ];

        $message = $messages[$newStatus] ?? "تم تحديث حالة طلبك إلى: {$newStatus}";

        Notification::create([
            'sender_type' => 'system',
            'sender_id' => null,
            'receiver_type' => 'customer',
            'receiver_id' => $this->customer_id,
            'type' => 'order_update',
            'title' => "تحديث طلب #{$this->id}",
            'message' => $message,
            'data' => json_encode([
                'order_id' => $this->id,
                'order_type' => $this->type,
                'new_status' => $newStatus,
            ]),
        ]);
    }

    // إشعار مدير التوصيل عند اكتمال تجهيز طلب التوصيل
    private function notifyDeliveryManager(): void
    {
        $manager = Employee::active()
            ->byRole(Employee::ROLE_DELIVERY_MANAGER)
            ->first();
        if (! $manager) {
            return;
        }

        Notification::create([
            'sender_type' => 'system',
            'sender_id' => null,
            'receiver_type' => 'employee',
            'receiver_id' => $manager->id,
            'type' => 'delivery_update',
            'title' => "طلب توصيل جاهز للتعيين #{$this->id}",
            'message' => "اكتمل تجهيز الطلب #{$this->id} ويمكن الآن تعيين سائق له",
            'data' => json_encode([
                'order_id' => $this->id,
                'delivery_order' => $this->deliveryOrder?->id,
            ]),
        ]);
    }

    // إضافة نقاط ولاء للزبون بعد إتمام الدفع
    public function awardLoyaltyPoints(): void
    {
        if (! $this->customer_id) {
            return;
        }

        $this->loadMissing('paymentRecord');
        $completedCashPayment = false;

        // الدفع النقدي لا يصبح مستلماً فعلياً إلا عند اكتمال الخدمة.
        if ($this->paymentRecord
            && $this->paymentRecord->method === PaymentRecord::METHOD_CASH
            && $this->paymentRecord->status === PaymentRecord::STATUS_PENDING) {
            $this->paymentRecord->update(['status' => PaymentRecord::STATUS_COMPLETED]);
            $completedCashPayment = true;
        }

        if (LoyaltyTransaction::where('order_id', $this->id)
            ->where('type', LoyaltyTransaction::TYPE_EARNING)
            ->exists()) {
            if ($completedCashPayment) {
                Notification::paymentCompleted($this->paymentRecord->fresh());
            }

            return;
        }

        // لا تُمنح نقاط جديدة عند الدفع بنقاط الولاء؛ هذه العملية يجب أن تخصم الرصيد فقط.
        if (! $this->paymentRecord || $this->paymentRecord->method === PaymentRecord::METHOD_LOYALTY_POINTS) {
            return;
        }

        $loyalty = LoyaltyAccount::firstOrCreate(
            ['customer_id' => $this->customer_id],
            [
                'points_balance' => 0,
                'tier' => LoyaltyAccount::TIER_BRONZE,
                'total_points_earned' => 0,
                'total_points_redeemed' => 0,
            ]
        );

        $points = LoyaltyAccount::calculatePointsFromAmount($this->final_price, $loyalty->tier);

        if ($points <= 0) {
            if ($completedCashPayment) {
                Notification::paymentCompleted($this->paymentRecord->fresh());
            }

            return;
        }

        $loyalty->addPoints($points, 'Order Payment');

        LoyaltyTransaction::create([
            'loyalty_account_id' => $loyalty->id,
            'order_id' => $this->id,
            'points' => $points,
            'type' => 'earning',
            'description' => "نقاط طلب #{$this->id}",
        ]);

        if ($completedCashPayment) {
            Notification::paymentCompleted($this->paymentRecord->fresh(), $points);
        }

    }

    // تفاصيل الطلب الكاملة
    public function getDetails(): array
    {
        $canRateMeals = $this->type === self::TYPE_DELIVERY
            ? $this->deliveryOrder?->status === DeliveryOrder::STATUS_DELIVERED
            : $this->status === self::STATUS_COMPLETED;

        $productReviewMap = collect();
        if ($this->customer_id) {
            $productIds = $this->items
                ->where('item_type', OrderItem::TYPE_PRODUCT)
                ->pluck('reference_id')
                ->unique()
                ->values();

            if ($productIds->isNotEmpty()) {
                $productReviewMap = Review::where('reviewer_type', Review::REVIEWER_CUSTOMER)
                    ->where('reviewer_id', $this->customer_id)
                    ->where('reviewable_type', Review::REVIEWABLE_PRODUCT)
                    ->whereIn('reviewable_id', $productIds)
                    ->latest()
                    ->get()
                    ->unique('reviewable_id')
                    ->keyBy('reviewable_id');
            }
        }

        $items = $this->items->map(function ($item) use ($canRateMeals, $productReviewMap) {
            $details = $item->getDetails();
            if ($item->item_type === OrderItem::TYPE_PRODUCT) {
                $review = $productReviewMap->get($item->reference_id);
                $details['meal_review'] = $review ? $review->getDetails() : null;
                $details['can_rate_meal'] = $canRateMeals && ! $review;
            } else {
                $details['meal_review'] = null;
                $details['can_rate_meal'] = false;
            }

            return $details;
        })->values();

        $base = [
            'id' => $this->id,
            'type' => $this->type,
            'type_label' => match ($this->type) {
                self::TYPE_NORMAL => 'طلب عادي',
                self::TYPE_DELIVERY => 'طلب توصيل',
                self::TYPE_RESERVATION => 'حجز طاولة',
                default => $this->type,
            },
            'status' => $this->status,
            'status_label' => $this->getStatusLabel(),
            'customer_status' => $this->getCustomerStatusDetails(),
            'total_price' => $this->total_price,
            'discount' => $this->discount,
            'final_price' => $this->final_price,
            'final_price_formatted' => number_format($this->final_price, 0).' ل.س',
            'notes' => $this->notes,
            'archived_at' => $this->archived_at?->toIso8601String(),
            'is_archived' => ! is_null($this->archived_at),
            'can_manage_record' => $this->isOperationallyClosed(),
            'customer' => $this->customer
                                     ? [
                                         'id' => $this->customer->id,
                                         'name' => $this->customer->name,
                                         'phone' => $this->customer->phone,
                                     ]
                                     : null,
            'items' => $items,
            'can_rate_meals' => $canRateMeals,
            'payment' => $this->paymentRecord
                                     ? [
                                         'method' => $this->paymentRecord->method,
                                         'status' => $this->paymentRecord->status,
                                         'amount' => $this->paymentRecord->amount,
                                     ]
                                     : null,
            'created_at' => $this->created_at?->toIso8601String(),
        ];

        // إضافة تفاصيل التوصيل
        if ($this->type === self::TYPE_DELIVERY && $this->deliveryOrder) {
            $base['delivery'] = $this->deliveryOrder->getDetails();
        }

        // إضافة تفاصيل الحجز
        if ($this->type === self::TYPE_RESERVATION && $this->reservationOrder) {
            $base['reservation'] = $this->reservationOrder->getDetails();
        }

        return $base;
    }

    // اسم الحالة بالعربي
    public function getStatusLabel(): string
    {
        return match ($this->status) {
            self::STATUS_PENDING => 'معلق',
            self::STATUS_CONFIRMED => 'مؤكد',
            self::STATUS_READY => 'قيد التجهيز',
            self::STATUS_COMPLETED => 'مكتمل',
            self::STATUS_CANCELLED => 'ملغى',
            default => $this->status,
        };
    }

    /**
     * A unified customer-facing status contract for all order types.
     */
    public function getCustomerStatusDetails(): array
    {
        $baseSteps = [
            ['key' => self::STATUS_PENDING, 'label_ar' => 'معلق', 'label_en' => 'Pending'],
            ['key' => self::STATUS_CONFIRMED, 'label_ar' => 'مؤكد', 'label_en' => 'Confirmed'],
            ['key' => self::STATUS_READY, 'label_ar' => 'قيد التجهيز', 'label_en' => 'Preparing'],
            ['key' => self::STATUS_COMPLETED, 'label_ar' => 'جاهز', 'label_en' => 'Ready'],
        ];
        $baseIndex = array_search($this->status, array_column($baseSteps, 'key'), true);
        $baseIndex = $baseIndex === false ? 0 : $baseIndex;
        $key = $this->status;
        $index = $baseIndex;
        $steps = $baseSteps;
        $cancelled = $this->status === self::STATUS_CANCELLED;
        $terminal = in_array($this->status, [self::STATUS_COMPLETED, self::STATUS_CANCELLED], true);

        if ($this->type === self::TYPE_NORMAL) {
            $steps[3] = ['key' => self::STATUS_COMPLETED, 'label_ar' => 'مكتمل', 'label_en' => 'Completed'];
        }

        if ($this->type === self::TYPE_DELIVERY) {
            $steps = [
                ...$baseSteps,
                ['key' => 'awaiting_driver', 'label_ar' => 'بانتظار سائق', 'label_en' => 'Awaiting driver'],
                ['key' => 'assigned', 'label_ar' => 'تم تعيين السائق', 'label_en' => 'Driver assigned'],
                ['key' => 'picked_up', 'label_ar' => 'استلم السائق الطلب', 'label_en' => 'Picked up'],
                ['key' => 'in_delivery', 'label_ar' => 'في الطريق', 'label_en' => 'On the way'],
                ['key' => 'delivered', 'label_ar' => 'تم التسليم', 'label_en' => 'Delivered'],
            ];
            if ($this->status === self::STATUS_COMPLETED && $this->deliveryOrder) {
                $deliveryStatus = $this->deliveryOrder->status;
                $key = $deliveryStatus === DeliveryOrder::STATUS_PENDING ? 'awaiting_driver' : $deliveryStatus;
                $deliveryIndex = array_search($key, array_column($steps, 'key'), true);
                $index = $deliveryIndex === false ? 4 : $deliveryIndex;
                $terminal = $deliveryStatus === DeliveryOrder::STATUS_DELIVERED;
                $cancelled = $deliveryStatus === DeliveryOrder::STATUS_CANCELLED;
            }
        }

        if ($this->type === self::TYPE_RESERVATION) {
            $steps = [
                ...$baseSteps,
                ['key' => 'seated', 'label_ar' => 'الجلسة قائمة', 'label_en' => 'Session active'],
                ['key' => 'reservation_completed', 'label_ar' => 'الطاولة جاهزة', 'label_en' => 'Table ready'],
            ];
            $reservationStatus = $this->reservationOrder?->status;
            if ($this->status === self::STATUS_COMPLETED && $reservationStatus) {
                if ($reservationStatus === ReservationOrder::STATUS_SEATED) {
                    $key = 'seated';
                    $index = 4;
                    $terminal = false;
                } elseif ($reservationStatus === ReservationOrder::STATUS_COMPLETED) {
                    $key = 'reservation_completed';
                    $index = 5;
                    $terminal = true;
                } elseif ($reservationStatus === ReservationOrder::STATUS_NO_SHOW) {
                    $key = 'no_show';
                    $index = 3;
                    $terminal = true;
                }
            }
            if ($reservationStatus === ReservationOrder::STATUS_CANCELLED) {
                $key = 'cancelled';
                $cancelled = true;
                $terminal = true;
            }
        }

        $labels = [
            'awaiting_driver' => ['بانتظار سائق', 'Awaiting driver'],
            'assigned' => ['تم تعيين السائق', 'Driver assigned'],
            'picked_up' => ['استلم السائق الطلب', 'Picked up by driver'],
            'in_delivery' => ['في الطريق', 'On the way'],
            'delivered' => ['تم التسليم', 'Delivered'],
            'seated' => ['الجلسة قائمة', 'Session active'],
            'reservation_completed' => ['الطاولة جاهزة', 'Table ready'],
            'no_show' => ['لم يحضر', 'No show'],
            'cancelled' => ['ملغى', 'Cancelled'],
        ];
        $step = collect($steps)->firstWhere('key', $key);
        $label = $labels[$key] ?? [$step['label_ar'] ?? $this->getStatusLabel(), $step['label_en'] ?? ucfirst($key)];

        return [
            'key' => $key,
            'label_ar' => $label[0],
            'label_en' => $label[1],
            'current_index' => $index,
            'is_cancelled' => $cancelled,
            'is_terminal' => $terminal,
            'steps' => $steps,
        ];
    }

    public function getTypeLabelAttribute(): string
    {
        return match ($this->type) {
            self::TYPE_NORMAL => 'طلب عادي',
            self::TYPE_DELIVERY => 'طلب توصيل',
            self::TYPE_RESERVATION => 'حجز طاولة',
            default => $this->type,
        };
    }
}
