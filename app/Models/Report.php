<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Report extends Model
{
    use HasFactory;

    // ✅ مطابق لقاعدة البيانات
    protected $table = 'reports';

    protected $fillable = [
        'title',
        'description',
        'content',
        'sender_id',
        'receiver_id',
        'report_type',
        'status',
        'reviewed_at',
    ];

    protected $casts = [
        'reviewed_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // ─────────────────────────────────────────────
    // الثوابت — أنواع التقرير
    // مطابقة لـ ENUM في قاعدة البيانات
    // ─────────────────────────────────────────────
    const TYPE_ORDER = 'order';

    const TYPE_DELIVERY = 'delivery';

    const TYPE_FINANCIAL = 'financial';

    const TYPE_INVENTORY = 'inventory';

    const TYPE_COMMUNICATION = 'communication';

    const TYPE_GENERAL = 'general';

    const TYPE_AI_GENERATED = 'ai_generated';

    // من يرسل لمن — القواعد المسموحة
    // [sender_role => [receiver_role, ...]]
    const ALLOWED_ROUTES = [
        Employee::ROLE_ORDER_MANAGER => [Employee::ROLE_GENERAL_MANAGER],
        Employee::ROLE_DELIVERY_MANAGER => [Employee::ROLE_GENERAL_MANAGER],
        Employee::ROLE_FINANCE_MANAGER => [Employee::ROLE_GENERAL_MANAGER],
        Employee::ROLE_INVENTORY_MANAGER => [Employee::ROLE_GENERAL_MANAGER],
        Employee::ROLE_COMMUNICATION_MANAGER => [Employee::ROLE_GENERAL_MANAGER],
        // AI ترسل لمدير التواصل فقط
        'ai_system' => [Employee::ROLE_COMMUNICATION_MANAGER],
        // مدير التواصل يُحيل تقارير AI للمدير العام
        Employee::ROLE_GENERAL_MANAGER => [
            Employee::ROLE_ORDER_MANAGER,
            Employee::ROLE_DELIVERY_MANAGER,
            Employee::ROLE_FINANCE_MANAGER,
            Employee::ROLE_INVENTORY_MANAGER,
            Employee::ROLE_COMMUNICATION_MANAGER,
        ],
    ];

    // الأنواع المسموحة لكل دور
    const ALLOWED_TYPES_BY_ROLE = [
        Employee::ROLE_ORDER_MANAGER => [self::TYPE_ORDER, self::TYPE_GENERAL],
        Employee::ROLE_DELIVERY_MANAGER => [self::TYPE_DELIVERY, self::TYPE_GENERAL],
        Employee::ROLE_FINANCE_MANAGER => [self::TYPE_FINANCIAL, self::TYPE_GENERAL],
        Employee::ROLE_INVENTORY_MANAGER => [self::TYPE_INVENTORY, self::TYPE_GENERAL],
        Employee::ROLE_COMMUNICATION_MANAGER => [
            self::TYPE_COMMUNICATION,
            self::TYPE_AI_GENERATED,
            self::TYPE_GENERAL,
        ],
        Employee::ROLE_GENERAL_MANAGER => [
            self::TYPE_ORDER, self::TYPE_DELIVERY, self::TYPE_FINANCIAL,
            self::TYPE_INVENTORY, self::TYPE_COMMUNICATION, self::TYPE_GENERAL,
        ],
    ];

    const TYPE_LABELS = [
        self::TYPE_ORDER => '📋 تقرير طلبات',
        self::TYPE_DELIVERY => '🚗 تقرير توصيل',
        self::TYPE_FINANCIAL => '💰 تقرير مالي',
        self::TYPE_INVENTORY => '📦 تقرير مخزون',
        self::TYPE_COMMUNICATION => '📢 تقرير تواصل',
        self::TYPE_GENERAL => '📄 تقرير عام',
        self::TYPE_AI_GENERATED => '🤖 تقرير ذكاء اصطناعي',
    ];

    // ─────────────────────────────────────────────
    // الثوابت — الحالات
    // ─────────────────────────────────────────────
    const STATUS_DRAFT = 'draft';

    const STATUS_SENT = 'sent';

    const STATUS_REVIEWED = 'reviewed';

    const STATUS_ARCHIVED = 'archived';

    const STATUS_LABELS = [
        self::STATUS_DRAFT => 'مسودة',
        self::STATUS_SENT => 'مُرسَل',
        self::STATUS_REVIEWED => 'تمت مراجعته',
        self::STATUS_ARCHIVED => 'مؤرشف',
    ];

    // ─────────────────────────────────────────────
    // العلاقات
    // ─────────────────────────────────────────────
    public function sender(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'sender_id');
    }

    public function receiver(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'receiver_id');
    }

    // ─────────────────────────────────────────────
    // Scopes
    // ─────────────────────────────────────────────
    public function scopeForReceiver($query, int $employeeId)
    {
        return $query->where('receiver_id', $employeeId);
    }

    public function scopeFromSender($query, int $employeeId)
    {
        return $query->where('sender_id', $employeeId);
    }

    public function scopeUnreviewed($query)
    {
        return $query->where('status', self::STATUS_SENT);
    }

    public function scopeByType($query, string $type)
    {
        return $query->where('report_type', $type);
    }

    // ─────────────────────────────────────────────
    // التحقق من صحة مسار الإرسال
    // ─────────────────────────────────────────────
    public static function isRouteAllowed(
        string $senderRole,
        string $receiverRole
    ): bool {
        $allowed = self::ALLOWED_ROUTES[$senderRole] ?? [];

        return in_array($receiverRole, $allowed);
    }

    public static function isTypeAllowed(
        string $senderRole,
        string $reportType
    ): bool {
        $allowed = self::ALLOWED_TYPES_BY_ROLE[$senderRole] ?? [];

        return in_array($reportType, $allowed);
    }

    // ─────────────────────────────────────────────
    // Factory Methods
    // ─────────────────────────────────────────────

    // إرسال تقرير من موظف للمدير العام
    public static function sendToGeneralManager(
        Employee $sender,
        string $type,
        string $title,
        string $content,
        ?string $description = null
    ): array {

        if (! self::isTypeAllowed($sender->role, $type)) {
            return [
                'success' => false,
                'message' => "غير مسموح لك بإرسال تقارير من نوع: {$type}",
            ];
        }

        $gm = Employee::active()
            ->byRole(Employee::ROLE_GENERAL_MANAGER)
            ->first();

        if (! $gm) {
            return [
                'success' => false,
                'message' => 'لم يتم العثور على المدير العام',
            ];
        }

        $report = self::create([
            'title' => $title,
            'description' => $description,
            'content' => $content,
            'sender_id' => $sender->id,
            'receiver_id' => $gm->id,
            'report_type' => $type,
            'status' => self::STATUS_SENT,
        ]);

        // إشعار المدير العام
        Notification::managerToEmployee(
            from: $sender,
            to: $gm,
            title: "تقرير جديد: {$title}",
            message: "{$sender->getRoleLabel()} أرسل تقريراً جديداً — {$title}",
            extraData: ['report_id' => $report->id, 'report_type' => $type]
        );

        return [
            'success' => true,
            'report_id' => $report->id,
            'message' => 'تم إرسال التقرير بنجاح',
        ];
    }

    // إرسال تقرير AI لمدير التواصل
    public static function sendAIReport(
        string $title,
        string $content,
        ?string $description = null
    ): ?self {
        $commManager = Employee::active()
            ->byRole(Employee::ROLE_COMMUNICATION_MANAGER)
            ->first();
        if (! $commManager) {
            return null;
        }

        // سيريتل كاش يمثل AI — نستخدم أول موظف مدير عام كـ sender
        $gm = Employee::active()
            ->byRole(Employee::ROLE_GENERAL_MANAGER)
            ->first();
        if (! $gm) {
            return null;
        }

        $report = self::create([
            'title' => $title,
            'description' => $description,
            'content' => $content,
            'sender_id' => $gm->id,    // AI يُسجَّل باسم النظام
            'receiver_id' => $commManager->id,
            'report_type' => self::TYPE_AI_GENERATED,
            'status' => self::STATUS_SENT,
        ]);

        // إشعار مدير التواصل
        Notification::create([
            'sender_type' => Notification::SENDER_SYSTEM,
            'sender_id' => null,
            'receiver_type' => Notification::RECEIVER_EMPLOYEE,
            'receiver_id' => $commManager->id,
            'type' => Notification::TYPE_MANAGER_NOTIF,
            'title' => 'تقرير ذكاء اصطناعي جديد 🤖',
            'message' => "وصل تقرير جديد من نظام AI: {$title}",
            'data' => [
                'report_id' => $report->id,
                'report_type' => self::TYPE_AI_GENERATED,
            ],
        ]);

        return $report;
    }

    // إحالة تقرير AI من مدير التواصل للمدير العام
    public function forwardToGeneralManager(Employee $commManager): array
    {
        if ($this->report_type !== self::TYPE_AI_GENERATED) {
            return [
                'success' => false,
                'message' => 'يمكن إحالة تقارير الذكاء الاصطناعي فقط',
            ];
        }

        if ($this->receiver_id !== $commManager->id) {
            return [
                'success' => false,
                'message' => 'هذا التقرير ليس موجهاً إليك',
            ];
        }

        $gm = Employee::active()
            ->byRole(Employee::ROLE_GENERAL_MANAGER)
            ->first();
        if (! $gm) {
            return ['success' => false, 'message' => 'لم يتم العثور على المدير العام'];
        }

        // إنشاء نسخة محالة للمدير العام
        $forwarded = self::create([
            'title' => 'إحالة: '.$this->title,
            'description' => "تمت الإحالة من {$commManager->name}",
            'content' => $this->content,
            'sender_id' => $commManager->id,
            'receiver_id' => $gm->id,
            'report_type' => self::TYPE_AI_GENERATED,
            'status' => self::STATUS_SENT,
        ]);

        // تحديث حالة التقرير الأصلي
        $this->update(['status' => self::STATUS_REVIEWED]);

        // إشعار المدير العام
        Notification::managerToEmployee(
            from: $commManager,
            to: $gm,
            title: 'تقرير AI محال إليك 🤖',
            message: "أحال {$commManager->name} تقرير ذكاء اصطناعي: {$this->title}",
            extraData: ['forwarded_report_id' => $forwarded->id]
        );

        return [
            'success' => true,
            'forwarded_report_id' => $forwarded->id,
            'message' => 'تم إحالة التقرير للمدير العام بنجاح',
        ];
    }

    // تمييز التقرير كمراجَع
    public function markAsReviewed(): void
    {
        $this->update([
            'status' => self::STATUS_REVIEWED,
            'reviewed_at' => now(),
        ]);
    }

    public function archive(): void
    {
        $this->update(['status' => self::STATUS_ARCHIVED]);
    }

    // تفاصيل التقرير للواجهة
    public function getDetails(): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'description' => $this->description,
            'content' => $this->content,
            'report_type' => $this->report_type,
            'type_label' => self::TYPE_LABELS[$this->report_type] ?? $this->report_type,
            'status' => $this->status,
            'status_label' => self::STATUS_LABELS[$this->status] ?? $this->status,
            'sender' => $this->sender ? [
                'id' => $this->sender->id,
                'name' => $this->sender->name,
                'role_label' => $this->sender->getRoleLabel(),
                'avatar' => $this->sender->avatar
                                    ? asset('storage/'.$this->sender->avatar)
                                    : null,
            ] : null,
            'receiver' => $this->receiver ? [
                'id' => $this->receiver->id,
                'name' => $this->receiver->name,
                'role_label' => $this->receiver->getRoleLabel(),
            ] : null,
            'reviewed_at' => $this->reviewed_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            'created_at_human' => $this->created_at?->diffForHumans(),
        ];
    }
}
