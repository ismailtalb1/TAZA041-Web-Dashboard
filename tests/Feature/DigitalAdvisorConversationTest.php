<?php

namespace Tests\Feature;

use App\Models\AiConversation;
use App\Models\Customer;
use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class DigitalAdvisorConversationTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    protected function setUp(): void
    {
        parent::setUp();

        config()->set('services.groq.api_key', null);
    }

    public function test_advisor_remembers_answers_and_returns_orderable_menu_cards(): void
    {
        $customer = $this->customer('advisor-one@example.test');

        $peopleStep = $this->actingAs($customer, 'sanctum')
            ->postJson('/api/customer/ai/chat', [
                'message' => 'أريد وجبة خفيفة لشخصين',
            ])
            ->assertOk()
            ->assertJsonPath('data.reply_type', 'question')
            ->assertJsonPath('data.missing_field', 'budget');

        $budgetStep = $this->actingAs($customer, 'sanctum')
            ->postJson('/api/customer/ai/chat', [
                'message' => 'ميزانيتي 600',
                'conversation_id' => $peopleStep->json('data.conversation_id'),
            ])
            ->assertOk()
            ->assertJsonPath('data.reply_type', 'question')
            ->assertJsonPath('data.missing_field', 'preference');

        $recommendations = $this->actingAs($customer, 'sanctum')
            ->postJson('/api/customer/ai/chat', [
                'message' => 'أفضل الدجاج الحار',
                'conversation_id' => $budgetStep->json('data.conversation_id'),
            ])
            ->assertOk()
            ->assertJsonPath('data.reply_type', 'recommendations')
            ->assertJsonPath('data.has_suggestions', true)
            ->assertJsonPath('data.suggested_items.0.name_en', 'Chicken Shawarma')
            ->assertJsonStructure([
                'data' => [
                    'suggested_items' => [[
                        'id',
                        'name_ar',
                        'name_en',
                        'price',
                        'is_available',
                        'recommendation_reason',
                    ]],
                ],
            ]);

        $lastConversation = AiConversation::findOrFail($recommendations->json('data.conversation_id'));
        $this->assertSame(2, $lastConversation->metadata['advisor_context']['people']);
        $this->assertSame(600, $lastConversation->metadata['advisor_context']['budget']);
        $this->assertSame('chicken', $lastConversation->metadata['advisor_context']['protein']);
        $this->assertTrue($lastConversation->metadata['advisor_context']['spicy']);
        $this->assertSame('recommended', $lastConversation->metadata['advisor_context']['stage']);
    }

    public function test_customer_cannot_reuse_another_customers_advisor_context(): void
    {
        $firstCustomer = $this->customer('advisor-owner@example.test');
        $otherCustomer = $this->customer('advisor-other@example.test');

        $ownerStep = $this->actingAs($firstCustomer, 'sanctum')
            ->postJson('/api/customer/ai/chat', [
                'message' => 'أريد وجبة لشخصين وميزانيتي 600',
            ])
            ->assertOk();

        $this->actingAs($otherCustomer, 'sanctum')
            ->postJson('/api/customer/ai/chat', [
                'message' => 'أفضل الدجاج',
                'conversation_id' => $ownerStep->json('data.conversation_id'),
            ])
            ->assertOk()
            ->assertJsonPath('data.reply_type', 'question')
            ->assertJsonPath('data.missing_field', 'people');
    }

    public function test_advisor_continues_with_drinks_and_cheaper_options_after_recommendations(): void
    {
        Product::create([
            'name' => 'Budget Bite',
            'name_ar' => 'لقمة اقتصادية',
            'name_en' => 'Budget Bite',
            'description' => 'Simple light sandwich',
            'description_ar' => 'سندويشة خفيفة وبسيطة',
            'description_en' => 'Simple light sandwich',
            'category' => Product::CATEGORY_SANDWICH,
            'price' => 80,
            'stock_quantity' => 20,
            'is_active' => true,
        ]);
        $customer = $this->customer('advisor-follow-up@example.test');
        $recommendations = $this->actingAs($customer, 'sanctum')
            ->postJson('/api/customer/ai/chat', [
                'message' => 'أريد وجبة لثلاثة أشخاص وميزانيتي 900 وأفضل اللحوم',
            ])
            ->assertOk()
            ->assertJsonPath('data.reply_type', 'recommendations');

        $originalMinimum = collect($recommendations->json('data.suggested_items'))->min('price');
        $cheaper = $this->actingAs($customer, 'sanctum')
            ->postJson('/api/customer/ai/chat', [
                'message' => 'أريد خيارًا أرخص',
                'conversation_id' => $recommendations->json('data.conversation_id'),
            ])
            ->assertOk()
            ->assertJsonPath('data.reply_type', 'discussion')
            ->assertJsonPath('data.has_suggestions', true);

        foreach ($cheaper->json('data.suggested_items') as $item) {
            $this->assertLessThan($originalMinimum, $item['price']);
        }

        $drink = $this->actingAs($customer, 'sanctum')
            ->postJson('/api/customer/ai/chat', [
                'message' => 'أريد مشروبًا مناسبًا',
                'conversation_id' => $cheaper->json('data.conversation_id'),
            ])
            ->assertOk()
            ->assertJsonPath('data.reply_type', 'discussion')
            ->assertJsonPath('data.has_suggestions', true);

        $this->assertNotEmpty($drink->json('data.suggested_items'));
        $this->assertSame(
            ['drink'],
            collect($drink->json('data.suggested_items'))->pluck('category')->unique()->values()->all(),
        );

    }

    public function test_advisor_can_replace_a_numbered_option_and_keep_the_conversation_open(): void
    {
        $customer = $this->customer('advisor-replace@example.test');
        $recommendations = $this->actingAs($customer, 'sanctum')
            ->postJson('/api/customer/ai/chat', [
                'message' => 'أريد وجبة لشخصين وميزانيتي 600 ولا فرق لدي',
            ])
            ->assertOk()
            ->assertJsonPath('data.reply_type', 'recommendations');

        $originalIds = collect($recommendations->json('data.suggested_items'))->pluck('id')->all();
        $replacement = $this->actingAs($customer, 'sanctum')
            ->postJson('/api/customer/ai/chat', [
                'message' => 'غير الخيار الثاني',
                'conversation_id' => $recommendations->json('data.conversation_id'),
            ])
            ->assertOk()
            ->assertJsonPath('data.reply_type', 'discussion');

        $replacementId = $replacement->json('data.suggested_items.0.id');
        $this->assertNotNull($replacementId);
        $this->assertNotContains($replacementId, $originalIds);

        $saved = AiConversation::findOrFail($replacement->json('data.conversation_id'));
        $this->assertSame('replacement', $saved->metadata['advisor_action']);
        $this->assertCount(3, $saved->metadata['advisor_context']['suggested_product_ids']);
    }

    public function test_generative_layer_cannot_repeat_the_previous_question_or_change_the_step(): void
    {
        $customer = $this->customer('advisor-generated-guard@example.test');
        $people = $this->actingAs($customer, 'sanctum')
            ->postJson('/api/customer/ai/chat', ['message' => 'اقترح لي شيئًا جيدًا'])
            ->assertOk()
            ->assertJsonPath('data.missing_field', 'people');

        config()->set('services.groq.api_key', 'test-key');
        config()->set('services.groq.base_url', 'https://groq.test/openai/v1');
        Http::fake([
            'groq.test/*' => Http::response([
                'output_text' => json_encode([
                    'reply' => 'اذكر عدد الأشخاص وسأساعدك.',
                    'conversation_mode' => 'question',
                    'missing_field' => 'people',
                    'products' => [],
                    'quick_replies' => [],
                ], JSON_UNESCAPED_UNICODE),
            ]),
        ]);

        $budget = $this->actingAs($customer, 'sanctum')
            ->postJson('/api/customer/ai/chat', [
                'message' => '3 أشخاص',
                'conversation_id' => $people->json('data.conversation_id'),
            ])
            ->assertOk()
            ->assertJsonPath('data.missing_field', 'budget');

        $this->assertStringContainsString('الميزانية', $budget->json('data.reply'));
        $this->assertStringNotContainsString('عدد الأشخاص', $budget->json('data.reply'));
    }

    public function test_valid_generative_reply_improves_tone_without_changing_server_choices(): void
    {
        $customer = $this->customer('advisor-generated-valid@example.test');
        $people = $this->actingAs($customer, 'sanctum')
            ->postJson('/api/customer/ai/chat', ['message' => 'ساعدني في اختيار وجبة'])
            ->assertOk()
            ->assertJsonPath('data.missing_field', 'people');

        config()->set('services.groq.api_key', 'test-key');
        config()->set('services.groq.base_url', 'https://groq.test/openai/v1');
        Http::fake([
            'groq.test/*' => Http::response([
                'output_text' => json_encode([
                    'reply' => 'حلو! بقي أن أعرف ميزانيتك الإجمالية 💛',
                    'conversation_mode' => 'question',
                    'missing_field' => 'budget',
                    'products' => [],
                    'quick_replies' => [
                        ['label' => 'خيار غير آمن', 'value' => 'قيمة غير محسوبة'],
                    ],
                ], JSON_UNESCAPED_UNICODE),
            ]),
        ]);

        $budget = $this->actingAs($customer, 'sanctum')
            ->postJson('/api/customer/ai/chat', [
                'message' => 'لشخصين',
                'conversation_id' => $people->json('data.conversation_id'),
            ])
            ->assertOk()
            ->assertJsonPath('data.reply', 'حلو! بقي أن أعرف ميزانيتك الإجمالية 💛')
            ->assertJsonPath('data.missing_field', 'budget');

        $this->assertNotEmpty($budget->json('data.quick_replies'));
        $this->assertNotSame('خيار غير آمن', $budget->json('data.quick_replies.0.label'));
        Http::assertSent(fn ($request) => $request->url() === 'https://groq.test/openai/v1/responses'
            && $request['model'] === 'openai/gpt-oss-20b'
            && ! isset($request['store'])
            && ! isset($request['text']['verbosity'])
            && $request['text']['format']['type'] === 'json_schema'
        );
    }

    private function customer(string $email): Customer
    {
        return Customer::create([
            'name' => 'Advisor Customer',
            'email' => $email,
            'password_hash' => bcrypt('Password123'),
            'status' => Customer::STATUS_REGISTERED,
            'loyalty_points' => 0,
        ]);
    }
}
