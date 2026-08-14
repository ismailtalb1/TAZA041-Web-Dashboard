<?php

namespace App\Http\Controllers\API;

use App\Models\Customer;
use App\Models\Employee;
use App\Models\Notification;
use App\Models\Offer;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

class NotificationController extends BaseController
{
    // ─────────────────────────────────────────────
    // مساعدات
    // ─────────────────────────────────────────────
    private function getCurrentEmployee(Request $request): ?Employee
    {
        $user = $request->user();

        return $user instanceof Employee ? $user : null;
    }

    private function getCurrentCustomer(Request $request): ?Customer
    {
        $user = $request->user();

        return $user instanceof Customer ? $user : null;
    }

    // ═══════════════════════════════════════════════
    // إشعارات الموظفين
    // ═══════════════════════════════════════════════

    // ─────────────────────────────────────────────
    // GET /api/employee/notifications
    // ─────────────────────────────────────────────
    public function employeeIndex(Request $request)
    {
        $employee = $this->getCurrentEmployee($request);
        if (! $employee) {
            return $this->unauthorized();
        }

        $query = Notification::forEmployee($employee->id)
            ->latest();

        // فلترة حسب الحالة
        if ($request->filled('status')) {
            match ($request->status) {
                'unread' => $query->unread(),
                'read' => $query->read(),
                default => null,
            };
        }

        // فلترة حسب النوع
        if ($request->filled('type')) {
            $query->byType($request->type);
        }

        // فلترة حسب التاريخ
        if ($request->filled('from_date')) {
            $query->whereDate('created_at', '>=', $request->from_date);
        }

        $notifications = $query->take(50)->get();

        return $this->success([
            'unread_count' => Notification::unreadCountForEmployee($employee->id),
            'total' => $notifications->count(),
            'type_icons' => Notification::TYPE_ICONS,
            'notifications' => $notifications->map->getDetails()->values(),
        ]);
    }

    // ─────────────────────────────────────────────
    // GET /api/employee/notifications/unread-count
    // ─────────────────────────────────────────────
    public function employeeUnreadCount(Request $request)
    {
        $employee = $this->getCurrentEmployee($request);
        if (! $employee) {
            return $this->unauthorized();
        }

        $count = Notification::unreadCountForEmployee($employee->id);

        // تفصيل الإشعارات غير المقروءة حسب النوع
        $byType = Notification::forEmployee($employee->id)
            ->unread()
            ->get()
            ->groupBy('type')
            ->map(fn ($group, $type) => [
                'type' => $type,
                'icon' => Notification::TYPE_ICONS[$type] ?? '🔔',
                'count' => $group->count(),
            ])
            ->values();

        return $this->success([
            'unread_count' => $count,
            'by_type' => $byType,
            'has_unread' => $count > 0,
        ]);
    }

    // ─────────────────────────────────────────────
    // PUT /api/employee/notifications/{id}/read
    // ─────────────────────────────────────────────
    public function markRead(Request $request, int $id)
    {
        $user = $request->user();

        // يعمل للموظف والزبون
        if ($user instanceof Employee) {
            $notification = Notification::forEmployee($user->id)->find($id);
        } elseif ($user instanceof Customer) {
            $notification = Notification::forCustomer($user->id)->find($id);
        } else {
            return $this->unauthorized();
        }

        if (! $notification) {
            return $this->notFound('الإشعار غير موجود');
        }

        $notification->markAsRead();

        return $this->success([
            'notification' => $notification->getDetails(),
        ], 'تم تعيين الإشعار كمقروء');
    }

    // ─────────────────────────────────────────────
    // PUT /api/employee/notifications/read-all
    // ─────────────────────────────────────────────
    public function employeeMarkAllRead(Request $request)
    {
        $employee = $this->getCurrentEmployee($request);
        if (! $employee) {
            return $this->unauthorized();
        }

        Notification::markAllReadForEmployee($employee->id);

        return $this->success([
            'unread_count' => 0,
        ], 'تم تعيين كل الإشعارات كمقروءة');
    }

    // ═══════════════════════════════════════════════
    // إشعارات الزبائن
    // ═══════════════════════════════════════════════

