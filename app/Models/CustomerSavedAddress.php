<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CustomerSavedAddress extends Model
{
    public const TYPE_HOME = 'home';

    public const TYPE_WORK = 'work';

    public const TYPE_OTHER = 'other';

    public const TYPES = [self::TYPE_HOME, self::TYPE_WORK, self::TYPE_OTHER];

    protected $fillable = [
        'customer_id',
        'type',
        'address',
        'details',
        'latitude',
        'longitude',
    ];

    protected $casts = [
        'latitude' => 'float',
        'longitude' => 'float',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function toCustomerPayload(): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'address' => $this->address,
            'details' => $this->details ?? '',
            'latitude' => $this->latitude,
            'longitude' => $this->longitude,
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
