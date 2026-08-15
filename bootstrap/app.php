<?php

// bootstrap/app.php
// نقطة تهيئة Laravel 12 — Sanctum + API Routes + CORS

use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Middleware\HandleCors;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))

    // ─────────────────────────────────────────────
    // [1] مسارات التطبيق
    // ─────────────────────────────────────────────
    ->withRouting(
        // مسارات الويب العادية (غير مستخدمة حالياً)
        web: __DIR__.'/../routes/web.php',

        // مسارات الـ API — كل نقاط الـ Dashboard هنا
        api: __DIR__.'/../routes/api.php',

        // prefix تلقائي لكل مسارات الـ API → /api/...
        apiPrefix: 'api',

        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )

    // ─────────────────────────────────────────────
    // [2] الـ Middleware
    // ─────────────────────────────────────────────
    ->withMiddleware(function (Middleware $middleware) {

        // عند تشغيل التطبيق خلف Cloudflare Tunnel يجب الوثوق بترويسات
        // X-Forwarded-* حتى يتعرف Laravel على HTTPS ويولّد روابط آمنة.
        // لا يتم تفعيل ذلك محلياً إلا عند ضبط TRUSTED_PROXIES في البيئة.
        $trustedProxies = env('TRUSTED_PROXIES');
        if (is_string($trustedProxies) && trim($trustedProxies) !== '') {
            $trustedProxies = trim($trustedProxies);
            $middleware->trustProxies(
                at: $trustedProxies === '*'
                    ? '*'
                    : array_values(array_filter(array_map('trim', explode(',', $trustedProxies))))
            );
        }

        // تفعيل CORS لكل طلبات الـ API
        $middleware->api(prepend: [
            HandleCors::class,
        ]);

        // الواجهات (الموقع، لوحة الموظفين وتطبيق الهاتف) تستخدم Sanctum
        // عبر Bearer tokens. لا نفعّل statefulApi هنا لأنه يحوّل طلبات
        // المتصفح من النطاق نفسه إلى جلسات Cookies تتطلب CSRF، بينما
        // تسجيل الدخول نفسه نقطة عامة مسؤولة عن إصدار التوكن.

        // السماح للـ Dashboard بإرسال الطلبات (لا Redirect عند 401)
        $middleware->redirectGuestsTo(fn (Request $request) => $request->expectsJson()
                ? null
                : route('login')
        );
    })

    // ─────────────────────────────────────────────
    // [3] معالجة الأخطاء
    // ─────────────────────────────────────────────
    ->withExceptions(function (Exceptions $exceptions) {

        // كل الأخطاء ترجع JSON للـ Dashboard (لا HTML)
        $exceptions->render(function (Throwable $e, Request $request) {
            if ($request->is('api/*') || $request->expectsJson()) {

                // السماح لاستجابات Laravel الجاهزة (مثل Rate Limiting) بالمرور كما هي.
                if ($e instanceof HttpResponseException) {
                    return $e->getResponse();
                }

                // خطأ مصادقة (401)
                if ($e instanceof AuthenticationException) {
                    return response()->json([
                        'success' => false,
                        'message' => 'غير مصرح — يرجى تسجيل الدخول أولاً',
                    ], 401);
                }

                // خطأ صلاحيات (403)
                if ($e instanceof AuthorizationException) {
                    return response()->json([
                        'success' => false,
                        'message' => 'ليس لديك صلاحية للقيام بهذا الإجراء',
                    ], 403);
                }

                // مسار غير موجود (404)
                if ($e instanceof NotFoundHttpException) {
                    return response()->json([
                        'success' => false,
                        'message' => 'المسار المطلوب غير موجود',
                    ], 404);
                }

                // خطأ في الـ Validation (422)
                if ($e instanceof ValidationException) {
                    return response()->json([
                        'success' => false,
                        'message' => 'بيانات غير صحيحة',
                        'errors' => $e->errors(),
                    ], 422);
                }

                // أي خطأ آخر (500)
                $payload = [
                    'success' => false,
                    'message' => 'حدث خطأ في الخادم',
                ];

                if (config('app.debug')) {
                    $payload['error'] = $e->getMessage();
                }

                return response()->json($payload, 500);
            }
        });
    })

    ->create();
