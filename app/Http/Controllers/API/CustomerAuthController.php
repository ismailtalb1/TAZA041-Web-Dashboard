<?php

namespace App\Http\Controllers\API;

use App\Models\Customer;
use App\Models\LoyaltyAccount;
use App\Models\Notification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password as PasswordRule;

class CustomerAuthController extends BaseController
{
    // ─────────────────────────────────────────────
    // POST /api/customer/auth/register
    // ─────────────────────────────────────────────
    public function register(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'email' => 'nullable|required_without:phone|email|max:255|unique:customers,email',
            'phone' => 'nullable|required_without:email|string|max:30|unique:customers,phone',
            'address' => 'nullable|string|max:1000',
            'date_of_birth' => 'nullable|date|before:today',
            'password' => 'required|string|min:6|confirmed',
            'password_confirmation' => 'required|string',
        ], [
            'name.required' => 'الاسم مطلوب',
            'email.required_without' => 'يرجى إدخال البريد الإلكتروني أو رقم الهاتف',
            'email.email' => 'البريد الإلكتروني غير صحيح',
            'email.unique' => 'هذا البريد مسجّل مسبقاً',
            'phone.required_without' => 'يرجى إدخال رقم الهاتف أو البريد الإلكتروني',
            'phone.unique' => 'رقم الهاتف مسجّل مسبقاً',
            'password.required' => 'كلمة المرور مطلوبة',
            'password.min' => 'كلمة المرور يجب أن تكون 6 أحرف على الأقل',
            'password.confirmed' => 'تأكيد كلمة المرور غير متطابق',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        DB::beginTransaction();
        try {
            // إنشاء حساب الزبون: يقبل البريد أو رقم الهاتف أو كليهما
            $customer = Customer::create([
                'name' => trim($request->name),
                'email' => Customer::normalizeContact($request->email),
                'phone' => Customer::normalizeContact($request->phone),
                'address' => Customer::normalizeContact($request->address),
                'date_of_birth' => $request->date_of_birth ?: null,
                'password_hash' => Hash::make($request->password),
                'status' => Customer::STATUS_REGISTERED,
                'loyalty_points' => 0,
            ]);

            // إنشاء حساب الولاء تلقائياً
            $loyalty = LoyaltyAccount::create([
                'customer_id' => $customer->id,
                'points_balance' => 0,
                'tier' => LoyaltyAccount::TIER_BRONZE,
                'total_points_earned' => 0,
                'total_points_redeemed' => 0,
            ]);

            // إشعار ترحيب
            Notification::create([
                'sender_type' => Notification::SENDER_SYSTEM,
                'sender_id' => null,
                'receiver_type' => Notification::RECEIVER_CUSTOMER,
                'receiver_id' => $customer->id,
                'type' => Notification::TYPE_SYSTEM_ANNOUNCEMENT,
                'title' => 'مرحباً في TAZA 041 🎉',
                'message' => "أهلاً {$customer->name}! تم إنشاء حسابك بنجاح. اطلب الآن واكسب نقاط الولاء!",
                'data' => [
                    'loyalty_info' => 'كل 10 ل.س = نقطة ولاء واحدة',
                ],
            ]);

            // توليد التوكن
            $token = $customer->generateAuthToken();

            DB::commit();

            $profile = $customer->getProfileDetails();
            $savedAddresses = $profile['saved_addresses'];

            return $this->success([
                'token' => $token,
                'token_type' => 'Bearer',
                'expires_in' => config('sanctum.customer_token_expiration', 43200).' دقيقة',
                'customer' => $profile,
                'saved_addresses' => $savedAddresses,
                'addresses' => $savedAddresses,
                'loyalty' => $loyalty->getDetails(),
            ], 'تم إنشاء حسابك بنجاح 🎉', 201);

        } catch (\Exception $e) {
            DB::rollBack();

            return $this->error(
                'فشل في إنشاء الحساب — حاول مرة أخرى',
                500,
                config('app.debug') ? $e->getMessage() : null
            );
        }
    }

    // ─────────────────────────────────────────────
    // POST /api/customer/auth/login
    // ─────────────────────────────────────────────
    public function login(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'identifier' => 'required_without:email|required_without:phone|string|max:255',
            'email' => 'nullable|string|max:255',
            'phone' => 'nullable|string|max:30',
            'password' => 'required|string',
        ], [
            'identifier.required_without' => 'يرجى إدخال البريد الإلكتروني أو رقم الهاتف',
            'password.required' => 'كلمة المرور مطلوبة',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $identifier = $request->identifier ?: $request->email ?: $request->phone;
        $identifier = trim($identifier);

        $customer = Customer::findByIdentifier($identifier);

        if (! $customer || ! Hash::check($request->password, $customer->password_hash)) {
            return $this->error(
                'بيانات الدخول غير صحيحة',
                401
            );
        }

        // التحقق من الحظر
        if ($customer->isBanned()) {
            return $this->error(
                'حسابك موقوف — تواصل مع إدارة المطعم',
                403
            );
        }

        // توليد التوكن
        $token = $customer->generateAuthToken();
        $loyalty = $customer->ensureLoyaltyAccount();
        $profile = $customer->getProfileDetails();
        $savedAddresses = $profile['saved_addresses'];

        return $this->success([
            'token' => $token,
            'token_type' => 'Bearer',
            'expires_in' => config('sanctum.customer_token_expiration', 43200).' دقيقة',
            'customer' => $profile,
            'saved_addresses' => $savedAddresses,
            'addresses' => $savedAddresses,
            'loyalty' => $loyalty ? $loyalty->getDetails() : null,
            'unread_notifications' => Notification::unreadCountForCustomer($customer->id),
        ], 'مرحباً '.$customer->name.' 👋');
    }

