<?php

use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Laravel\Sanctum\Http\Middleware\AuthenticateSession;

// config/sanctum.php
// إعدادات المصادقة — Laravel Sanctum
// التوكن يُستخدم لحماية كل نقاط API الخاصة بالـ Dashboard

return [

    /*
    |--------------------------------------------------------------------------
    | Stateful Domains
    |--------------------------------------------------------------------------
    | هذه النطاقات تستخدم Cookie للمصادقة بدلاً من التوكن
    | Dashboard يعمل على localhost لذا نضيفه هنا
    */
    'stateful' => explode(',', env('SANCTUM_STATEFUL_DOMAINS',
        'localhost,localhost:8000,localhost:3000,127.0.0.1,127.0.0.1:8000,::1'
    )),

    /*
    |--------------------------------------------------------------------------
    | Sanctum Guards
    |--------------------------------------------------------------------------
    | الـ Guards التي يفحصها Sanctum عند التحقق من الهوية
    | web → للزبائن (مستقبلاً)
    | employees → للموظفين والمديرين
    */
    'guard' => ['web'],

    /*
    |--------------------------------------------------------------------------
    | Token Expiration — مدة صلاحية التوكن
    |--------------------------------------------------------------------------
    | القيمة بالدقائق — null تعني لا تنتهي أبداً
    |
    | employees_token_expiration : 8 ساعات (480 دقيقة) — يوم عمل كامل
    | customer_token_expiration  : 30 يوم — الزبون يبقى مسجلاً لفترة طويلة
    |
    | عند انتهاء التوكن → Dashboard يعيد توجيه المستخدم لصفحة تسجيل الدخول
    */
    'expiration' => null, // نتحكم به يدوياً في AuthController

    // مدة توكن الموظفين بالدقائق (8 ساعات)
    'employee_token_expiration' => env('EMPLOYEE_TOKEN_EXPIRATION', 480),

    // مدة توكن الزبائن بالدقائق (30 يوم)
    'customer_token_expiration' => env('CUSTOMER_TOKEN_EXPIRATION', 43200),

    /*
    |--------------------------------------------------------------------------
    | Token Prefix
    |--------------------------------------------------------------------------
    | بادئة تُضاف للتوكن لتمييز توكنات المشروع
    | مثال: taza041_AbCdEfGh...
    */
    'token_prefix' => env('SANCTUM_TOKEN_PREFIX', 'taza041_'),

    /*
    |--------------------------------------------------------------------------
    | Sanctum Middleware
    |--------------------------------------------------------------------------
    | Middleware يعمل مع كل طلب API محمي
    */
    'middleware' => [
        // التحقق من صحة التوكن المرسل في الـ Header
        'authenticate_session' => AuthenticateSession::class,

        // التحقق من أن الطلب قادم من نطاق موثوق (Stateful)
        'encrypt_cookies' => EncryptCookies::class,

        // التحقق من CSRF لطلبات Stateful فقط
        'validate_csrf_token' => ValidateCsrfToken::class,
    ],

    /*
    |--------------------------------------------------------------------------
    | Abilities (الصلاحيات)
    |--------------------------------------------------------------------------
    | كل دور له مجموعة صلاحيات محددة
    | تُستخدم عند إنشاء التوكن: createToken('name', [abilities])
    |
    | الاستخدام في الـ Controller:
    |   $request->user()->tokenCan('manage_products')
    */
    'abilities' => [

        'general_manager' => [
            'manage_employees',
            'manage_products',
            'manage_offers',
            'manage_restaurant_info',
            'view_all_orders',
            'view_all_reports',
            'manage_customers',
            'send_notifications',
        ],

        'order_manager' => [
            'manage_orders',
            'manage_reservations',
            'send_notifications',
            'view_own_profile',
        ],

        'delivery_manager' => [
            'manage_delivery',
            'view_delivery_orders',
            'send_notifications',
            'view_own_profile',
        ],

        'inventory_manager' => [
            'manage_products',
            'manage_offers',
            'manage_stock',
            'view_own_profile',
        ],

        'finance_manager' => [
            'manage_payment_accounts',
            'view_financial_reports',
            'view_own_profile',
        ],

        'communication_manager' => [
            'manage_restaurant_info',
            'manage_restaurant_images',
            'view_ai_reports',
            'forward_reports',
            'view_own_profile',
        ],

        'driver' => [
            'view_assigned_deliveries',
            'update_delivery_status',
            'view_own_profile',
        ],
    ],

];
