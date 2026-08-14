<?php

namespace App\Http\Controllers\API;

use App\Models\Customer;
use App\Models\Employee;
use App\Models\Notification;
use App\Models\Order;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;

class CustomerController extends BaseController
{
    // ─────────────────────────────────────────────
    // التحقق من صلاحية المدير العام
    // ─────────────────────────────────────────────
    private function getGM(Request $request): ?Employee
    {
        $user = $request->user();
        if (! $user instanceof Employee || ! $user->isGeneralManager()) {
            return null;
        }

        return $user;
    }

    // ─────────────────────────────────────────────
    // GET /api/admin/customers
    // قائمة الزبائن مع فلترة متقدمة
    // ─────────────────────────────────────────────
    public function index(Request $request)
    {
        $gm = $this->getGM($request);
        if (! $gm) {
            return $this->unauthorized('هذا المسار للمدير العام فقط');
        }

        $query = Customer::registered();

        // ── الفلاتر ──────────────────────────────
        $filter = $request->get('filter', 'all');

        switch ($filter) {
            case 'most_orders':
                $query->mostOrders();
                break;
            case 'top_spenders':
                $query->topSpenders();
                break;
            case 'top_loyalty':
                $query->topLoyalty();
                break;
            case 'suspicious':
                $query->suspicious();
                break;
            case 'banned':
                $query->banned();
                break;
            case 'active':
                $query->active();
                break;
            default:
                $query->latest();
        }

        // بحث بالاسم أو الهاتف أو البريد
        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%");
            });
        }

        $perPage = max(1, min(100, $request->integer('per_page', 25)));
        $customers = $query
            ->with('loyaltyAccount')
            ->withCount([
                'orders as total_orders',
                'completedOrders as completed_orders',
                'cancelledOrders as cancelled_orders',
                'cancelledOrders as recent_cancelled_orders' => fn ($orders) => $orders
                    ->where('updated_at', '>=', now()->subDays(Customer::CANCELLATION_BAN_WINDOW_DAYS)),
            ])
            ->withSum('completedOrders as total_spent', 'final_price')
            ->paginate($perPage);

        $customers->getCollection()->transform(
            fn (Customer $customer) => $customer->getDetailsForAdmin()
        );

        // إحصائيات عامة
        $allRegistered = Customer::registered();
        $stats = [
            'total_registered' => (clone $allRegistered)->count(),
            'total_active' => (clone $allRegistered)->active()->count(),
            'total_banned' => (clone $allRegistered)->banned()->count(),
            'total_suspicious' => (clone $allRegistered)->suspicious()->count(),
        ];

        return $this->success([
            'stats' => $stats,
            'filter' => $filter,
            'count' => $customers->total(),
            'customers' => $customers->items(),
            'pagination' => [
                'current_page' => $customers->currentPage(),
                'last_page' => $customers->lastPage(),
                'per_page' => $customers->perPage(),
                'total' => $customers->total(),
                'from' => $customers->firstItem(),
                'to' => $customers->lastItem(),
            ],
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/admin/customers/{id}
    // ─────────────────────────────────────────────
    public function show(Request $request, int $id)
    {
        $gm = $this->getGM($request);
        if (! $gm) {
            return $this->unauthorized('هذا المسار للمدير العام فقط');
        }

        $customer = Customer::with(['loyaltyAccount', 'reviews'])
            ->find($id);
        if (! $customer) {
            return $this->notFound('الزبون غير موجود');
        }

        // آخر 5 طلبات
        $recentOrders = Order::where('customer_id', $id)
            ->with(['items', 'paymentRecord'])
            ->latest()
            ->take(5)
            ->get()
            ->map->getDetails()
            ->values();

        return $this->success([
            'customer' => $customer->getDetailsForAdmin(),
            'loyalty' => $customer->loyaltyAccount?->getDetails(),
            'recent_orders' => $recentOrders,
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/admin/customers/{id}/orders
    // ─────────────────────────────────────────────
    public function orders(Request $request, int $id)
    {
        $gm = $this->getGM($request);
        if (! $gm) {
            return $this->unauthorized();
        }

        $customer = Customer::find($id);
        if (! $customer) {
            return $this->notFound('الزبون غير موجود');
        }

        $query = Order::where('customer_id', $id)
            ->with(['items', 'paymentRecord',
                'deliveryOrder', 'reservationOrder']);

        // فلترة حسب النوع
        if ($request->filled('type')) {
            $query->where('type', $request->type);
        }

        // فلترة حسب الحالة
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        $orders = $query->latest()->get();

        return $this->success([
            'customer_name' => $customer->name,
            'total_orders' => $orders->count(),
            'total_spent' => $customer->getTotalSpent(),
            'orders' => $orders->map->getDetails()->values(),
        ]);
    }

    // ─────────────────────────────────────────────
    // POST /api/admin/customers/{id}/ban
    // ─────────────────────────────────────────────
    public function ban(Request $request, int $id)
    {
        $gm = $this->getGM($request);
        if (! $gm) {
            return $this->unauthorized('هذا المسار للمدير العام فقط');
        }

        $customer = Customer::registered()->find($id);
        if (! $customer) {
            return $this->notFound('الزبون غير موجود');
        }

        if ($customer->isBanned()) {
            return $this->error('الزبون محظور مسبقاً');
        }

        $validator = Validator::make($request->all(), [
            'reason' => 'required|string|min:5|max:500',
        ], [
            'reason.required' => 'سبب الحظر مطلوب',
            'reason.min' => 'سبب الحظر يجب أن يكون 5 أحرف على الأقل',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $customer->ban($gm, $request->reason);

        return $this->success([
            'customer' => $customer->getDetailsForAdmin(),
        ], "تم حظر الزبون {$customer->name}");
    }

    // ─────────────────────────────────────────────
    // POST /api/admin/customers/{id}/unban
    // ─────────────────────────────────────────────
    public function unban(Request $request, int $id)
    {
        $gm = $this->getGM($request);
        if (! $gm) {
            return $this->unauthorized('هذا المسار للمدير العام فقط');
        }

        $customer = Customer::find($id);
        if (! $customer) {
            return $this->notFound('الزبون غير موجود');
        }

        if (! $customer->isBanned()) {
            return $this->error('الزبون غير محظور');
        }

        $customer->unban($gm);

        return $this->success([
            'customer' => $customer->getDetailsForAdmin(),
        ], "تم رفع الحظر عن {$customer->name}");
    }

    // ─────────────────────────────────────────────
    // POST /api/admin/customers/broadcast
    // إشعار جماعي لكل الزبائن
    // ─────────────────────────────────────────────
    public function broadcast(Request $request)
    {
        $gm = $this->getGM($request);
        if (! $gm) {
            return $this->unauthorized('هذا المسار للمدير العام فقط');
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

        $customers = Customer::registered()->active()->get(['id']);
        $count = $customers->count();

        if ($count === 0) {
            return $this->error('لا يوجد زبائن مسجلون حالياً');
        }

        // إدراج الإشعارات دفعة واحدة لأداء أفضل
        $rows = $customers->map(fn ($c) => [
            'sender_type' => Notification::SENDER_EMPLOYEE,
            'sender_id' => $gm->id,
            'receiver_type' => Notification::RECEIVER_CUSTOMER,
            'receiver_id' => $c->id,
            'type' => Notification::TYPE_SYSTEM_ANNOUNCEMENT,
            'title' => $request->title,
            'message' => $request->message,
            'data' => json_encode([
                'broadcast' => true,
                'sent_by' => $gm->name,
            ]),
            'status' => Notification::STATUS_SENT,
            'read_at' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ])->toArray();

        Notification::insert($rows);

        return $this->success([
            'sent_to' => $count,
        ], "تم إرسال الإشعار لـ {$count} زبون بنجاح");
    }

    // ─────────────────────────────────────────────
    // GET /api/customer/profile
    // الزبون يعرض ملفه الشخصي
    // ─────────────────────────────────────────────
    public function profile(Request $request)
    {
        $customer = $request->user();

        if (! $customer instanceof Customer) {
            return $this->unauthorized('هذا المسار للزبائن فقط');
        }

        if ($customer->isBanned()) {
            return $this->error('حسابك موقوف', 403);
        }

        $loyalty = $customer->ensureLoyaltyAccount();
        $profile = $customer->getProfileDetails();
        $savedAddresses = $profile['saved_addresses'];

        return $this->success([
            'customer' => $profile,
            'saved_addresses' => $savedAddresses,
            'addresses' => $savedAddresses,
            'loyalty' => $loyalty?->getDetails(),
            'unread_notifications' => Notification::unreadCountForCustomer($customer->id),
            'stats' => [
                'total_orders' => $customer->orders()->count(),
                'completed_orders' => $customer->completedOrders()->count(),
                'cancelled_orders' => $customer->getCancellationCount(),
                'total_spent' => $customer->getTotalSpent(),
            ],
        ]);
    }

    // ─────────────────────────────────────────────
    // PUT /api/customer/profile
    // الزبون يعدّل بياناته الشخصية
    // ─────────────────────────────────────────────
    public function updateProfile(Request $request)
    {
        $customer = $request->user();

        if (! $customer instanceof Customer) {
            return $this->unauthorized('هذا المسار للزبائن فقط');
        }

        if ($customer->isBanned()) {
            return $this->error('حسابك موقوف', 403);
        }

        $validator = Validator::make($request->all(), [
            'name' => 'sometimes|string|max:255',
            'phone' => 'sometimes|string|max:30|unique:customers,phone,'.$customer->id,
            'address' => 'sometimes|nullable|string|max:500',
            'bio' => 'sometimes|nullable|string|max:1000',
            'date_of_birth' => 'sometimes|nullable|date|before:today',
            'current_password' => 'required|string',
            'new_password' => 'sometimes|string|min:6|confirmed|different:current_password',
            'new_password_confirmation' => 'sometimes|string',
        ], [
            'phone.unique' => 'رقم الهاتف مستخدم مسبقاً',
            'date_of_birth.before' => 'تاريخ الميلاد غير صحيح',
            'new_password.min' => 'كلمة المرور 6 أحرف على الأقل',
            'new_password.confirmed' => 'تأكيد كلمة المرور غير متطابق',
            'new_password.different' => 'يجب أن تختلف كلمة المرور الجديدة عن الحالية',
            'current_password.required' => 'كلمة المرور الحالية مطلوبة لحماية بيانات الحساب',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        if (! Hash::check($request->current_password, $customer->password_hash)) {
            return $this->error('كلمة المرور الحالية غير صحيحة', 422);
        }

        $changes = [];

        if ($request->filled('name')) {
            $customer->name = $request->name;
            $changes[] = 'الاسم';
        }

        if ($request->filled('phone')) {
            $customer->phone = $request->phone;
            $changes[] = 'رقم الهاتف';
        }

        if ($request->has('address')) {
            $customer->address = $request->address;
            $changes[] = 'العنوان';
        }

        if ($request->has('bio')) {
            $customer->bio = $request->bio;
            $changes[] = 'النبذة الشخصية';
        }

        if ($request->has('date_of_birth')) {
            $customer->date_of_birth = $request->date_of_birth;
            $changes[] = 'تاريخ الميلاد';
        }

        if ($request->filled('new_password')) {
            $customer->password_hash = Hash::make($request->new_password);
            $currentToken = $customer->currentAccessToken();
            $currentTokenId = is_object($currentToken) && method_exists($currentToken, 'getKey')
                ? $currentToken->getKey()
                : null;

            // Keep the session that performed the verified change and revoke every other device.
            if ($currentTokenId) {
                $customer->tokens()->where('id', '!=', $currentTokenId)->delete();
            } else {
                $customer->tokens()->delete();
            }
            $changes[] = 'كلمة المرور';
        }

        $customer->save();

        $profile = $customer->getProfileDetails();
        $savedAddresses = $profile['saved_addresses'];
        $loyalty = $customer->ensureLoyaltyAccount();

        return $this->success([
            'customer' => $profile,
            'saved_addresses' => $savedAddresses,
            'addresses' => $savedAddresses,
            'loyalty' => $loyalty?->getDetails(),
            'changes' => $changes,
        ], 'تم تحديث بياناتك بنجاح');
    }
}
