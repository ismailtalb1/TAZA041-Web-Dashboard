<?php

// =====================================================================
// TAZA 041 — Restaurant Management System
// routes/api.php — كل مسارات الـ API
// =====================================================================
// Base URL : http://localhost:8000/api
// Auth     : Bearer Token (Sanctum)
// Format   : JSON
// =====================================================================

use App\Http\Controllers\API\AIController;
use App\Http\Controllers\API\CustomerAuthController;
use App\Http\Controllers\API\CustomerController;
use App\Http\Controllers\API\CustomerSavedAddressController;
use App\Http\Controllers\API\DeliveryController;
use App\Http\Controllers\API\EmployeeAuthController;
use App\Http\Controllers\API\EmployeeController;
use App\Http\Controllers\API\LoyaltyController;
use App\Http\Controllers\API\MealSuggestionController;
use App\Http\Controllers\API\NotificationController;
use App\Http\Controllers\API\OfferController;
use App\Http\Controllers\API\OrderController;
use App\Http\Controllers\API\PaymentController;
use App\Http\Controllers\API\ProductController;
use App\Http\Controllers\API\ReportController;
use App\Http\Controllers\API\ReservationController;
use App\Http\Controllers\API\RestaurantController;
use App\Http\Controllers\API\ReviewController;
use App\Http\Controllers\API\UploadController;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

// ─────────────────────────────────────────────────────────────────────
// [A] مسارات عامة — لا تحتاج تسجيل دخول
// ─────────────────────────────────────────────────────────────────────
Route::prefix('public')->name('public.')->group(function () {

    // لقطة موحدة للبيانات الحية في موقع الزبون
    Route::get('live-data', [RestaurantController::class, 'liveData'])
        ->name('live-data');

    // معلومات المطعم العامة (اسم، عنوان، ساعات، سوشيال)
    Route::get('restaurant', [RestaurantController::class, 'publicInfo'])
        ->name('restaurant.info');

    // صور المطعم مُجمَّعة حسب النوع
    Route::get('restaurant/images', [RestaurantController::class, 'publicImages'])
        ->name('restaurant.images');

    // المنتجات المتاحة للتصفح
    Route::get('products', [ProductController::class, 'publicIndex'])
        ->name('products.index');

    // تفاصيل منتج واحد
    Route::get('products/{id}', [ProductController::class, 'publicShow'])
        ->name('products.show');

    // العروض النشطة
    Route::get('offers', [OfferController::class, 'publicIndex'])
        ->name('offers.index');

    // تفاصيل عرض واحد
    Route::get('offers/{id}', [OfferController::class, 'publicShow'])
        ->name('offers.show');

    // محادثة AI بدون تسجيل دخول
    Route::post('ai/chat', [AIController::class, 'chat'])
        ->name('ai.chat');

    // معلومات التسعير (تكلفة التوصيل، الحجز)
    Route::get('pricing', [RestaurantController::class, 'pricingInfo'])
        ->name('pricing');

    // حساب تكلفة التوصيل من إحداثيات الخريطة
    Route::get('delivery/quote', [RestaurantController::class, 'deliveryQuote'])
        ->name('delivery.quote');

    // التحقق العام من توفر طاولة لواجهة الزبون
    Route::get('reservations/tables', [ReservationController::class, 'tables'])
        ->name('reservations.tables');
    Route::get('reservations/table/{tableNumber}/availability',
        [ReservationController::class, 'tableAvailability'])
        ->name('reservations.table-availability');
});

// ─────────────────────────────────────────────────────────────────────
// [B] مصادقة الموظفين
// ─────────────────────────────────────────────────────────────────────
Route::prefix('auth/employee')->name('auth.employee.')->group(function () {

    // POST /api/auth/employee/login
    Route::post('login', [EmployeeAuthController::class, 'login'])
        ->middleware('throttle:employee-login')
        ->name('login');

    // مسارات محمية بالتوكن
    Route::middleware('auth:sanctum')->group(function () {

        // POST /api/auth/employee/logout
        Route::post('logout', [EmployeeAuthController::class, 'logout'])
            ->name('logout');

        // GET /api/auth/employee/me — بيانات الموظف الحالي
        Route::get('me', [EmployeeAuthController::class, 'me'])
            ->name('me');

        // PUT /api/auth/employee/profile — تعديل بيانات شخصية
        Route::put('profile', [EmployeeAuthController::class, 'updateProfile'])
            ->name('profile.update');

        // POST /api/auth/employee/avatar — رفع صورة شخصية
        Route::post('avatar', [UploadController::class, 'uploadEmployeeAvatar'])
            ->name('avatar.upload');

        // DELETE /api/auth/employee/avatar — حذف الصورة الشخصية
        Route::delete('avatar', [UploadController::class, 'deleteEmployeeAvatar'])
            ->name('avatar.delete');
    });
});

