<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use Illuminate\Http\Request;

class BaseController extends Controller
{
    // ─────────────────────────────────────────────
    // استجابة ناجحة
    // ─────────────────────────────────────────────
    protected function success(
        mixed $data = null,
        string $message = 'تمت العملية بنجاح',
        int $code = 200
    ) {
        $response = [
            'success' => true,
            'message' => $message,
        ];

        if (! is_null($data)) {
            $response['data'] = $data;
        }

        return response()->json($response, $code);
    }

    // ─────────────────────────────────────────────
    // استجابة خطأ
    // ─────────────────────────────────────────────
    protected function error(
        string $message = 'حدث خطأ',
        int $code = 400,
        mixed $errors = null
    ) {
        $response = [
            'success' => false,
            'message' => $message,
        ];

        if (! is_null($errors)) {
            $response['errors'] = $errors;
        }

        return response()->json($response, $code);
    }

    // ─────────────────────────────────────────────
    // استجابة Validation
    // ─────────────────────────────────────────────
    protected function validationError(array $errors)
    {
        $firstMessage = collect($errors)->flatten()->first() ?: 'بيانات غير صحيحة';

        return response()->json([
            'success' => false,
            'message' => $firstMessage,
            'errors' => $errors,
        ], 422);
    }

    // ─────────────────────────────────────────────
    // غير مصرح
    // ─────────────────────────────────────────────
    protected function unauthorized(string $message = 'غير مصرح')
    {
        return response()->json([
            'success' => false,
            'message' => $message,
        ], 403);
    }

    // ─────────────────────────────────────────────
    // غير موجود
    // ─────────────────────────────────────────────
    protected function notFound(string $message = 'العنصر غير موجود')
    {
        return response()->json([
            'success' => false,
            'message' => $message,
        ], 404);
    }

    // ─────────────────────────────────────────────
    // التحقق من الدور
    // ─────────────────────────────────────────────
    protected function requireRole(
        Employee $employee,
        string|array $roles
    ): bool {
        $roles = (array) $roles;

        return in_array($employee->role, $roles);
    }

    // ─────────────────────────────────────────────
    // التحقق من الصلاحية
    // ─────────────────────────────────────────────
    protected function requireAbility(
        Request $request,
        string $ability
    ): bool {
        return $request->user()?->tokenCan($ability) ?? false;
    }
}
