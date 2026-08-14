<?php

namespace App\Services;

use App\Models\DeliveryOrder;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Throwable;

class DeliveryRouteService
{
    /**
     * @return array{distance_meters: float, duration_seconds: int, geometry: array<int, array{0: float, 1: float}>, provider: string, is_fallback: bool, calculated_at: string}
     */
    public function calculate(
        float $originLatitude,
        float $originLongitude,
        float $destinationLatitude,
        float $destinationLongitude
    ): array {
        $cacheKey = 'delivery-route:'.sha1(json_encode([
            round($originLatitude, 6),
            round($originLongitude, 6),
            round($destinationLatitude, 6),
            round($destinationLongitude, 6),
            config('services.delivery_routing.profile', 'driving'),
        ]));

        return Cache::remember(
            $cacheKey,
            now()->addMinutes((int) config('services.delivery_routing.cache_minutes', 10)),
            fn () => $this->calculateUncached(
                $originLatitude,
                $originLongitude,
                $destinationLatitude,
                $destinationLongitude
            )
        );
    }

    private function calculateUncached(
        float $originLatitude,
        float $originLongitude,
        float $destinationLatitude,
        float $destinationLongitude
    ): array {
        if (! config('services.delivery_routing.enabled', true)) {
            return $this->fallback($originLatitude, $originLongitude, $destinationLatitude, $destinationLongitude);
        }

        $baseUrl = rtrim((string) config('services.delivery_routing.base_url'), '/');
        $profile = preg_replace('/[^a-z0-9_-]/i', '', (string) config('services.delivery_routing.profile', 'driving')) ?: 'driving';
        $coordinates = implode(';', [
            $this->coordinate($originLongitude).','.$this->coordinate($originLatitude),
            $this->coordinate($destinationLongitude).','.$this->coordinate($destinationLatitude),
        ]);

        try {
            $response = Http::acceptJson()
                ->timeout((int) config('services.delivery_routing.timeout_seconds', 8))
                ->connectTimeout((int) config('services.delivery_routing.connect_timeout_seconds', 4))
                ->get("{$baseUrl}/route/v1/{$profile}/{$coordinates}", [
                    'alternatives' => 'false',
                    'steps' => 'false',
                    'overview' => 'full',
                    'geometries' => 'geojson',
                ]);

            $route = $response->successful() && $response->json('code') === 'Ok'
                ? $response->json('routes.0')
                : null;
            $geometry = $this->normalizeGeometry($route['geometry']['coordinates'] ?? null);
            $distance = (float) ($route['distance'] ?? 0);
            $duration = (int) round((float) ($route['duration'] ?? 0));

            if ($distance <= 0 || $duration <= 0 || count($geometry) < 2) {
                return $this->fallback($originLatitude, $originLongitude, $destinationLatitude, $destinationLongitude);
            }

            return [
                'distance_meters' => round($distance, 2),
                'duration_seconds' => $duration,
                'geometry' => $geometry,
                'provider' => 'osrm',
                'is_fallback' => false,
                'calculated_at' => now()->toIso8601String(),
            ];
        } catch (Throwable) {
            return $this->fallback($originLatitude, $originLongitude, $destinationLatitude, $destinationLongitude);
        }
    }

    /** @return array<int, array{0: float, 1: float}> */
    private function normalizeGeometry(mixed $coordinates): array
    {
        if (! is_array($coordinates)) {
            return [];
        }

        return collect($coordinates)
            ->filter(fn ($point) => is_array($point)
                && count($point) >= 2
                && is_numeric($point[0])
                && is_numeric($point[1]))
            ->map(fn ($point) => [(float) $point[0], (float) $point[1]])
            ->values()
            ->all();
    }

    /** @return array{distance_meters: float, duration_seconds: int, geometry: array<int, array{0: float, 1: float}>, provider: string, is_fallback: bool, calculated_at: string} */
    private function fallback(
        float $originLatitude,
        float $originLongitude,
        float $destinationLatitude,
        float $destinationLongitude
    ): array {
        $distance = DeliveryOrder::calculateDistanceMeters(
            $originLatitude,
            $originLongitude,
            $destinationLatitude,
            $destinationLongitude
        );
        $speedKph = max(1, (float) config('services.delivery_routing.fallback_speed_kph', 30));
        $duration = max(60, (int) ceil($distance / ($speedKph * 1000 / 3600)));

        return [
            'distance_meters' => $distance,
            'duration_seconds' => $duration,
            'geometry' => [
                [$originLongitude, $originLatitude],
                [$destinationLongitude, $destinationLatitude],
            ],
            'provider' => 'haversine_fallback',
            'is_fallback' => true,
            'calculated_at' => now()->toIso8601String(),
        ];
    }

    private function coordinate(float $value): string
    {
        return number_format($value, 7, '.', '');
    }
}