// ─────────────────────────────────────────────────────────────────────
// [C] مسارات مشتركة — كل موظف مسجل
// ─────────────────────────────────────────────────────────────────────
Route::middleware('auth:sanctum')->prefix('employee')->name('employee.')->group(function () {

    // ── الإشعارات ──────────────────────────────────────────────────
    Route::prefix('notifications')->name('notifications.')->group(function () {

        // GET /api/employee/notifications — قائمة الإشعارات
        Route::get('/', [NotificationController::class, 'employeeIndex'])
            ->name('index');

        // GET /api/employee/notifications/unread-count
        Route::get('unread-count', [NotificationController::class, 'employeeUnreadCount'])
            ->name('unread-count');

        // PUT /api/employee/notifications/read-all
        Route::put('read-all', [NotificationController::class, 'employeeMarkAllRead'])
            ->name('read-all');

        // PUT /api/employee/notifications/{id}/read
        Route::put('{id}/read', [NotificationController::class, 'markRead'])
            ->whereNumber('id')
            ->name('mark-read');
    });

    // ── التقارير المستلمة ───────────────────────────────────────────
    Route::prefix('reports')->name('reports.')->group(function () {

        // GET /api/employee/reports — التقارير المستلمة والمرسلة
        Route::get('/', [ReportController::class, 'index'])
            ->name('index');

        // GET /api/employee/reports/{id}
        Route::get('{id}', [ReportController::class, 'show'])
            ->name('show');

        // POST /api/employee/reports — إنشاء وإرسال تقرير
        Route::post('/', [ReportController::class, 'store'])
            ->name('store');

        // PUT /api/employee/reports/{id}/review
        Route::put('{id}/review', [ReportController::class, 'markReviewed'])
            ->name('review');

        // PUT /api/employee/reports/{id}/archive
        Route::put('{id}/archive', [ReportController::class, 'archive'])
            ->name('archive');
    });
});

