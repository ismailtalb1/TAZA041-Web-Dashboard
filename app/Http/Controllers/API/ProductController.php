<?php

namespace App\Http\Controllers\API;

use App\Jobs\BroadcastNewProduct;
use App\Models\Customer;
use App\Models\Employee;
use App\Models\Notification;
use App\Models\Product;
use App\Services\ProductSearchService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class ProductController extends BaseController
{
    public function reportUnavailable(Request $request, int $id)
    {
        $customer = $request->user();
        if (! $customer instanceof Customer) {
            return $this->unauthorized('هذا المسار للزبائن فقط');
        }

        $product = Product::find($id);
        if (! $product) {
            return $this->notFound('الوجبة غير موجودة');
        }
        if ($product->isAvailable()) {
            return $this->error('الوجبة متوفرة حالياً ولا تحتاج إلى بلاغ', 422);
        }

        $notification = Notification::customerReportedUnavailable($product, $customer);
        if (! $notification) {
            return $this->error('لا يوجد مدير مخزون متاح لاستلام البلاغ حالياً', 503);
        }

        return $this->success([
            'notification_id' => $notification->id,
            'product_id' => $product->id,
        ], 'تم إرسال البلاغ إلى مدير المخزون');
    }

    // ─────────────────────────────────────────────
    // التحقق من صلاحية إدارة المنتجات
    // inventory_manager أو general_manager
    // ─────────────────────────────────────────────
    private function canManageProducts(Request $request): bool
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
    // GET /api/public/products
    // للزبون — كل المنتجات النشطة، بما فيها النافدة من المخزون
    // ─────────────────────────────────────────────
    public function publicIndex(Request $request, ProductSearchService $searchService)
    {
        // تُعرض المنتجات النافدة بحالة "غير متاح" بدلاً من إخفائها كلياً.
        // الواجهة تملك مرشحاً مستقلاً لإظهار المتاح فقط عند رغبة العميل.
        $query = Product::active();

        // فلترة حسب الفئة
        if ($request->filled('category')) {
            $query->byCategory($request->category);
        }

        // ترتيب
        $sort = $request->get('sort', 'category');
        match ($sort) {
            'price_asc' => $query->orderBy('price'),
            'price_desc' => $query->orderByDesc('price'),
            'name' => $query->orderBy('name'),
            default => $query->orderBy('category')->orderBy('name'),
        };

        $products = $query->get();
        $searchQuery = trim((string) $request->get('search', ''));
        $correction = null;
        if ($searchQuery !== '') {
            $products = $searchService->rank($products, $searchQuery);
            $correction = $searchService->bestCorrection($products, $searchQuery);
        }

        // تجميع حسب الفئة
        $grouped = $products->groupBy('category')->map(function ($items, $category) {
            return [
                'label' => Product::CATEGORY_LABELS[$category] ?? $category,
                'count' => $items->count(),
                'products' => $items->map->getDetails()->values(),
            ];
        });

        return $this->success([
            'total' => $products->count(),
            'categories' => Product::CATEGORY_LABELS,
            'grouped' => $grouped,
            'search' => [
                'query' => $searchQuery,
                'fuzzy' => $searchQuery !== '',
                'corrected_to' => $correction,
            ],
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/public/products/{id}
    // ─────────────────────────────────────────────
    public function publicShow(int $id)
    {
        $product = Product::active()->find($id);
        if (! $product) {
            return $this->notFound('المنتج غير موجود أو غير متاح');
        }

        return $this->success([
            'product' => $product->getDetails(),
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/products
    // للإدارة — كل المنتجات (نشطة وغير نشطة)
    // ─────────────────────────────────────────────
    public function index(Request $request)
    {
        if (! $this->canManageProducts($request)) {
            return $this->unauthorized('صلاحية مدير المخزون أو المدير العام مطلوبة');
        }

        $query = Product::query();

        // فلترة
        if ($request->filled('category')) {
            $query->byCategory($request->category);
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

        // ترتيب
        $sort = $request->get('sort', 'category');
        match ($sort) {
            'price_asc' => $query->orderBy('price'),
            'price_desc' => $query->orderByDesc('price'),
            'stock_asc' => $query->orderBy('stock_quantity'),
            'name' => $query->orderBy('name'),
            default => $query->orderBy('category')->orderBy('name'),
        };

        $products = $query->get();

        return $this->success([
            'stats' => [
                'total' => $products->count(),
                'active' => $products->where('is_active', true)->count(),
                'inactive' => $products->where('is_active', false)->count(),
                'low_stock' => $products->filter->isLowStock()->count(),
                'out_of_stock' => $products->where('stock_quantity', 0)->count(),
            ],
            'categories' => Product::CATEGORY_LABELS,
            'products' => $products->map->getDetails()->values(),
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/products/low-stock
    // ─────────────────────────────────────────────
    public function lowStock(Request $request)
    {
        if (! $this->canManageProducts($request)) {
            return $this->unauthorized();
        }

        $products = Product::lowStock()
            ->orderBy('stock_quantity')
            ->get();

        return $this->success([
            'count' => $products->count(),
            'products' => $products->map->getDetails()->values(),
        ], 'منتجات المخزون المنخفض');
    }

    // ─────────────────────────────────────────────
    // GET /api/products/out-of-stock
    // ─────────────────────────────────────────────
    public function outOfStock(Request $request)
    {
        if (! $this->canManageProducts($request)) {
            return $this->unauthorized();
        }

        $products = Product::outOfStock()->orderBy('name')->get();

        return $this->success([
            'count' => $products->count(),
            'products' => $products->map->getDetails()->values(),
        ], 'منتجات نفد مخزونها');
    }

    // ─────────────────────────────────────────────
    // GET /api/products/stats
    // ─────────────────────────────────────────────
    public function stats(Request $request)
    {
        if (! $this->canManageProducts($request)) {
            return $this->unauthorized();
        }

        $byCategory = collect(Product::CATEGORY_LABELS)
            ->map(fn ($label, $cat) => [
                'label' => $label,
                'total' => Product::byCategory($cat)->count(),
                'active' => Product::byCategory($cat)->active()->count(),
                'available' => Product::byCategory($cat)->available()->count(),
            ]);

        $mostOrdered = Product::withCount([
            'orderItems as order_count',
        ])->withSum('orderItems as ordered_quantity', 'quantity')
            ->orderByDesc('ordered_quantity')
            ->take(5)
            ->get()
            ->map(fn (Product $product) => array_merge($product->getDetails(), [
                'order_count' => (int) $product->order_count,
                'ordered_quantity' => (int) ($product->ordered_quantity ?? 0),
            ]))->values();

        return $this->success([
            'summary' => [
                'total_products' => Product::count(),
                'active_products' => Product::active()->count(),
                'low_stock' => Product::lowStock()->count(),
                'out_of_stock' => Product::outOfStock()->count(),
            ],
            'by_category' => $byCategory,
            'most_ordered' => $mostOrdered,
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/products/{id}
    // ─────────────────────────────────────────────
    public function show(Request $request, int $id)
    {
        if (! $this->canManageProducts($request)) {
            return $this->unauthorized();
        }

        $product = Product::find($id);
        if (! $product) {
            return $this->notFound('المنتج غير موجود');
        }

        return $this->success([
            'product' => $product->getDetails(),
            'order_count' => $product->getOrderCount(),
        ]);
    }

    // ─────────────────────────────────────────────
    // POST /api/products
    // ─────────────────────────────────────────────
    public function store(Request $request)
    {
        if (! $this->canManageProducts($request)) {
            return $this->unauthorized();
        }

        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'name_ar' => 'nullable|string|max:255',
            'name_en' => 'nullable|string|max:255',
            'description' => 'nullable|string|max:1000',
            'description_ar' => 'nullable|string|max:1000',
            'description_en' => 'nullable|string|max:1000',
            'category' => 'required|in:meal,drink,sandwich',
            'price' => 'required|numeric|min:0',
            'stock_quantity' => 'required|integer|min:0',
            'loyalty_price' => 'nullable|integer|min:1',
            'is_active' => 'sometimes|boolean',
        ], [
            'name.required' => 'اسم المنتج مطلوب',
            'category.required' => 'فئة المنتج مطلوبة',
            'category.in' => 'الفئة يجب أن تكون meal أو drink أو sandwich',
            'price.required' => 'سعر المنتج مطلوب',
            'price.min' => 'السعر يجب أن يكون أكبر من صفر',
            'stock_quantity.required' => 'كمية المخزون مطلوبة',
            'loyalty_price.min' => 'سعر النقاط يجب أن يكون أكبر من صفر',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $product = Product::create([
            'name' => $request->name,
            'name_ar' => $request->name_ar,
            'name_en' => $request->name_en,
            'description' => $request->description,
            'description_ar' => $request->description_ar,
            'description_en' => $request->description_en,
            'category' => $request->category,
            'price' => $request->price,
            'stock_quantity' => $request->stock_quantity,
            'loyalty_price' => $request->loyalty_price,
            'is_active' => $request->get('is_active', true),
        ]);
        $product->syncStockAlert();

        BroadcastNewProduct::dispatch($product->id, $request->user()->id)
            ->onQueue('notifications');

        return $this->success([
            'product' => $product->getDetails(),
        ], 'تم إضافة المنتج بنجاح', 201);
    }

    // ─────────────────────────────────────────────
    // PUT /api/products/{id}
    // ─────────────────────────────────────────────
    public function update(Request $request, int $id)
    {
        if (! $this->canManageProducts($request)) {
            return $this->unauthorized();
        }

        $product = Product::find($id);
        if (! $product) {
            return $this->notFound('المنتج غير موجود');
        }

        $validator = Validator::make($request->all(), [
            'name' => 'sometimes|string|max:255',
            'name_ar' => 'sometimes|nullable|string|max:255',
            'name_en' => 'sometimes|nullable|string|max:255',
            'description' => 'sometimes|nullable|string|max:1000',
            'description_ar' => 'sometimes|nullable|string|max:1000',
            'description_en' => 'sometimes|nullable|string|max:1000',
            'category' => 'sometimes|in:meal,drink,sandwich',
            'price' => 'sometimes|numeric|min:0',
            'stock_quantity' => 'sometimes|integer|min:0',
            'loyalty_price' => 'sometimes|nullable|integer|min:1',
            'is_active' => 'sometimes|boolean',
        ], [
            'price.min' => 'السعر يجب أن يكون أكبر من صفر',
            'category.in' => 'الفئة يجب أن تكون meal أو drink أو sandwich',
            'loyalty_price.min' => 'سعر النقاط يجب أن يكون أكبر من صفر',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $oldStock = (int) $product->stock_quantity;
        $product->fill($request->only([
            'name', 'name_ar', 'name_en',
            'description', 'description_ar', 'description_en', 'category',
            'price', 'stock_quantity', 'loyalty_price', 'is_active',
        ]));
        $product->save();
        if ($request->hasAny(['stock_quantity', 'is_active'])) {
            $product->syncStockAlert($oldStock);
        }

        return $this->success([
            'product' => $product->getDetails(),
        ], 'تم تحديث المنتج بنجاح');
    }

    // ─────────────────────────────────────────────
    // PATCH /api/products/{id}/price
    // تعديل السعر فقط
    // ─────────────────────────────────────────────
    public function updatePrice(Request $request, int $id)
    {
        if (! $this->canManageProducts($request)) {
            return $this->unauthorized();
        }

        $product = Product::find($id);
        if (! $product) {
            return $this->notFound('المنتج غير موجود');
        }

        $validator = Validator::make($request->all(), [
            'price' => 'required|numeric|min:0',
        ], [
            'price.required' => 'السعر الجديد مطلوب',
            'price.min' => 'السعر يجب أن يكون أكبر من صفر',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $oldPrice = $product->price;
        $product->price = $request->price;
        $product->save();

        return $this->success([
            'product' => $product->getDetails(),
            'old_price' => $oldPrice,
            'new_price' => $product->price,
        ], 'تم تحديث السعر بنجاح');
    }

    // ─────────────────────────────────────────────
    // PATCH /api/products/{id}/loyalty-price
    // تحديد سعر المنتج بنقاط الولاء
    // ─────────────────────────────────────────────
    public function updateLoyaltyPrice(Request $request, int $id)
    {
        if (! $this->canManageProducts($request)) {
            return $this->unauthorized();
        }

        $product = Product::find($id);
        if (! $product) {
            return $this->notFound('المنتج غير موجود');
        }

        $validator = Validator::make($request->all(), [
            'loyalty_price' => 'nullable|integer|min:1',
        ], [
            'loyalty_price.min' => 'سعر النقاط يجب أن يكون أكبر من صفر',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $product->loyalty_price = $request->loyalty_price;
        $product->save();

        $message = $request->loyalty_price
            ? "تم تحديد سعر {$product->name} بـ {$request->loyalty_price} نقطة"
            : "تم إزالة سعر النقاط من {$product->name}";

        return $this->success([
            'product' => $product->getDetails(),
        ], $message);
    }

    // ─────────────────────────────────────────────
    // PATCH /api/products/{id}/stock
    // تعديل المخزون
    // ─────────────────────────────────────────────
    public function updateStock(Request $request, int $id)
    {
        if (! $this->canManageProducts($request)) {
            return $this->unauthorized();
        }

        $product = Product::find($id);
        if (! $product) {
            return $this->notFound('المنتج غير موجود');
        }

        $validator = Validator::make($request->all(), [
            'stock_quantity' => 'required|integer|min:0',
            'operation' => 'sometimes|in:set,add,subtract',
        ], [
            'stock_quantity.required' => 'الكمية مطلوبة',
            'stock_quantity.min' => 'الكمية لا تكون أقل من صفر',
            'operation.in' => 'العملية: set أو add أو subtract',
        ]);

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }

        $oldStock = $product->stock_quantity;
        $operation = $request->get('operation', 'set');
        $qty = (int) $request->stock_quantity;

        match ($operation) {
            'add' => $product->stock_quantity += $qty,
            'subtract' => $product->stock_quantity = max(0, $product->stock_quantity - $qty),
            default => $product->stock_quantity = $qty,
        };

        $product->save();
        $product->syncStockAlert($oldStock);

        return $this->success([
            'product' => $product->getDetails(),
            'old_stock' => $oldStock,
            'new_stock' => $product->stock_quantity,
            'operation' => $operation,
        ], 'تم تحديث المخزون بنجاح');
    }

    // ─────────────────────────────────────────────
    // PATCH /api/products/{id}/toggle
    // تفعيل أو تعطيل المنتج
    // ─────────────────────────────────────────────
    public function toggle(Request $request, int $id)
    {
        if (! $this->canManageProducts($request)) {
            return $this->unauthorized();
        }

        $product = Product::find($id);
        if (! $product) {
            return $this->notFound('المنتج غير موجود');
        }

        $product->is_active = ! $product->is_active;
        $product->save();
        $product->syncStockAlert((int) $product->stock_quantity);

        $status = $product->is_active ? 'تفعيل' : 'تعطيل';
        $message = "تم {$status} منتج {$product->name}";

        return $this->success([
            'product' => $product->getDetails(),
            'is_active' => $product->is_active,
        ], $message);
    }

    // ─────────────────────────────────────────────
    // DELETE /api/products/{id}
    // ─────────────────────────────────────────────
    public function destroy(Request $request, int $id)
    {
        if (! $this->canManageProducts($request)) {
            return $this->unauthorized();
        }

        $product = Product::find($id);
        if (! $product) {
            return $this->notFound('المنتج غير موجود');
        }

        // التحقق من أن المنتج لا يُستخدم في طلبات نشطة
        $activeOrders = $product->orderItems()
            ->whereHas('order', fn ($q) => $q->whereNotIn('status', ['completed', 'cancelled'])
            )->count();

        if ($activeOrders > 0) {
            return $this->error(
                "لا يمكن حذف المنتج — يوجد {$activeOrders} طلب نشط يحتوي عليه. ".
                'قم بتعطيله بدلاً من الحذف',
                422
            );
        }

        $productName = $product->name;
        $product->delete();

        return $this->success(null, "تم حذف منتج {$productName} بنجاح");
    }
}
