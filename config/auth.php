<?php

use App\Models\Customer;
use App\Models\Employee;

return [

    'defaults' => [
        'guard' => 'web',
        'passwords' => 'users',
    ],

    'guards' => [
        'web' => [
            'driver' => 'session',
            'provider' => 'users',
        ],

        // حارس الموظفين — يستخدمه Dashboard
        'employee' => [
            'driver' => 'sanctum',
            'provider' => 'employees',
        ],

        // حارس الزبائن — يستخدمه تطبيق الموبايل/الويب
        'customer' => [
            'driver' => 'sanctum',
            'provider' => 'customers',
        ],
    ],

    'providers' => [
        'users' => [
            'driver' => 'eloquent',
            'model' => Employee::class,
        ],
        'employees' => [
            'driver' => 'eloquent',
            'model' => Employee::class,
        ],
        'customers' => [
            'driver' => 'eloquent',
            'model' => Customer::class,
        ],
    ],

    'passwords' => [
        'users' => [
            'provider' => 'users',
            'table' => 'password_reset_tokens',
            'expire' => 60,
            'throttle' => 60,
        ],
        'customers' => [
            'provider' => 'customers',
            'table' => 'customer_password_reset_tokens',
            'expire' => 15,
            'throttle' => 60,
        ],
    ],

    'password_timeout' => 10800,

];
