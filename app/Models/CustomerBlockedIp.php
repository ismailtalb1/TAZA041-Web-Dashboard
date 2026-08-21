<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CustomerBlockedIp extends Model
{
    use HasFactory;

    protected $fillable = [
        'customer_id',
        'ip_address',
        'banned_by',
        'reason',
        'is_active',
        'banned_at',
        'released_at',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'banned_at' => 'datetime',
        'released_at' => 'datetime',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function bannedBy(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'banned_by');
    }

    public static function normalize(?string $ipAddress): ?string
    {
        $ipAddress = trim((string) $ipAddress);

        return filter_var($ipAddress, FILTER_VALIDATE_IP) ? $ipAddress : null;
    }

    public static function isBlocked(?string $ipAddress): bool
    {
        $ipAddress = self::normalize($ipAddress);

        return $ipAddress !== null
            && self::where('ip_address', $ipAddress)->where('is_active', true)->exists();
    }
}