    // ─────────────────────────────────────────────
    // POST /api/customer/auth/forgot-password
    // ─────────────────────────────────────────────
    public function forgotPassword(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required|email|max:255',
        ], [
            'email.required' => 'يرجى إدخال البريد الإلكتروني',
            'email.email' => 'يرجى إدخال بريد إلكتروني صحيح',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $message = 'إذا كان البريد الإلكتروني مرتبطاً بحساب، فسيتم إرسال رابط استعادة كلمة المرور إليه.';

        $email = trim((string) $request->input('email'));
        $previousReset = DB::table('customer_password_reset_tokens')
            ->where('email', $email)
            ->first();

        try {
            Password::broker('customers')->sendResetLink([
                'email' => $email,
            ]);
        } catch (\Throwable $exception) {
            // إنشاء Laravel للرمز يسبق إرسال البريد. عند فشل المزوّد نعيد
            // السجل السابق حتى لا يُبطل طلب فاشل رابطاً سبق أن وصل للزبون.
            if ($previousReset) {
                DB::table('customer_password_reset_tokens')->updateOrInsert(
                    ['email' => $email],
                    [
                        'token' => $previousReset->token,
                        'created_at' => $previousReset->created_at,
                    ]
                );
            } else {
                DB::table('customer_password_reset_tokens')->where('email', $email)->delete();
            }

            // نحافظ على استجابة عامة حتى لا يكشف فشل المزوّد وجود الحساب.
            Log::warning('Customer password reset email could not be sent.', [
                'email_fingerprint' => hash('sha256', strtolower($email)),
                'exception' => $exception,
            ]);
        }

        return $this->success(null, $message);
    }

    // ─────────────────────────────────────────────
    // POST /api/customer/auth/reset-password
    // ─────────────────────────────────────────────
    public function resetPassword(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required|email|max:255',
            'token' => 'required|string',
            'password' => ['required', 'string', PasswordRule::min(8)->letters()->numbers(), 'confirmed'],
            'password_confirmation' => 'required|string',
        ], [
            'email.required' => 'البريد الإلكتروني مطلوب',
            'email.email' => 'يرجى إدخال بريد إلكتروني صحيح',
            'token.required' => 'رابط الاستعادة غير صالح أو غير مكتمل',
            'password.required' => 'كلمة المرور الجديدة مطلوبة',
            'password.confirmed' => 'تأكيد كلمة المرور غير متطابق',
            'password_confirmation.required' => 'تأكيد كلمة المرور مطلوب',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        try {
            $status = Password::broker('customers')->reset(
                $validator->validated(),
                function (Customer $customer, string $password): void {
                    DB::transaction(function () use ($customer, $password) {
                        $customer->forceFill([
                            'password_hash' => Hash::make($password),
                        ])->save();

                        // إلغاء جلسات Sanctum القديمة لهذا الحساب فقط.
                        $customer->tokens()->delete();
                    });
                }
            );
        } catch (\Throwable $exception) {
            Log::error('Customer password reset failed unexpectedly.', [
                'email_fingerprint' => hash('sha256', strtolower(trim((string) $request->input('email')))),
                'exception' => $exception,
            ]);

            return $this->error('تعذر حفظ كلمة المرور بسبب خطأ في الخادم. حاول مرة أخرى بعد قليل.', 500);
        }

        if ($status === Password::PASSWORD_RESET) {
            return $this->success(null, 'تم تغيير كلمة المرور بنجاح، يمكنك تسجيل الدخول الآن.');
        }

        if ($status === Password::RESET_THROTTLED) {
            return $this->error('تم تجاوز عدد المحاولات المسموح به. حاول مجدداً بعد قليل.', 429);
        }

        return $this->error('رابط استعادة كلمة المرور غير صالح أو منتهي الصلاحية.', 422);
    }

    // ─────────────────────────────────────────────
    // POST /api/customer/auth/logout
    // ─────────────────────────────────────────────
    public function logout(Request $request)
    {
        $user = $request->user();

        if (! $user instanceof Customer) {
            return $this->unauthorized('هذا المسار للزبائن فقط');
        }

        $request->user()->currentAccessToken()->delete();

        return $this->success(null, 'تم تسجيل الخروج بنجاح');
    }
}
