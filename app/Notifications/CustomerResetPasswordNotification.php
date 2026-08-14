<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class CustomerResetPasswordNotification extends Notification
{
    use Queueable;

    public function __construct(private readonly string $token) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $expiration = (int) config('auth.passwords.customers.expire', 15);
        $query = http_build_query([
            'token' => $this->token,
            'email' => $notifiable->getEmailForPasswordReset(),
        ], '', '&', PHP_QUERY_RFC3986);
        // يوضع الرمز في URL fragment كي لا يُرسل إلى الخادم أو يظهر في سجلات الطلبات.
        $url = rtrim((string) config('app.url'), '/').'/frontend/reset-password.html#'.$query;

        return (new MailMessage)
            ->subject('TAZA041 - استعادة كلمة المرور')
            ->greeting('مرحباً '.$notifiable->name.'،')
            ->line('تلقّينا طلباً لتغيير كلمة المرور الخاصة بحسابك في TAZA041.')
            ->action('تعيين كلمة مرور جديدة', $url)
            ->line("هذا الرابط صالح لمدة {$expiration} دقيقة فقط، ولا يمكن استخدامه أكثر من مرة.")
            ->line('إذا لم تطلب تغيير كلمة المرور، فتجاهل هذه الرسالة ولن يطرأ أي تغيير على حسابك.')
            ->salutation('فريق TAZA041');
    }
}
