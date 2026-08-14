<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        RateLimiter::for('employee-login', function (Request $request) {
            return $this->loginLimits(
                $request,
                Str::lower(trim((string) $request->input('username')))
            );
        });

        RateLimiter::for('customer-login', function (Request $request) {
            $identifier = $request->input('identifier')
                ?: $request->input('email')
                ?: $request->input('phone');

            return $this->loginLimits(
                $request,
                Str::lower(trim((string) $identifier))
            );
        });

        RateLimiter::for('customer-password-email', function (Request $request) {
            $email = Str::lower(trim((string) $request->input('email')));
            $response = fn (Request $request, array $headers) => response()->json([
                'success' => false,
                'message' => 'تم تجاوز عدد طلبات الاستعادة المسموح به. حاول مجدداً بعد قليل.',
            ], 429, $headers);

            return [
                Limit::perMinutes(15, 5)
                    ->by('email:'.hash('sha256', $email))
                    ->response($response),
                Limit::perMinutes(15, 20)
                    ->by('ip:'.hash('sha256', $request->ip()))
                    ->response($response),
            ];
        });

        RateLimiter::for('customer-password-reset', function (Request $request) {
            $email = Str::lower(trim((string) $request->input('email')));
            $response = fn (Request $request, array $headers) => response()->json([
                'success' => false,
                'message' => 'تم تجاوز عدد المحاولات المسموح به. حاول مجدداً بعد قليل.',
            ], 429, $headers);

            return [
                Limit::perMinute(10)
                    ->by('email:'.hash('sha256', $email))
                    ->response($response),
                Limit::perMinute(30)
                    ->by('ip:'.hash('sha256', $request->ip()))
                    ->response($response),
            ];
        });
    }

    private function loginLimits(Request $request, string $identifier): array
    {
        $response = fn (Request $request, array $headers) => response()->json([
            'success' => false,
            'message' => 'تم تجاوز عدد محاولات تسجيل الدخول المسموح به. حاول مجدداً بعد قليل.',
        ], 429, $headers);

        return [
            Limit::perMinute(5)
                ->by('identifier:'.hash('sha256', $identifier))
                ->response($response),
            Limit::perMinute(20)
                ->by('ip:'.hash('sha256', $request->ip()))
                ->response($response),
        ];
    }
}
