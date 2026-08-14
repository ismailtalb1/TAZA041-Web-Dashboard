<?php

namespace App\Http\Controllers\API;

use App\Models\Customer;
use App\Models\Employee;
use App\Models\Offer;
use App\Models\Product;
use App\Models\RestaurantImage;
use App\Models\RestaurantInfo;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

class UploadController extends BaseController
{
    // ─────────────────────────────────────────────
    // إعدادات رفع الصور
    // ─────────────────────────────────────────────
    const MAX_SIZE_KB = 5120;   // 5 MB

    const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

    const ALLOWED_MIMES = [
        'image/jpeg',
        'image/png',
        'image/webp',
    ];

    // مجلدات التخزين داخل storage/app/public/
    const FOLDER_PRODUCTS = 'products';

    const FOLDER_OFFERS = 'offers';

    const FOLDER_RESTAURANT = 'restaurant';

    const FOLDER_LOGO = 'restaurant/logo';

    const FOLDER_EMPLOYEES = 'employees';

    const FOLDER_CUSTOMERS = 'customers';

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

    // ─────────────────────────────────────────────
    // التحقق من صحة الصورة المرفوعة
    // ─────────────────────────────────────────────
    private function validateImage(Request $request, string $field = 'image'): ?array
    {
        $validator = Validator::make($request->all(), [
            $field => [
                'required',
                'image',
                'max:'.self::MAX_SIZE_KB,
                'mimes:'.implode(',', self::ALLOWED_EXTENSIONS),
                'mimetypes:'.implode(',', self::ALLOWED_MIMES),
                'dimensions:min_width=1,min_height=1,max_width=10000,max_height=10000',
            ],
        ], [
            "{$field}.required" => 'الصورة مطلوبة',
            "{$field}.image" => 'الملف المرفوع ليس صورة صالحة',
            "{$field}.max" => 'حجم الصورة يجب أن لا يتجاوز 5 ميغابايت',
            "{$field}.mimes" => 'صيغة الصورة يجب أن تكون: JPG أو PNG أو WebP',
            "{$field}.mimetypes" => 'محتوى الملف يجب أن يكون صورة JPG أو PNG أو WebP',
            "{$field}.dimensions" => 'أبعاد الصورة غير صالحة أو كبيرة جدًا',
        ]);

        return $validator->fails()
            ? $validator->errors()->toArray()
            : null;
    }

    // ─────────────────────────────────────────────
    // رفع الصورة إلى Storage وإرجاع المسار
    // الصورة تُخزَّن في storage/app/public/{folder}/
    // وتُقدَّم عبر http://localhost:8000/storage/{folder}/
    // ─────────────────────────────────────────────
    private function storeImage(
        Request $request,
        string $folder,
        string $field = 'image',
        ?string $oldPath = null
    ): string {

        // حذف الصورة القديمة إن وُجدت
        if ($oldPath && Storage::disk('public')->exists($oldPath)) {
            Storage::disk('public')->delete($oldPath);
        }

        $file = $request->file($field);
        $extension = $file->getClientOriginalExtension();
        $filename = Str::uuid().'.'.strtolower($extension);
        $path = $folder.'/'.$filename;

        // تخزين الصورة في public disk
        Storage::disk('public')->putFileAs($folder, $file, $filename);

        return $path;
    }

    // ─────────────────────────────────────────────
    // توليد رابط الصورة الكامل للاستخدام في الواجهة
    // مثال: http://localhost:8000/storage/products/uuid.jpg
    // ─────────────────────────────────────────────
    private function buildImageUrl(string $path): string
    {
        return asset('storage/'.$path);
    }

    // ═══════════════════════════════════════════════
    // رفع صور المنتجات
    // ═══════════════════════════════════════════════

    // ─────────────────────────────────────────────
    // POST /api/products/{id}/image
    // ─────────────────────────────────────────────
    public function uploadProductImage(Request $request, int $id)
    {
        $employee = $this->getEmployee($request);
        if (! $employee) {
            return $this->unauthorized();
        }

        if (! in_array($employee->role, [
            Employee::ROLE_INVENTORY_MANAGER,
            Employee::ROLE_GENERAL_MANAGER,
        ])) {
            return $this->unauthorized('صلاحية مدير المخزون مطلوبة');
        }

        $product = Product::find($id);
        if (! $product) {
            return $this->notFound('المنتج غير موجود');
        }

        $errors = $this->validateImage($request);
        if ($errors) {
            return $this->validationError($errors);
        }

        $path = $this->storeImage(
            request: $request,
            folder: self::FOLDER_PRODUCTS,
            oldPath: $product->image_path
        );

        $product->image_path = $path;
        $product->save();

        return $this->success([
            'image_path' => $path,
            'image_url' => $this->buildImageUrl($path),
            'product' => $product->getDetails(),
        ], 'تم رفع صورة المنتج بنجاح');
    }

