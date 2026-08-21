<?php

namespace App\Http\Controllers\API;

use App\Jobs\GenerateDailyAiReport;
use App\Models\AiConversation;
use App\Models\Customer;
use App\Models\Employee;
use App\Models\MealSuggestion;
use App\Models\Report;
use App\Support\CustomerInputRules;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

class AIController extends BaseController
{
    // ─────────────────────────────────────────────
    // مساعدات
    // ─────────────────────────────────────────────
    private function getEmployee(Request $request): ?Employee
    {
        $user = $request->user();

        return $user instanceof Employee ? $user : null;
    }

    private function getCustomer(Request $request): ?Customer
    {
        $user = $request->user();

        return $user instanceof Customer ? $user : null;
    }

    private function canManageAI(Request $request): bool
    {
        $emp = $this->getEmployee($request);
        if (! $emp) {
            return false;
        }

        return in_array($emp->role, [
            Employee::ROLE_COMMUNICATION_MANAGER,
            Employee::ROLE_GENERAL_MANAGER,
        ]);
    }

    // ═══════════════════════════════════════════════
    // محادثة AI — عامة وخاصة
    // ═══════════════════════════════════════════════

    // ─────────────────────────────────────────────
    // POST /api/public/ai/chat
    // POST /api/customer/ai/chat
    // محادثة AI (عامة أو مع زبون مسجل)
    // ─────────────────────────────────────────────
    public function chat(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'message' => CustomerInputRules::safeText(true, 1000, 2),
            'conversation_id' => 'nullable|integer',
        ], [
            'message.required' => 'الرسالة مطلوبة',
            'message.min' => 'الرسالة قصيرة جداً',
            'message.max' => 'الرسالة طويلة جداً (الحد 1000 حرف)',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        // تحديد هوية المستخدم
        $customer = $this->getCustomer($request);

        // استعادة آخر خطوة في نفس محادثة الزبون فقط. تجاهل أي معرّف لا يخصه
        // يمنع مشاركة سياق المحادثات بين الحسابات.
        $previousConversation = null;
        if ($customer && $request->filled('conversation_id')) {
            $previousConversation = AiConversation::query()
                ->whereKey((int) $request->conversation_id)
                ->where('customer_id', $customer->id)
                ->first();
        }

        // تشغيل الـ AI
        $result = AiConversation::chat(
            message: $request->message,
            customer: $customer,
            previousConversation: $previousConversation,
        );

        // بناء الرد
        $response = [
            'reply' => $result['message'],
            'intent' => $result['intent'],
            'conversation_id' => $result['conversation_id'],
            'reply_type' => $result['reply_type'] ?? 'message',
            'quick_replies' => $result['quick_replies'] ?? [],
            'missing_field' => $result['missing_field'] ?? null,
        ];

        // إضافة المنتجات المقترحة إن وُجدت
        if (! empty($result['suggested_items'])) {
            $response['suggested_items'] = $result['suggested_items'];
            $response['has_suggestions'] = true;
        } else {
            $response['has_suggestions'] = false;
        }

        // للزبون المسجل — إضافة معلومات الولاء
        if ($customer) {
            $loyalty = $customer->loyaltyAccount;
            $response['customer_context'] = [
                'name' => $customer->name,
                'loyalty_points' => $loyalty?->points_balance ?? 0,
                'tier' => $loyalty?->tier ?? 'bronze',
            ];
        }

        return $this->success($response, 'تم');
    }

    // ─────────────────────────────────────────────
    // GET /api/customer/ai/history
    // سجل محادثات الزبون مع الـ AI
    // ─────────────────────────────────────────────
    public function customerHistory(Request $request)
    {
        $customer = $this->getCustomer($request);
        if (! $customer) {
            return $this->unauthorized('هذا المسار للزبائن فقط');
        }

        $conversations = AiConversation::byCustomer($customer->id)
            ->latest()
            ->take(20)
            ->get();

        // تجميع حسب اليوم
        $grouped = $conversations->groupBy(
            fn ($c) => $c->created_at->format('Y-m-d')
        )->map(fn ($group, $date) => [
            'date' => $date,
            'date_formatted' => Carbon::parse($date)->diffForHumans(),
            'count' => $group->count(),
            'conversations' => $group->map->getDetails()->values(),
        ])->values();

        return $this->success([
            'total' => $conversations->count(),
            'history' => $grouped,
        ]);
    }

    // ═══════════════════════════════════════════════
    // مسارات الإدارة
    // ═══════════════════════════════════════════════