// ─────────────────────────────────────────────────────────────────────
// [D] المدير العام — general_manager
// ─────────────────────────────────────────────────────────────────────
Route::middleware('auth:sanctum')->prefix('admin')->name('admin.')->group(function () {

    // ── إدارة الموظفين ──────────────────────────────────────────────
    Route::prefix('employees')->name('employees.')->group(function () {

        // GET  /api/admin/employees — قائمة الموظفين
        Route::get('/', [EmployeeController::class, 'index'])
            ->name('index');

        // GET  /api/admin/employees/{id}
        Route::get('{id}', [EmployeeController::class, 'show'])
            ->name('show');

        // POST /api/admin/employees — إنشاء موظف جديد
        Route::post('/', [EmployeeController::class, 'store'])
            ->name('store');

        // PUT  /api/admin/employees/{id}
        Route::put('{id}', [EmployeeController::class, 'update'])
            ->name('update');

        // PATCH /api/admin/employees/{id}
        // دعم إضافي للواجهات التي ترسل تحديثًا جزئيًا
        Route::patch('{id}', [EmployeeController::class, 'update'])
            ->name('update.patch');

        // POST /api/admin/employees/{id}
        // مسار احتياطي لحالات الاستضافة/المتصفح التي تمنع PUT/PATCH في الطلبات المسبقة CORS
        Route::post('{id}', [EmployeeController::class, 'update'])
            ->whereNumber('id')
            ->name('update.post-fallback');

        // DELETE /api/admin/employees/{id} — إقالة موظف
        Route::delete('{id}', [EmployeeController::class, 'destroy'])
            ->name('destroy');

        // POST /api/admin/employees/{id}/avatar — رفع صورة موظف
        Route::post('{id}/avatar', [UploadController::class, 'uploadEmployeeAvatar'])
            ->name('avatar');

        // DELETE /api/admin/employees/{id}/avatar — حذف صورة موظف
        Route::delete('{id}/avatar', [UploadController::class, 'deleteEmployeeAvatar'])
            ->name('avatar.delete');

        // POST /api/admin/employees/{id}/notify — إرسال إشعار لموظف
        Route::post('{id}/notify', [EmployeeController::class, 'sendNotification'])
            ->name('notify');

        // GET  /api/admin/employees/{id}/reviews — تقييمات الموظف
        Route::get('{id}/reviews', [ReviewController::class, 'employeeReviews'])
            ->name('reviews');

        // POST /api/admin/employees/{id}/review — تقييم موظف
        Route::post('{id}/review', [ReviewController::class, 'rateEmployee'])
            ->name('review');
    });

    // ── إدارة الزبائن ───────────────────────────────────────────────
    Route::prefix('customers')->name('customers.')->group(function () {

        // GET /api/admin/customers — قائمة مع فلترة
        // Query params: filter=most_orders|top_spenders|top_loyalty|suspicious
        Route::get('/', [CustomerController::class, 'index'])
            ->name('index');

        // GET /api/admin/customers/{id}
        Route::get('{id}', [CustomerController::class, 'show'])
            ->name('show');

        // GET /api/admin/customers/{id}/orders — طلبات زبون معين
        Route::get('{id}/orders', [CustomerController::class, 'orders'])
            ->name('orders');

        // POST /api/admin/customers/{id}/ban — حظر زبون
        Route::post('{id}/ban', [CustomerController::class, 'ban'])
            ->name('ban');

        // POST /api/admin/customers/{id}/unban — رفع الحظر
        Route::post('{id}/unban', [CustomerController::class, 'unban'])
            ->name('unban');

        // POST /api/admin/customers/broadcast — إشعار جماعي لكل الزبائن
        Route::post('broadcast', [CustomerController::class, 'broadcast'])
            ->name('broadcast');
    });

    // ── عرض كل الطلبات (للمدير العام) ──────────────────────────────
    Route::prefix('orders')->name('orders.')->group(function () {

        // GET /api/admin/orders — كل الطلبات بكل الأنواع
        // Query params: type=normal|delivery|reservation, status=..., date=...
        Route::get('/', [OrderController::class, 'adminIndex'])
            ->name('index');

        // GET /api/admin/orders/stats — إحصائيات الطلبات
        Route::get('stats', [OrderController::class, 'stats'])
            ->name('stats');

        // GET /api/admin/orders/{id}
        Route::get('{id}', [OrderController::class, 'adminShow'])
            ->name('show');
    });

    // ── التقارير (استقبال وإرسال) ───────────────────────────────────
    Route::prefix('reports')->name('reports.')->group(function () {

        // GET /api/admin/reports — كل التقارير الواردة
        Route::get('/', [ReportController::class, 'adminIndex'])
            ->name('index');

        // GET /api/admin/reports/stats — ملخص التقارير
        Route::get('stats', [ReportController::class, 'stats'])
            ->name('stats');

        // POST /api/admin/reports/{id}/forward — إرسال تعليمات لموظف
        Route::post('{id}/send', [ReportController::class, 'adminSend'])
            ->name('send');
    });

    // ── إعدادات المطعم (كاملة للمدير العام) ────────────────────────
    Route::prefix('restaurant')->name('restaurant.')->group(function () {

        // GET  /api/admin/restaurant
        Route::get('/', [RestaurantController::class, 'adminShow'])
            ->name('show');

        // PUT  /api/admin/restaurant/delivery — إعدادات التوصيل
        Route::put('delivery-settings', [RestaurantController::class, 'updateDeliverySettings'])
            ->name('delivery-settings');

        // PUT  /api/admin/restaurant/reservation — إعدادات الحجز
        Route::put('reservation-settings', [RestaurantController::class, 'updateReservationSettings'])
            ->name('reservation-settings');

        // PUT  /api/admin/restaurant/toggle-open — فتح/إغلاق المطعم
        Route::put('toggle-open', [RestaurantController::class, 'toggleOpen'])
            ->name('toggle-open');

        // POST /api/admin/restaurant/logo — رفع شعار المطعم
        Route::post('logo', [UploadController::class, 'uploadLogo'])
            ->name('logo');
    });
});

