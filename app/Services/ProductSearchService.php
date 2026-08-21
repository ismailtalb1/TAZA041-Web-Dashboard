<?php

namespace App\Services;

use App\Models\Product;
use Illuminate\Support\Collection;

class ProductSearchService
{
    /**
     * ترتيب المنتجات حسب التطابق المباشر أو التقارب الإملائي.
     * هذا نموذج محلي حتمي لا يرسل أسماء المنتجات إلى خدمة خارجية.
     *
     * @param  Collection<int, Product>  $products
     * @return Collection<int, Product>
     */
    public function rank(Collection $products, string $query): Collection
    {
        $query = $this->normalize($query);
        if ($query === '') {
            return $products->values();
        }

        return $products
            ->map(fn (Product $product) => [
                'product' => $product,
                'score' => $this->score($product, $query),
            ])
            ->filter(fn (array $match) => $match['score'] >= 0.54)
            ->sortByDesc('score')
            ->pluck('product')
            ->values();
    }

    public function bestCorrection(Collection $ranked, string $query): ?string
    {
        $first = $ranked->first();
        if (! $first instanceof Product) {
            return null;
        }

        $normalizedQuery = $this->normalize($query);
        $names = array_filter([$first->name, $first->name_ar, $first->name_en]);
        $directMatch = collect($names)->contains(
            fn (string $name) => str_contains($this->normalize($name), $normalizedQuery)
        );

        return $directMatch ? null : ($first->name_en ?: $first->name_ar ?: $first->name);
    }

    private function score(Product $product, string $query): float
    {
        $names = array_filter([
            $product->name,
            $product->name_ar,
            $product->name_en,
        ]);
        $descriptions = array_filter([
            $product->description,
            $product->description_ar,
            $product->description_en,
        ]);

        return max(
            $this->scoreText($this->normalize(implode(' ', $names)), $query),
            $this->scoreText($this->normalize(implode(' ', $descriptions)), $query) * 0.6
        );
    }

    private function scoreText(string $text, string $query): float
    {
        if ($text === '') {
            return 0.0;
        }

        if ($text === $query) {
            return 1.0;
        }
        if (str_contains($text, $query)) {
            return 0.96;
        }

        $queryTokens = $this->tokens($query);
        $candidateTokens = $this->tokens($text);
        if ($queryTokens === [] || $candidateTokens === []) {
            return 0.0;
        }

        $tokenScores = array_map(function (string $needle) use ($candidateTokens): float {
            $best = 0.0;
            foreach ($candidateTokens as $candidate) {
                if ($candidate === $needle) {
                    return 1.0;
                }
                if (min(strlen($candidate), strlen($needle)) >= 3
                    && (str_contains($candidate, $needle) || str_contains($needle, $candidate))) {
                    $best = max($best, 0.88);

                    continue;
                }

                $maxLength = max(strlen($needle), strlen($candidate));
                if ($maxLength < 3) {
                    continue;
                }
                $best = max($best, 1 - (levenshtein($needle, $candidate) / $maxLength));
            }

            return $best;
        }, $queryTokens);

        return array_sum($tokenScores) / count($tokenScores);
    }

    /** @return array<int, string> */
    private function tokens(string $value): array
    {
        return array_values(array_filter(preg_split('/\s+/u', $value) ?: []));
    }

    private function normalize(string $value): string
    {
        $value = mb_strtolower($value, 'UTF-8');
        $value = strtr($value, [
            'أ' => 'ا', 'إ' => 'ا', 'آ' => 'ا', 'ى' => 'ي', 'ة' => 'ه', 'ؤ' => 'و', 'ئ' => 'ي',
        ]);
        $value = preg_replace('/[\x{064B}-\x{065F}\x{0670}]/u', '', $value) ?? $value;
        $value = preg_replace('/[^\p{L}\p{N}]+/u', ' ', $value) ?? '';

        return trim(preg_replace('/\s+/u', ' ', $value) ?? '');
    }
}
