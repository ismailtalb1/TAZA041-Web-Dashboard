<?php

namespace App\Http\Controllers\API;

use App\Jobs\BroadcastNewOffer;
use App\Models\Customer;
use App\Models\Employee;
use App\Models\Offer;
use App\Models\OfferProduct;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class OfferController extends BaseController
{
    // ─────────────────────────────────────────────
    // التحقق من صلاحية إدارة العروض
    // ─────────────────────────────────────────────
    private function canManageOffers(Request $request): bool
    {
        $user = $request->user();
        if (! $user instanceof Employee) {
            return false;
        }

        return in_array($user->role, [
            Employee::ROLE_INVENTORY_MANAGER,
            Employee::ROLE_GENERAL_MANAGER,
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/public/offers
    // للزبون — العروض النشطة فقط
    // ─────────────────────────────────────────────
    public function publicIndex(Request $request)
    {
        $offers = Offer::currentlyActive()
            ->with(['products'])
            ->latest()
            ->get();

        return $this->success([
            'count' => $offers->count(),
            'offers' => $offers->map->getDetails()->values(),
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/public/offers/{id}
    // ─────────────────────────────────────────────
    public function publicShow(int $id)
    {
        $offer = Offer::currentlyActive()
            ->with(['products'])
            ->find($id);

        if (! $offer) {
            return $this->notFound('العرض غير موجود أو منتهٍ');
        }

        return $this->success(['offer' => $offer->getDetails()]);
    }

    // ─────────────────────────────────────────────
    // GET /api/offers
    // للإدارة — كل العروض
    // ─────────────────────────────────────────────
    public function index(Request $request)
    {
        if (! $this->canManageOffers($request)) {
            return $this->unauthorized('صلاحية مدير المخزون أو المدير العام مطلوبة');
        }

        $query = Offer::with(['products', 'offerProducts']);

        // فلترة
        if ($request->filled('category')) {
            $query->where('category', $request->category);
        }

        if ($request->filled('is_active')) {
            $query->where('is_active', (bool) $request->is_active);
        }

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%");
            });
        }

        $offers = $query->latest()->get();

        // تصنيف العروض حسب الحالة
        $now = now();

        return $this->success([
            'stats' => [
                'total' => $offers->count(),
                'active' => $offers->filter->isCurrentlyActive()->count(),
                'expired' => $offers->filter->isExpired()->count(),
                'upcoming' => $offers->filter(
                    fn ($o) => $o->start_date && $o->start_date->isAfter($now)
                )->count(),
                'inactive' => $offers->where('is_active', false)->count(),
            ],
            'offers' => $offers->map->getDetails()->values(),
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/offers/active
    // ─────────────────────────────────────────────
    public function active(Request $request)
    {
        if (! $this->canManageOffers($request)) {
            return $this->unauthorized();
        }

        $offers = Offer::currentlyActive()
            ->with(['products'])
            ->latest()
            ->get();

        return $this->success([
            'count' => $offers->count(),
            'offers' => $offers->map->getDetails()->values(),
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/offers/expired
    // ─────────────────────────────────────────────
    public function expired(Request $request)
    {
        if (! $this->canManageOffers($request)) {
            return $this->unauthorized();
        }

        $offers = Offer::expired()
            ->with(['products'])
            ->latest()
            ->get();

        return $this->success([
            'count' => $offers->count(),
            'offers' => $offers->map->getDetails()->values(),
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/offers/upcoming
    // ─────────────────────────────────────────────
    public function upcoming(Request $request)
    {
        if (! $this->canManageOffers($request)) {
            return $this->unauthorized();
        }

        $offers = Offer::upcoming()
            ->with(['products'])
            ->orderBy('start_date')
            ->get();

        return $this->success([
            'count' => $offers->count(),
            'offers' => $offers->map->getDetails()->values(),
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/offers/{id}
    // ─────────────────────────────────────────────
    public function show(Request $request, int $id)
    {
        if (! $this->canManageOffers($request)) {
            return $this->unauthorized();
        }

        $offer = Offer::with(['products', 'offerProducts.product'])->find($id);
        if (! $offer) {
            return $this->notFound('العرض غير موجود');
        }

        return $this->success([
            'offer' => $offer->getDetails(),
            'order_count' => $offer->orderItems()->count(),
        ]);
    }

    // ─────────────────────────────────────────────
    // POST /api/offers
    // إنشاء عرض جديد
    // ─────────────────────────────────────────────
    public function store(Request $request)
    {
        if (! $this->canManageOffers($request)) {
            return $this->unauthorized();
        }

        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'name_ar' => 'nullable|string|max:255',
            'name_en' => 'nullable|string|max:255',
            'description' => 'nullable|string|max:1000',
            'description_ar' => 'nullable|string|max:1000',
            'description_en' => 'nullable|string|max:1000',
            'category' => 'required|in:meal,drink,sandwich,mixed',
            'offer_price' => 'required|numeric|min:0',
            'loyalty_price' => 'nullable|integer|min:1',
            'is_active' => 'sometimes|boolean',
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date|after_or_equal:start_date',
            // المنتجات (اختياري عند الإنشاء، يمكن إضافتها لاحقاً)
            'products' => 'nullable|array',
            'products.*.product_id' => 'required|exists:products,id',
            'products.*.quantity' => 'required|integer|min:1',
        ], [
            'name.required' => 'اسم العرض مطلوب',
            'category.required' => 'فئة العرض مطلوبة',
            'category.in' => 'الفئة: meal أو drink أو sandwich أو mixed',
            'offer_price.required' => 'سعر العرض مطلوب',
            'offer_price.min' => 'سعر العرض يجب أن يكون أكبر من صفر',
            'end_date.after_or_equal' => 'تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية',
            'products.*.product_id.exists' => 'أحد المنتجات المحددة غير موجود',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        DB::beginTransaction();
        try {
            $offer = Offer::create([
                'name' => $request->name,
                'name_ar' => $request->name_ar,
                'name_en' => $request->name_en,
                'description' => $request->description,
                'description_ar' => $request->description_ar,
                'description_en' => $request->description_en,
                'category' => $request->category,
                'offer_price' => $request->offer_price,
                'loyalty_price' => $request->loyalty_price,
                'is_active' => $request->get('is_active', true),
                'start_date' => $request->start_date,
                'end_date' => $request->end_date,
            ]);

            // إضافة المنتجات إن وُجدت
            if ($request->filled('products')) {
                foreach ($request->products as $item) {
                    OfferProduct::create([
                        'offer_id' => $offer->id,
                        'product_id' => $item['product_id'],
                        'quantity' => $item['quantity'],
                    ]);
                }
                // حساب السعر الأصلي تلقائياً
                $offer->syncOriginalPrice();
            }

            $offer->load(['products']);

            DB::commit();

            BroadcastNewOffer::dispatch($offer->id, $request->user()->id)
                ->onQueue('notifications');

            return $this->success([
                'offer' => $offer->getDetails(),
            ], 'تم إنشاء العرض بنجاح', 201);

        } catch (\Exception $e) {
            DB::rollBack();

            return $this->error(
                'فشل في إنشاء العرض',
                500,
                config('app.debug') ? $e->getMessage() : null
            );
        }
    }

    // ─────────────────────────────────────────────
    // PUT /api/offers/{id}
    // تعديل عرض
    // ─────────────────────────────────────────────
    public function update(Request $request, int $id)
    {
        if (! $this->canManageOffers($request)) {
            return $this->unauthorized();
        }

        $offer = Offer::find($id);
        if (! $offer) {
            return $this->notFound('العرض غير موجود');
        }

        $validator = Validator::make($request->all(), [
            'name' => 'sometimes|string|max:255',
            'name_ar' => 'sometimes|nullable|string|max:255',
            'name_en' => 'sometimes|nullable|string|max:255',
            'description' => 'sometimes|nullable|string|max:1000',
            'description_ar' => 'sometimes|nullable|string|max:1000',
            'description_en' => 'sometimes|nullable|string|max:1000',
            'category' => 'sometimes|in:meal,drink,sandwich,mixed',
            'offer_price' => 'sometimes|numeric|min:0',
            'loyalty_price' => 'sometimes|nullable|integer|min:1',
            'is_active' => 'sometimes|boolean',
            'start_date' => 'sometimes|nullable|date',
            'end_date' => 'sometimes|nullable|date',
        ], [
            'offer_price.min' => 'سعر العرض يجب أن يكون أكبر من صفر',
            'loyalty_price.min' => 'سعر النقاط يجب أن يكون أكبر من صفر',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $offer->fill($request->only([
            'name', 'name_ar', 'name_en',
            'description', 'description_ar', 'description_en', 'category',
            'offer_price', 'loyalty_price',
            'is_active', 'start_date', 'end_date',
        ]));
        $offer->save();

        $offer->load(['products']);

        return $this->success([
            'offer' => $offer->getDetails(),
        ], 'تم تحديث العرض بنجاح');
    }

    // ─────────────────────────────────────────────
    // PATCH /api/offers/{id}/loyalty-price
    // ─────────────────────────────────────────────
    public function updateLoyaltyPrice(Request $request, int $id)
    {
        if (! $this->canManageOffers($request)) {
            return $this->unauthorized();
        }

        $offer = Offer::find($id);
        if (! $offer) {
            return $this->notFound('العرض غير موجود');
        }

        $validator = Validator::make($request->all(), [
            'loyalty_price' => 'nullable|integer|min:1',
        ], [
            'loyalty_price.min' => 'سعر النقاط يجب أن يكون أكبر من صفر',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $offer->loyalty_price = $request->loyalty_price;
        $offer->save();

        $message = $request->loyalty_price
            ? "تم تحديد سعر {$offer->name} بـ {$request->loyalty_price} نقطة"
            : "تم إزالة سعر النقاط من {$offer->name}";

        return $this->success([
            'offer' => $offer->getDetails(),
        ], $message);
    }

    // ─────────────────────────────────────────────
    // PATCH /api/offers/{id}/toggle
    // تفعيل أو تعطيل العرض
    // ─────────────────────────────────────────────
    public function toggle(Request $request, int $id)
    {
        if (! $this->canManageOffers($request)) {
            return $this->unauthorized();
        }

        $offer = Offer::find($id);
        if (! $offer) {
            return $this->notFound('العرض غير موجود');
        }

        $offer->is_active = ! $offer->is_active;
        $offer->save();

        $status = $offer->is_active ? 'تفعيل' : 'إيقاف';
        $message = "تم {$status} عرض {$offer->name}";

        return $this->success([
            'offer' => $offer->getDetails(),
            'is_active' => $offer->is_active,
        ], $message);
    }

    // ─────────────────────────────────────────────
    // POST /api/offers/{id}/products
    // إضافة منتج للعرض
    // ─────────────────────────────────────────────
    public function addProduct(Request $request, int $id)
    {
        if (! $this->canManageOffers($request)) {
            return $this->unauthorized();
        }

        $offer = Offer::find($id);
        if (! $offer) {
            return $this->notFound('العرض غير موجود');
        }

        $validator = Validator::make($request->all(), [
            'product_id' => 'required|exists:products,id',
            'quantity' => 'required|integer|min:1',
        ], [
            'product_id.required' => 'المنتج مطلوب',
            'product_id.exists' => 'المنتج غير موجود',
            'quantity.required' => 'الكمية مطلوبة',
            'quantity.min' => 'الكمية يجب أن تكون 1 على الأقل',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        // التحقق من عدم وجود المنتج في العرض مسبقاً
        $exists = OfferProduct::where('offer_id', $offer->id)
            ->where('product_id', $request->product_id)
            ->exists();

        if ($exists) {
            return $this->error('هذا المنتج موجود في العرض مسبقاً — عدّل الكمية بدلاً من ذلك');
        }

        $offer->addProduct($request->product_id, $request->quantity);

        $offer->load(['products']);

        $product = Product::find($request->product_id);

        return $this->success([
            'offer' => $offer->getDetails(),
            'added_product' => $product->name,
            'original_price' => $offer->original_price,
        ], "تم إضافة {$product->name} للعرض وتحديث السعر الأصلي");
    }

    // ─────────────────────────────────────────────
    // DELETE /api/offers/{id}/products/{productId}
    // حذف منتج من العرض
    // ─────────────────────────────────────────────
    public function removeProduct(Request $request, int $id, int $productId)
    {
        if (! $this->canManageOffers($request)) {
            return $this->unauthorized();
        }

        $offer = Offer::find($id);
        if (! $offer) {
            return $this->notFound('العرض غير موجود');
        }

        $product = Product::find($productId);
        if (! $product) {
            return $this->notFound('المنتج غير موجود');
        }

        $exists = OfferProduct::where('offer_id', $offer->id)
            ->where('product_id', $productId)
            ->exists();

        if (! $exists) {
            return $this->error('هذا المنتج غير موجود في العرض');
        }

        $offer->removeProduct($productId);

        // إذا لم يتبق منتجات — تحذير
        $remainingCount = $offer->offerProducts()->count();

        $offer->load(['products']);

        return $this->success([
            'offer' => $offer->getDetails(),
            'removed_product' => $product->name,
            'remaining_count' => $remainingCount,
            'warning' => $remainingCount === 0
                ? 'تنبيه: العرض لا يحتوي على أي منتجات الآن'
                : null,
        ], "تم حذف {$product->name} من العرض");
    }

    // ─────────────────────────────────────────────
    // POST /api/offers/{id}/broadcast
    // إشعار كل الزبائن بعرض جديد
    // ─────────────────────────────────────────────
    public function broadcast(Request $request, int $id)
    {
        if (! $this->canManageOffers($request)) {
            return $this->unauthorized();
        }

        $offer = Offer::with(['products'])->find($id);
        if (! $offer) {
            return $this->notFound('العرض غير موجود');
        }

        if (! $offer->isCurrentlyActive()) {
            return $this->error('لا يمكن الإعلان عن عرض غير نشط');
        }

        $employee = $request->user();

        $customerCount = Customer::registered()->active()->count();
        BroadcastNewOffer::dispatch($offer->id, $employee->id)
            ->onQueue('notifications');

        return $this->success([
            'offer_name' => $offer->name,
            'sent_to' => $customerCount,
            'queued' => true,
        ], "تمت جدولة إشعار العرض لـ {$customerCount} زبون");
    }

    // ─────────────────────────────────────────────
    // DELETE /api/offers/{id}
    // ─────────────────────────────────────────────
    public function destroy(Request $request, int $id)
    {
        if (! $this->canManageOffers($request)) {
            return $this->unauthorized();
        }

        $offer = Offer::find($id);
        if (! $offer) {
            return $this->notFound('العرض غير موجود');
        }

        // التحقق من عدم وجود طلبات نشطة تستخدم هذا العرض
        $activeOrders = $offer->orderItems()
            ->whereHas('order', fn ($q) => $q->whereNotIn('status', ['completed', 'cancelled'])
            )->count();

        if ($activeOrders > 0) {
            return $this->error(
                "لا يمكن حذف العرض — يوجد {$activeOrders} طلب نشط يحتوي عليه. ".
                'قم بإيقافه بدلاً من الحذف',
                422
            );
        }

        $offerName = $offer->name;
        $offer->delete();

        return $this->success(null, "تم حذف عرض {$offerName} بنجاح");
    }
}
