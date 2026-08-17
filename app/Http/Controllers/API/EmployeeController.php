<?php

namespace App\Http\Controllers\API;

use App\Models\Employee;
use App\Models\Notification;
use App\Models\Review;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;

class EmployeeController extends BaseController
{
    // ─────────────────────────────────────────────
    // التحقق من أن المستخدم الحالي مدير عام
    // ─────────────────────────────────────────────
    private function getGeneralManager(Request $request)
    {
        $employee = $request->user();

        if (! $employee instanceof Employee) {
            return null;
        }

        if (! $employee->isGeneralManager()) {
            return null;
        }

        return $employee;
    }

    // ─────────────────────────────────────────────
    // GET /api/admin/employees
    // ─────────────────────────────────────────────
    public function index(Request $request)
    {
        $gm = $this->getGeneralManager($request);
        if (! $gm) {
            return $this->unauthorized('هذا المسار للمدير العام فقط');
        }

        $query = Employee::with(['managedEmployees'])
            ->staffOnly(); // كل الموظفين ما عدا المدير العام

        // فلترة حسب الدور
        if ($request->filled('role')) {
            $query->byRole($request->role);
        }

        // فلترة حسب الحالة
        if ($request->filled('is_active')) {
            $query->where('is_active', (bool) $request->is_active);
        }

        // بحث بالاسم أو اسم المستخدم
        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('username', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%");
            });
        }

        $employees = $query->latest()->get();

        // تجميع حسب الدور للعرض في الـ Dashboard
        $grouped = [];
        foreach (Employee::ALL_ROLES as $role) {
            if ($role === Employee::ROLE_GENERAL_MANAGER) {
                continue;
            }

            $roleEmployees = $employees->filter(
                fn ($e) => $e->role === $role
            );

            if ($roleEmployees->isNotEmpty()) {
                $grouped[$role] = [
                    'role_label' => $roleEmployees->first()->getRoleLabel(),
                    'count' => $roleEmployees->count(),
                    'employees' => $roleEmployees->map(function ($e) {
                        return array_merge($e->getDetails(), [
                            'avg_rating' => Review::getAverageForEmployee($e->id),
                        ]);
                    })->values(),
                ];
            }
        }

        return $this->success([
            'total' => $employees->count(),
            'active' => $employees->where('is_active', true)->count(),
            'inactive' => $employees->where('is_active', false)->count(),
            'grouped' => $grouped,
            'all' => $employees->map(fn ($e) => $e->getDetails())->values(),
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/admin/employees/{id}
    // ─────────────────────────────────────────────
    public function show(Request $request, int $id)
    {
        $gm = $this->getGeneralManager($request);
        if (! $gm) {
            return $this->unauthorized('هذا المسار للمدير العام فقط');
        }

        $employee = Employee::find($id);
        if (! $employee) {
            return $this->notFound('الموظف غير موجود');
        }

        // منع عرض بيانات مدير عام آخر
        if ($employee->isGeneralManager() && $employee->id !== $gm->id) {
            return $this->unauthorized();
        }

        $reviews = Review::employeeReviews()
            ->forEmployee($id)
            ->latest()
            ->get()
            ->map->getDetails()
            ->values();

        return $this->success([
            'employee' => $employee->getDetails(),
            'avg_rating' => Review::getAverageForEmployee($id),
            'reviews' => $reviews,
        ]);
    }

    // ─────────────────────────────────────────────
    // POST /api/admin/employees
    // ─────────────────────────────────────────────
    public function store(Request $request)
    {
        $gm = $this->getGeneralManager($request);
        if (! $gm) {
            return $this->unauthorized('هذا المسار للمدير العام فقط');
        }

        // تنظيف البيانات القادمة من لوحة الإدارة قبل التحقق والحفظ
        $request->merge([
            'name' => trim((string) $request->input('name', '')),
            'username' => trim((string) $request->input('username', '')),
            'email' => $request->filled('email') ? trim((string) $request->input('email')) : null,
            'phone' => $request->filled('phone') ? trim((string) $request->input('phone')) : null,
            'role' => trim((string) $request->input('role', '')),
        ]);

        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'username' => 'required|string|max:255|unique:employees,username',
            'password' => 'required|string|min:6',
            'role' => 'required|in:'.implode(',', array_filter(
                Employee::ALL_ROLES,
                fn ($r) => $r !== Employee::ROLE_GENERAL_MANAGER
            )),
            'email' => 'nullable|email|max:255|unique:employees,email',
            'phone' => 'nullable|string|max:30',
            'manager_password' => 'required|string',
        ], [
            'name.required' => 'الاسم مطلوب',
            'username.required' => 'اسم المستخدم مطلوب',
            'username.unique' => 'اسم المستخدم مستخدم مسبقاً',
            'password.required' => 'كلمة المرور مطلوبة',
            'password.min' => 'كلمة المرور 6 أحرف على الأقل',
            'role.required' => 'الدور الوظيفي مطلوب',
            'role.in' => 'الدور الوظيفي غير صحيح',
            'email.unique' => 'البريد الإلكتروني مستخدم مسبقاً',
            'manager_password.required' => 'كلمة مرور المدير العام مطلوبة لتأكيد العملية',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        if (! Hash::check((string) $request->manager_password, $gm->password_hash)) {
            return $this->error('كلمة مرور المدير العام غير صحيحة', 422);
        }

        DB::beginTransaction();
        try {
            if (Employee::isAdministrativeRole($request->role)
                && Employee::where('role', $request->role)->lockForUpdate()->exists()) {
                DB::rollBack();

                return $this->error('يوجد موظف إداري مسجل مسبقاً بهذا الدور، ولا يمكن إنشاء حساب إداري ثانٍ له', 422);
            }

            $employee = Employee::create([
                'name' => $request->name,
                'username' => $request->username,
                'password_hash' => Hash::make($request->password),
                'role' => $request->role,
                'email' => $request->email,
                'phone' => $request->phone,
                'is_active' => true,
                'created_by' => $gm->id,
            ]);

            // إشعار الموظف الجديد
            Notification::create([
                'sender_type' => Notification::SENDER_EMPLOYEE,
                'sender_id' => $gm->id,
                'receiver_type' => Notification::RECEIVER_EMPLOYEE,
                'receiver_id' => $employee->id,
                'type' => Notification::TYPE_SYSTEM_ANNOUNCEMENT,
                'title' => 'مرحباً في فريق TAZA 041 👋',
                'message' => "تم إنشاء حسابك كـ {$employee->getRoleLabel()}. ".
                                   "يمكنك الدخول باستخدام: {$employee->username}",
                'data' => [
                    'role' => $employee->role,
                    'created_by' => $gm->name,
                ],
            ]);

            DB::commit();

            return $this->success([
                'employee' => $employee->getDetails(),
            ], "تم إنشاء حساب {$employee->name} بنجاح", 201);

        } catch (\Exception $e) {
            DB::rollBack();

            return $this->error(
                'فشل في إنشاء الحساب',
                500,
                config('app.debug') ? $e->getMessage() : null
            );
        }
    }

    // ─────────────────────────────────────────────
    // PUT /api/admin/employees/{id}
    // ─────────────────────────────────────────────
    public function update(Request $request, int $id)
    {
        $gm = $this->getGeneralManager($request);
        if (! $gm) {
            return $this->unauthorized('هذا المسار للمدير العام فقط');
        }

        // تنظيف القيم المرسلة من Dashboard، مع إبقاء الحقول غير المرسلة كما هي
        $normalized = [];
        foreach (['name', 'username', 'email', 'phone', 'role'] as $field) {
            if ($request->has($field)) {
                $value = $request->input($field);
                $normalized[$field] = $value === null ? null : trim((string) $value);
            }
        }
        if (array_key_exists('email', $normalized) && $normalized['email'] === '') {
            $normalized['email'] = null;
        }
        if (array_key_exists('phone', $normalized) && $normalized['phone'] === '') {
            $normalized['phone'] = null;
        }
        if ($normalized) {
            $request->merge($normalized);
        }

        $employee = Employee::find($id);
        if (! $employee) {
            return $this->notFound('الموظف غير موجود');
        }

        // منع تعديل مدير عام آخر
        if ($employee->isGeneralManager()) {
            return $this->unauthorized('لا يمكن تعديل بيانات المدير العام');
        }

        $validator = Validator::make($request->all(), [
            'name' => 'sometimes|string|max:255',
            'username' => 'sometimes|string|max:255|unique:employees,username,'.$id,
            'password' => 'sometimes|string|min:6',
            'role' => 'sometimes|in:'.implode(',', array_filter(
                Employee::ALL_ROLES,
                fn ($r) => $r !== Employee::ROLE_GENERAL_MANAGER
            )),
            'email' => 'sometimes|nullable|email|unique:employees,email,'.$id,
            'phone' => 'sometimes|nullable|string|max:30',
            'is_active' => 'sometimes|boolean',
            'manager_password' => 'required|string',
        ], [
            'username.unique' => 'اسم المستخدم مستخدم مسبقاً',
            'email.unique' => 'البريد الإلكتروني مستخدم مسبقاً',
            'password.min' => 'كلمة المرور 6 أحرف على الأقل',
            'role.in' => 'الدور الوظيفي غير صحيح',
            'manager_password.required' => 'كلمة مرور المدير العام مطلوبة لتأكيد التعديل',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        if (! Hash::check((string) $request->manager_password, $gm->password_hash)) {
            return $this->error('كلمة مرور المدير العام غير صحيحة', 422);
        }

        $requestedRole = $request->input('role', $employee->role);
        if ($requestedRole !== $employee->role
            && Employee::isAdministrativeRole($requestedRole)
            && Employee::where('role', $requestedRole)->whereKeyNot($employee->id)->exists()) {
            return $this->error('يوجد موظف إداري مسجل مسبقاً بهذا الدور، ولا يمكن إسناده لموظف آخر', 422);
        }

        $changes = [];

        if ($request->filled('name') && $employee->name !== $request->name) {
            $employee->name = $request->name;
            $changes[] = 'الاسم';
        }

        if ($request->filled('username') && $employee->username !== $request->username) {
            $employee->username = $request->username;
            $changes[] = 'اسم المستخدم';
        }

        if ($request->filled('password')) {
            $employee->password_hash = Hash::make($request->password);
            $changes[] = 'كلمة المرور';
            // إلغاء كل التوكنات عند تغيير كلمة المرور
            $employee->tokens()->delete();
        }

        if ($request->filled('role') && $employee->role !== $request->role) {
            $employee->role = $request->role;
            $changes[] = 'الدور الوظيفي';
        }

        if ($request->has('email') && $employee->email !== $request->email) {
            $employee->email = $request->email;
            $changes[] = 'البريد الإلكتروني';
        }

        if ($request->has('phone') && $employee->phone !== $request->phone) {
            $employee->phone = $request->phone;
            $changes[] = 'رقم الهاتف';
        }

        if ($request->has('is_active')) {
            $wasActive = $employee->is_active;
            $employee->is_active = $request->boolean('is_active');

            if ($wasActive && ! $employee->is_active) {
                // تعطيل الحساب — حذف كل التوكنات
                $employee->tokens()->delete();
                $changes[] = 'تم تعطيل الحساب';
            } elseif (! $wasActive && $employee->is_active) {
                $changes[] = 'تم تفعيل الحساب';
            }
        }

        $employee->save();

        // إشعار الموظف بالتغييرات
        if (! empty($changes)) {
            Notification::employeeProfileUpdated($employee, $gm, $changes);
        }

        return $this->success([
            'employee' => $employee->getDetails(),
            'changes' => $changes,
        ], 'تم تحديث بيانات الموظف بنجاح');
    }

    // ─────────────────────────────────────────────
    // DELETE /api/admin/employees/{id}
    // إقالة الموظف (تعطيل وليس حذف فعلي)
    // ─────────────────────────────────────────────
    public function destroy(Request $request, int $id)
    {
        $gm = $this->getGeneralManager($request);
        if (! $gm) {
            return $this->unauthorized('هذا المسار للمدير العام فقط');
        }

        $employee = Employee::find($id);
        if (! $employee) {
            return $this->notFound('الموظف غير موجود');
        }

        // منع إقالة المدير العام
        if ($employee->isGeneralManager()) {
            return $this->unauthorized('لا يمكن إقالة المدير العام');
        }

        // منع إقالة نفسه
        if ($employee->id === $gm->id) {
            return $this->error('لا يمكنك إقالة نفسك');
        }

        $validator = Validator::make($request->all(), [
            'reason' => 'required|string|min:5|max:500',
            'manager_password' => 'required|string',
        ], [
            'reason.required' => 'سبب الإقالة مطلوب',
            'reason.min' => 'سبب الإقالة يجب أن يكون 5 أحرف على الأقل',
            'manager_password.required' => 'كلمة مرور المدير العام مطلوبة لتأكيد الإقالة',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        if (! Hash::check((string) $request->manager_password, $gm->password_hash)) {
            return $this->error('كلمة مرور المدير العام غير صحيحة', 422);
        }

        $employeeName = $employee->name;
        $employeeRole = $employee->getRoleLabel();

        // إرسال إشعار الإقالة قبل الحذف
        Notification::employeeFired($employee, $gm, $request->reason);

        // حذف كل التوكنات فوراً
        $employee->tokens()->delete();

        // تعطيل الحساب (لا نحذف البيانات للمحافظة على السجلات)
        $employee->update(['is_active' => false]);

        return $this->success([
            'fired_employee' => [
                'id' => $employee->id,
                'name' => $employeeName,
                'role' => $employeeRole,
            ],
        ], "تم إقالة {$employeeName} وتعطيل حسابه");
    }

    // ─────────────────────────────────────────────
    // POST /api/admin/employees/{id}/notify
    // ─────────────────────────────────────────────
    public function sendNotification(Request $request, int $id)
    {
        $gm = $this->getGeneralManager($request);
        if (! $gm) {
            return $this->unauthorized('هذا المسار للمدير العام فقط');
        }

        $employee = Employee::find($id);
        if (! $employee) {
            return $this->notFound('الموظف غير موجود');
        }

        $validator = Validator::make($request->all(), [
            'title' => 'required|string|max:255',
            'message' => 'required|string|max:1000',
        ], [
            'title.required' => 'عنوان الإشعار مطلوب',
            'message.required' => 'نص الإشعار مطلوب',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $notification = Notification::managerToEmployee(
            from: $gm,
            to: $employee,
            title: $request->title,
            message: $request->message,
            extraData: $request->extra_data ?? []
        );

        return $this->success([
            'notification' => $notification->getDetails(),
        ], 'تم إرسال الإشعار بنجاح');
    }

    // ─────────────────────────────────────────────
    // GET /api/admin/employees/{id}/reviews
    // ─────────────────────────────────────────────
    public function employeeReviews(Request $request, int $id)
    {
        $gm = $this->getGeneralManager($request);
        if (! $gm) {
            return $this->unauthorized();
        }

        $employee = Employee::find($id);
        if (! $employee) {
            return $this->notFound('الموظف غير موجود');
        }

        $reviews = Review::employeeReviews()
            ->forEmployee($id)
            ->latest()
            ->get()
            ->map->getDetails()
            ->values();

        return $this->success([
            'employee_name' => $employee->name,
            'avg_rating' => Review::getAverageForEmployee($id),
            'total_reviews' => $reviews->count(),
            'reviews' => $reviews,
        ]);
    }

    // ─────────────────────────────────────────────
    // POST /api/admin/employees/{id}/review
    // ─────────────────────────────────────────────
    public function rateEmployee(Request $request, int $id)
    {
        $gm = $this->getGeneralManager($request);
        if (! $gm) {
            return $this->unauthorized();
        }

        $validator = Validator::make($request->all(), [
            'rating' => 'required|integer|min:1|max:5',
            'comment' => 'nullable|string|max:500',
        ], [
            'rating.required' => 'التقييم مطلوب',
            'rating.min' => 'التقييم يجب أن يكون بين 1 و 5',
            'rating.max' => 'التقييم يجب أن يكون بين 1 و 5',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $result = Review::rateEmployee(
            manager: $gm,
            employeeId: $id,
            rating: (int) $request->rating,
            comment: $request->comment
        );

        if (! $result['success']) {
            return $this->error($result['message']);
        }

        return $this->success(null, $result['message']);
    }
}
