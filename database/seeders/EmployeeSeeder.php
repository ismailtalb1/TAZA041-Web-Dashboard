<?php

namespace Database\Seeders;

use App\Models\Employee;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use RuntimeException;

class EmployeeSeeder extends Seeder
{
    public function run(): void
    {
        if (app()->isProduction()) {
            $password = (string) config('taza.initial_admin_password');
            $username = (string) config('taza.initial_admin_username', 'admin');

            if (mb_strlen($password) < 12) {
                throw new RuntimeException(
                    'INITIAL_ADMIN_PASSWORD must contain at least 12 characters before seeding production.'
                );
            }

            $demoPasswords = [
                'admin' => 'Admin@041',
                'order_mgr' => 'Staff@041',
                'delivery_mgr' => 'Staff@041',
                'finance_mgr' => 'Staff@041',
                'inventory_mgr' => 'Staff@041',
                'comm_mgr' => 'Staff@041',
                'driver' => 'Staff@041',
            ];

            Employee::whereIn('username', array_keys($demoPasswords))
                ->get()
                ->each(function (Employee $employee) use ($demoPasswords, $password, $username): void {
                    if (! Hash::check($demoPasswords[$employee->username], $employee->password_hash)) {
                        return;
                    }

                    if ($employee->username === $username
                        && $employee->role === Employee::ROLE_GENERAL_MANAGER) {
                        $employee->password_hash = Hash::make($password);
                        $employee->is_active = true;
                    } else {
                        $employee->password_hash = Hash::make(Str::random(64));
                        $employee->is_active = false;
                    }

                    $employee->save();
                    $employee->tokens()->delete();
                });

            Employee::firstOrCreate(['username' => $username], [
                'name' => 'المدير العام',
                'role' => Employee::ROLE_GENERAL_MANAGER,
                'password_hash' => Hash::make($password),
                'is_active' => true,
            ]);

            return;
        }

        $accounts = [
            ['name' => 'المدير العام', 'username' => 'admin', 'role' => Employee::ROLE_GENERAL_MANAGER],
            ['name' => 'مدير الطلبات', 'username' => 'order_mgr', 'role' => Employee::ROLE_ORDER_MANAGER],
            ['name' => 'مدير التوصيل', 'username' => 'delivery_mgr', 'role' => Employee::ROLE_DELIVERY_MANAGER],
            ['name' => 'مدير المالية', 'username' => 'finance_mgr', 'role' => Employee::ROLE_FINANCE_MANAGER],
            ['name' => 'مدير المخزون', 'username' => 'inventory_mgr', 'role' => Employee::ROLE_INVENTORY_MANAGER],
            ['name' => 'مدير التواصل', 'username' => 'comm_mgr', 'role' => Employee::ROLE_COMMUNICATION_MANAGER],
            ['name' => 'السائق', 'username' => 'driver', 'role' => Employee::ROLE_DRIVER],
        ];

        foreach ($accounts as $account) {
            Employee::firstOrCreate(
                ['username' => $account['username']],
                $account + [
                    'password_hash' => Hash::make(
                        $account['username'] === 'admin' ? 'Admin@041' : 'Staff@041'
                    ),
                    'email' => $account['username'].'@taza041.local',
                    'is_active' => true,
                ]
            );
        }
    }
}
