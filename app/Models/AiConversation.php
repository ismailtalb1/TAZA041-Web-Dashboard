<?php

namespace App\Models;

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
    // مساعد ذكي حتمي يعتمد على النوايا وبيانات القائمة الحية.
    // لا يرسل بيانات الزبون إلى نموذج توليدي أو خدمة خارجية.
    // ─────────────────────────────────────────────
    public static function chat(
        string $message,
        ?Customer $customer = null
    ): array {

        // تحديد نية المستخدم
        $intent = self::detectIntent($message);

        // توليد الرد حسب النية
        $response = self::generateResponse($intent, $message, $customer);

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
        ];
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
        ?Customer $customer
    ): array {

        return match ($intent) {

            self::INTENT_MEAL_SUGGESTION => self::handleMealSuggestion($message, $customer),

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
        ?Customer $customer
    ): array {

        $message = mb_strtolower($message);

        // جلب المنتجات المتاحة
        $products = Product::available()->get();

        $matchedProducts = [];

        // مطابقة المنتجات حسب الكلمات المفتاحية في الوصف
        foreach ($products as $product) {
            $searchText = mb_strtolower(
                $product->name.' '.$product->description
            );
            // حساب نقاط المطابقة
            $score = 0;
            foreach (explode(' ', $message) as $word) {
                if (mb_strlen($word) > 2 && str_contains($searchText, $word)) {
                    $score++;
                }
            }
            if ($score > 0) {
                $matchedProducts[] = [
                    'score' => $score,
                    'product' => $product,
                ];
            }
        }

        // إذا وجدنا مطابقات
        if (! empty($matchedProducts)) {
            usort($matchedProducts, fn ($a, $b) => $b['score'] - $a['score']);
            $top = array_slice($matchedProducts, 0, 3);

            $names = implode('، ', array_map(
                fn ($m) => $m['product']->name,
                $top
            ));

            $customerName = $customer?->name
                ? "يا {$customer->name}" : '';

            return [
                'text' => "بناءً على ما ذكرته {$customerName}، أقترح عليك: {$names} 😋\n".
                          'هل تريد إضافة أي منها لطلبك؟',
                'suggested_items' => array_map(
                    fn ($m) => $m['product']->getDetails(),
                    $top
                ),
                'metadata' => ['type' => 'meal_suggestion', 'matched' => true],
            ];
        }

        // لا توجد مطابقة مباشرة — نقدّم بدائل حقيقية ونحفظ الفكرة للمراجعة
        $alternatives = $products->shuffle()->take(3)->values();
        $alternativesText = $alternatives->isEmpty()
            ? 'نعمل على تحديث المنيو، جرّب سؤالي عن العروض أو الأسعار.'
            : $alternatives->map(
                fn ($product) => "• {$product->name} — ".
                    number_format($product->price, 0).' ل.س'
            )->implode("\n");

        return [
            'text' => "فكرتك وصلت وهي تستحق التجربة 💡\n".
                      "لم أجد تطابقًا مباشرًا، لذلك اخترت لك أقرب خيارات متنوعة من المنيو الحالي:\n".
                      $alternativesText.
                      "\n\nقل لي: تفضّل الأقرب بالنكهة أم بالسعر؟ وسأضيّق الاختيار أكثر.",
            'suggested_items' => $alternatives
                ->map->getDetails()->values()->toArray(),
            'metadata' => [
                'type' => 'unmatched',
                'request' => $message,
            ],
        ];
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
