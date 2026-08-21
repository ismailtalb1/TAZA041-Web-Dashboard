<?php

namespace App\Http\Middleware;

use App\Models\Customer;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class TrackCustomerIp
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if ($user instanceof Customer) {
            $user->recordAccessIp($request->ip());
            $this->renewActiveCustomerToken($user);
        }

        return $next($request);
    }

    private function renewActiveCustomerToken(Customer $customer): void
    {
        $token = $customer->currentAccessToken();
        $lifetimeMinutes = (int) config('sanctum.customer_token_expiration', 43200);

        if (! is_object($token)
            || ! method_exists($token, 'getAttribute')
            || $lifetimeMinutes <= 0) {
            return;
        }

        $expiresAt = $token->getAttribute('expires_at');
        if (! $expiresAt || $expiresAt->greaterThan(now()->addMinutes(intdiv($lifetimeMinutes, 2)))) {
            return;
        }

        // تمديد منزلق: المستخدم النشط يبقى مسجلاً، بينما تنتهي الجلسة
        // غير المستخدمة بعد المدة المحددة. لا نكتب في كل طلب مزامنة.
        $token->forceFill([
            'expires_at' => now()->addMinutes($lifetimeMinutes),
        ])->save();
    }
}
