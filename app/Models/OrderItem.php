<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OrderItem extends Model
{
    use HasFactory;

    protected $table = 'order_items';

    protected $fillable = [
        'order_id',
        'item_type',
        'reference_id',
        'quantity',
        'unit_price',
        'subtotal',
    ];

    protected $casts = [
        'quantity' => 'integer',
        'unit_price' => 'float',
        'subtotal' => 'float',
    ];

    // ─────────────────────────────────────────────
    // الثوابت
    // ─────────────────────────────────────────────
    const TYPE_PRODUCT = 'product';

    const TYPE_OFFER = 'offer';

    // ─────────────────────────────────────────────
    // العلاقات
    // ─────────────────────────────────────────────
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    // المنتج المرتبط (إذا كان item_type = product)
    public function product(): ?Product
    {
        if ($this->item_type !== self::TYPE_PRODUCT) {
            return null;
        }

        return Product::find($this->reference_id);
    }

    // العرض المرتبط (إذا كان item_type = offer)
    public function offer(): ?Offer
    {
        if ($this->item_type !== self::TYPE_OFFER) {
            return null;
        }

        return Offer::find($this->reference_id);
    }

    // ─────────────────────────────────────────────
    // التوابع
    // ─────────────────────────────────────────────

    // هل العنصر منتج عادي؟
    public function isProduct(): bool
    {
        return $this->item_type === self::TYPE_PRODUCT;
    }

    // هل العنصر عرض؟
    public function isOffer(): bool
    {
        return $this->item_type === self::TYPE_OFFER;
    }

    // إعادة حساب السعر الجزئي
    public function recalcSubtotal(): float
    {
        $this->subtotal = $this->unit_price * $this->quantity;
        $this->save();

        return $this->subtotal;
    }

    // اسم العنصر (منتج أو عرض)
    public function getItemName(): string
    {
        if ($this->isProduct()) {
            return Product::find($this->reference_id)?->name ?? 'منتج محذوف';
        }

        return Offer::find($this->reference_id)?->name ?? 'عرض محذوف';
    }

    // صورة العنصر
    public function getItemImage(): ?string
    {
        $imagePath = null;

        if ($this->isProduct()) {
            $imagePath = Product::find($this->reference_id)?->image_path;
        } else {
            $imagePath = Offer::find($this->reference_id)?->image_path;
        }

        return $imagePath ? asset('storage/'.$imagePath) : null;
    }

    // تفاصيل العنصر للواجهة الأمامية
    public function getDetails(): array
    {
        $details = [
            'id' => $this->id,
            'item_type' => $this->item_type,
            'reference_id' => $this->reference_id,
            'name' => $this->getItemName(),
            'image_url' => $this->getItemImage(),
            'quantity' => $this->quantity,
            'unit_price' => $this->unit_price,
            'unit_price_formatted' => number_format($this->unit_price, 0).' ل.س',
            'subtotal' => $this->subtotal,
            'subtotal_formatted' => number_format($this->subtotal, 0).' ل.س',
        ];

        // إذا كان عرض أضف السعر الأصلي للعرض المشطوب
        if ($this->isOffer()) {
            $offer = Offer::find($this->reference_id);
            if ($offer) {
                $details['original_price'] = $offer->original_price;
                $details['original_price_formatted'] =
                    number_format($offer->original_price, 0).' ل.س';
                $details['discount_percentage'] =
                    $offer->getDiscountPercentage();
                $details['offer_products'] =
                    $offer->products->map(fn ($p) => [
                        'name' => $p->name,
                        'quantity' => $p->pivot->quantity,
                    ])->values();
            }
        }

        return $details;
    }
}
