<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $this->renameRateColumn(
            'loyalty_points_per_1000_syp',
            'loyalty_points_per_10_syp'
        );
        $this->replaceHistoricalRateText('1000', '10');
    }

    public function down(): void
    {
        $this->renameRateColumn(
            'loyalty_points_per_10_syp',
            'loyalty_points_per_1000_syp'
        );
        $this->replaceHistoricalRateText('10', '1000');
    }

    private function renameRateColumn(string $from, string $to): void
    {
        if (! Schema::hasTable('restaurant_info')
            || ! Schema::hasColumn('restaurant_info', $from)
            || Schema::hasColumn('restaurant_info', $to)) {
            return;
        }

        Schema::table('restaurant_info', function (Blueprint $table) use ($from, $to) {
            $table->renameColumn($from, $to);
        });
    }

    private function replaceHistoricalRateText(string $from, string $to): void
    {
        $replacements = [
            "كل {$from} ل.س" => "كل {$to} ل.س",
            "لكل {$from} ل.س" => "لكل {$to} ل.س",
        ];

        $this->replaceTextInTable(
            'notifications',
            'message',
            'data',
            $replacements
        );
        $this->replaceTextInTable(
            'ai_conversations',
            'ai_response',
            'metadata',
            $replacements
        );
    }

    private function replaceTextInTable(
        string $table,
        string $textColumn,
        string $jsonColumn,
        array $replacements
    ): void {
        if (! Schema::hasTable($table)) {
            return;
        }

        DB::table($table)
            ->select(['id', $textColumn, $jsonColumn])
            ->orderBy('id')
            ->chunkById(100, function ($rows) use (
                $table,
                $textColumn,
                $jsonColumn,
                $replacements
            ) {
                foreach ($rows as $row) {
                    $updates = [
                        $textColumn => str_replace(
                            array_keys($replacements),
                            array_values($replacements),
                            $row->{$textColumn}
                        ),
                    ];

                    $json = $this->replaceTextInJson(
                        $row->{$jsonColumn},
                        $replacements
                    );
                    if ($json !== null) {
                        $updates[$jsonColumn] = $json;
                    }

                    DB::table($table)->where('id', $row->id)->update($updates);
                }
            });
    }

    private function replaceTextInJson(?string $json, array $replacements): ?string
    {
        if ($json === null || $json === '') {
            return null;
        }

        $data = json_decode($json, true);
        if (! is_array($data)) {
            return null;
        }

        $data = $this->replaceTextInArray($data, $replacements);

        return json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    private function replaceTextInArray(array $data, array $replacements): array
    {
        foreach ($data as $key => $value) {
            if (is_array($value)) {
                $data[$key] = $this->replaceTextInArray($value, $replacements);
            } elseif (is_string($value)) {
                $data[$key] = str_replace(
                    array_keys($replacements),
                    array_values($replacements),
                    $value
                );
            }
        }

        return $data;
    }
};