// ─────────────────────────────────────────────────────────────────────
// [E] مدير الطلبات — order_manager
// ─────────────────────────────────────────────────────────────────────
Route::middleware('auth:sanctum')->prefix('orders')->name('orders.')->group(function () {

    // GET /api/orders — طلبات مدير الطلبات
    // (عادية + توصيل مرحلة التجهيز + كل الحجوزات)
    Route::get('/', [OrderController::class, 'index'])
        ->name('index');

    // GET /api/orders/pending — الطلبات المعلقة (للتنبيه)
    Route::get('pending', [OrderController::class, 'pending'])
        ->name('pending');

    // ── طلبات الحجز ──────────────────────────────────────────────
    Route::prefix('reservations')->name('reservations.')->group(function () {

        // GET /api/orders/reservations — قائمة الحجوزات
        Route::get('/', [ReservationController::class, 'index'])
            ->name('index');

        // GET /api/orders/reservations/today — حجوزات اليوم
        Route::get('today', [ReservationController::class, 'today'])
            ->name('today');

        // GET /api/orders/reservations/upcoming — القادمة
        Route::get('upcoming', [ReservationController::class, 'upcoming'])
            ->name('upcoming');

        // GET /api/orders/reservations/table/{tableNumber}/availability
        // Query: reservation_time, duration_minutes, live=1
        // يجب أن يسبق {id} حتى لا يُفسَّر مسار table كمعرّف حجز
        Route::get('table/{tableNumber}/availability',
            [ReservationController::class, 'tableAvailability'])
            ->name('table-availability');

        // GET /api/orders/reservations/{id}
        Route::get('{id}', [ReservationController::class, 'show'])
            ->whereNumber('id')
            ->name('show');

        // PUT /api/orders/reservations/{id}/status
        // Body: { "status": "confirmed" | "seated" | "completed" | "cancelled" | "no_show" }
        Route::put('{id}/status', [ReservationController::class, 'changeStatus'])
            ->whereNumber('id')
            ->name('change-status');
    });

    // ── الطلبات العادية ───────────────────────────────────────────
    Route::prefix('normal')->name('normal.')->group(function () {

        // GET /api/orders/normal
        Route::get('/', [OrderController::class, 'normalOrders'])
            ->name('index');

        // GET /api/orders/normal/stats
        Route::get('stats', [OrderController::class, 'normalStats'])
            ->name('stats');
    });

    // ── مسارات الطلب المفرد يجب أن تبقى أخيراً حتى لا تحجب /reservations و /normal ──
    // GET /api/orders/{id}
    Route::get('{id}', [OrderController::class, 'show'])
        ->whereNumber('id')
        ->name('show');

    // PUT /api/orders/{id}/status — تغيير حالة الطلب
    Route::put('{id}/status', [OrderController::class, 'changeStatus'])
        ->whereNumber('id')
        ->name('change-status');

    // POST /api/orders/{id}/notify-customer — إشعار الزبون يدوياً
    Route::post('{id}/notify-customer', [OrderController::class, 'notifyCustomer'])
        ->whereNumber('id')
        ->name('notify-customer');
});

