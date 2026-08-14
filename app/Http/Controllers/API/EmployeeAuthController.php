<?php

namespace App\Http\Controllers\API;

use App\Models\Customer;
use App\Models\DeliveryOrder;
use App\Models\Employee;
use App\Models\MealSuggestion;
use App\Models\Notification;
use App\Models\Offer;
use App\Models\Order;
use App\Models\PaymentAccount;
use App\Models\PaymentRecord;
use App\Models\Product;
use App\Models\Report;
use App\Models\ReservationOrder;
use App\Models\RestaurantImage;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;

class EmployeeAuthController extends BaseController
{
    // ─────────────────────────────────────────────
    // POST /api/auth/employee/login
    // ─────────────────────────────────────────────
    public function login(Request $request)
    {
        // التحقق من البيانات
        $validator = Validator::make($request->all(), [
            'username' => 'required|string',
            'password' => 'required|string|min:4',
        ], [
            'username.required' => 'اسم المستخدم مطلوب',
            'password.required' => 'كلمة المرور مطلوبة',
            'password.min' => 'كلمة المرور يجب أن تكون 4 أحرف على الأقل',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        // البحث عن الموظف
        $employee = Employee::where('username', $request->username)->first();

        // التحقق من وجود الموظف وصحة كلمة المرور
        if (! $employee || ! Hash::check($request->password, $employee->password_hash)) {
            return $this->error(
                'اسم المستخدم أو كلمة المرور غير صحيحة',
                401
            );
        }

        // التحقق من أن الحساب نشط
        if (! $employee->is_active) {
            return $this->error(
                'حسابك معطّل — تواصل مع المدير العام',
                403
            );
        }

        // حذف التوكنات القديمة وإنشاء توكن جديد
        $token = $employee->generateAuthToken();

        // تحديث آخر تسجيل دخول (نستخدم updated_at مؤقتاً)
        $employee->touch();

        return $this->success([
            'token' => $token,
            'token_type' => 'Bearer',
            'expires_in' => config('sanctum.employee_token_expiration', 480).' دقيقة',
            'employee' => $employee->getDetails(),
        ], 'مرحباً '.$employee->name.' 👋');
    }

    // ─────────────────────────────────────────────
    // POST /api/auth/employee/logout
    // ─────────────────────────────────────────────
    public function logout(Request $request)
    {
        // حذف التوكن الحالي فقط
        $request->user()->currentAccessToken()->delete();

        return $this->success(
            null,
            'تم تسجيل الخروج بنجاح'
        );
    }

    // ─────────────────────────────────────────────
    // GET /api/auth/employee/me
    // ─────────────────────────────────────────────
    public function me(Request $request)
    {
        $employee = $request->user();

        // التحقق من أن المستخدم موظف وليس زبوناً
        if (! $employee instanceof Employee) {
            return $this->unauthorized('هذا المسار مخصص للموظفين فقط');
        }

        // إحصائيات إضافية حسب الدور
        $extras = $this->getRoleExtras($employee);

        return $this->success([
            'employee' => $employee->getDetails(),
            'unread_notifications' => Notification::unreadCountForEmployee($employee->id),
            'extras' => $extras,
        ]);
    }

    // ─────────────────────────────────────────────
    // PUT /api/auth/employee/profile
    // ─────────────────────────────────────────────
    public function updateProfile(Request $request)
    {
        $employee = $request->user();

        if (! $employee instanceof Employee) {
            return $this->unauthorized();
        }

        $normalized = [];
        foreach (['name', 'email', 'phone'] as $field) {
            if ($request->has($field)) {
                $value = $request->input($field);
                $normalized[$field] = $value === null ? null : trim((string) $value);
            }
        }
        foreach (['email', 'phone'] as $nullableField) {
            if (($normalized[$nullableField] ?? null) === '') {
                $normalized[$nullableField] = null;
            }
        }
        if ($normalized) {
            $request->merge($normalized);
        }

        // كل الموظفين يملكون الميزات الشخصية نفسها، مع إبقاء اسم المستخدم
        // والدور الوظيفي تحت إدارة المدير العام فقط.
        $rules = [
            'name' => 'sometimes|required|string|max:255',
            'email' => 'sometimes|nullable|email|max:255|unique:employees,email,'.$employee->id,
            'phone' => 'sometimes|nullable|string|max:30',
            'current_password' => 'required|string',
            'new_password' => 'sometimes|string|min:6|confirmed|different:current_password',
            'new_password_confirmation' => 'sometimes|string',
        ];

        $messages = [
            'email.unique' => 'هذا البريد الإلكتروني مستخدم بالفعل',
            'new_password.min' => 'كلمة المرور يجب أن تكون 6 أحرف على الأقل',
            'new_password.confirmed' => 'تأكيد كلمة المرور غير متطابق',
            'current_password.required' => 'كلمة المرور الحالية مطلوبة لحماية بيانات الحساب',
            'new_password.different' => 'كلمة المرور الجديدة يجب أن تختلف عن الحالية',
        ];

        $validator = Validator::make($request->all(), $rules, $messages);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $changes = [];

        // كل تعديل شخصي حساس ويجب أن يؤكده مالك الحساب بكلمة مروره الحالية.
        if (! Hash::check((string) $request->current_password, $employee->password_hash)) {
            return $this->error('كلمة المرور الحالية غير صحيحة', 422);
        }

        if ($request->filled('name') && $employee->name !== $request->name) {
            $employee->name = $request->name;
            $changes[] = 'الاسم';
        }

        if ($request->has('email') && $employee->email !== $request->email) {
            $employee->email = $request->email;
            $changes[] = 'البريد الإلكتروني';
        }

        if ($request->has('phone') && $employee->phone !== $request->phone) {
            $employee->phone = $request->phone;
            $changes[] = 'رقم الهاتف';
        }

        if ($request->filled('new_password')) {
            $employee->password_hash = Hash::make($request->new_password);
            $changes[] = 'كلمة المرور';
        }

        $employee->save();

        return $this->success([
            'employee' => $employee->getDetails(),
            'changes' => $changes,
        ], empty($changes) ? 'لا توجد تغييرات جديدة' : 'تم تحديث البيانات بنجاح');
    }

    // ─────────────────────────────────────────────
    // بيانات إضافية حسب الدور — للـ Dashboard
    // ─────────────────────────────────────────────
    private function getRoleExtras(Employee $employee): array
    {
        return match ($employee->role) {

            Employee::ROLE_GENERAL_MANAGER => [
                'total_employees' => Employee::staffOnly()->active()->count(),
                'total_customers' => Customer::registered()->active()->count(),
                'pending_orders' => Order::pending()->count(),
                'pending_reports' => Report::forReceiver($employee->id)
                    ->unreviewed()->count(),
            ],

            Employee::ROLE_ORDER_MANAGER => [
                'pending_orders' => Order::forOrderManager()
                    ->pending()->count(),
                'today_reservations' => ReservationOrder::today()
                    ->active()->count(),
                'confirmed_orders' => Order::forOrderManager()
                    ->where('status', 'confirmed')->count(),
            ],

            Employee::ROLE_DELIVERY_MANAGER => [
                'active_deliveries' => DeliveryOrder::active()->count(),
                'pending_assignments' => DeliveryOrder::where('status', 'pending')->count(),
                'average_rating' => $employee->getAverageDriverRating(),
                'completed_deliveries' => $employee->getCompletedDeliveriesCount(),
            ],

            Employee::ROLE_DRIVER => [
                'assigned_deliveries' => DeliveryOrder::assignedToDriver($employee->id)
                    ->active()->count(),
                'average_rating' => $employee->getAverageDriverRating(),
                'completed_deliveries' => $employee->getCompletedDeliveriesCount(),
            ],

            Employee::ROLE_INVENTORY_MANAGER => [
                'total_products' => Product::active()->count(),
                'low_stock_products' => Product::lowStock()->count(),
                'out_of_stock' => Product::outOfStock()->count(),
                'active_offers' => Offer::currentlyActive()->count(),
            ],

            Employee::ROLE_FINANCE_MANAGER => [
                'total_accounts' => PaymentAccount::active()->count(),
                'near_capacity_count' => PaymentAccount::active()->get()
                    ->filter->isNearCapacity()->count(),
                'pending_payments' => PaymentRecord::where('status', 'pending')->count(),
            ],

            Employee::ROLE_COMMUNICATION_MANAGER => [
                'pending_suggestions' => MealSuggestion::pending()->count(),
                'pending_ai_reports' => Report::forReceiver($employee->id)
                    ->unreviewed()
                    ->byType('ai_generated')->count(),
                'restaurant_images' => RestaurantImage::active()->count(),
            ],

            default => [],
        };
    }
}
