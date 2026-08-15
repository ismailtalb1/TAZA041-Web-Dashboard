<?php

namespace App\Http\Controllers\API;

use App\Models\Employee;
use App\Models\Notification;
use App\Models\Report;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class ReportController extends BaseController
{
    // ─────────────────────────────────────────────
    // مساعدات
    // ─────────────────────────────────────────────
    private function getEmployee(Request $request): ?Employee
    {
        $user = $request->user();

        return $user instanceof Employee ? $user : null;
    }

    private function isGM(Request $request): bool
    {
        $employee = $this->getEmployee($request);

        return $employee?->isGeneralManager() ?? false;
    }

    // ═══════════════════════════════════════════════
    // المسارات المشتركة بين الموظفين
    // ═══════════════════════════════════════════════

    // ─────────────────────────────────────────────
    // GET /api/employee/reports
    // التقارير المُرسَلة والمُستلَمة للموظف
    // ─────────────────────────────────────────────
    public function index(Request $request)
    {
        $employee = $this->getEmployee($request);
        if (! $employee) {
            return $this->unauthorized();
        }

        // التقارير الواردة
        $received = Report::forReceiver($employee->id)
            ->with(['sender'])
            ->latest()
            ->get();

        // التقارير الصادرة
        $sent = Report::fromSender($employee->id)
            ->with(['receiver'])
            ->latest()
            ->get();

        return $this->success([
            'stats' => [
                'total_received' => $received->count(),
                'unreviewed' => $received->where('status', Report::STATUS_SENT)->count(),
                'total_sent' => $sent->count(),
                'pending_sent' => $sent->where('status', Report::STATUS_SENT)->count(),
            ],
            'allowed_types' => Report::ALLOWED_TYPES_BY_ROLE[$employee->role] ?? [],
            'allowed_routes' => Report::ALLOWED_ROUTES[$employee->role] ?? [],
            'received' => $received->map->getDetails()->values(),
            'sent' => $sent->map->getDetails()->values(),
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/employee/reports/{id}
    // ─────────────────────────────────────────────
    public function show(Request $request, int $id)
    {
        $employee = $this->getEmployee($request);
        if (! $employee) {
            return $this->unauthorized();
        }

        // الموظف يرى فقط ما أرسله أو استلمه
        $report = Report::where(function ($q) use ($employee) {
            $q->where('sender_id', $employee->id)
                ->orWhere('receiver_id', $employee->id);
        })->with(['sender', 'receiver'])->find($id);

        if (! $report) {
            return $this->notFound('التقرير غير موجود');
        }

        return $this->success(['report' => $report->getDetails()]);
    }

    // ─────────────────────────────────────────────
    // POST /api/employee/reports
    // إنشاء وإرسال تقرير للمدير العام
    // ─────────────────────────────────────────────
    public function store(Request $request)
    {
        $employee = $this->getEmployee($request);
        if (! $employee) {
            return $this->unauthorized();
        }

        // المدير العام لا يرسل تقارير لنفسه من هنا
        if ($employee->isGeneralManager()) {
            return $this->error(
                'استخدم مسار /api/admin/reports لإرسال تعليمات للموظفين'
            );
        }

        $allowedTypes = Report::ALLOWED_TYPES_BY_ROLE[$employee->role] ?? [];

        $validator = Validator::make($request->all(), [
            'title' => 'required|string|max:255',
            'description' => 'nullable|string|max:500',
            'content' => 'required|string',
            'report_type' => 'required|in:'.implode(',', $allowedTypes),
        ], [
            'title.required' => 'عنوان التقرير مطلوب',
            'content.required' => 'محتوى التقرير مطلوب',
            'report_type.required' => 'نوع التقرير مطلوب',
            'report_type.in' => 'هذا النوع غير مسموح به لدورك الوظيفي',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $result = Report::sendToGeneralManager(
            sender: $employee,
            type: $request->report_type,
            title: $request->title,
            content: $request->content,
            description: $request->description
        );

        if (! $result['success']) {
            return $this->error($result['message']);
        }

        $report = Report::with(['sender', 'receiver'])->find($result['report_id']);

        return $this->success([
            'report' => $report->getDetails(),
        ], $result['message'], 201);
    }

    // ─────────────────────────────────────────────
    // PUT /api/employee/reports/{id}/review
    // ─────────────────────────────────────────────
    public function markReviewed(Request $request, int $id)
    {
        $employee = $this->getEmployee($request);
        if (! $employee) {
            return $this->unauthorized();
        }

        $report = Report::forReceiver($employee->id)->find($id);
        if (! $report) {
            return $this->notFound('التقرير غير موجود');
        }

        if ($report->status === Report::STATUS_REVIEWED) {
            return $this->error('تمت مراجعة هذا التقرير مسبقاً');
        }

        $report->markAsReviewed();

        return $this->success([
            'report' => $report->fresh()->getDetails(),
        ], 'تم تعيين التقرير كمراجَع');
    }

    // ─────────────────────────────────────────────
    // PUT /api/employee/reports/{id}/archive
    // ─────────────────────────────────────────────
    public function archive(Request $request, int $id)
    {
        $employee = $this->getEmployee($request);
        if (! $employee) {
            return $this->unauthorized();
        }

        $report = Report::where(function ($q) use ($employee) {
            $q->where('sender_id', $employee->id)
                ->orWhere('receiver_id', $employee->id);
        })->find($id);

        if (! $report) {
            return $this->notFound('التقرير غير موجود');
        }

        if ($report->status === Report::STATUS_ARCHIVED) {
            return $this->error('التقرير مؤرشف مسبقاً');
        }

        $report->archive();

        return $this->success(null, 'تم أرشفة التقرير');
    }

    // ─────────────────────────────────────────────
    // PUT /api/employee/reports/{id}/restore
    // ─────────────────────────────────────────────
    public function restore(Request $request, int $id)
    {
        $employee = $this->getEmployee($request);
        if (! $employee) {
            return $this->unauthorized();
        }

        $report = Report::where(function ($query) use ($employee) {
            $query->where('sender_id', $employee->id)
                ->orWhere('receiver_id', $employee->id);
        })->find($id);

        if (! $report) {
            return $this->notFound('التقرير غير موجود');
        }

        if ($report->status !== Report::STATUS_ARCHIVED) {
            return $this->error('التقرير موجود بالفعل ضمن القائمة النشطة');
        }

        $report->update([
            'status' => $report->reviewed_at
                ? Report::STATUS_REVIEWED
                : Report::STATUS_SENT,
        ]);

        return $this->success([
            'report' => $report->fresh()->load(['sender', 'receiver'])->getDetails(),
        ], 'تمت إعادة التقرير إلى القائمة النشطة');
    }

    // ═══════════════════════════════════════════════
    // مسارات المدير العام
    // ═══════════════════════════════════════════════

    // ─────────────────────────────────────────────
    // GET /api/admin/reports
    // كل التقارير الواردة للمدير العام
    // ─────────────────────────────────────────────
    public function adminIndex(Request $request)
    {
        if (! $this->isGM($request)) {
            return $this->unauthorized('هذا المسار للمدير العام فقط');
        }

        $gm = $this->getEmployee($request);
        $query = Report::forReceiver($gm->id)->with(['sender']);

        $activeCount = Report::forReceiver($gm->id)
            ->where('status', '!=', Report::STATUS_ARCHIVED)
            ->count();
        $archivedCount = Report::forReceiver($gm->id)
            ->where('status', Report::STATUS_ARCHIVED)
            ->count();

        match ($request->input('record_state', 'active')) {
            'archived' => $query->where('status', Report::STATUS_ARCHIVED),
            'all' => null,
            default => $query->where('status', '!=', Report::STATUS_ARCHIVED),
        };

        // فلاتر
        if ($request->filled('report_type')) {
            $query->byType($request->report_type);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('sender_id')) {
            $query->fromSender($request->sender_id);
        }

        if ($request->filled('from_date') && $request->filled('to_date')) {
            $query->whereBetween('created_at', [
                $request->from_date.' 00:00:00',
                $request->to_date.' 23:59:59',
            ]);
        }

        $reports = $query->latest()->get();

        // تجميع حسب النوع
        $byType = $reports->groupBy('report_type')
            ->map(fn ($group, $type) => [
                'type' => $type,
                'type_label' => Report::TYPE_LABELS[$type] ?? $type,
                'count' => $group->count(),
                'unreviewed' => $group->where('status', Report::STATUS_SENT)->count(),
            ])->values();

        return $this->success([
            'stats' => [
                'total' => $reports->count(),
                'unreviewed' => $reports->where('status', Report::STATUS_SENT)->count(),
                'reviewed' => $reports->where('status', Report::STATUS_REVIEWED)->count(),
                'archived' => $reports->where('status', Report::STATUS_ARCHIVED)->count(),
                'active_total' => $activeCount,
                'archive_total' => $archivedCount,
            ],
            'by_type' => $byType,
            'reports' => $reports->map->getDetails()->values(),
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/admin/reports/stats
    // ─────────────────────────────────────────────
    public function stats(Request $request)
    {
        if (! $this->isGM($request)) {
            return $this->unauthorized();
        }

        $gm = $this->getEmployee($request);
        $week = now()->startOfWeek();

        $reportsThisWeek = Report::forReceiver($gm->id)
            ->where('created_at', '>=', $week)
            ->count();

        // التقارير حسب المرسل
        $bySender = Report::forReceiver($gm->id)
            ->with('sender')
            ->get()
            ->groupBy('sender_id')
            ->map(fn ($group) => [
                'sender_name' => $group->first()->sender?->name,
                'sender_role' => $group->first()->sender?->getRoleLabel(),
                'total_sent' => $group->count(),
                'unreviewed' => $group->where('status', Report::STATUS_SENT)->count(),
            ])
            ->values();

        return $this->success([
            'total_received' => Report::forReceiver($gm->id)->count(),
            'unreviewed' => Report::forReceiver($gm->id)->unreviewed()->count(),
            'this_week' => $reportsThisWeek,
            'ai_reports_pending' => Report::forReceiver($gm->id)
                ->byType(Report::TYPE_AI_GENERATED)
                ->unreviewed()
                ->count(),
            'by_sender' => $bySender,
            'type_labels' => Report::TYPE_LABELS,
            'status_labels' => Report::STATUS_LABELS,
        ]);
    }

    // ─────────────────────────────────────────────
    // POST /api/admin/reports/{id}/send
    // المدير العام يرسل تعليمات لموظف
    // ─────────────────────────────────────────────
    public function adminSend(Request $request, int $id)
    {
        if (! $this->isGM($request)) {
            return $this->unauthorized();
        }

        $gm = $this->getEmployee($request);

        $validator = Validator::make($request->all(), [
            'receiver_id' => 'required|integer|exists:employees,id',
            'title' => 'required|string|max:255',
            'content' => 'required|string',
            'report_type' => 'required|in:order,delivery,financial,inventory,communication,general',
        ], [
            'receiver_id.required' => 'معرف المستلم مطلوب',
            'receiver_id.exists' => 'الموظف المستلم غير موجود',
            'title.required' => 'عنوان التقرير مطلوب',
            'content.required' => 'محتوى التقرير مطلوب',
            'report_type.required' => 'نوع التقرير مطلوب',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $receiver = Employee::find($request->receiver_id);

        // التحقق من صحة مسار الإرسال
        if (! Report::isRouteAllowed(
            Employee::ROLE_GENERAL_MANAGER,
            $receiver->role
        )) {
            return $this->error('لا يمكن إرسال تقارير لهذا الموظف');
        }

        $report = Report::create([
            'title' => $request->title,
            'description' => $request->get('description'),
            'content' => $request->content,
            'sender_id' => $gm->id,
            'receiver_id' => $receiver->id,
            'report_type' => $request->report_type,
            'status' => Report::STATUS_SENT,
        ]);

        // إشعار الموظف
        Notification::managerToEmployee(
            from: $gm,
            to: $receiver,
            title: 'تعليمات من المدير العام 📋',
            message: "وصلك تقرير/تعليمات بعنوان: {$report->title}",
            extraData: [
                'report_id' => $report->id,
                'report_type' => $report->report_type,
            ]
        );

        return $this->success([
            'report' => $report->load(['sender', 'receiver'])->getDetails(),
            'receiver_name' => $receiver->name,
        ], "تم إرسال التعليمات إلى {$receiver->name}", 201);
    }

    // ═══════════════════════════════════════════════
    // تقارير AI — مدير التواصل
    // ═══════════════════════════════════════════════

    // ─────────────────────────────────────────────
    // GET /api/communication/ai-reports
    // ─────────────────────────────────────────────
    public function aiReportsIndex(Request $request)
    {
        $employee = $this->getEmployee($request);
        if (! $employee) {
            return $this->unauthorized();
        }

        if (! in_array($employee->role, [
            Employee::ROLE_COMMUNICATION_MANAGER,
            Employee::ROLE_GENERAL_MANAGER,
        ])) {
            return $this->unauthorized('هذا المسار لمدير التواصل فقط');
        }

        $reports = Report::forReceiver($employee->id)
            ->byType(Report::TYPE_AI_GENERATED)
            ->with(['sender'])
            ->latest()
            ->get();

        return $this->success([
            'stats' => [
                'total' => $reports->count(),
                'unreviewed' => $reports->where('status', Report::STATUS_SENT)->count(),
                'reviewed' => $reports->where('status', Report::STATUS_REVIEWED)->count(),
                'forwarded' => $reports->where('status', Report::STATUS_REVIEWED)->count(),
            ],
            'reports' => $reports->map->getDetails()->values(),
        ]);
    }

    // ─────────────────────────────────────────────
    // POST /api/communication/ai-reports/{id}/forward
    // مدير التواصل يُحيل تقرير AI للمدير العام
    // ─────────────────────────────────────────────
    public function forwardToGM(Request $request, int $id)
    {
        $employee = $this->getEmployee($request);
        if (! $employee) {
            return $this->unauthorized();
        }

        if ($employee->role !== Employee::ROLE_COMMUNICATION_MANAGER) {
            return $this->unauthorized('هذا المسار لمدير التواصل فقط');
        }

        $report = Report::forReceiver($employee->id)
            ->byType(Report::TYPE_AI_GENERATED)
            ->find($id);

        if (! $report) {
            return $this->notFound('التقرير غير موجود');
        }

        if ($report->status === Report::STATUS_REVIEWED) {
            return $this->error('تمت إحالة هذا التقرير مسبقاً');
        }

        $result = $report->forwardToGeneralManager($employee);

        if (! $result['success']) {
            return $this->error($result['message']);
        }

        return $this->success([
            'forwarded_report_id' => $result['forwarded_report_id'],
            'original_report' => $report->fresh()->getDetails(),
        ], $result['message']);
    }
}