// ─────────────────────────────────────────────────────────────────────
// [F] مدير التوصيل + السائق — delivery_manager | driver
// ─────────────────────────────────────────────────────────────────────
Route::middleware('auth:sanctum')->prefix('delivery')->name('delivery.')->group(function () {

    // ══ Static routes أولاً (قبل {id} حتماً) ══════════════════════════

    // GET /api/delivery
    Route::get('/', [DeliveryController::class, 'index'])
        ->name('index');

    // GET /api/delivery/active
    Route::get('active', [DeliveryController::class, 'active'])
        ->name('active');

    // GET /api/delivery/assigned
    Route::get('assigned', [DeliveryController::class, 'assigned'])
        ->name('assigned');

    // GET /api/delivery/stats
    Route::get('stats', [DeliveryController::class, 'stats'])
        ->name('stats');

    // ↓↓ الإصلاح 4 ── نُقلت للأعلى قبل {id} ↓↓
    // GET /api/delivery/settings
    Route::get('settings', [DeliveryController::class, 'settings'])
        ->name('settings');
    // GET /api/delivery/drivers — قائمة السائقين (لمدير التوصيل)
    Route::get('drivers', [DeliveryController::class, 'getDrivers'])
        ->name('drivers');
    // PUT /api/delivery/settings
    Route::put('settings', [DeliveryController::class, 'updateSettings'])
        ->name('settings.update');

    // GET /api/delivery/driver/{id}/ratings
    Route::get('driver/{id}/ratings', [DeliveryController::class, 'driverRatings'])
        ->name('driver-ratings');

    // GET /api/delivery/driver/{id}/stats
    Route::get('driver/{id}/stats', [DeliveryController::class, 'driverStats'])
        ->name('driver-stats');

    // ══ Dynamic {id} routes أخيراً دائماً ═════════════════════════════

    // GET /api/delivery/{id}
    Route::get('{id}', [DeliveryController::class, 'show'])
        ->name('show');

    // PUT /api/delivery/{id}/assign
    Route::put('{id}/assign', [DeliveryController::class, 'assignDriver'])
        ->name('assign');

    // PUT /api/delivery/{id}/status
    Route::put('{id}/status', [DeliveryController::class, 'changeStatus'])
        ->name('change-status');

    // POST /api/delivery/{id}/notify-customer
    Route::post('{id}/notify-customer', [DeliveryController::class, 'notifyCustomer'])
        ->name('notify-customer');
});
// ─────────────────────────────────────────────────────────────────────
// [G] مدير المخزون والعروض — inventory_manager
// ─────────────────────────────────────────────────────────────────────
Route::middleware('auth:sanctum')->group(function () {

    // ── المنتجات ─────────────────────────────────────────────────────
    Route::prefix('products')->name('products.')->group(function () {

        // GET  /api/products — قائمة كل المنتجات (نشطة وغير نشطة)
        Route::get('/', [ProductController::class, 'index'])
            ->name('index');

        // GET  /api/products/low-stock — مخزون منخفض
        Route::get('low-stock', [ProductController::class, 'lowStock'])
            ->name('low-stock');

        // GET  /api/products/out-of-stock — نفد المخزون
        Route::get('out-of-stock', [ProductController::class, 'outOfStock'])
            ->name('out-of-stock');

        // GET  /api/products/stats — إحصائيات المنتجات
        Route::get('stats', [ProductController::class, 'stats'])
            ->name('stats');

        // GET  /api/products/{id}
        Route::get('{id}', [ProductController::class, 'show'])
            ->name('show');

        // POST /api/products — إضافة منتج جديد
        Route::post('/', [ProductController::class, 'store'])
            ->name('store');

        // POST /api/products/{id}/image — رفع صورة المنتج
        Route::post('{id}/image', [UploadController::class, 'uploadProductImage'])
            ->name('image');

        // PUT  /api/products/{id}
        Route::put('{id}', [ProductController::class, 'update'])
            ->name('update');

        // PATCH /api/products/{id}/price — تعديل السعر فقط
        Route::patch('{id}/price', [ProductController::class, 'updatePrice'])
            ->name('update-price');

        // PATCH /api/products/{id}/loyalty-price — تعديل سعر النقاط
        Route::patch('{id}/loyalty-price', [ProductController::class, 'updateLoyaltyPrice'])
            ->name('update-loyalty-price');

        // PATCH /api/products/{id}/stock — تعديل المخزون
        Route::patch('{id}/stock', [ProductController::class, 'updateStock'])
            ->name('update-stock');

        // PATCH /api/products/{id}/toggle — تفعيل/تعطيل
        Route::patch('{id}/toggle', [ProductController::class, 'toggle'])
            ->name('toggle');

        // DELETE /api/products/{id}
        Route::delete('{id}', [ProductController::class, 'destroy'])
            ->name('destroy');
    });

    // ── العروض ──────────────────────────────────────────────────────
    Route::prefix('offers')->name('offers.')->group(function () {

        // GET  /api/offers — كل العروض
        Route::get('/', [OfferController::class, 'index'])
            ->name('index');

        // GET  /api/offers/active — النشطة فعلياً
        Route::get('active', [OfferController::class, 'active'])
            ->name('active');

        // GET  /api/offers/expired — المنتهية
        Route::get('expired', [OfferController::class, 'expired'])
            ->name('expired');

        // GET  /api/offers/upcoming — المستقبلية
        Route::get('upcoming', [OfferController::class, 'upcoming'])
            ->name('upcoming');

        // GET  /api/offers/{id}
        Route::get('{id}', [OfferController::class, 'show'])
            ->name('show');

        // POST /api/offers — إنشاء عرض
        Route::post('/', [OfferController::class, 'store'])
            ->name('store');

        // POST /api/offers/{id}/image — رفع صورة العرض
        Route::post('{id}/image', [UploadController::class, 'uploadOfferImage'])
            ->name('image');

        // PUT  /api/offers/{id}
        Route::put('{id}', [OfferController::class, 'update'])
            ->name('update');

        // PATCH /api/offers/{id}/loyalty-price — سعر بالنقاط
        Route::patch('{id}/loyalty-price', [OfferController::class, 'updateLoyaltyPrice'])
            ->name('update-loyalty-price');

        // PATCH /api/offers/{id}/toggle — تفعيل/إيقاف
        Route::patch('{id}/toggle', [OfferController::class, 'toggle'])
            ->name('toggle');

        // POST /api/offers/{id}/products — إضافة منتج للعرض
        Route::post('{id}/products', [OfferController::class, 'addProduct'])
            ->name('add-product');

        // DELETE /api/offers/{id}/products/{productId} — حذف منتج من العرض
        Route::delete('{id}/products/{productId}', [OfferController::class, 'removeProduct'])
            ->name('remove-product');

        // POST /api/offers/{id}/broadcast — إشعار كل الزبائن
        Route::post('{id}/broadcast', [OfferController::class, 'broadcast'])
            ->name('broadcast');

        // DELETE /api/offers/{id}
        Route::delete('{id}', [OfferController::class, 'destroy'])
            ->name('destroy');
    });
});

