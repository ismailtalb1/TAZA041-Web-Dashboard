<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class RestaurantImage extends Model
{
    use HasFactory;

    // ✅ مطابق لقاعدة البيانات
    protected $table = 'restaurant_images';

    protected $fillable = [
        'type',
        'image_path',
        'caption',
        'sort_order',
        'is_active',
    ];

    protected $casts = [
        'sort_order' => 'integer',
        'is_active' => 'boolean',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // ─────────────────────────────────────────────
    // الثوابت — أنواع الصور
    // مطابقة لـ ENUM في قاعدة البيانات
    // ─────────────────────────────────────────────
    const TYPE_EXTERIOR = 'exterior';

    const TYPE_INTERIOR = 'interior';

    const TYPE_FOOD = 'food';

    const TYPE_BANNER = 'banner';

    const TYPE_LOGO = 'logo';

    const TYPE_LABELS = [
        self::TYPE_EXTERIOR => 'الواجهة الخارجية',
        self::TYPE_INTERIOR => 'الصالة الداخلية',
        self::TYPE_FOOD => 'صور الطعام',
        self::TYPE_BANNER => 'البانرات',
        self::TYPE_LOGO => 'الشعار',
    ];

    // ─────────────────────────────────────────────
    // Scopes
    // ─────────────────────────────────────────────
    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    public function scopeByType($query, string $type)
    {
        return $query->where('type', $type);
    }

    public function scopeOrdered($query)
    {
        return $query->orderBy('sort_order')->orderBy('created_at');
    }

    // ─────────────────────────────────────────────
    // تفاصيل الصورة للواجهة
    // ─────────────────────────────────────────────
    public function getDetails(): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'type_label' => self::TYPE_LABELS[$this->type] ?? $this->type,
            'image_url' => asset('storage/'.$this->image_path),
            'caption' => $this->caption,
            'sort_order' => $this->sort_order,
            'is_active' => $this->is_active,
            'created_at' => $this->created_at?->format('Y-m-d'),
        ];
    }

    // جلب كل الصور مُجمَّعة حسب النوع
    public static function getAllGrouped(): array
    {
        $images = self::active()->ordered()->get();

        $grouped = [];
        foreach (self::TYPE_LABELS as $type => $label) {
            $grouped[$type] = [
                'label' => $label,
                'images' => $images
                    ->where('type', $type)
                    ->map->getDetails()
                    ->values(),
            ];
        }

        return $grouped;
    }
}