    // ─────────────────────────────────────────────
    // GET /api/ai/conversations
    // سجل كل المحادثات (للمدير)
    // ─────────────────────────────────────────────
    public function conversations(Request $request)
    {
        if (! $this->canManageAI($request)) {
            return $this->unauthorized('صلاحية مدير التواصل أو المدير العام مطلوبة');
        }

        $query = AiConversation::with(['customer'])->latest();

        // فلاتر
        if ($request->filled('intent')) {
            $query->where('intent', $request->intent);
        }

        if ($request->filled('customer_id')) {
            $query->byCustomer($request->customer_id);
        }

        if ($request->filled('from_date') && $request->filled('to_date')) {
            $query->whereBetween('created_at', [
                $request->from_date.' 00:00:00',
                $request->to_date.' 23:59:59',
            ]);
        }

        if ($request->filled('date')) {
            $query->whereDate('created_at', $request->date);
        }

        $conversations = $query->take(100)->get();

        // تجميع حسب النية
        $byIntent = $conversations->groupBy('intent')
            ->map(fn ($group, $intent) => [
                'intent' => $intent,
                'count' => $group->count(),
            ])->values();

        return $this->success([
            'stats' => [
                'total' => $conversations->count(),
                'today' => $conversations->filter(
                    fn ($c) => $c->created_at->isToday()
                )->count(),
                'unmatched_requests' => $conversations->where(
                    'intent',
                    AiConversation::INTENT_UNMATCHED_REQUEST
                )->count(),
                'unique_customers' => $conversations->whereNotNull('customer_id')
                    ->unique('customer_id')
                    ->count(),
                'anonymous_chats' => $conversations->whereNull('customer_id')->count(),
            ],
            'intents_distribution' => $byIntent,
            'conversations' => $conversations->map(fn ($c) => array_merge(
                $c->getDetails(),
                [
                    'customer_name' => $c->customer?->name ?? 'زائر',
                ]
            ))->values(),
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/ai/conversations/stats
    // إحصائيات تفصيلية للمحادثات
    // ─────────────────────────────────────────────
    public function conversationStats(Request $request)
    {
        if (! $this->canManageAI($request)) {
            return $this->unauthorized();
        }

        $today = now()->startOfDay();
        $week = now()->startOfWeek();
        $month = now()->startOfMonth();

        $all = AiConversation::all();

        // أكثر النوايا تكراراً
        $topIntents = $all->groupBy('intent')
            ->map(fn ($g, $intent) => [
                'intent' => $intent,
                'count' => $g->count(),
            ])
            ->sortByDesc('count')
            ->values()
            ->take(5);

        // طلبات غير متطابقة (تحتاج دراسة من الإدارة)
        $unmatchedRequests = AiConversation::unmatched()
            ->latest()
            ->take(10)
            ->get()
            ->map(fn ($c) => [
                'message' => $c->user_message,
                'customer' => $c->customer?->name ?? 'زائر',
                'created_at' => $c->created_at->format('Y-m-d H:i'),
            ]);

        // اقتراحات الوجبات المعلقة
        $pendingSuggestions = MealSuggestion::pending()
            ->with('customer')
            ->latest()
            ->take(5)
            ->get()
            ->map->getDetails()
            ->values();

        return $this->success([
            'volume' => [
                'today' => $all->filter(fn ($c) => $c->created_at->isToday())->count(),
                'this_week' => $all->filter(fn ($c) => $c->created_at->gte($week))->count(),
                'this_month' => $all->filter(fn ($c) => $c->created_at->gte($month))->count(),
                'all_time' => $all->count(),
            ],
            'top_intents' => $topIntents,
            'unmatched_requests' => $unmatchedRequests->values(),
            'pending_suggestions' => $pendingSuggestions,
            'pending_suggestions_count' => MealSuggestion::pending()->count(),
            'last_report_at' => Report::byType(
                Report::TYPE_AI_GENERATED
            )->latest()->first()?->created_at?->format('Y-m-d H:i'),
        ]);
    }

    // ─────────────────────────────────────────────
    // POST /api/ai/generate-report
    // توليد التقرير اليومي يدوياً
    // ─────────────────────────────────────────────
    public function generateDailyReport(Request $request)
    {
        if (! $this->canManageAI($request)) {
            return $this->unauthorized();
        }

        // التحقق من عدم وجود تقرير مُولَّد اليوم مسبقاً
        $todayReport = Report::byType(
            Report::TYPE_AI_GENERATED
        )->whereDate('created_at', today())->first();

        if ($todayReport && ! $request->get('force', false)) {
            return $this->error(
                'تم توليد تقرير اليوم مسبقاً. '.
                'أرسل force=true لتوليد تقرير إضافي',
                409
            );
        }

        $conversationsCount = AiConversation::recent(24)->count();
        if ($conversationsCount === 0) {
            return $this->error(
                'لا توجد محادثات في آخر 24 ساعة — لا يوجد ما يُرفع'
            );
        }

        $force = $request->boolean('force');
        GenerateDailyAiReport::dispatch($force, $force ? (string) Str::uuid() : null)
            ->onQueue('reports');

        return $this->success([
            'queued' => true,
            'conversations_count' => $conversationsCount,
            'suggestions_count' => MealSuggestion::recent(24)->count(),
        ], 'تمت جدولة التقرير اليومي وسيصل لمدير التواصل بعد توليده 🤖');
    }
}
