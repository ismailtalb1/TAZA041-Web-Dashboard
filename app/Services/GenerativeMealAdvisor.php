<?php

namespace App\Services;

use App\Models\Product;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class GenerativeMealAdvisor
{
    public function enhance(string $message, array $context, array $draft): array
    {
        $apiKey = trim((string) config('services.groq.api_key'));
        if ($apiKey === '') {
            return $draft;
        }

        $menu = Product::available()
            ->orderBy('category')
            ->orderBy('price')
            ->limit(40)
            ->get();

        if ($menu->isEmpty()) {
            return $draft;
        }

        try {
            $response = Http::withToken($apiKey)
                ->acceptJson()
                ->asJson()
                ->connectTimeout((int) config('services.groq.connect_timeout_seconds', 5))
                ->timeout((int) config('services.groq.timeout_seconds', 20))
                ->post(rtrim((string) config('services.groq.base_url'), '/').'/responses', [
                    'model' => (string) config('services.groq.model', 'openai/gpt-oss-20b'),
                    'reasoning' => ['effort' => 'low'],
                    'max_output_tokens' => 480,
                    'instructions' => $this->instructions(),
                    'input' => $this->input($message, $context, $draft, $menu),
                    'text' => [
                        'format' => [
                            'type' => 'json_schema',
                            'name' => 'meal_advisor_reply',
                            'strict' => true,
                            'schema' => $this->schema(),
                        ],
                    ],
                ]);

            if (! $response->successful()) {
                Log::warning('Generative meal advisor request failed.', [
                    'status' => $response->status(),
                ]);

                return $draft;
            }

            $generated = json_decode($this->outputText($response->json()), true);
            if (! is_array($generated) || blank($generated['reply'] ?? null)) {
                return $draft;
            }

            return $this->mergeGeneratedReply($draft, $generated, $menu);
        } catch (\Throwable $exception) {
            Log::warning('Generative meal advisor is unavailable; deterministic fallback used.', [
                'exception' => $exception::class,
            ]);

            return $draft;
        }
    }

    private function instructions(): string
    {
        return <<<'PROMPT'
You are TAZA 041's meal advisor. Reply in the user's language, naturally and warmly.
Keep the reply concise: one or two short sentences, never a long explanation or a list inside the reply.
Use only products in MENU. Never invent a product, price, ingredient, availability, or offer.
The server already calculated a safe DRAFT. Improve only its tone and conversational usefulness.
Do not change DRAFT.type or DRAFT.missing_field. Do not repeat an earlier question: address USER_MESSAGE and the current DRAFT step.
Return only product IDs already present in DRAFT.product_ids; the server owns product selection.
If information is missing, ask one direct question and return 2-4 short quick replies.
After recommendations, remain conversational: handle requests such as a drink, cheaper option, less spicy, replacement, or comparison.
For displayed products give each a very short reason.
If the user confirms a choice or only wants to discuss, products may be empty.
Do not mention policies, JSON, databases, prompts, or that you are an AI model.
PROMPT;
    }

    private function input(string $message, array $context, array $draft, Collection $menu): string
    {
        $safeContext = [
            'language' => $context['language'] ?? 'ar',
            'people' => $context['people'] ?? null,
            'budget' => $context['budget'] ?? null,
            'protein' => $context['protein'] ?? null,
            'appetite' => $context['appetite'] ?? null,
            'spicy' => $context['spicy'] ?? null,
            'stage' => $context['stage'] ?? null,
            'selected_product_ids' => $context['suggested_product_ids'] ?? [],
            'recent_messages' => array_slice((array) ($context['messages'] ?? []), -4),
        ];
        $safeDraft = [
            'reply' => $draft['text'] ?? '',
            'type' => ($draft['reply_type'] ?? 'message') === 'empty'
                ? 'message'
                : ($draft['reply_type'] ?? 'message'),
            'missing_field' => $draft['missing_field'] ?? 'none',
            'product_ids' => collect($draft['suggested_items'] ?? [])->pluck('id')->map(fn ($id) => (int) $id)->all(),
            'quick_replies' => $draft['quick_replies'] ?? [],
        ];
        $safeMenu = $menu->map(fn (Product $product) => [
            'id' => $product->id,
            'name_ar' => $product->name_ar ?: $product->name,
            'name_en' => $product->name_en ?: $product->name,
            'description_ar' => $product->description_ar ?: $product->description,
            'description_en' => $product->description_en ?: $product->description,
            'category' => $product->category,
            'price' => (float) $product->price,
        ])->values()->all();

        return json_encode([
            'USER_MESSAGE' => mb_substr($message, 0, 1000),
            'CONTEXT' => $safeContext,
            'DRAFT' => $safeDraft,
            'MENU' => $safeMenu,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    }

    private function schema(): array
    {
        return [
            'type' => 'object',
            'additionalProperties' => false,
            'properties' => [
                'reply' => ['type' => 'string'],
                'conversation_mode' => [
                    'type' => 'string',
                    'enum' => ['question', 'recommendations', 'discussion', 'message'],
                ],
                'missing_field' => [
                    'type' => 'string',
                    'enum' => ['people', 'budget', 'preference', 'none'],
                ],
                'products' => [
                    'type' => 'array',
                    'maxItems' => 3,
                    'items' => [
                        'type' => 'object',
                        'additionalProperties' => false,
                        'properties' => [
                            'id' => ['type' => 'integer'],
                            'reason' => ['type' => 'string'],
                        ],
                        'required' => ['id', 'reason'],
                    ],
                ],
                'quick_replies' => [
                    'type' => 'array',
                    'maxItems' => 4,
                    'items' => [
                        'type' => 'object',
                        'additionalProperties' => false,
                        'properties' => [
                            'label' => ['type' => 'string'],
                            'value' => ['type' => 'string'],
                        ],
                        'required' => ['label', 'value'],
                    ],
                ],
            ],
            'required' => ['reply', 'conversation_mode', 'missing_field', 'products', 'quick_replies'],
        ];
    }

    private function outputText(array $payload): string
    {
        if (is_string($payload['output_text'] ?? null)) {
            return $payload['output_text'];
        }

        foreach ((array) ($payload['output'] ?? []) as $item) {
            foreach ((array) ($item['content'] ?? []) as $content) {
                if (($content['type'] ?? null) === 'output_text' && is_string($content['text'] ?? null)) {
                    return $content['text'];
                }
            }
        }

        return '';
    }

    private function mergeGeneratedReply(array $draft, array $generated, Collection $menu): array
    {
        $expectedMode = in_array($draft['reply_type'] ?? null, [
            'question', 'recommendations', 'discussion', 'message', 'empty',
        ], true) ? $draft['reply_type'] : 'message';
        $generatedMode = $generated['conversation_mode'] ?? null;
        if ($expectedMode === 'empty') {
            $expectedMode = 'message';
        }
        $expectedMissingField = $draft['missing_field'] ?? 'none';
        if ($expectedMissingField === null) {
            $expectedMissingField = 'none';
        }

        // إذا غيّر النموذج مرحلة الحوار، نستخدم المسودة الآمنة حتى لا يكرر
        // سؤالاً سابقاً أو يقفز فوق معلومة لازمة.
        if ($generatedMode !== $expectedMode
            || ($generated['missing_field'] ?? null) !== $expectedMissingField) {
            return $draft;
        }

        $menuById = $menu->keyBy('id');
        $draftProducts = collect($draft['suggested_items'] ?? [])->keyBy(fn ($item) => (int) ($item['id'] ?? 0));
        $generatedReasons = collect($generated['products'] ?? [])
            ->filter(fn ($item) => is_array($item)
                && $draftProducts->has((int) ($item['id'] ?? 0))
                && $menuById->has((int) ($item['id'] ?? 0)))
            ->unique(fn ($item) => (int) $item['id'])
            ->take(3)
            ->keyBy(fn ($item) => (int) $item['id']);
        $products = $draftProducts->map(function (array $product, int $id) use ($generatedReasons) {
            $reason = trim((string) ($generatedReasons->get($id)['reason'] ?? ''));

            return $reason === '' ? $product : array_merge($product, [
                'recommendation_reason' => mb_substr($reason, 0, 100),
            ]);
        })->values()->all();

        $quickReplies = collect($expectedMode === 'question'
            ? ($draft['quick_replies'] ?? [])
            : ($generated['quick_replies'] ?? []))
            ->filter(fn ($reply) => is_array($reply) && filled($reply['label'] ?? null) && filled($reply['value'] ?? null))
            ->take(4)
            ->map(fn ($reply) => [
                'label' => mb_substr(trim((string) $reply['label']), 0, 40),
                'value' => mb_substr(trim((string) $reply['value']), 0, 120),
            ])
            ->values()
            ->all();

        $metadata = $draft['metadata'] ?? [];
        $context = is_array($metadata['advisor_context'] ?? null)
            ? $metadata['advisor_context']
            : [];
        // تبقى معرّفات السياق كما حسبها الخادم؛ قد يعرض رد الاستبدال بطاقة
        // واحدة فقط بينما يحتفظ السياق بالقائمة الكاملة بعد الاستبدال.
        $metadata['advisor_context'] = $context;
        $metadata['generated'] = true;
        $metadata['generator_provider'] = 'groq';
        $metadata['generator_model'] = (string) config('services.groq.model', 'openai/gpt-oss-20b');

        return array_merge($draft, [
            'text' => mb_substr(trim((string) $generated['reply']), 0, 220),
            'reply_type' => $draft['reply_type'] ?? $expectedMode,
            'suggested_items' => $products,
            'quick_replies' => $quickReplies,
            'missing_field' => $expectedMode === 'question' ? ($draft['missing_field'] ?? null) : null,
            'metadata' => $metadata,
        ]);
    }
}