    // ═══════════════════════════════════════════════
    // رفع صور العروض
    // ═══════════════════════════════════════════════

    // ─────────────────────────────────────────────
    // POST /api/offers/{id}/image
    // ─────────────────────────────────────────────
    public function uploadOfferImage(Request $request, int $id)
    {
        $employee = $this->getEmployee($request);
        if (! $employee) {
            return $this->unauthorized();
        }

        if (! in_array($employee->role, [
            Employee::ROLE_INVENTORY_MANAGER,
            Employee::ROLE_GENERAL_MANAGER,
        ])) {
            return $this->unauthorized('صلاحية مدير المخزون مطلوبة');
        }

        $offer = Offer::find($id);
        if (! $offer) {
            return $this->notFound('العرض غير موجود');
        }

        $errors = $this->validateImage($request);
        if ($errors) {
            return $this->validationError($errors);
        }

        $path = $this->storeImage(
            request: $request,
            folder: self::FOLDER_OFFERS,
            oldPath: $offer->image_path
        );

        $offer->image_path = $path;
        $offer->save();

        return $this->success([
            'image_path' => $path,
            'image_url' => $this->buildImageUrl($path),
            'offer' => $offer->getDetails(),
        ], 'تم رفع صورة العرض بنجاح');
    }

    // ═══════════════════════════════════════════════
    // رفع صور المطعم
    // ═══════════════════════════════════════════════

