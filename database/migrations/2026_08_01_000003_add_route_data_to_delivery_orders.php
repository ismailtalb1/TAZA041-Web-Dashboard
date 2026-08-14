<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('delivery_orders', function (Blueprint $table) {
            $table->decimal('origin_latitude', 10, 7)->nullable();
            $table->decimal('origin_longitude', 10, 7)->nullable();
            $table->json('route_geometry')->nullable();
            $table->unsignedInteger('route_duration_seconds')->nullable();
            $table->string('route_provider', 50)->nullable();
            $table->boolean('route_is_fallback')->default(false);
            $table->timestamp('route_calculated_at')->nullable();
        });

        $restaurant = DB::table('restaurant_info')->first(['latitude', 'longitude']);
        $originLatitude = (float) ($restaurant?->latitude ?? 35.5317);
        $originLongitude = (float) ($restaurant?->longitude ?? 35.7901);
        $speedMetersPerSecond = 30 * 1000 / 3600;

        DB::table('delivery_orders')
            ->orderBy('id')
            ->chunkById(100, function ($deliveries) use ($originLatitude, $originLongitude, $speedMetersPerSecond) {
                foreach ($deliveries as $delivery) {
                    if (is_null($delivery->latitude) || is_null($delivery->longitude)) {
                        continue;
                    }

                    $distance = (float) ($delivery->distance_meters ?? 0);
                    DB::table('delivery_orders')->where('id', $delivery->id)->update([
                        'origin_latitude' => $originLatitude,
                        'origin_longitude' => $originLongitude,
                        'route_geometry' => json_encode([
                            [$originLongitude, $originLatitude],
                            [(float) $delivery->longitude, (float) $delivery->latitude],
                        ]),
                        'route_duration_seconds' => $distance > 0
                            ? max(60, (int) ceil($distance / $speedMetersPerSecond))
                            : null,
                        'route_provider' => 'legacy_haversine',
                        'route_is_fallback' => true,
                        'route_calculated_at' => $delivery->created_at ?? now(),
                    ]);
                }
            });
    }

    public function down(): void
    {
        Schema::table('delivery_orders', function (Blueprint $table) {
            $table->dropColumn([
                'origin_latitude',
                'origin_longitude',
                'route_geometry',
                'route_duration_seconds',
                'route_provider',
                'route_is_fallback',
                'route_calculated_at',
            ]);
        });
    }
};
