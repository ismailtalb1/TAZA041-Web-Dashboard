<?php

namespace App\Models;

use App\Services\GenerativeMealAdvisor;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AiConversation extends Model
{
    use HasFactory;

    // ✅ مطابق لقاعدة البيانات
    protected $table = 'ai_conversations';

    protected $fillable = [
        'customer_id',
        'employee_id',
        'user_message',
        'ai_response',
        'intent',
        'metadata',
    ];

    protected $casts = [
        'metadata' => 'array',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    // ─────────────────────────────────────────────
    // الثوابت — نوايا المحادثة (Intent)
    // ─────────────────────────────────────────────
    const INTENT_MEAL_SUGGESTION = 'meal_suggestion';

    const INTENT_PRICE_INQUIRY = 'price_inquiry';

    const INTENT_OFFERS_INQUIRY = 'offers_inquiry';

    const INTENT_RESERVATION_HELP = 'reservation_inquiry';

    const INTENT_GENERAL = 'general';

    const INTENT_UNMATCHED_REQUEST = 'unmatched_request';

    const INTENT_COMPLAINT = 'complaint';

    // ─────────────────────────────────────────────
    // العلاقات
    // ─────────────────────────────────────────────
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    // ─────────────────────────────────────────────
    // Scopes
    // ─────────────────────────────────────────────
    public function scopeRecent($query, int $hours = 24)
    {
        return $query->where('created_at', '>=', now()->subHours($hours));
    }

    public function scopeUnmatched($query)
    {
        return $query->where('intent', self::INTENT_UNMATCHED_REQUEST);
    }

    public function scopeByCustomer($query, int $customerId)
    {
        return $query->where('customer_id', $customerId);
    }

    // ─────────────────────────────────────────────
    // مستشار وجبات يحسب المنتجات الآمنة من المنيو محلياً، ثم يسمح لطبقة
    // توليدية اختيارية بتحسين صياغة الرد من دون اختراع منتجات أو أسعار.
    // ─────────────────────────────────────────────
    public static function chat(
        string $message,
        ?Customer $customer = null,
        ?self $previousConversation = null,
    ): array {

        $advisorContext = self::advisorContextFrom($previousConversation);

        // نحافظ على جلسة اختيار الوجبة في الإجابات القصيرة، مع السماح للزبون
        // بالانتقال الصريح إلى العروض أو الحجز أو الشكاوى.
        $detectedIntent = self::detectIntent($message);
        if (! $advisorContext && $detectedIntent === self::INTENT_GENERAL) {
            $detectedIntent = self::INTENT_MEAL_SUGGESTION;
        }
        $continuesAdvisor = $advisorContext && in_array($detectedIntent, [
            self::INTENT_GENERAL,
            self::INTENT_MEAL_SUGGESTION,
            self::INTENT_PRICE_INQUIRY,
        ], true);
        $intent = $continuesAdvisor
            ? self::INTENT_MEAL_SUGGESTION
            : $detectedIntent;

        // توليد الرد حسب النية
        $response = self::generateResponse(
            $intent,
            $message,
            $customer,
            $advisorContext,
        );

        if ($intent === self::INTENT_MEAL_SUGGESTION) {
            $response = app(GenerativeMealAdvisor::class)->enhance(
                $message,
                $response['metadata']['advisor_context'] ?? $advisorContext,
                $response,
            );
        }

        // حفظ المحادثة
        $conversation = self::create([
            'customer_id' => $customer?->id,
            'user_message' => $message,
            'ai_response' => $response['text'],
            'intent' => $intent,
            'metadata' => $response['metadata'] ?? [],
        ]);

        // إذا لم يُطابق أي طبق → حفظ كاقتراح
        if ($intent === self::INTENT_UNMATCHED_REQUEST && $customer) {
            MealSuggestion::create([
                'customer_id' => $customer->id,
                'suggestion_text' => "AI flagged: {$message}",
                'status' => MealSuggestion::STATUS_PENDING,
            ]);
        }

        return [
            'message' => $response['text'],
            'intent' => $intent,
            'suggested_items' => $response['suggested_items'] ?? [],
            'conversation_id' => $conversation->id,
            'reply_type' => $response['reply_type'] ?? 'message',
            'quick_replies' => $response['quick_replies'] ?? [],
            'missing_field' => $response['missing_field'] ?? null,
        ];
    }

    private static function advisorContextFrom(?self $conversation): array
    {
        if (! $conversation) {
            return [];
        }

        $context = $conversation->metadata['advisor_context'] ?? [];

        return is_array($context) ? $context : [];
    }

    // ─────────────────────────────────────────────
    // تحديد النية من نص الرسالة
    // ─────────────────────────────────────────────
    private static function detectIntent(string $message): string
    {
        $message = mb_strtolower($message);

        $patterns = [
            self::INTENT_PRICE_INQUIRY => [
                'سعر', 'كم تكلف', 'كم يساوي', 'بكم', 'الأسعار',
                'price', 'cost', 'budget', 'how much',
            ],
            self::INTENT_OFFERS_INQUIRY => [
                'عرض', 'خصم', 'تخفيض', 'عروض', 'offer', 'discount', 'deal',
            ],
            self::INTENT_RESERVATION_HELP => [
                'حجز', 'طاولة', 'احجز', 'مكان', 'vip', 'reserve', 'table', 'booking',
            ],
            self::INTENT_MEAL_SUGGESTION => [
                'اقترح', 'وجبة', 'جائع', 'أنصحني', 'ماذا آكل',
                'أريد', 'أحب', 'تعبان', 'حزين', 'سعيد', 'مرهق',
                'حيوي', 'رياضة', 'خفيف', 'ثقيل', 'حار', 'بارد',
                'لحم', 'دجاج', 'خضار', 'نباتي',
                'suggest', 'meal', 'hungry', 'chicken', 'meat', 'vegetarian',
                'light', 'filling', 'spicy', 'fresh',
            ],
            self::INTENT_COMPLAINT => [
                'شكوى', 'مشكلة', 'سيء', 'غلط', 'خطأ',
                'complaint', 'problem', 'bad', 'wrong',
            ],
        ];

        foreach ($patterns as $intent => $keywords) {
            foreach ($keywords as $keyword) {
                if (str_contains($message, $keyword)) {
                    return $intent;
                }
            }
        }

        return self::INTENT_GENERAL;
    }

    // ─────────────────────────────────────────────
    // توليد الرد حسب النية
    // ─────────────────────────────────────────────
    private static function generateResponse(
        string $intent,
        string $message,
        ?Customer $customer,
        array $advisorContext = [],
    ): array {

        return match ($intent) {

            self::INTENT_MEAL_SUGGESTION => self::handleMealSuggestion(
                $message,
                $customer,
                $advisorContext,
            ),

            self::INTENT_PRICE_INQUIRY => self::handlePriceInquiry(),

            self::INTENT_OFFERS_INQUIRY => self::handleOffersInquiry(),

            self::INTENT_RESERVATION_HELP => [
                'text' => "يسعدني مساعدتك في حجز طاولة! 🪑\n".
                          "لحجز طاولة عادية لا يوجد رسوم إضافية.\n".
                          'لحجز طاولة VIP يُضاف '.
                          number_format(RestaurantInfo::getInstance()->vip_table_extra_cost, 0).
                          " ل.س.\nاضغط على «حجز طاولة» من القائمة الرئيسية!",
                'metadata' => ['type' => 'reservation_info'],
            ],

            self::INTENT_COMPLAINT => [
                'text' => 'ملاحظتك مهمة وسجّلتها بوضوح لتصل إلى الفريق المسؤول ✅ '.
                          'إذا رغبت بمتابعة مباشرة يمكنك التواصل عبر '.
                          (RestaurantInfo::getInstance()->phone ?? 'الهاتف').
                          '. أخبرني أيضًا ما النتيجة التي ترضيك وسأحفظها ضمن الملاحظة.',
                'metadata' => ['type' => 'complaint', 'message' => $message],
            ],

            default => [
                'text' => self::getGeneralResponse($customer),
                'metadata' => ['type' => 'general'],
            ],
        };
    }

    // ─────────────────────────────────────────────
    // معالجة اقتراح وجبة
    // ─────────────────────────────────────────────
    private static function handleMealSuggestion(
        string $message,
        ?Customer $customer,
        array $context = [],
    ): array {
        $hadRecommendations = in_array($context['stage'] ?? null, ['recommended', 'selected'], true)
            && ! empty($context['suggested_product_ids']);
        $context = self::updateAdvisorContext($context, $message);
        $products = Product::available()
            ->where('category', '!=', Product::CATEGORY_DRINK)
            ->get();

        if ($hadRecommendations) {
            return self::handleAdvisorFollowUp($message, $context, $products);
        }

        $question = self::nextAdvisorQuestion($context, $products);
        if ($question) {
            return [
                'text' => $question['text'],
                'reply_type' => 'question',
                'quick_replies' => $question['quick_replies'],
                'missing_field' => $question['field'],
                'metadata' => [
                    'type' => 'meal_advisor_question',
                    'advisor_context' => $context,
                ],
            ];
        }

        if ($products->isEmpty()) {
            $isArabic = ($context['language'] ?? 'ar') === 'ar';

            return [
                'text' => $isArabic
                    ? 'المنيو المتاح للطلب فارغ الآن. أستطيع بدلًا من ذلك عرض العروض الحالية أو مساعدتك في الحجز.'
                    : 'The orderable menu is empty right now. I can show current offers or help with a reservation instead.',
                'reply_type' => 'empty',
                'metadata' => [
                    'type' => 'meal_advisor_empty',
                    'advisor_context' => $context,
                ],
            ];
        }

        $ranked = self::rankAdvisorProducts($products, $context);
        $top = collect($ranked)->take(3)->values();
        $isArabic = ($context['language'] ?? 'ar') === 'ar';
        $people = (int) ($context['people'] ?? 1);
        $budget = (float) ($context['budget'] ?? 0);
        $context['stage'] = 'recommended';
        $context['suggested_product_ids'] = $top
            ->pluck('product.id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $suggestedItems = $top->map(function (array $match) use ($context, $isArabic) {
            return array_merge(
                $match['product']->getDetails(),
                [
                    'recommendation_reason' => self::advisorRecommendationReason(
                        $match['product'],
                        $context,
                        $isArabic,
                    ),
                ],
            );
        })->all();

        $customerName = $customer?->name
            ? ($isArabic ? " يا {$customer->name}" : ", {$customer->name}")
            : '';
        $summary = $isArabic
            ? "اكتملت الصورة{$customerName}: {$people} ".($people === 1 ? 'شخص' : 'أشخاص').
                '، وميزانية '.number_format($budget, 0).' ل.س. رتّبت لك أفضل الخيارات الفعلية من المنيو حسب طلبك.'
            : "I have enough to recommend{$customerName}: {$people} ".($people === 1 ? 'person' : 'people').
                ' with a budget of '.number_format($budget, 0).' SYP. Here are the best live menu matches for your request.';

        return [
            'text' => $summary,
            'reply_type' => 'recommendations',
            'suggested_items' => $suggestedItems,
            'quick_replies' => [],
            'metadata' => [
                'type' => 'meal_suggestion',
                'matched' => true,
                'advisor_context' => $context,
            ],
        ];
    }

    private static function updateAdvisorContext(array $context, string $message): array
    {
        $normalized = mb_strtolower(strtr($message, [
            '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4',
            '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
        ]));

        if (preg_match('/(?:ابدأ|نبدأ)\s+من\s+جديد|غي[ّ]?ر\s+الطلب|start\s+over|reset/ui', $normalized)) {
            $context = [];
        }

        $context['language'] = preg_match('/\p{Arabic}/u', $message) ? 'ar' : ($context['language'] ?? 'en');
        $messages = is_array($context['messages'] ?? null) ? $context['messages'] : [];
        $messages[] = mb_substr(trim($message), 0, 240);
        $context['messages'] = array_slice($messages, -4);
        $context['stage'] ??= 'collecting';

        if (preg_match('/(\d{1,2})\s*(?:أشخاص|اشخاص|أفراد|افراد|شخص|people|persons?)/ui', $normalized, $match)) {
            $context['people'] = max(1, min(20, (int) $match[1]));
        } elseif (preg_match('/شخصين|لشخصين|اثنين|اثنان|two\s+(?:people|persons?)/ui', $normalized)) {
            $context['people'] = 2;
        } elseif (preg_match('/شخص\s+واحد|لشخص\s+واحد|one\s+person/ui', $normalized)) {
            $context['people'] = 1;
        } elseif (preg_match('/ثلاثة\s+(?:أشخاص|اشخاص|أفراد|افراد)|لثلاثة|three\s+(?:people|persons?)/ui', $normalized)) {
            $context['people'] = 3;
        } elseif (preg_match('/أربعة\s+(?:أشخاص|اشخاص)|لاربعة|لأربعة|four\s+(?:people|persons?)/ui', $normalized)) {
            $context['people'] = 4;
        } elseif (empty($context['people']) && preg_match('/^\s*(\d{1,2})\s*$/u', $normalized, $match)) {
            $context['people'] = max(1, min(20, (int) $match[1]));
        }

        if (preg_match('/(?:ميزاني(?:تي|ة)|بحدود|حدود|حتى|الحد|budget|under|up\s+to|around)\s*(?:هي|is|:|-)?\s*([\d,.]+)\s*(ألف|الف|k)?/ui', $normalized, $match)) {
            $amount = (float) str_replace(',', '', $match[1]);
            if (! empty($match[2])) {
                $amount *= 1000;
            }
            if ($amount > 0) {
                $context['budget'] = $amount;
            }
        } elseif (! empty($context['people']) && empty($context['budget'])
            && preg_match('/^\s*([\d,.]+)\s*(ألف|الف|k)?\s*(?:ليرة|ل\.س|syp)?\s*$/ui', $normalized, $match)) {
            $amount = (float) str_replace(',', '', $match[1]);
            if (! empty($match[2])) {
                $amount *= 1000;
            }
            if ($amount > 0) {
                $context['budget'] = $amount;
            }
        }

        $proteinPatterns = [
            'chicken' => '/دجاج|فروج|شاورما|chicken|poultry/ui',
            'meat' => '/لحم|لحمة|لحوم|برغر|كباب|meat|beef|burger|kebab/ui',
            'vegetarian' => '/نباتي|خضار|بدون\s+لحم|vegetarian|veggie/ui',
            'seafood' => '/سمك|بحري|روبيان|جمبري|seafood|fish|shrimp/ui',
        ];
        if (preg_match('/لا\s+فرق|أي\s+شي|اي\s+شي|بدون\s+تفضيل|whatever|anything|no\s+preference/ui', $normalized)) {
            $context['protein'] = 'any';
        } else {
            foreach ($proteinPatterns as $protein => $pattern) {
                if (preg_match($pattern, $normalized)) {
                    $context['protein'] = $protein;
                    break;
                }
            }
        }

        if (preg_match('/خفيف|سناك|light|snack/ui', $normalized)) {
            $context['appetite'] = 'light';
        } elseif (preg_match('/مشبع|ثقيل|جائع\s+جدا|filling|heavy|very\s+hungry/ui', $normalized)) {
            $context['appetite'] = 'filling';
        }

        if (preg_match('/غير\s+حار|بدون\s+حر|not\s+spicy|mild/ui', $normalized)) {
            $context['spicy'] = false;
        } elseif (preg_match('/حار|سبايسي|spicy|hot/ui', $normalized)) {
            $context['spicy'] = true;
        }

        return $context;
    }

    private static function handleAdvisorFollowUp(string $message, array $context, $mealProducts): array
    {
        $normalized = mb_strtolower($message);
        $isArabic = ($context['language'] ?? 'ar') === 'ar';
        $current = self::advisorProductsByIds((array) ($context['suggested_product_ids'] ?? []));
        $ordinal = self::advisorOrdinalIndex($normalized);

        if (preg_match('/مشروب|شراب|عصير|بيبسي|كولا|drink|juice|pepsi|cola/ui', $normalized)) {
            $drinks = Product::available()
                ->where('category', Product::CATEGORY_DRINK)
                ->orderBy('price')
                ->take(3)
                ->get();

            return self::advisorFollowUpResponse(
                $context,
                $drinks,
                $isArabic
                    ? ($drinks->isEmpty() ? 'لا يوجد مشروب متاح الآن.' : 'أكيد، هذه ألطف المشروبات المتاحة مع وجبتك 🥤')
                    : ($drinks->isEmpty() ? 'There are no drinks available right now.' : 'Of course — these drinks pair nicely with your meal 🥤'),
                'drink',
            );
        }

        if (preg_match('/أرخص|ارخص|أوفر|اوفر|أقل\s+(?:سعر|تكلفة)|cheaper|less\s+expensive|lower\s+price/ui', $normalized)) {
            $referencePrice = (float) ($current->min('price') ?? 0);
            $category = $current->first()?->category === Product::CATEGORY_DRINK
                ? Product::CATEGORY_DRINK
                : null;
            $cheaperQuery = Product::available()
                ->when($category, fn ($query) => $query->where('category', $category))
                ->when(! $category, fn ($query) => $query->where('category', '!=', Product::CATEGORY_DRINK))
                ->whereNotIn('id', $current->pluck('id'));
            if ($referencePrice > 0) {
                $cheaperQuery->where('price', '<', $referencePrice);
            }
            $cheaper = $cheaperQuery->orderBy('price')->take(3)->get();

            return self::advisorFollowUpResponse(
                $context,
                $cheaper,
                $isArabic
                    ? ($cheaper->isEmpty() ? 'اختياراتك الحالية هي الأرخص المناسبة لطلبك.' : 'طبعًا، هذه خيارات ألطف على الميزانية 💛')
                    : ($cheaper->isEmpty() ? 'Your current picks are already the cheapest suitable options.' : 'Absolutely — these options are easier on the budget 💛'),
                'cheaper',
                $cheaper->isEmpty() ? $current : null,
            );
        }

        if (preg_match('/قارن|مقارنة|ما\s+الفرق|الفرق\s+بين|compare|difference/ui', $normalized)) {
            $compared = $ordinal === null
                ? $current->take(2)
                : $current->slice($ordinal, 1)->values();
            if ($compared->count() < 2 && $current->count() >= 2) {
                $compared = $current->take(2);
            }

            $comparison = $compared->map(fn (Product $product) => self::advisorProductName($product, $isArabic).' — '.number_format($product->price, 0).' '.($isArabic ? 'ل.س' : 'SYP')
            )->implode($isArabic ? '، مقابل ' : ', compared with ');

            return self::advisorFollowUpResponse(
                $context,
                $compared,
                $isArabic ? "باختصار: {$comparison}." : "In short: {$comparison}.",
                'comparison',
                $current,
            );
        }

        if (preg_match('/اخترت|سآخذ|سوف\s+آخذ|أريد\s+(?:الخيار\s+)?(?:الأول|الاول|الثاني|الثالث)|اختياري|I\s*(?:will|\x27ll)?\s*(?:take|choose)|my\s+choice/ui', $normalized)) {
            $selectedIndex = $ordinal ?? 0;
            $selected = $current->slice($selectedIndex, 1)->values();
            if ($selected->isEmpty()) {
                $selected = $current->take(1);
            }
            $context['stage'] = 'selected';
            $context['selected_product_ids'] = $selected->pluck('id')->map(fn ($id) => (int) $id)->all();
            $name = $selected->first() ? self::advisorProductName($selected->first(), $isArabic) : '';

            return self::advisorFollowUpResponse(
                $context,
                $selected,
                $isArabic ? "اختيار موفق — {$name} جاهز لتضيفه للسلة ✨" : "Great choice — {$name} is ready to add to your cart ✨",
                'selection',
            );
        }

        if (preg_match('/(?:غير|غيّر|بدل|بدّل|استبدل|replace|swap|change)\s+(?:لي\s+)?(?:الخيار\s+)?(?:الأول|الاول|الثاني|الثالث|1|2|3|first|second|third)/ui', $normalized)) {
            $replaceIndex = $ordinal ?? 0;
            $removed = $current->get($replaceIndex);
            $candidates = Product::available()
                ->where('category', $removed?->category ?? Product::CATEGORY_MEAL)
                ->whereNotIn('id', $current->pluck('id'))
                ->get();
            if ($candidates->isEmpty()) {
                $candidates = $mealProducts->whereNotIn('id', $current->pluck('id'))->values();
            }
            $replacement = collect(self::rankAdvisorProducts($candidates, $context))
                ->pluck('product')
                ->take(1)
                ->values();

            if ($replacement->isEmpty()) {
                return self::advisorFollowUpResponse(
                    $context,
                    collect(),
                    $isArabic ? 'لا يوجد بديل مختلف متاح الآن، لكن يمكنني تعديل الميزانية أو النوع.' : 'There is no different alternative available right now, but we can change the budget or type.',
                    'replacement',
                    $current,
                );
            }

            $updated = $current->values();
            $updated->splice($replaceIndex, 1, [$replacement->first()]);

            return self::advisorFollowUpResponse(
                $context,
                $replacement,
                $isArabic ? 'تم، بدّلت الخيار لك بهذا البديل 👌' : 'Done — I swapped it for this alternative 👌',
                'replacement',
                $updated,
            );
        }

        if (preg_match('/سعر|بكم|كم\s+(?:سعر|يكلف)|price|how\s+much/ui', $normalized)) {
            $priced = $ordinal === null ? $current : $current->slice($ordinal, 1)->values();

            return self::advisorFollowUpResponse(
                $context,
                $priced,
                $isArabic ? 'هذه أسعار خياراتك الحالية، وكلها من المنيو المتاح.' : 'Here are the prices of your current available picks.',
                'price',
                $current,
            );
        }

        $shouldRerank = preg_match('/بدون\s+حار|غير\s+حار|خفف\s+الحار|not\s+spicy|mild|دجاج|فروج|لحم|لحوم|برغر|كباب|نباتي|خضار|سمك|بحري|خفيف|مشبع|ميزاني|budget|under|حتى\s*\d/ui', $normalized);
        if ($shouldRerank) {
            $candidates = $mealProducts;
            if (($context['spicy'] ?? null) === false) {
                $candidates = $candidates->reject(fn (Product $product) => preg_match(
                    '/حار|سبايسي|spicy|hot/ui',
                    implode(' ', array_filter([$product->name, $product->name_ar, $product->name_en, $product->description, $product->description_ar, $product->description_en]))
                ))->values();
            }
            $reranked = collect(self::rankAdvisorProducts($candidates, $context))
                ->pluck('product')
                ->take(3)
                ->values();

            return self::advisorFollowUpResponse(
                $context,
                $reranked,
                $isArabic ? 'تمام، عدّلت الخيارات حسب طلبك.' : 'Done — I adjusted the options to match your request.',
                'adjustment',
            );
        }

        $focused = $ordinal === null ? collect() : $current->slice($ordinal, 1)->values();

        return self::advisorFollowUpResponse(
            $context,
            $focused,
            $isArabic ? 'أكيد، أنا معك. أخبرني ما الذي تحب تغييره أو معرفته عن الاختيارات.' : 'Of course — tell me what you would like to change or know about the picks.',
            'discussion',
            $current,
        );
    }

    private static function advisorFollowUpResponse(
        array $context,
        $displayProducts,
        string $text,
        string $action,
        $contextProducts = null,
    ): array {
        $displayProducts = collect($displayProducts)->filter();
        $contextProducts = $contextProducts === null ? $displayProducts : collect($contextProducts)->filter();
        $isArabic = ($context['language'] ?? 'ar') === 'ar';

        if (($context['stage'] ?? null) !== 'selected') {
            $context['stage'] = 'recommended';
        }
        if ($contextProducts->isNotEmpty()) {
            $context['suggested_product_ids'] = $contextProducts
                ->pluck('id')
                ->map(fn ($id) => (int) $id)
                ->values()
                ->all();
        }

        return [
            'text' => $text,
            'reply_type' => 'discussion',
            'suggested_items' => $displayProducts->map(fn (Product $product) => array_merge(
                $product->getDetails(),
                ['recommendation_reason' => self::advisorRecommendationReason($product, $context, $isArabic)],
            ))->values()->all(),
            'quick_replies' => self::advisorDiscussionQuickReplies($isArabic),
            'metadata' => [
                'type' => 'meal_advisor_follow_up',
                'advisor_action' => $action,
                'advisor_context' => $context,
            ],
        ];
    }

    private static function advisorProductsByIds(array $ids)
    {
        $orderedIds = collect($ids)->map(fn ($id) => (int) $id)->filter()->unique()->values();
        $products = Product::available()->whereIn('id', $orderedIds)->get()->keyBy('id');

        return $orderedIds->map(fn ($id) => $products->get($id))->filter()->values();
    }

    private static function advisorOrdinalIndex(string $message): ?int
    {
        $ordinals = [
            0 => '/الأول|الاول|الخيار\s*1|first/ui',
            1 => '/الثاني|الخيار\s*2|second/ui',
            2 => '/الثالث|الخيار\s*3|third/ui',
        ];
        foreach ($ordinals as $index => $pattern) {
            if (preg_match($pattern, $message)) {
                return $index;
            }
        }

        return null;
    }

    private static function advisorProductName(Product $product, bool $isArabic): string
    {
        return (string) ($isArabic
            ? ($product->name_ar ?: $product->name)
            : ($product->name_en ?: $product->name));
    }

    private static function advisorDiscussionQuickReplies(bool $isArabic): array
    {
        return $isArabic
            ? [
                ['label' => 'أرخص', 'value' => 'أريد خيارًا أرخص'],
                ['label' => 'مشروب', 'value' => 'أريد مشروبًا مناسبًا'],
                ['label' => 'بدون حار', 'value' => 'أريد الخيارات بدون حار'],
            ]
            : [
                ['label' => 'Cheaper', 'value' => 'I want a cheaper option'],
                ['label' => 'Drink', 'value' => 'I want a suitable drink'],
                ['label' => 'Not spicy', 'value' => 'I want non-spicy options'],
            ];
    }

    private static function nextAdvisorQuestion(array $context, $products): ?array
    {
        $isArabic = ($context['language'] ?? 'ar') === 'ar';

        if (empty($context['people'])) {
            return [
                'field' => 'people',
                'text' => $isArabic
                    ? 'ممتاز. أولًا: الوجبة لكم شخص؟'
                    : 'Great. First, how many people is the meal for?',
                'quick_replies' => $isArabic
                    ? [
                        ['label' => 'شخص واحد', 'value' => 'لشخص واحد'],
                        ['label' => 'شخصان', 'value' => 'لشخصين'],
                        ['label' => '4 أشخاص', 'value' => 'لأربعة أشخاص'],
                    ]
                    : [
                        ['label' => '1 person', 'value' => 'For one person'],
                        ['label' => '2 people', 'value' => 'For two people'],
                        ['label' => '4 people', 'value' => 'For four people'],
                    ],
            ];
        }

        if (empty($context['budget'])) {
            $prices = $products->pluck('price')->map(fn ($price) => (float) $price)->sort()->values();
            $people = max(1, (int) $context['people']);
            $low = max(1, (float) ($prices->first() ?? 1)) * $people;
            $middle = max($low, (float) ($prices->get((int) floor(max(0, $prices->count() - 1) / 2)) ?? $low) * $people);
            $high = max($middle, (float) ($prices->last() ?? $middle) * $people);
            $budgets = collect([$low, $middle, $high])->map(fn ($value) => (int) ceil($value))->unique()->values();

            return [
                'field' => 'budget',
                'text' => $isArabic
                    ? 'وما الميزانية الإجمالية التي تريد البقاء ضمنها؟'
                    : 'What total budget would you like to stay within?',
                'quick_replies' => $budgets->map(fn ($budget) => [
                    'label' => $isArabic ? 'حتى '.number_format($budget).' ل.س' : 'Up to '.number_format($budget).' SYP',
                    'value' => $isArabic ? "ميزانيتي {$budget}" : "My budget is {$budget}",
                ])->all(),
            ];
        }

        if (empty($context['protein'])) {
            return [
                'field' => 'preference',
                'text' => $isArabic
                    ? 'أخيرًا، أي نوع تفضّل؟ ويمكنك أيضًا اختيار «لا فرق».'
                    : 'Finally, what type do you prefer? You can also choose “No preference.”',
                'quick_replies' => $isArabic
                    ? [
                        ['label' => 'دجاج', 'value' => 'أفضل الدجاج'],
                        ['label' => 'لحوم', 'value' => 'أفضل اللحوم'],
                        ['label' => 'نباتي', 'value' => 'أفضل وجبة نباتية'],
                        ['label' => 'لا فرق', 'value' => 'لا فرق لدي'],
                    ]
                    : [
                        ['label' => 'Chicken', 'value' => 'I prefer chicken'],
                        ['label' => 'Meat', 'value' => 'I prefer meat'],
                        ['label' => 'Vegetarian', 'value' => 'I prefer vegetarian food'],
                        ['label' => 'No preference', 'value' => 'I have no preference'],
                    ],
            ];
        }

        return null;
    }

    private static function rankAdvisorProducts($products, array $context): array
    {
        $budget = (float) ($context['budget'] ?? 0);
        $protein = $context['protein'] ?? 'any';
        $messages = mb_strtolower(implode(' ', $context['messages'] ?? []));
        $proteinKeywords = [
            'chicken' => ['دجاج', 'فروج', 'شاورما', 'chicken', 'poultry'],
            'meat' => ['لحم', 'لحمة', 'لحوم', 'برغر', 'كباب', 'meat', 'beef', 'burger', 'kebab'],
            'vegetarian' => ['نباتي', 'خضار', 'vegetarian', 'veggie'],
            'seafood' => ['سمك', 'بحري', 'روبيان', 'seafood', 'fish', 'shrimp'],
        ];

        return $products->map(function (Product $product) use ($budget, $protein, $messages, $context, $proteinKeywords) {
            $searchText = mb_strtolower(implode(' ', array_filter([
                $product->name,
                $product->name_ar,
                $product->name_en,
                $product->description,
                $product->description_ar,
                $product->description_en,
            ])));
            $score = 0.0;

            if ($budget > 0) {
                $score += $product->price <= $budget ? 8 : -8 * min(2, $product->price / $budget);
                $score += max(0, 2 - abs($budget - $product->price) / max(1, $budget));
            }

            if ($protein !== 'any') {
                $matchesProtein = collect($proteinKeywords[$protein] ?? [])
                    ->contains(fn ($keyword) => str_contains($searchText, $keyword));
                $score += $matchesProtein ? 10 : -3;
            }

            if (($context['appetite'] ?? null) === 'filling' && $product->category === Product::CATEGORY_MEAL) {
                $score += 3;
            }
            if (($context['appetite'] ?? null) === 'light' && $product->category === Product::CATEGORY_SANDWICH) {
                $score += 3;
            }
            if (($context['spicy'] ?? null) === true && preg_match('/حار|سبايسي|spicy|hot/ui', $searchText)) {
                $score += 3;
            }

            foreach (preg_split('/\s+/u', $messages) ?: [] as $word) {
                if (mb_strlen($word) > 3 && str_contains($searchText, $word)) {
                    $score += 0.75;
                }
            }

            return ['score' => $score, 'product' => $product];
        })->sort(function (array $a, array $b) {
            return $b['score'] <=> $a['score'] ?: $a['product']->price <=> $b['product']->price;
        })->values()->all();
    }

    private static function advisorRecommendationReason(Product $product, array $context, bool $isArabic): string
    {
        if ($product->category === Product::CATEGORY_DRINK) {
            return $isArabic ? 'مشروب متاح وخفيف مع الوجبة' : 'an available, easy pairing for the meal';
        }

        $reasons = [];
        if ($product->price <= (float) ($context['budget'] ?? 0)) {
            $reasons[] = $isArabic ? 'ضمن ميزانيتك' : 'within your budget';
        } else {
            $reasons[] = $isArabic ? 'أقرب خيار لميزانيتك' : 'the closest option to your budget';
        }
        if (($context['protein'] ?? 'any') !== 'any') {
            $labels = [
                'chicken' => ['يناسب تفضيل الدجاج', 'matches your chicken preference'],
                'meat' => ['يناسب تفضيل اللحوم', 'matches your meat preference'],
                'vegetarian' => ['الأقرب لتفضيلك النباتي', 'closest to your vegetarian preference'],
                'seafood' => ['الأقرب لتفضيل المأكولات البحرية', 'closest to your seafood preference'],
            ];
            $label = $labels[$context['protein']] ?? null;
            if ($label) {
                $reasons[] = $isArabic ? $label[0] : $label[1];
            }
        }
        if (($context['appetite'] ?? null) === 'filling' && $product->category === Product::CATEGORY_MEAL) {
            $reasons[] = $isArabic ? 'خيار مشبع' : 'a filling choice';
        }
        if (($context['appetite'] ?? null) === 'light' && $product->category === Product::CATEGORY_SANDWICH) {
            $reasons[] = $isArabic ? 'خيار أخف' : 'a lighter choice';
        }

        return implode($isArabic ? '، و' : ' and ', array_slice($reasons, 0, 3));
    }

    // ─────────────────────────────────────────────
    // معالجة استفسار الأسعار
    // ─────────────────────────────────────────────
    private static function handlePriceInquiry(): array
    {
        $products = Product::available()
            ->orderBy('price')
            ->get()
            ->groupBy('category');

        $text = "إليك أسعارنا الحالية 📋:\n\n";

        foreach ($products as $category => $items) {
            $label = Product::CATEGORY_LABELS[$category] ?? $category;
            $text .= "🍽️ {$label}:\n";
            foreach ($items->take(3) as $item) {
                $text .= "  • {$item->name}: ".
                         number_format($item->price, 0)." ل.س\n";
            }
            $text .= "\n";
        }

        $text .= 'للقائمة الكاملة تفضل بتصفح المنتجات في التطبيق.';

        return [
            'text' => $text,
            'metadata' => ['type' => 'price_list'],
        ];
    }

    // ─────────────────────────────────────────────
    // معالجة استفسار العروض
    // ─────────────────────────────────────────────
    private static function handleOffersInquiry(): array
    {
        $offers = Offer::currentlyActive()->get();

        if ($offers->isEmpty()) {
            return [
                'text' => 'العروض تتجهز حاليًا 🎯 وحتى يبدأ العرض القادم، أستطيع اختيار أفضل قيمة من المنيو حسب ميزانيتك. اكتب المبلغ الذي يناسبك.',
                'metadata' => ['type' => 'no_offers'],
            ];
        }

        $text = "عروضنا المتاحة الآن 🎯:\n\n";
        foreach ($offers as $offer) {
            $text .= "⭐ {$offer->name}\n";
            $text .= '   السعر: '.number_format($offer->offer_price, 0).' ل.س';
            if ($offer->original_price) {
                $text .= ' (بدل '.number_format($offer->original_price, 0).' ل.س)';
            }
            $text .= "\n";
            if ($offer->end_date) {
                $text .= '   ينتهي: '.$offer->end_date->format('d/m/Y')."\n";
            }
            $text .= "\n";
        }

        return [
            'text' => $text,
            'metadata' => ['type' => 'offers_list'],
            'suggested_items' => $offers->map->getDetails()->values()->toArray(),
        ];
    }

    // ─────────────────────────────────────────────
    // رد عام للمحادثة
    // ─────────────────────────────────────────────
    private static function getGeneralResponse(?Customer $customer): string
    {
        $name = $customer?->name ? "يا {$customer->name}" : '';
        $info = RestaurantInfo::getInstance();

        $responses = [
            "أهلاً {$name}! 👋 أعطني ثلاث إشارات فقط: جوعك، النكهة التي تحبها، وميزانيتك؛ وسأرتب لك اختيارًا واضحًا.",
            "مرحباً {$name}! 😊 نستطيع أن نبدأ من مزاجك اليوم، أو من السعر، أو من أفضل عرض متاح. أي طريق تختار؟",
            "هلا {$name}! 🌟 أنا متصل بالمنيو الحالي. قل لي: خفيف أم مشبع، كلاسيكي أم جريء؟",
            "جاهز لاختيار سريع {$name} ✨ اذكر عدد الأشخاص وسأقترح وجبة أو عرضًا يناسب المشاركة.",
        ];

        return $responses[array_rand($responses)];
    }

    // ─────────────────────────────────────────────
    // اقتراحات عشوائية
    // ─────────────────────────────────────────────
    private static function getRandomSuggestions($products): string
    {
        $random = $products->random(min(3, $products->count()));

        return $random->map(fn ($p) => "• {$p->name} — ".number_format($p->price, 0).' ل.س'
        )->implode("\n");
    }

    // ─────────────────────────────────────────────
    // التقرير اليومي — يُرسَل كل 24 ساعة
    // ─────────────────────────────────────────────
    public static function generateDailyReport(): ?Report
    {
        $conversations = self::recent(24)->get();

        if ($conversations->isEmpty()) {
            return null;
        }

        // إحصائيات
        $total = $conversations->count();
        $byIntent = $conversations->groupBy('intent')
            ->map->count();
        $unmatched = $conversations
            ->where('intent', self::INTENT_UNMATCHED_REQUEST);
        $suggestions = MealSuggestion::recent(24)->get();

        // بناء محتوى التقرير
        $content = '📊 تقرير المحادثات اليومي — '.now()->format('Y-m-d')."\n";
        $content .= "━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
        $content .= "إجمالي المحادثات: {$total}\n\n";

        $content .= "توزيع حسب النوع:\n";
        foreach ($byIntent as $intent => $count) {
            $content .= "  • {$intent}: {$count}\n";
        }

        if ($unmatched->isNotEmpty()) {
            $content .= "\n❗ طلبات غير مطابقة ({$unmatched->count()}):\n";
            foreach ($unmatched as $conv) {
                $content .= "  • {$conv->user_message}\n";
            }
        }

        if ($suggestions->isNotEmpty()) {
            $content .= "\n💡 اقتراحات وجبات من الزبائن ({$suggestions->count()}):\n";
            foreach ($suggestions as $s) {
                $content .= "  • {$s->suggestion_text}\n";
            }
        }

        $content .= "\nتوصية النظام: ";
        if ($unmatched->count() > 5) {
            $content .= 'يُنصح بإضافة أصناف جديدة بناءً على الطلبات المتكررة.';
        } else {
            $content .= 'أداء النظام طبيعي، لا توجد توصيات إضافية.';
        }

        // إرسال التقرير لمدير التواصل
        return Report::sendAIReport(
            title: 'تقرير AI اليومي — '.now()->format('d/m/Y'),
            content: $content,
            description: 'ملخص محادثات الذكاء الاصطناعي لآخر 24 ساعة',
        );
    }

    // تفاصيل المحادثة للواجهة
    public function getDetails(): array
    {
        return [
            'id' => $this->id,
            'user_message' => $this->user_message,
            'ai_response' => $this->ai_response,
            'intent' => $this->intent,
            'customer' => $this->customer ? [
                'id' => $this->customer->id,
                'name' => $this->customer->name,
            ] : null,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