    // ─────────────────────────────────────────────
    // POST /api/communication/images
    // رفع صورة جديدة للمعرض
    // ─────────────────────────────────────────────
    public function uploadRestaurantImage(Request $request)
    {
        $employee = $this->getEmployee($request);
        if (! $employee) {
            return $this->unauthorized();
        }

        if (! in_array($employee->role, [
            Employee::ROLE_COMMUNICATION_MANAGER,
            Employee::ROLE_GENERAL_MANAGER,
        ])) {
            return $this->unauthorized('صلاحية مدير التواصل مطلوبة');
        }

        $validator = Validator::make($request->all(), [
            'image' => [
                'required', 'image',
                'max:'.self::MAX_SIZE_KB,
                'mimes:'.implode(',', self::ALLOWED_EXTENSIONS),
                'mimetypes:'.implode(',', self::ALLOWED_MIMES),
                'dimensions:min_width=1,min_height=1,max_width=10000,max_height=10000',
            ],
            'type' => 'required|in:exterior,interior,food,banner,logo',
            'caption' => 'nullable|string|max:255',
            'sort_order' => 'nullable|integer|min:0',
        ], [
            'image.required' => 'الصورة مطلوبة',
            'image.image' => 'الملف المرفوع ليس صورة صالحة',
            'image.max' => 'حجم الصورة يجب أن لا يتجاوز 5 ميغابايت',
            'image.mimes' => 'صيغة الصورة يجب أن تكون: JPG أو PNG أو WebP',
            'image.mimetypes' => 'محتوى الملف يجب أن يكون صورة JPG أو PNG أو WebP',
            'image.dimensions' => 'أبعاد الصورة غير صالحة أو كبيرة جدًا',
            'type.required' => 'نوع الصورة مطلوب',
            'type.in' => 'النوع: exterior أو interior أو food أو banner أو logo',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $path = $this->storeImage(
            request: $request,
            folder: self::FOLDER_RESTAURANT.'/'.$request->type
        );

        $image = RestaurantImage::create([
            'type' => $request->type,
            'image_path' => $path,
            'caption' => $request->caption,
            'sort_order' => $request->get('sort_order', 0),
            'is_active' => true,
        ]);

        return $this->success([
            'image' => $image->getDetails(),
            'image_url' => $this->buildImageUrl($path),
        ], 'تم رفع الصورة بنجاح', 201);
    }

    // ─────────────────────────────────────────────
    // POST /api/admin/restaurant/logo
    // رفع شعار المطعم
    // ─────────────────────────────────────────────
    public function uploadLogo(Request $request)
    {
        $employee = $this->getEmployee($request);
        if (! $employee || ! in_array($employee->role, [
            Employee::ROLE_GENERAL_MANAGER,
            Employee::ROLE_COMMUNICATION_MANAGER,
        ])) {
            return $this->unauthorized('صلاحية المدير العام أو مدير التواصل مطلوبة');
        }

        $errors = $this->validateImage($request);
        if ($errors) {
            return $this->validationError($errors);
        }

        $info = RestaurantInfo::getInstance();
        $path = $this->storeImage(
            request: $request,
            folder: self::FOLDER_LOGO,
            oldPath: $info->logo_path
        );

        $info->logo_path = $path;
        $info->save();

        return $this->success([
            'logo_path' => $path,
            'logo_url' => $this->buildImageUrl($path),
        ], 'تم رفع شعار المطعم بنجاح');
    }

    // ═══════════════════════════════════════════════
    // رفع صور الموظفين
    // ═══════════════════════════════════════════════

    // ─────────────────────────────────────────────
    // POST /api/auth/employee/avatar
    // الموظف يرفع صورته الشخصية
    // ─────────────────────────────────────────────
    public function uploadEmployeeAvatar(Request $request, ?int $id = null)
    {
        $currentEmployee = $this->getEmployee($request);
        if (! $currentEmployee) {
            return $this->unauthorized();
        }

        // تحديد الموظف المستهدف
        if ($id && $id !== $currentEmployee->id) {
            // المدير العام يرفع صورة أي موظف
            if (! $currentEmployee->isGeneralManager()) {
                return $this->unauthorized('يمكنك فقط تغيير صورتك الشخصية');
            }
            $targetEmployee = Employee::find($id);
            if (! $targetEmployee) {
                return $this->notFound('الموظف غير موجود');
            }
        } else {
            $targetEmployee = $currentEmployee;
        }

        $passwordField = $id && $id !== $currentEmployee->id ? 'manager_password' : 'current_password';
        $passwordLabel = $passwordField === 'manager_password' ? 'كلمة مرور المدير العام' : 'كلمة المرور الحالية';
        if (! $request->filled($passwordField)) {
            return $this->validationError([
                $passwordField => [$passwordLabel.' مطلوبة لحماية الصورة الشخصية'],
            ]);
        }
        if (! Hash::check((string) $request->input($passwordField), $currentEmployee->password_hash)) {
            return $this->error($passwordLabel.' غير صحيحة', 422);
        }

        $errors = $this->validateImage($request);
        if ($errors) {
            return $this->validationError($errors);
        }

        $path = $this->storeImage(
            request: $request,
            folder: self::FOLDER_EMPLOYEES,
            oldPath: $targetEmployee->avatar
        );

        $targetEmployee->avatar = $path;
        $targetEmployee->save();

        return $this->success([
            'avatar_path' => $path,
            'avatar_url' => $this->buildImageUrl($path),
            'employee' => $targetEmployee->getDetails(),
        ], 'تم رفع الصورة الشخصية بنجاح');
    }

    // ─────────────────────────────────────────────
    // DELETE /api/auth/employee/avatar
    // DELETE /api/admin/employees/{id}/avatar
    // حذف الصورة الشخصية والعودة إلى الأحرف الافتراضية
    // ─────────────────────────────────────────────
    public function deleteEmployeeAvatar(Request $request, ?int $id = null)
    {
        $currentEmployee = $this->getEmployee($request);
        if (! $currentEmployee) {
            return $this->unauthorized();
        }

        if ($id && $id !== $currentEmployee->id) {
            if (! $currentEmployee->isGeneralManager()) {
                return $this->unauthorized('يمكنك فقط حذف صورتك الشخصية');
            }

            $targetEmployee = Employee::find($id);
            if (! $targetEmployee) {
                return $this->notFound('الموظف غير موجود');
            }
        } else {
            $targetEmployee = $currentEmployee;
        }

        $passwordField = $id && $id !== $currentEmployee->id ? 'manager_password' : 'current_password';
        $passwordLabel = $passwordField === 'manager_password' ? 'كلمة مرور المدير العام' : 'كلمة المرور الحالية';
        if (! $request->filled($passwordField)) {
            return $this->validationError([
                $passwordField => [$passwordLabel.' مطلوبة لحماية الصورة الشخصية'],
            ]);
        }
        if (! Hash::check((string) $request->input($passwordField), $currentEmployee->password_hash)) {
            return $this->error($passwordLabel.' غير صحيحة', 422);
        }

        if ($targetEmployee->avatar && Storage::disk('public')->exists($targetEmployee->avatar)) {
            Storage::disk('public')->delete($targetEmployee->avatar);
        }

        $targetEmployee->avatar = null;
        $targetEmployee->save();

        return $this->success([
            'employee' => $targetEmployee->getDetails(),
        ], 'تم حذف الصورة الشخصية بنجاح');
    }

    // ═══════════════════════════════════════════════
    // رفع صور الزبائن
    // ═══════════════════════════════════════════════

    // ─────────────────────────────────────────────
    // POST /api/customer/avatar
    // الزبون يرفع صورته الشخصية
    // ─────────────────────────────────────────────
    public function uploadCustomerAvatar(Request $request)
    {
        $customer = $this->getCustomer($request);
        if (! $customer) {
            return $this->unauthorized('هذا المسار للزبائن فقط');
        }

        if ($customer->isBanned()) {
            return $this->error('حسابك موقوف', 403);
        }

        if (! $request->filled('current_password')) {
            return $this->validationError([
                'current_password' => ['كلمة المرور الحالية مطلوبة لحماية الصورة الشخصية'],
            ]);
        }

        if (! Hash::check($request->current_password, $customer->password_hash)) {
            return $this->error('كلمة المرور الحالية غير صحيحة', 422);
        }

        $errors = $this->validateImage($request);
        if ($errors) {
            return $this->validationError($errors);
        }

        $path = $this->storeImage(
            request: $request,
            folder: self::FOLDER_CUSTOMERS,
            oldPath: $customer->avatar
        );

        $customer->avatar = $path;
        $customer->save();

        return $this->success([
            'avatar_path' => $path,
            'avatar_url' => $this->buildImageUrl($path),
        ], 'تم رفع الصورة الشخصية بنجاح');
    }

    // ═══════════════════════════════════════════════
    // رفع وحذف عام
    // ═══════════════════════════════════════════════

    // ─────────────────────────────────────────────
    // POST /api/upload/image
    // رفع صورة عامة (للموظفين)
    // ─────────────────────────────────────────────
    public function uploadImage(Request $request)
    {
        $employee = $this->getEmployee($request);
        if (! $employee || ! $employee->isGeneralManager()) {
            return $this->unauthorized('هذا المسار العام للمدير العام فقط؛ استخدم مسار الرفع المخصص لوظيفتك');
        }

        $validator = Validator::make($request->all(), [
            'image' => [
                'required', 'image',
                'max:'.self::MAX_SIZE_KB,
                'mimes:'.implode(',', self::ALLOWED_EXTENSIONS),
                'mimetypes:'.implode(',', self::ALLOWED_MIMES),
                'dimensions:min_width=1,min_height=1,max_width=10000,max_height=10000',
            ],
            'folder' => 'nullable|in:general,products,offers,restaurant,employees',
        ], [
            'image.required' => 'الصورة مطلوبة',
            'image.image' => 'الملف المرفوع ليس صورة صالحة',
            'image.max' => 'حجم الصورة يجب أن لا يتجاوز 5 ميغابايت',
            'image.mimes' => 'صيغة الصورة يجب أن تكون: JPG أو PNG أو WebP',
            'image.mimetypes' => 'محتوى الملف يجب أن يكون صورة JPG أو PNG أو WebP',
            'image.dimensions' => 'أبعاد الصورة غير صالحة أو كبيرة جدًا',
            'folder.in' => 'المجلد غير صحيح',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $folder = $request->get('folder', 'general');
        $path = $this->storeImage($request, $folder);

        return $this->success([
            'image_path' => $path,
            'image_url' => $this->buildImageUrl($path),
        ], 'تم رفع الصورة بنجاح', 201);
    }

    // ─────────────────────────────────────────────
    // DELETE /api/upload/{path}
    // حذف ملف من التخزين
    // ─────────────────────────────────────────────
    public function deleteFile(Request $request, string $path)
    {
        $employee = $this->getEmployee($request);
        if (! $employee) {
            return $this->unauthorized();
        }

        // المدير العام فقط يحذف ملفات مباشرة
        if (! $employee->isGeneralManager()) {
            return $this->unauthorized('هذا المسار للمدير العام فقط');
        }

        $decodedPath = urldecode($path);

        if (! $this->isManagedImagePath($decodedPath)) {
            return $this->validationError([
                'path' => ['مسار الملف غير صالح أو خارج مجلدات الصور المسموحة'],
            ]);
        }

        if (! Storage::disk('public')->exists($decodedPath)) {
            return $this->notFound('الملف غير موجود');
        }

        Storage::disk('public')->delete($decodedPath);

        return $this->success(null, 'تم حذف الملف بنجاح');
    }

    /**
     * يسمح الحذف العام فقط بالصور التي أنشأها التطبيق داخل مجلداته المعروفة.
     * يمنع المسارات المطلقة، والتنقل بـ ..، والامتدادات غير المدعومة.
     */
    private function isManagedImagePath(string $path): bool
    {
        if ($path === '' || str_contains($path, "\0") || str_contains($path, '\\') || str_contains($path, '..')) {
            return false;
        }

        return preg_match(
            '/\A(?:general|products|offers|employees|customers|restaurant(?:\/(?:logo|exterior|interior|food|banner))?)\/[0-9a-f-]+\.(?:jpe?g|png|webp)\z/i',
            $path
        ) === 1;
    }
}