    // ─────────────────────────────────────────────
    // GET /api/customer/notifications
    // ─────────────────────────────────────────────
    public function customerIndex(Request $request)
    {
        $customer = $this->getCurrentCustomer($request);
        if (! $customer) {
            return $this->unauthorized('هذا المسار للزبائن فقط');
        }

        $this->syncCurrentOfferNotifications($customer);

        $query = Notification::forCustomer($customer->id)->latest();

        // فلترة
        if ($request->filled('status')) {
            match ($request->status) {
                'unread' => $query->unread(),
                'read' => $query->read(),
                default => null,
            };
        }

        if ($request->filled('type')) {
            $query->byType($request->type);
        }

        $notifications = $this->visibleCatalogNotifications($query->get());
        $unreadCount = $this->visibleCatalogNotifications(
            Notification::forCustomer($customer->id)->unread()->get()
        )->count();
        $total = $notifications->count();
        $notifications = $notifications->take(50)->values();

        return $this->success([
            'unread_count' => $unreadCount,
            'total' => $total,
            'type_icons' => Notification::TYPE_ICONS,
            'notifications' => $notifications->map->getDetails()->values(),
        ]);
    }

    private function visibleCatalogNotifications(Collection $notifications): Collection
    {
        $offerIds = $notifications
            ->where('type', Notification::TYPE_NEW_OFFER)
            ->map(fn (Notification $notification) => (int) ($notification->data['offer_id'] ?? 0))
            ->filter()
            ->unique();
        $productIds = $notifications
            ->where('type', Notification::TYPE_NEW_PRODUCT)
            ->map(fn (Notification $notification) => (int) ($notification->data['product_id'] ?? 0))
            ->filter()
            ->unique();

        $activeOfferIds = Offer::currentlyActive()
            ->whereIn('id', $offerIds)
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();
        $availableProductIds = Product::available()
            ->whereIn('id', $productIds)
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();

        return $notifications->filter(function (Notification $notification) use ($activeOfferIds, $availableProductIds) {
            if ($notification->type === Notification::TYPE_NEW_OFFER) {
                return in_array((int) ($notification->data['offer_id'] ?? 0), $activeOfferIds, true);
            }
            if ($notification->type === Notification::TYPE_NEW_PRODUCT) {
                return in_array((int) ($notification->data['product_id'] ?? 0), $availableProductIds, true);
            }

            return true;
        })->values();
    }

    private function syncCurrentOfferNotifications(Customer $customer): void
    {
        $knownOfferIds = Notification::forCustomer($customer->id)
            ->byType(Notification::TYPE_NEW_OFFER)
            ->get(['data'])
            ->map(fn (Notification $notification) => (int) ($notification->data['offer_id'] ?? 0))
            ->filter()
            ->unique();

        Offer::currentlyActive()
            ->whereNotIn('id', $knownOfferIds)
            ->get()
            ->each(function (Offer $offer) use ($customer) {
                Notification::create([
                    'sender_type' => Notification::SENDER_SYSTEM,
                    'sender_id' => null,
                    'receiver_type' => Notification::RECEIVER_CUSTOMER,
                    'receiver_id' => $customer->id,
                    'type' => Notification::TYPE_NEW_OFFER,
                    'title' => 'عرض متاح الآن! 🎯',
                    'message' => "{$offer->name} متاح الآن بسعر ".
                        number_format($offer->offer_price, 0).' ل.س',
                    'data' => [
                        'offer_id' => $offer->id,
                        'offer_name' => $offer->name,
                        'offer_price' => $offer->offer_price,
                        'original_price' => $offer->original_price,
                        'discount_percentage' => $offer->getDiscountPercentage(),
                        'image_url' => $offer->image_path
                            ? asset('storage/'.$offer->image_path)
                            : null,
                        'end_date' => $offer->end_date?->toIso8601String(),
                    ],
                    'status' => Notification::STATUS_SENT,
                ]);
            });
    }

    // ─────────────────────────────────────────────
    // PUT /api/customer/notifications/read-all
    // ─────────────────────────────────────────────
    public function customerMarkAllRead(Request $request)
    {
        $customer = $this->getCurrentCustomer($request);
        if (! $customer) {
            return $this->unauthorized();
        }

        Notification::markAllReadForCustomer($customer->id);

        return $this->success([
            'unread_count' => 0,
        ], 'تم تعيين كل الإشعارات كمقروءة');
    }
}
