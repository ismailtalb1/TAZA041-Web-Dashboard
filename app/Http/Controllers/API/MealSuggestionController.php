<?php

namespace App\Http\Controllers\API;

use App\Models\Customer;
use App\Models\Employee;
use App\Models\MealSuggestion;
use App\Models\Notification;
use App\Support\CustomerInputRules;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class MealSuggestionController extends BaseController
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

    private function canManage(Request $request): bool
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

    // ─────────────────────────────────────────────
    // GET /api/communication/meal-suggestions
    // ─────────────────────────────────────────────
    public function index(Request $request)
    {
        if (! $this->canManage($request)) {
            return $this->unauthorized('صلاحية مدير التواصل مطلوبة');
        }

        $query = MealSuggestion::with(['customer'])->latest();

        // فلترة حسب الحالة
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        // فلترة حسب التاريخ
        if ($request->filled('from_date') && $request->filled('to_date')) {
            $query->whereBetween('created_at', [
                $request->from_date.' 00:00:00',
                $request->to_date.' 23:59:59',
            ]);
        }

        // بحث في نص الاقتراح
        if ($request->filled('search')) {
            $search = $request->search;
            $query->where('suggestion_text', 'like', "%{$search}%");
        }

        $suggestions = $query->get();

        return $this->success([
            'stats' => [
                'total' => $suggestions->count(),
                'pending' => $suggestions->where('status', MealSuggestion::STATUS_PENDING)->count(),
                'reviewed' => $suggestions->where('status', MealSuggestion::STATUS_REVIEWED)->count(),
                'implemented' => $suggestions->where('status', MealSuggestion::STATUS_IMPLEMENTED)->count(),
                'rejected' => $suggestions->where('status', MealSuggestion::STATUS_REJECTED)->count(),
            ],
            'status_labels' => MealSuggestion::STATUS_LABELS,
            'suggestions' => $suggestions->map(fn ($s) => array_merge(
                $s->getDetails(),
                [
                    'customer_name' => $s->customer?->name ?? 'مجهول (AI)',
                    'customer_phone' => $s->customer?->phone,
                ]
            ))->values(),
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/communication/meal-suggestions/stats
    // ─────────────────────────────────────────────
    public function stats(Request $request)
    {
        if (! $this->canManage($request)) {
            return $this->unauthorized();
        }

        $week = now()->startOfWeek();
        $month = now()->startOfMonth();

        // الاقتراحات الأكثر تكراراً (تحليل بسيط بالكلمات)
        $allTexts = MealSuggestion::pending()
            ->pluck('suggestion_text')
            ->toArray();

        // كلمات مفتاحية شائعة
        $keywords = [];
        $commonWords = [
            'بيتزا', 'برغر', 'شاورما', 'فلافل', 'دجاج', 'لحم',
            'نباتي', 'إفطار', 'حلويات', 'سوشي', 'باستا', 'سلطة',
        ];

        foreach ($commonWords as $word) {
            $count = count(array_filter(
                $allTexts,
                fn ($text) => str_contains(mb_strtolower($text), $word)
            ));
            if ($count > 0) {
                $keywords[] = ['keyword' => $word, 'mentions' => $count];
            }
        }

        usort($keywords, fn ($a, $b) => $b['mentions'] - $a['mentions']);

        return $this->success([
            'overview' => [
                'total_all_time' => MealSuggestion::count(),
                'pending' => MealSuggestion::pending()->count(),
                'this_week' => MealSuggestion::recent(168)->count(),
                'this_month' => MealSuggestion::where('created_at', '>=', $month)->count(),
                'implementation_rate' => MealSuggestion::count() > 0
                    ? round(
                        (MealSuggestion::where('status', MealSuggestion::STATUS_IMPLEMENTED)->count()
                        / MealSuggestion::count()) * 100,
                        1
                    )
                    : 0,
            ],
            'popular_keywords' => array_slice($keywords, 0, 5),
            'recent_pending' => MealSuggestion::pending()
                ->with('customer')
                ->latest()
                ->take(5)
                ->get()
                ->map->getDetails()
                ->values(),
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/communication/meal-suggestions/{id}
    // ─────────────────────────────────────────────
    public function show(Request $request, int $id)
    {
        if (! $this->canManage($request)) {
            return $this->unauthorized();
        }

        $suggestion = MealSuggestion::with(['customer'])->find($id);
        if (! $suggestion) {
            return $this->notFound('الاقتراح غير موجود');
        }

        return $this->success([
            'suggestion' => array_merge(
                $suggestion->getDetails(),
                [
                    'customer_name' => $suggestion->customer?->name ?? 'مجهول (AI)',
                    'customer_phone' => $suggestion->customer?->phone,
                    'customer_email' => $suggestion->customer?->email,
                ]
            ),
        ]);
    }

    // ─────────────────────────────────────────────
    // PUT /api/communication/meal-suggestions/{id}/review
    // ─────────────────────────────────────────────
    public function review(Request $request, int $id)
    {
        if (! $this->canManage($request)) {
            return $this->unauthorized();
        }

        $suggestion = MealSuggestion::find($id);
        if (! $suggestion) {
            return $this->notFound('الاقتراح غير موجود');
        }

        if ($suggestion->status !== MealSuggestion::STATUS_PENDING) {
            return $this->error(
                "الاقتراح بحالة \"{$suggestion->status}\" — لا يمكن مراجعته مجدداً"
            );
        }

        $validator = Validator::make($request->all(), [
            'note' => 'required|string|min:5|max:500',
        ], [
            'note.required' => 'ملاحظة المراجعة مطلوبة',
            'note.min' => 'الملاحظة يجب أن تكون 5 أحرف على الأقل',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $employee = $this->getEmployee($request);
        $suggestion->review($employee, $request->note);

        return $this->success([
            'suggestion' => $suggestion->fresh()->getDetails(),
        ], 'تمت مراجعة الاقتراح');
    }

    // ─────────────────────────────────────────────
    // PUT /api/communication/meal-suggestions/{id}/implement
    // ─────────────────────────────────────────────
    public function markImplemented(Request $request, int $id)
    {
        if (! $this->canManage($request)) {
            return $this->unauthorized();
        }

        $suggestion = MealSuggestion::find($id);
        if (! $suggestion) {
            return $this->notFound('الاقتراح غير موجود');
        }

        if ($suggestion->status === MealSuggestion::STATUS_IMPLEMENTED) {
            return $this->error('هذا الاقتراح مُطبَّق مسبقاً');
        }

        $validator = Validator::make($request->all(), [
            'note' => 'required|string|min:5|max:500',
        ], [
            'note.required' => 'ملاحظة التطبيق مطلوبة',
            'note.min' => 'الملاحظة يجب أن تكون 5 أحرف على الأقل',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $employee = $this->getEmployee($request);
        $suggestion->markImplemented($employee, $request->note);

        return $this->success([
            'suggestion' => $suggestion->fresh()->getDetails(),
        ], 'تم تعيين الاقتراح كمُطبَّق 🎉');
    }

    // ─────────────────────────────────────────────
    // PUT /api/communication/meal-suggestions/{id}/reject
    // ─────────────────────────────────────────────
    public function reject(Request $request, int $id)
    {
        if (! $this->canManage($request)) {
            return $this->unauthorized();
        }

        $suggestion = MealSuggestion::find($id);
        if (! $suggestion) {
            return $this->notFound('الاقتراح غير موجود');
        }

        if ($suggestion->status === MealSuggestion::STATUS_REJECTED) {
            return $this->error('هذا الاقتراح مرفوض مسبقاً');
        }

        $validator = Validator::make($request->all(), [
            'reason' => 'required|string|min:5|max:500',
        ], [
            'reason.required' => 'سبب الرفض مطلوب',
            'reason.min' => 'سبب الرفض يجب أن يكون 5 أحرف على الأقل',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $suggestion->update([
            'status' => MealSuggestion::STATUS_REJECTED,
            'admin_note' => $request->reason,
        ]);

        // إشعار الزبون بالرفض (مع تلطيف الرسالة)
        if ($suggestion->customer_id) {
            Notification::create([
                'sender_type' => Notification::SENDER_EMPLOYEE,
                'sender_id' => $this->getEmployee($request)->id,
                'receiver_type' => Notification::RECEIVER_CUSTOMER,
                'receiver_id' => $suggestion->customer_id,
                'type' => Notification::TYPE_SYSTEM_ANNOUNCEMENT,
                'title' => 'شكراً على اقتراحك 💚',
                'message' => 'تم مراجعة اقتراحك — للأسف لن نتمكن من تطبيقه في الوقت الحالي، لكننا نقدّر تفاعلك!',
                'data' => ['suggestion_id' => $suggestion->id],
            ]);
        }

        return $this->success([
            'suggestion' => $suggestion->fresh()->getDetails(),
        ], 'تم رفض الاقتراح');
    }

    // ─────────────────────────────────────────────
    // GET /api/customer/meal-suggestions
    // سجل اقتراحات الزبون وحالتها
    // ─────────────────────────────────────────────
    public function customerIndex(Request $request)
    {
        $customer = $this->getCustomer($request);
        if (! $customer) {
            return $this->unauthorized('هذا المسار للزبائن فقط');
        }

        return $this->success([
            'suggestions' => MealSuggestion::where('customer_id', $customer->id)
                ->latest()
                ->get()
                ->map->getDetails()
                ->values(),
        ]);
    }

    // ─────────────────────────────────────────────
    // POST /api/customer/meal-suggestion
    // الزبون يرسل اقتراحاً
    // ─────────────────────────────────────────────
    public function store(Request $request)
    {
        $customer = $this->getCustomer($request);
        if (! $customer) {
            return $this->unauthorized('هذا المسار للزبائن فقط');
        }

        if ($customer->isBanned()) {
            return $this->error('حسابك موقوف', 403);
        }

        $validator = Validator::make($request->all(), [
            'suggestion_text' => CustomerInputRules::safeText(true, 1000, 10),
            'image' => [
                'nullable',
                'image',
                'max:5120',
                'mimes:jpg,jpeg,png,webp',
                'mimetypes:image/jpeg,image/png,image/webp',
                'dimensions:min_width=1,min_height=1,max_width=10000,max_height=10000',
            ],
        ], [
            'suggestion_text.required' => 'نص الاقتراح مطلوب',
            'suggestion_text.min' => 'الاقتراح قصير جداً — أضف تفاصيل أكثر',
            'suggestion_text.max' => 'الاقتراح طويل جداً (الحد 1000 حرف)',
            'image.image' => 'الملف المرفوع ليس صورة صالحة',
            'image.max' => 'حجم الصورة يجب ألا يتجاوز 5 ميغابايت',
            'image.mimes' => 'صيغة الصورة يجب أن تكون JPG أو PNG أو WebP',
            'image.mimetypes' => 'محتوى الملف يجب أن يكون صورة JPG أو PNG أو WebP',
            'image.dimensions' => 'أبعاد الصورة غير صالحة أو كبيرة جداً',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        // منع الاقتراحات المكررة (نفس النص خلال 24 ساعة)
        $recentDuplicate = MealSuggestion::where('customer_id', $customer->id)
            ->where('suggestion_text', $request->suggestion_text)
            ->where('created_at', '>=', now()->subDay())
            ->exists();

        if ($recentDuplicate) {
            return $this->error('لقد أرسلت هذا الاقتراح مؤخراً — شكراً لتفاعلك!');
        }

        $suggestion = MealSuggestion::create([
            'customer_id' => $customer->id,
            'suggestion_text' => $request->suggestion_text,
            'image_path' => $request->file('image')?->store('meal-suggestions', 'public'),
            'status' => MealSuggestion::STATUS_PENDING,
        ]);

        // إشعار مدير التواصل
        $commManager = Employee::active()
            ->byRole(Employee::ROLE_COMMUNICATION_MANAGER)
            ->first();

        if ($commManager) {
            Notification::create([
                'sender_type' => Notification::SENDER_CUSTOMER,
                'sender_id' => $customer->id,
                'receiver_type' => Notification::RECEIVER_EMPLOYEE,
                'receiver_id' => $commManager->id,
                'type' => Notification::TYPE_SYSTEM_ANNOUNCEMENT,
                'title' => 'اقتراح وجبة جديد 💡',
                'message' => "الزبون {$customer->name} اقترح: ".
                                   mb_substr($request->suggestion_text, 0, 80).'...',
                'data' => ['suggestion_id' => $suggestion->id],
            ]);
        }

        return $this->success([
            'suggestion' => $suggestion->getDetails(),
        ], 'شكراً على اقتراحك! سنراجعه قريباً 💚', 201);
    }
}
