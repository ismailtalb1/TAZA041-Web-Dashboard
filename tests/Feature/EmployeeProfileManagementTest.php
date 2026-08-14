<?php

namespace Tests\Feature;

use App\Models\Employee;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class EmployeeProfileManagementTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    public function test_every_employee_can_update_profile_password_and_avatar(): void
    {
        Storage::fake('public');

        $login = $this->postJson('/api/auth/employee/login', [
            'username' => 'order_mgr',
            'password' => 'Staff@041',
        ])->assertOk();

        $token = $login->json('data.token');

        $this->withToken($token)
            ->putJson('/api/auth/employee/profile', [
                'name' => 'مدير الطلبات المحدّث',
                'email' => 'orders.updated@example.test',
                'phone' => '+963900000041',
                'current_password' => 'wrong-password',
                'new_password' => 'NewPass@041',
                'new_password_confirmation' => 'NewPass@041',
            ])
            ->assertStatus(422)
            ->assertJsonPath('success', false);

        $employee = Employee::where('username', 'order_mgr')->firstOrFail();
        $this->assertSame('مدير الطلبات', $employee->name);
        $this->assertTrue(Hash::check('Staff@041', $employee->password_hash));

        $this->withToken($token)
            ->putJson('/api/auth/employee/profile', [
                'name' => 'مدير الطلبات المحدّث',
                'email' => 'orders.updated@example.test',
                'phone' => '+963900000041',
                'current_password' => 'Staff@041',
                'new_password' => 'NewPass@041',
                'new_password_confirmation' => 'NewPass@041',
            ])
            ->assertOk()
            ->assertJsonPath('data.employee.name', 'مدير الطلبات المحدّث')
            ->assertJsonPath('data.employee.email', 'orders.updated@example.test')
            ->assertJsonPath('data.employee.phone', '+963900000041');

        $employee->refresh();
        $this->assertTrue(Hash::check('NewPass@041', $employee->password_hash));

        $upload = $this->withToken($token)
            ->post('/api/auth/employee/avatar', [
                'image' => $this->fakePng('profile.png'),
                'current_password' => 'NewPass@041',
            ], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('data.employee.id', $employee->id);

        $avatarPath = $upload->json('data.avatar_path');
        Storage::disk('public')->assertExists($avatarPath);

        $this->withToken($token)
            ->deleteJson('/api/auth/employee/avatar', [
                'current_password' => 'NewPass@041',
            ])
            ->assertOk()
            ->assertJsonPath('data.employee.avatar', null);

        Storage::disk('public')->assertMissing($avatarPath);
    }

    public function test_owner_password_is_required_for_every_sensitive_profile_change(): void
    {
        $login = $this->postJson('/api/auth/employee/login', [
            'username' => 'inventory_mgr',
            'password' => 'Staff@041',
        ])->assertOk();
        $token = $login->json('data.token');
        $employee = Employee::where('username', 'inventory_mgr')->firstOrFail();
        $originalName = $employee->name;

        $this->withToken($token)
            ->putJson('/api/auth/employee/profile', [
                'name' => 'اسم غير مصرح',
            ])
            ->assertStatus(422)
            ->assertJsonPath('success', false);

        $this->withToken($token)
            ->putJson('/api/auth/employee/profile', [
                'name' => 'اسم غير مصرح',
                'current_password' => 'wrong-password',
            ])
            ->assertStatus(422)
            ->assertJsonPath('success', false);

        $this->assertSame($originalName, $employee->fresh()->name);

        $this->withToken($token)
            ->putJson('/api/auth/employee/profile', [
                'name' => 'مدير المخزون الآمن',
                'current_password' => 'Staff@041',
            ])
            ->assertOk()
            ->assertJsonPath('data.employee.name', 'مدير المخزون الآمن');
    }

    public function test_general_manager_can_fully_edit_an_employee_and_manage_their_avatar(): void
    {
        Storage::fake('public');

        $login = $this->postJson('/api/auth/employee/login', [
            'username' => 'admin',
            'password' => 'Admin@041',
        ])->assertOk();
        $token = $login->json('data.token');

        $employee = Employee::where('username', 'finance_mgr')->firstOrFail();

        $this->withToken($token)
            ->putJson('/api/admin/employees/'.$employee->id, [
                'name' => 'مدير المالية الجديد',
                'username' => 'finance.manager',
                'email' => 'finance.manager@example.test',
                'phone' => '+963911111111',
                'password' => 'ManagedPass@041',
                'role' => Employee::ROLE_FINANCE_MANAGER,
                'is_active' => false,
                'manager_password' => 'Admin@041',
            ])
            ->assertOk()
            ->assertJsonPath('data.employee.name', 'مدير المالية الجديد')
            ->assertJsonPath('data.employee.username', 'finance.manager')
            ->assertJsonPath('data.employee.is_active', false);

        $employee->refresh();
        $this->assertTrue(Hash::check('ManagedPass@041', $employee->password_hash));
        $this->assertFalse($employee->is_active);

        $upload = $this->withToken($token)
            ->post('/api/admin/employees/'.$employee->id.'/avatar', [
                'image' => $this->fakePng('managed-profile.png'),
                'manager_password' => 'Admin@041',
            ], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('data.employee.id', $employee->id);

        $avatarPath = $upload->json('data.avatar_path');
        Storage::disk('public')->assertExists($avatarPath);

        $this->withToken($token)
            ->deleteJson('/api/admin/employees/'.$employee->id.'/avatar', [
                'manager_password' => 'Admin@041',
            ])
            ->assertOk()
            ->assertJsonPath('data.employee.avatar', null);

        Storage::disk('public')->assertMissing($avatarPath);
    }

    public function test_general_manager_password_is_required_to_manage_an_employee(): void
    {
        $login = $this->postJson('/api/auth/employee/login', [
            'username' => 'admin',
            'password' => 'Admin@041',
        ])->assertOk();
        $token = $login->json('data.token');
        $employee = Employee::where('username', 'finance_mgr')->firstOrFail();
        $originalPhone = $employee->phone;

        $this->withToken($token)
            ->putJson('/api/admin/employees/'.$employee->id, [
                'phone' => '+963933333333',
            ])
            ->assertStatus(422);

        $this->withToken($token)
            ->putJson('/api/admin/employees/'.$employee->id, [
                'phone' => '+963933333333',
                'manager_password' => 'wrong-password',
            ])
            ->assertStatus(422);

        $this->assertSame($originalPhone, $employee->fresh()->phone);

        $this->withToken($token)
            ->putJson('/api/admin/employees/'.$employee->id, [
                'phone' => '+963933333333',
                'manager_password' => 'Admin@041',
            ])
            ->assertOk()
            ->assertJsonPath('data.employee.phone', '+963933333333');
    }

    private function fakePng(string $name): UploadedFile
    {
        $png = base64_decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
            true
        );

        return UploadedFile::fake()->createWithContent($name, $png);
    }
}
