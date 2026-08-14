<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Offer extends Model
{
    use HasFactory;

    protected $table = 'offers';

    protected $fillable = [
        'name',
        'name_ar',
        'name_en',
        'description',
        'description_ar',
        'description_en',
        'category',
        'offer_price',
        'loyalty_price',
        'original_price',
        'is_active',
        'image_path',
        'start_date',
        'end_date',
    ];

    protected $casts = [
        'offer_price' => 'float',
        'loyalty_price' => 'integer',
        'original_price' => 'float',
        'is_active' => 'boolean',
        'start_date' => 'datetime',
        'end_date' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // ─────────────────────────────────────────────
    // العلاقات
    // ─────────────────────────────────────────────

    // المنتجات المكوِّنة للعرض (مع الكمية)
    public function products(): BelongsToMany
    {
        return $this->belongsToMany(
            Product::class,
            'offer_products',
            'offer_id',
            'product_id'
        )->withPivot('quantity')->withTimestamps();
    }

    // سجلات offer_products المباشرة
    public function offerProducts(): HasMany
    {
        return $this->hasMany(OfferProduct::class, 'offer_id');
    }

    // عناصر الطلبات التي استخدمت هذا العرض
    public function orderItems(): HasMany
    {
        return $this->hasMany(OrderItem::class, 'reference_id')
            ->where('item_type', 'offer');
    }

    // ─────────────────────────────────────────────
    // Scopes
    // ─────────────────────────────────────────────

    // العروض النشطة حالياً (التاريخ + is_active)
    public function scopeCurrentlyActive($query)
    {
        return $query->where('is_active', true)
            ->where(function ($q) {
                $q->whereNull('start_date')
                    ->orWhere('start_date', '<=', now());
            })
            ->where(function ($q) {
                $q->whereNull('end_date')
                    ->orWhere('end_date', '>=', now());
            });
    }

    // العروض المنتهية
    public function scopeExpired($query)
    {
        return $query->where('end_date', '<', now());
    }

    // العروض المستقبلية
    public function scopeUpcoming($query)
    {
        return $query->where('start_date', '>', now());
    }

    // ─────────────────────────────────────────────
    // التوابع
    // ─────────────────────────────────────────────

    // هل العرض نشط الآن فعلاً؟
    public function isCurrentlyActive(): bool
    {
        if (! $this->is_active) {
            return false;
        }

        $now = now();

        if ($this->start_date && $this->start_date->isAfter($now)) {
            return false;
        }
        if ($this->end_date && $this->end_date->isBefore($now)) {
            return false;
        }

        return true;
    }

    // هل انتهى العرض؟
    public function isExpired(): bool
    {
        return $this->end_date && $this->end_date->isBefore(now());
    }

    // ─────────────────────────────────────────────
    // حساب original_price (مجموع أسعار المنتجات منفردة)
    // هذا هو السعر الذي يظهر مشطوباً في الواجهة
    // ─────────────────────────────────────────────
    public function calculateOriginalPrice(): float
    {
        $total = 0.0;

        foreach ($this->offerProducts()->with('product')->get() as $op) {
            $total += $op->product->price * $op->quantity;
        }

        return $total;
    }

    // تحديث original_price وحفظه في قاعدة البيانات
    // يُستدعى عند إضافة/حذف منتج من العرض
    public function syncOriginalPrice(): void
    {
        $this->original_price = $this->calculateOriginalPrice();
        $this->save();
    }

    // نسبة الخصم
    public function getDiscountPercentage(): float
    {
        if (! $this->original_price || $this->original_price == 0) {
            return 0;
        }

        return round(
            (($this->original_price - $this->offer_price) / $this->original_price) * 100,
            1
        );
    }

    // قيمة الخصم بالليرة
    public function getDiscountAmount(): float
    {
        return max(0, ($this->original_price ?? 0) - $this->offer_price);
    }

    // إضافة منتج للعرض وتحديث السعر الأصلي
    public function addProduct(int $productId, int $quantity = 1): void
    {
        $this->products()->syncWithoutDetaching([
            $productId => ['quantity' => $quantity],
        ]);
        $this->syncOriginalPrice();
    }

    // حذف منتج من العرض وتحديث السعر الأصلي
    public function removeProduct(int $productId): void
    {
        $this->products()->detach($productId);
        $this->syncOriginalPrice();
    }

    // بيانات العرض الكاملة للواجهة الأمامية
    // تتضمن أسعار المنتجات الفردية للعرض المشطوب
    public function getDetails(): array
    {
        $products = $this->products()->get()->map(function ($product) {
            return [
                'id' => $product->id,
                'name' => $product->name,
                'category' => $product->category,
                'quantity_in_offer' => $product->pivot->quantity,

                // السعر الفردي لهذا المنتج لو اشتراه وحده
                'individual_price' => $product->price,
                'individual_price_formatted' => number_format($product->price, 0).' ل.س',

                // السعر الكلي لهذا المنتج × الكمية (للمشطوب)
                'line_price' => $product->price * $product->pivot->quantity,
                'line_price_formatted' => number_format($product->price * $product->pivot->quantity, 0).' ل.س',

                'image_url' => $product->image_path
                                           ? asset('storage/'.$product->image_path)
                                           : null,
                'stock_quantity' => $product->stock_quantity,
                'max_available' => $product->pivot->quantity > 0
                                           ? intdiv(max(0, (int) $product->stock_quantity), (int) $product->pivot->quantity)
                                           : 0,
                'is_available' => $product->isAvailable(),
            ];
        });

        $maxAvailable = $products->isEmpty()
            ? 0
            : (int) $products->min('max_available');

        $originalPrice = $this->original_price ?? $this->calculateOriginalPrice();

        return [
            'id' => $this->id,
            'name' => $this->name,
            'name_ar' => $this->name_ar,
            'name_en' => $this->name_en,
            'description' => $this->description,
            'description_ar' => $this->description_ar,
            'description_en' => $this->description_en,
            'category' => $this->category,

            // السعر الأصلي (مجموع المنتجات منفردة) — يُعرض مشطوباً
            'original_price' => $originalPrice,
            'original_price_formatted' => number_format($originalPrice, 0).' ل.س',

            // سعر العرض الفعلي
            'offer_price' => $this->offer_price,
            'offer_price_formatted' => number_format($this->offer_price, 0).' ل.س',

            // نسبة وقيمة الخصم
            'discount_percentage' => $this->getDiscountPercentage(),
            'discount_amount' => $this->getDiscountAmount(),
            'discount_formatted' => number_format($this->getDiscountAmount(), 0).' ل.س',

            'is_active' => $this->is_active,
            'is_currently_active' => $this->isCurrentlyActive() && $maxAvailable > 0,
            'is_expired' => $this->isExpired(),
            'max_quantity' => $maxAvailable,
            'max_available' => $maxAvailable,

            'start_date' => $this->start_date?->toIso8601String(),
            'end_date' => $this->end_date?->toIso8601String(),

            'image_url' => $this->image_path
                                  ? asset('storage/'.$this->image_path)
                                  : null,

            // المنتجات مع أسعارها الفردية (للعرض المشطوب)
            'products' => $products,

            'created_at' => $this->created_at?->toIso8601String(),
            'loyalty_price' => $this->loyalty_price,
            'loyalty_price_formatted' => $this->loyalty_price
                                 ? $this->loyalty_price.' نقطة'
                                 : null,
            'can_pay_with_points' => ! is_null($this->loyalty_price),
        ];
    }
}
