<?php

namespace App\Support;

use Illuminate\Validation\Rules\Password;

final class CustomerInputRules
{
    public const PHONE_PATTERN = '/^09[0-9]{8}$/';

    public static function normalizeName(mixed $value): string
    {
        return preg_replace('/\s+/u', ' ', trim((string) $value)) ?? '';
    }

    public static function normalizeEmail(mixed $value): ?string
    {
        $email = mb_strtolower(trim((string) $value));

        return $email === '' ? null : $email;
    }

    public static function normalizePhone(mixed $value): ?string
    {
        $phone = trim((string) $value);

        return $phone === '' ? null : $phone;
    }

    public static function normalizeText(mixed $value): ?string
    {
        $text = preg_replace('/[\t ]+/u', ' ', trim((string) $value)) ?? '';

        return $text === '' ? null : $text;
    }

    public static function fullName(bool $sometimes = false): array
    {
        return array_values(array_filter([
            $sometimes ? 'sometimes' : 'required',
            'string',
            'min:2',
            'max:100',
            "regex:/^[\p{L}\p{M}]+(?:[ '\x{2019}.\-][\p{L}\p{M}]+)*$/u",
        ]));
    }

    public static function email(bool $sometimes = false): array
    {
        return array_values(array_filter([
            $sometimes ? 'sometimes' : null,
            'nullable',
            'email:rfc',
            'max:254',
        ]));
    }

    public static function phone(bool $sometimes = false): array
    {
        return array_values(array_filter([
            $sometimes ? 'sometimes' : null,
            'nullable',
            'string',
            'size:10',
            'regex:'.self::PHONE_PATTERN,
        ]));
    }

    public static function safeText(
        bool $required,
        int $max,
        int $min = 1,
        bool $sometimes = false,
    ): array {
        return array_values(array_filter([
            $sometimes ? 'sometimes' : null,
            $required ? 'required' : 'nullable',
            'string',
            "min:{$min}",
            "max:{$max}",
            'not_regex:/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/',
            'regex:/[\p{L}\p{N}]/u',
        ]));
    }

    public static function strongPassword(): array
    {
        return [
            'required',
            'string',
            'max:128',
            Password::min(8)->letters()->numbers(),
            'confirmed',
        ];
    }
}