// ─────────────────────────────────────────────────────────────────────
// [H] المدير المالي — finance_manager
// ─────────────────────────────────────────────────────────────────────
Route::middleware('auth:sanctum')->prefix('finance')->name('finance.')->group(function () {

    // ── حسابات الدفع ─────────────────────────────────────────────
    Route::prefix('accounts')->name('accounts.')->group(function () {

        // GET  /api/finance/accounts
        Route::get('/', [PaymentController::class, 'accountsIndex'])
            ->name('index');

        // GET  /api/finance/accounts/summary — ملخص مُجمَّع حسب النوع
        Route::get('summary', [PaymentController::class, 'accountsSummary'])
            ->name('summary');

        // GET  /api/finance/accounts/{id}
        Route::get('{id}', [PaymentController::class, 'accountShow'])
            ->name('show');

        // POST /api/finance/accounts — إضافة حساب
        Route::post('/', [PaymentController::class, 'accountStore'])
            ->name('store');

        // PUT  /api/finance/accounts/{id}
        Route::put('{id}', [PaymentController::class, 'accountUpdate'])
            ->name('update');

        // PATCH /api/finance/accounts/{id}/balance — تحديث الرصيد
        Route::patch('{id}/balance', [PaymentController::class, 'updateBalance'])
            ->name('update-balance');

        // PATCH /api/finance/accounts/{id}/primary — جعله الأساسي
        Route::patch('{id}/primary', [PaymentController::class, 'makePrimary'])
            ->name('make-primary');

        // POST  /api/finance/accounts/{id}/withdraw — سحب
        Route::post('{id}/withdraw', [PaymentController::class, 'withdraw'])
            ->name('withdraw');

        // DELETE /api/finance/accounts/{id}
        Route::delete('{id}', [PaymentController::class, 'accountDestroy'])
            ->name('destroy');
    });

    // ── سجلات المدفوعات ───────────────────────────────────────────
    Route::prefix('payments')->name('payments.')->group(function () {

        // GET /api/finance/payments — كل المدفوعات
        Route::get('/', [PaymentController::class, 'paymentsIndex'])
            ->name('index');

        // GET /api/finance/payments/stats — إحصائيات مالية
        Route::get('stats', [PaymentController::class, 'stats'])
            ->name('stats');

        // GET /api/finance/payments/{id}
        Route::get('{id}', [PaymentController::class, 'paymentShow'])
            ->name('show');

        // POST /api/finance/payments/{id}/refund — استرداد
        Route::post('{id}/refund', [PaymentController::class, 'refund'])
            ->name('refund');
    });

    // ── التقارير المالية ──────────────────────────────────────────
    // GET /api/finance/report — توليد تقرير مالي
    Route::get('report', [PaymentController::class, 'generateReport'])
        ->name('report');
});

// ─────────────────────────────────────────────────────────────────────
// [I] مدير التواصل — communication_manager
// ─────────────────────────────────────────────────────────────────────
Route::middleware('auth:sanctum')->prefix('communication')->name('communication.')->group(function () {

    // ── معلومات المطعم (تعديل قسم عن المطعم) ────────────────────
    Route::prefix('restaurant')->name('restaurant.')->group(function () {

        // GET  /api/communication/restaurant
        Route::get('/', [RestaurantController::class, 'commShow'])
            ->name('show');

        // PUT  /api/communication/restaurant — تعديل معلومات الاتصال
        Route::put('/', [RestaurantController::class, 'updateContactInfo'])
            ->name('update');
    });

    // ── صور المطعم ───────────────────────────────────────────────
    Route::prefix('images')->name('images.')->group(function () {

        // GET    /api/communication/images
        Route::get('/', [RestaurantController::class, 'imagesIndex'])
            ->name('index');

        // POST   /api/communication/images — رفع صورة جديدة
        Route::post('/', [UploadController::class, 'uploadRestaurantImage'])
            ->name('store');

        // PUT    /api/communication/images/{id}
        Route::put('{id}', [RestaurantController::class, 'imageUpdate'])
            ->name('update');

        // PATCH  /api/communication/images/{id}/order — ترتيب الصور
        Route::patch('{id}/order', [RestaurantController::class, 'imageReorder'])
            ->name('reorder');

        // PATCH  /api/communication/images/{id}/toggle
        Route::patch('{id}/toggle', [RestaurantController::class, 'imageToggle'])
            ->name('toggle');

        // DELETE /api/communication/images/{id}
        Route::delete('{id}', [RestaurantController::class, 'imageDestroy'])
            ->name('destroy');
    });

    // ── اقتراحات الوجبات ─────────────────────────────────────────
    Route::prefix('meal-suggestions')->name('meal-suggestions.')->group(function () {

        // GET  /api/communication/meal-suggestions
        Route::get('/', [MealSuggestionController::class, 'index'])
            ->name('index');

        // GET  /api/communication/meal-suggestions/stats
        Route::get('stats', [MealSuggestionController::class, 'stats'])
            ->name('stats');

        // GET  /api/communication/meal-suggestions/{id}
        Route::get('{id}', [MealSuggestionController::class, 'show'])
            ->name('show');

        // PUT  /api/communication/meal-suggestions/{id}/review
        Route::put('{id}/review', [MealSuggestionController::class, 'review'])
            ->name('review');

        // PUT  /api/communication/meal-suggestions/{id}/implement
        Route::put('{id}/implement', [MealSuggestionController::class, 'markImplemented'])
            ->name('implement');

        // PUT  /api/communication/meal-suggestions/{id}/reject
        Route::put('{id}/reject', [MealSuggestionController::class, 'reject'])
            ->name('reject');
    });

    // ── تقارير الذكاء الاصطناعي ──────────────────────────────────
    Route::prefix('ai-reports')->name('ai-reports.')->group(function () {

        // GET  /api/communication/ai-reports — تقارير AI الواردة
        Route::get('/', [ReportController::class, 'aiReportsIndex'])
            ->name('index');

        // POST /api/communication/ai-reports/{id}/forward — إحالة للمدير العام
        Route::post('{id}/forward', [ReportController::class, 'forwardToGM'])
            ->name('forward');
    });
});

