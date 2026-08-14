<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** @var list<string> */
    private array $moneyKeys = [
        'price',
        'offer_price',
        'original_price',
        'total_price',
        'final_price',
        'unit_price',
        'subtotal',
        'discount',
        'amount',
        'delivery_cost',
        'extra_cost',
        'current_balance',
        'max_balance',
        'cost_per_100m',
        'cost_per_km',
        'vip_extra_cost',
        'vip_table_extra_cost',
        'cost_per_extra_seat',
        'extra_cost_per_extra_seat',
    ];

    public function up(): void
    {
        $this->scaleSnapshots(100);
    }

    public function down(): void
    {
        $this->scaleSnapshots(0.01);
    }

    private function scaleSnapshots(float $divisor): void
    {
        if (Schema::hasTable('notifications')) {
            DB::table('notifications')
                ->select(['id', 'message', 'data'])
                ->orderBy('id')
                ->chunkById(100, function ($rows) use ($divisor) {
                    foreach ($rows as $row) {
                        $updates = [
                            'message' => $this->scaleMoneyInText($row->message, $divisor),
                        ];

                        $scaledData = $this->scaleJson($row->data, $divisor);
                        if ($scaledData !== null) {
                            $updates['data'] = $scaledData;
                        }

                        DB::table('notifications')->where('id', $row->id)->update($updates);
                    }
                });
        }

        if (Schema::hasTable('ai_conversations')) {
            DB::table('ai_conversations')
                ->select(['id', 'ai_response', 'metadata'])
                ->orderBy('id')
                ->chunkById(100, function ($rows) use ($divisor) {
                    foreach ($rows as $row) {
                        $updates = [
                            'ai_response' => $this->scaleMoneyInText($row->ai_response, $divisor),
                        ];

                        $scaledMetadata = $this->scaleJson($row->metadata, $divisor);
                        if ($scaledMetadata !== null) {
                            $updates['metadata'] = $scaledMetadata;
                        }

                        DB::table('ai_conversations')->where('id', $row->id)->update($updates);
                    }
                });
        }
    }

    private function scaleMoneyInText(?string $text, float $divisor): ?string
    {
        if ($text === null || $text === '') {
            return $text;
        }

        return preg_replace_callback(
            '/(?<![\d,])(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?(?=\s*(?:ل\.س|SYP)))/u',
            function (array $match) use ($divisor) {
                $value = (float) str_replace(',', '', $match[0]);

                return $this->formatMoneyNumber($value / $divisor);
            },
            $text
        );
    }

    private function scaleJson(?string $json, float $divisor): ?string
    {
        if ($json === null || $json === '') {
            return null;
        }

        $data = json_decode($json, true);
        if (! is_array($data)) {
            return null;
        }

        $scaled = $this->scaleArray($data, $divisor);

        return json_encode($scaled, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    private function scaleArray(array $data, float $divisor): array
    {
        foreach ($data as $key => $value) {
            if (is_array($value)) {
                $data[$key] = $this->scaleArray($value, $divisor);
            } elseif (in_array((string) $key, $this->moneyKeys, true) && is_numeric($value)) {
                $data[$key] = round(((float) $value) / $divisor, 2);
            }
        }

        return $data;
    }

    private function formatMoneyNumber(float $value): string
    {
        return rtrim(rtrim(number_format(round($value, 2), 2, '.', ','), '0'), '.');
    }
};
