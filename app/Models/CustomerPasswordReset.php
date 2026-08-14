<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CustomerPasswordReset extends Model
{
    protected $table = 'customer_password_resets';

    protected $fillable = [
        'customer_id',
        'identifier',
        'channel',
        'code_hash',
        'reset_token_hash',
        'expires_at',
        'used_at',
        'attempts',
    ];

    protected $casts = [
        'expires_at' => 'datetime',
        'used_at' => 'datetime',
        'attempts' => 'integer',
    ];

    public function isExpired(): bool
    {
        return now()->greaterThan($this->expires_at);
    }

    public function isUsed(): bool
    {
        return $this->used_at !== null;
    }
}