// ─────────────────────────────────────────────────────────────────────
// [J] الولاء — loyalty
// ─────────────────────────────────────────────────────────────────────
Route::middleware('auth:sanctum')->prefix('loyalty')->name('loyalty.')->group(function () {

    // GET /api/loyalty — قائمة حسابات الولاء (للمدير العام)
    Route::get('/', [LoyaltyController::class, 'index'])
        ->name('index');

    // GET /api/loyalty/stats — إحصائيات نظام الولاء
    Route::get('stats', [LoyaltyController::class, 'stats'])
        ->name('stats');

    // PUT /api/loyalty/settings — معاملات المستويات (للمدير العام فقط)
    Route::put('settings', [LoyaltyController::class, 'updateSettings'])
        ->name('settings.update');

    // GET /api/loyalty/{customerId} — حساب زبون محدد
    Route::get('{customerId}', [LoyaltyController::class, 'show'])
        ->name('show');

    // GET /api/loyalty/{customerId}/transactions — حركة النقاط
    Route::get('{customerId}/transactions', [LoyaltyController::class, 'transactions'])
        ->name('transactions');

    // POST /api/loyalty/{customerId}/adjust — تعديل يدوي للنقاط
    Route::post('{customerId}/adjust', [LoyaltyController::class, 'adjust'])
        ->name('adjust');
});

// ─────────────────────────────────────────────────────────────────────
// [K] الذكاء الاصطناعي — AI
// ─────────────────────────────────────────────────────────────────────
Route::middleware('auth:sanctum')->prefix('ai')->name('ai.')->group(function () {

    // GET  /api/ai/conversations — سجل المحادثات (للمدير)
    Route::get('conversations', [AIController::class, 'conversations'])
        ->name('conversations');

    // GET  /api/ai/conversations/stats
    Route::get('conversations/stats', [AIController::class, 'conversationStats'])
        ->name('conversation-stats');

    // POST /api/ai/generate-report — توليد التقرير اليومي يدوياً
    Route::post('generate-report', [AIController::class, 'generateDailyReport'])
        ->name('generate-report');
});

// ─────────────────────────────────────────────────────────────────────
// [L] التقييمات — reviews
// ─────────────────────────────────────────────────────────────────────
Route::middleware('auth:sanctum')->prefix('reviews')->name('reviews.')->group(function () {

    // GET /api/reviews/drivers — تقييمات السائقين
    Route::get('drivers', [ReviewController::class, 'driverReviews'])
        ->name('drivers');

    // GET /api/reviews/employees — تقييمات الموظفين
    Route::get('employees', [ReviewController::class, 'employeeReviews'])
        ->name('employees');

    // GET /api/reviews/driver/{id}/summary — ملخص تقييمات سائق
    Route::get('driver/{id}/summary', [ReviewController::class, 'driverSummary'])
        ->name('driver-summary');
});
// GET /api/reviews/customers — تقييمات الزبائن للمنتجات
Route::get('reviews/customers', [ReviewController::class, 'customerProductReviews'])
    ->middleware('auth:sanctum')
    ->name('reviews.customers');
// ─────────────────────────────────────────────────────────────────────
// [M] رفع الملفات — uploads (مشترك)
// ─────────────────────────────────────────────────────────────────────
Route::middleware('auth:sanctum')->prefix('upload')->name('upload.')->group(function () {

    // POST /api/upload/image — رفع صورة عامة
    Route::post('image', [UploadController::class, 'uploadImage'])
        ->name('image');

    // DELETE /api/upload/{path} — حذف ملف
    Route::delete('{path}', [UploadController::class, 'deleteFile'])
        ->name('delete')
        ->where('path', '.*');
});

