<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MealSuggestion extends Model
{
    use HasFactory;

    // ✅ مطابق لقاعدة البيانات
    protected $table = 'meal_suggestions';

    protected $fillable = [
        'customer_id',
        'suggestion_text',
        'image_path',
        'status',
        'admin_note',
    ];

    protected $casts = [
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // ─────────────────────────────────────────────
    // الثوابت — الحالات
    // ─────────────────────────────────────────────
    const STATUS_PENDING = 'pending';

    const STATUS_REVIEWED = 'reviewed';

    const STATUS_IMPLEMENTED = 'implemented';

    const STATUS_REJECTED = 'rejected';

    const STATUS_LABELS = [
        self::STATUS_PENDING => '⏳ بانتظار المراجعة',
        self::STATUS_REVIEWED => '👀 تمت المراجعة',
        self::STATUS_IMPLEMENTED => '✅ تم التطبيق',
        self::STATUS_REJECTED => '❌ مرفوض',
    ];

    // ─────────────────────────────────────────────
    // العلاقات
    // ─────────────────────────────────────────────
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    // ─────────────────────────────────────────────
    // Scopes
    // ─────────────────────────────────────────────
    public function scopePending($query)
    {
        return $query->where('status', self::STATUS_PENDING);
    }

    public function scopeRecent($query, int $hours = 24)
    {
        return $query->where('created_at', '>=', now()->subHours($hours));
    }

    // ─────────────────────────────────────────────
    // التوابع
    // ─────────────────────────────────────────────

    // مراجعة الاقتراح من قبل مدير التواصل
    public function review(Employee $manager, string $note): void
    {
        $this->update([
            'status' => self::STATUS_REVIEWED,
            'admin_note' => $note,
        ]);

        // إشعار الزبون
        if ($this->customer_id) {
            Notification::create([
                'sender_type' => Notification::SENDER_EMPLOYEE,
                'sender_id' => $manager->id,
                'receiver_type' => Notification::RECEIVER_CUSTOMER,
                'receiver_id' => $this->customer_id,
                'type' => Notification::TYPE_SYSTEM_ANNOUNCEMENT,
                'title' => 'تمت مراجعة اقتراحك 👀',
                'message' => "شكراً على اقتراحك! تمت مراجعته: {$note}",
                'data' => ['suggestion_id' => $this->id],
            ]);
        }
    }

    // تطبيق الاقتراح
    public function markImplemented(Employee $manager, string $note): void
    {
        $this->update([
            'status' => self::STATUS_IMPLEMENTED,
            'admin_note' => $note,
        ]);

        if ($this->customer_id) {
            Notification::create([
                'sender_type' => Notification::SENDER_EMPLOYEE,
                'sender_id' => $manager->id,
                'receiver_type' => Notification::RECEIVER_CUSTOMER,
                'receiver_id' => $this->customer_id,
                'type' => Notification::TYPE_SYSTEM_ANNOUNCEMENT,
                'title' => 'اقتراحك أصبح حقيقة! 🎉',
                'message' => 'تهانينا! تم تطبيق اقتراحك في مطعم TAZA 041',
                'data' => ['suggestion_id' => $this->id],
            ]);
        }
    }

    // إحصائيات للتقرير اليومي
    public static function getDailySummary(int $hours = 24): array
    {
        $recent = self::recent($hours)->with('customer')->get();

        return [
            'total' => $recent->count(),
            'pending' => $recent->where('status', self::STATUS_PENDING)->count(),
            'suggestions' => $recent->map(fn ($s) => [
                'text' => $s->suggestion_text,
                'customer' => $s->customer?->name ?? 'مجهول',
                'created_at' => $s->created_at->format('H:i'),
            ])->values()->toArray(),
        ];
    }

    // تفاصيل الاقتراح للواجهة
    public function getDetails(): array
    {
        return [
            'id' => $this->id,
            'suggestion_text' => $this->suggestion_text,
            'image_url' => $this->image_path ? asset('storage/'.$this->image_path) : null,
            'status' => $this->status,
            'status_label' => self::STATUS_LABELS[$this->status] ?? $this->status,
            'admin_note' => $this->admin_note,
            'customer' => $this->customer ? [
                'id' => $this->customer->id,
                'name' => $this->customer->name,
            ] : null,
            'created_at' => $this->created_at?->toIso8601String(),
            'created_at_human' => $this->created_at?->diffForHumans(),
        ];
    }
}
