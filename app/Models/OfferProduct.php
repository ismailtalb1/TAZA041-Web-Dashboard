<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OfferProduct extends Model
{
    use HasFactory;

    protected $table = 'offer_products';

    public $timestamps = true;

    protected $fillable = [
        'offer_id',
        'product_id',
        'quantity',
    ];

    protected $casts = [
        'quantity' => 'integer',
    ];

    // ─────────────────────────────────────────────
    // العلاقات
    // ─────────────────────────────────────────────
    public function offer(): BelongsTo
    {
        return $this->belongsTo(Offer::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    // ─────────────────────────────────────────────
    // السعر الفردي لهذا المنتج ضمن العرض
    // (quantity × price) — يُستخدم لحساب original_price
    // ─────────────────────────────────────────────
    public function getLinePrice(): float
    {
        return $this->product->price * $this->quantity;
    }
}