// ─────────────────────────────────────────────────────────────────────
// [N] مسارات الزبائن المشتركة (تطبيق الموبايل/الويب)
// ─────────────────────────────────────────────────────────────────────
// تستخدمها واجهتا الزبون، بينما تعتمد لوحة الموظفين على مجموعات المسارات الإدارية.

Route::prefix('customer')->name('customer.')->group(function () {

    // ── مصادقة الزبون ────────────────────────────────────────────
    Route::prefix('auth')->name('auth.')->group(function () {
        Route::post('register', [CustomerAuthController::class, 'register'])->name('register');
        Route::post('login', [CustomerAuthController::class, 'login'])
            ->middleware('throttle:customer-login')->name('login');
        Route::post('forgot-password', [CustomerAuthController::class, 'forgotPassword'])
            ->middleware('throttle:customer-password-email')->name('forgot-password');
        Route::post('reset-password', [CustomerAuthController::class, 'resetPassword'])
            ->middleware('throttle:customer-password-reset')->name('reset-password');
        Route::post('logout', [CustomerAuthController::class, 'logout'])
            ->middleware('auth:sanctum')->name('logout');
    });

    // ── مسارات الزبون المحمية ─────────────────────────────────────
    Route::middleware('auth:sanctum')->group(function () {

        // الملف الشخصي
        Route::get('profile', [CustomerController::class, 'profile'])->name('profile');
        Route::put('profile', [CustomerController::class, 'updateProfile'])->name('profile.update');
        Route::post('avatar', [UploadController::class, 'uploadCustomerAvatar'])->name('avatar');

        // العناوين المحفوظة المشتركة بين الويب وتطبيق الموبايل
        Route::get('saved-addresses', [CustomerSavedAddressController::class, 'index'])->name('saved-addresses.index');
        Route::put('saved-addresses', [CustomerSavedAddressController::class, 'sync'])->name('saved-addresses.sync');
        Route::put('saved-addresses/{type}', [CustomerSavedAddressController::class, 'update'])
            ->whereIn('type', ['home', 'work', 'other'])->name('saved-addresses.update');
        Route::delete('saved-addresses/{type}', [CustomerSavedAddressController::class, 'destroy'])
            ->whereIn('type', ['home', 'work', 'other'])->name('saved-addresses.destroy');

        // الطلبات
        Route::get('orders', [OrderController::class, 'customerOrders'])->name('orders');
        Route::post('orders', [OrderController::class, 'customerStore'])->name('orders.store');
        Route::get('orders/{id}', [OrderController::class, 'customerShow'])->name('orders.show');
        Route::delete('orders/{id}', [OrderController::class, 'customerCancel'])->name('orders.cancel');

        // الولاء
        Route::get('loyalty', [LoyaltyController::class, 'customerAccount'])->name('loyalty');

        // الإشعارات
        Route::get('notifications', [NotificationController::class, 'customerIndex'])->name('notifications');
        Route::put('notifications/read-all', [NotificationController::class, 'customerMarkAllRead'])->name('notifications.read-all');
        Route::put('notifications/{id}/read', [NotificationController::class, 'markRead'])->whereNumber('id')->name('notifications.read');

        // إبلاغ مدير المخزون عن وجبة غير متوفرة
        Route::post('products/{id}/report-unavailable', [ProductController::class, 'reportUnavailable'])
            ->whereNumber('id')->name('products.report-unavailable');

        // الدفع
        Route::post('orders/{id}/pay', [PaymentController::class, 'customerPay'])->name('pay');

        // تقييم السائق
        Route::post('delivery/{id}/rate', [ReviewController::class, 'customerRateDriver'])->name('rate-driver');
        Route::post('orders/{orderId}/products/{productId}/rate', [ReviewController::class, 'customerRateProduct'])->name('rate-product');

        // اقتراح وجبة
        Route::post('meal-suggestion', [MealSuggestionController::class, 'store'])->name('meal-suggestion');

        // الذكاء الاصطناعي
        Route::post('ai/chat', [AIController::class, 'chat'])->name('ai.chat');
        Route::get('ai/history', [AIController::class, 'customerHistory'])->name('ai.history');
    });
});

// ─────────────────────────────────────────────────────────────────────
// [O] Health Check — للتأكد من أن الـ API يعمل
// ─────────────────────────────────────────────────────────────────────
Route::get('health', function () {
    try {
        DB::connection()->getPdo();
        $database = 'connected';
        $status = 'ok';
        $code = 200;
    } catch (Throwable) {
        $database = 'disconnected';
        $status = 'degraded';
        $code = 503;
    }

    return response()->json([
        'status' => $status,
        'app' => config('app.name'),
        'version' => '1.0.0',
        'timestamp' => now()->toISOString(),
        'database' => $database,
    ], $code);
})->name('health');
