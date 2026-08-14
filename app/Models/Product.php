<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Product extends Model
{
    use HasFactory;

    protected $table = 'products';

    protected $fillable = [
        'name',
        'name_ar',
        'name_en',
        'description',
        'description_ar',
        'description_en',
        'category',
        'price',
        'loyalty_price',
        'stock_quantity',
        'is_active',
        'image_path',
    ];

    protected $casts = [
        'price' => 'float',
        'loyalty_price' => 'integer',
        'stock_quantity' => 'integer',
        'is_active' => 'boolean',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // ─────────────────────────────────────────────
    // الثوابت
    // ─────────────────────────────────────────────
    const CATEGORY_MEAL = 'meal';

    const CATEGORY_DRINK = 'drink';

    const CATEGORY_SANDWICH = 'sandwich';

    const CATEGORY_LABELS = [
        self::CATEGORY_MEAL => 'وجبات',
        self::CATEGORY_DRINK => 'مشروبات',
        self::CATEGORY_SANDWICH => 'سندويشات',
    ];

    // حد أدنى للمخزون يُطلق تحذير النفاد
    const LOW_STOCK_THRESHOLD = 10;

    // ─────────────────────────────────────────────
    // العلاقات
    // ─────────────────────────────────────────────

    // العروض التي يدخل فيها هذا المنتج
    public function offers(): BelongsToMany
    {
        return $this->belongsToMany(
            Offer::class,
            'offer_products',
            'product_id',
            'offer_id'
        )->withPivot('quantity')->withTimestamps();
    }

    // عناصر الطلبات التي تحتوي هذا المنتج
    public function orderItems(): HasMany
    {
        return $this->hasMany(OrderItem::class, 'reference_id')
            ->where('item_type', 'product');
    }

    // تقييمات هذا المنتج
    public function reviews(): HasMany
    {
        return $this->hasMany(Review::class, 'reviewable_id')
            ->where('reviewable_type', 'product');
    }

    // ─────────────────────────────────────────────
    // Scopes
    // ─────────────────────────────────────────────
    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    public function scopeAvailable($query)
    {
        return $query->where('is_active', true)
            ->where('stock_quantity', '>', 0);
    }

    public function scopeByCategory($query, string $category)
    {
        return $query->where('category', $category);
    }

    public function scopeLowStock($query)
    {
        return $query->where('stock_quantity', '<=', self::LOW_STOCK_THRESHOLD)
            ->where('stock_quantity', '>', 0)
            ->where('is_active', true);
    }

    public function scopeOutOfStock($query)
    {
        return $query->where('stock_quantity', 0);
    }

    // ─────────────────────────────────────────────
    // التوابع
    // ─────────────────────────────────────────────

    // هل المنتج متاح للطلب؟
    public function isAvailable(): bool
    {
        return $this->is_active && $this->stock_quantity > 0;
    }

    // هل المخزون منخفض؟
    public function isLowStock(): bool
    {
        return $this->stock_quantity <= self::LOW_STOCK_THRESHOLD
            && $this->stock_quantity > 0;
    }

    // خصم كمية من المخزون عند إتمام الطلب
    public function decreaseStock(int $quantity): bool
    {
        if ($this->stock_quantity < $quantity) {
            return false;
        }

        $oldStock = (int) $this->stock_quantity;
        $this->decrement('stock_quantity', $quantity);
        $this->refresh();
        $this->syncStockAlert($oldStock);

        return true;
    }

    // إعادة كمية للمخزون عند إلغاء الطلب
    public function increaseStock(int $quantity): void
    {
        $oldStock = (int) $this->stock_quantity;
        $this->increment('stock_quantity', $quantity);
        $this->refresh();
        $this->syncStockAlert($oldStock);
    }

    // إنشاء/تحديث التنبيه عند انخفاض أو نفاد المخزون، وحلّه تلقائياً بعد التعبئة.
    public function syncStockAlert(?int $oldStock = null): void
    {
        $inventoryManager = Employee::active()
            ->byRole(Employee::ROLE_INVENTORY_MANAGER)
            ->first();
        if (! $inventoryManager) {
            return;
        }

        if (! $this->is_active) {
            Notification::resolveStockAlert($this, $inventoryManager);

            return;
        }

        if ($this->stock_quantity <= self::LOW_STOCK_THRESHOLD) {
            Notification::stockAlert($this, $inventoryManager);

            return;
        }

        if ($oldStock !== null && $oldStock <= self::LOW_STOCK_THRESHOLD) {
            Notification::resolveStockAlert($this, $inventoryManager);
        }
    }

    // متوسط تقييم المنتج
    public function getAverageRating(): float
    {
        return round(
            $this->reviews()->avg('rating') ?? 0,
            1
        );
    }

    // عدد مرات الطلب (للإحصائيات)
    public function getOrderCount(): int
    {
        return $this->orderItems()->count();
    }

    // اسم الفئة بالعربي
    public function getCategoryLabel(): string
    {
        return self::CATEGORY_LABELS[$this->category] ?? $this->category;
    }

    // بيانات المنتج الكاملة للعرض في الواجهة
    public function getDetails(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'name_ar' => $this->name_ar,
            'name_en' => $this->name_en,
            'description' => $this->description,
            'description_ar' => $this->description_ar,
            'description_en' => $this->description_en,
            'category' => $this->category,
            'category_label' => $this->getCategoryLabel(),
            'price' => $this->price,
            'price_formatted' => number_format($this->price, 0).' ل.س',
            'stock_quantity' => $this->stock_quantity,
            'max_quantity' => max(0, (int) $this->stock_quantity),
            'is_active' => $this->is_active,
            'is_available' => $this->isAvailable(),
            'is_low_stock' => $this->isLowStock(),
            'average_rating' => $this->getAverageRating(),
            'image_url' => $this->image_path
                                    ? asset('storage/'.$this->image_path)
                                    : null,
            'created_at' => $this->created_at?->format('Y-m-d'),
            'loyalty_price' => $this->loyalty_price,
            'loyalty_price_formatted' => $this->loyalty_price
                                    ? $this->loyalty_price.' نقطة'
                                    : null,
            'can_pay_with_points' => ! is_null($this->loyalty_price),
        ];
    }
}
