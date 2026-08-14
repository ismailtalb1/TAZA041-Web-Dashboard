<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'delivery_routing' => [
        'enabled' => env('DELIVERY_ROUTING_ENABLED', true),
        'base_url' => env('DELIVERY_ROUTING_BASE_URL', 'https://router.project-osrm.org'),
        'profile' => env('DELIVERY_ROUTING_PROFILE', 'driving'),
        'timeout_seconds' => env('DELIVERY_ROUTING_TIMEOUT', 8),
        'connect_timeout_seconds' => env('DELIVERY_ROUTING_CONNECT_TIMEOUT', 4),
        'cache_minutes' => env('DELIVERY_ROUTING_CACHE_MINUTES', 10),
        'fallback_speed_kph' => env('DELIVERY_FALLBACK_SPEED_KPH', 30),
    ],

];
