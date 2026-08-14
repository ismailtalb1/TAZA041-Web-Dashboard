<?php

namespace Tests\Feature;

use App\Models\Employee;
use Database\Seeders\EmployeeSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use RuntimeException;
use Tests\TestCase;

class SecurityHardeningTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    public function test_employee_login_is_rate_limited_by_identifier(): void
    {
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->postJson('/api/auth/employee/login', [
                'username' => 'admin',
                'password' => 'wrong-password',
            ])->assertUnauthorized();
        }

        $this->postJson('/api/auth/employee/login', [
            'username' => 'admin',
            'password' => 'wrong-password',
        ])->assertTooManyRequests();
    }

    public function test_customer_login_is_rate_limited_by_identifier(): void
    {
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->postJson('/api/customer/auth/login', [
                'identifier' => 'missing@example.test',
                'password' => 'wrong-password',
            ])->assertUnauthorized();
        }

        $this->postJson('/api/customer/auth/login', [
            'identifier' => 'missing@example.test',
            'password' => 'wrong-password',
        ])->assertTooManyRequests();
    }

    public function test_production_employee_seed_requires_a_strong_explicit_password(): void
    {
        $previousEnvironment = app()['env'];
        app()['env'] = 'production';
        config(['taza.initial_admin_password' => null]);

        try {
            (new EmployeeSeeder)->run();
            $this->fail('Production seeding should reject a missing initial password.');
        } catch (RuntimeException $exception) {
            $this->assertStringContainsString('INITIAL_ADMIN_PASSWORD', $exception->getMessage());
        } finally {
            app()['env'] = $previousEnvironment;
        }
    }

    public function test_production_employee_seed_creates_only_the_initial_manager(): void
    {
        Employee::query()->delete();
        $previousEnvironment = app()['env'];
        app()['env'] = 'production';
        config([
            'taza.initial_admin_username' => 'owner',
            'taza.initial_admin_password' => 'Unique-Initial-Password-041',
        ]);

        try {
            (new EmployeeSeeder)->run();
        } finally {
            app()['env'] = $previousEnvironment;
        }

        $this->assertDatabaseCount('employees', 1);
        $manager = Employee::where('username', 'owner')->firstOrFail();
        $this->assertSame(Employee::ROLE_GENERAL_MANAGER, $manager->role);
        $this->assertTrue(Hash::check('Unique-Initial-Password-041', $manager->password_hash));
    }

    public function test_production_seed_rotates_or_disables_unchanged_demo_credentials(): void
    {
        $previousEnvironment = app()['env'];
        app()['env'] = 'production';
        config([
            'taza.initial_admin_username' => 'admin',
            'taza.initial_admin_password' => 'Rotated-Production-Password-041',
        ]);

        try {
            (new EmployeeSeeder)->run();
        } finally {
            app()['env'] = $previousEnvironment;
        }

        $admin = Employee::where('username', 'admin')->firstOrFail();
        $staff = Employee::where('username', 'order_mgr')->firstOrFail();

        $this->assertTrue(Hash::check('Rotated-Production-Password-041', $admin->password_hash));
        $this->assertTrue($admin->is_active);
        $this->assertFalse(Hash::check('Staff@041', $staff->password_hash));
        $this->assertFalse($staff->is_active);
    }

    public function test_general_manager_dashboard_escapes_external_values_before_using_inner_html(): void
    {
        $dashboard = file_get_contents(public_path('dashboard/general-manager.html'));

        $this->assertIsString($dashboard);
        $this->assertStringContainsString('${escapeHtml(c.name ??', $dashboard);
        $this->assertStringContainsString('${escapeHtml(r.content ??', $dashboard);
        $this->assertStringNotContainsString('${c.name ??', $dashboard);
        $this->assertStringNotContainsString('${r.content ??', $dashboard);
    }

    public function test_production_api_errors_do_not_expose_exception_details(): void
    {
        config(['app.debug' => false]);
        Route::get('/api/testing/production-error', fn () => throw new RuntimeException('private database detail'));

        $this->getJson('/api/testing/production-error')
            ->assertStatus(500)
            ->assertJson([
                'success' => false,
                'message' => 'حدث خطأ في الخادم',
            ])
            ->assertJsonMissingPath('error')
            ->assertDontSee('private database detail');
    }

    public function test_debug_api_errors_remain_diagnostic_locally(): void
    {
        config(['app.debug' => true]);
        Route::get('/api/testing/debug-error', fn () => throw new RuntimeException('local diagnostic'));

        $this->getJson('/api/testing/debug-error')
            ->assertStatus(500)
            ->assertJsonPath('error', 'local diagnostic');
    }

    public function test_cors_never_echoes_untrusted_origins(): void
    {
        config(['cors.allowed_origins' => ['https://dashboard.example.test']]);

        $this->call('OPTIONS', '/api/health', server: [
            'HTTP_ORIGIN' => 'https://dashboard.example.test',
            'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'GET',
        ])
            ->assertNoContent()
            ->assertHeader('Access-Control-Allow-Origin', 'https://dashboard.example.test');

        $this->call('OPTIONS', '/api/health', server: [
            'HTTP_ORIGIN' => 'https://evil.example.test',
            'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'GET',
        ])
            ->assertNoContent()
            // مع أصل واحد تعيد مكتبة CORS الأصل الموثوق الثابت؛ المتصفح يرفضه
            // لأنه لا يطابق Origin الشرير، ولا يتم عكس origin الطلب مطلقًا.
            ->assertHeader('Access-Control-Allow-Origin', 'https://dashboard.example.test');
    }

    public function test_protected_upload_routes_require_authentication(): void
    {
        $this->postJson('/api/upload/image')->assertUnauthorized();
        $this->deleteJson('/api/upload/products/file.png')->assertUnauthorized();
    }

    public function test_generic_upload_is_general_manager_only_and_rejects_disguised_files(): void
    {
        Storage::fake('public');

        $orderManager = Employee::where('username', 'order_mgr')->firstOrFail();
        Sanctum::actingAs($orderManager, $orderManager->getAbilities());

        $this->post('/api/upload/image', [
            'image' => $this->fakePng('image.png'),
            'folder' => 'general',
        ], ['Accept' => 'application/json'])->assertForbidden();

        $generalManager = Employee::where('username', 'admin')->firstOrFail();
        Sanctum::actingAs($generalManager, $generalManager->getAbilities());

        $this->post('/api/upload/image', [
            'image' => UploadedFile::fake()->createWithContent('fake.png', '<?php echo "not an image";'),
            'folder' => 'general',
        ], ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonPath('success', false);

        Storage::disk('public')->assertMissing('general');
    }

    public function test_direct_delete_rejects_unmanaged_paths_and_accepts_managed_images(): void
    {
        Storage::fake('public');
        $generalManager = Employee::where('username', 'admin')->firstOrFail();
        Sanctum::actingAs($generalManager, $generalManager->getAbilities());

        $this->deleteJson('/api/upload/'.rawurlencode('../private.txt'))
            ->assertUnprocessable()
            ->assertJsonPath('success', false);

        $path = 'products/123e4567-e89b-12d3-a456-426614174000.png';
        Storage::disk('public')->put($path, 'image bytes');

        $this->deleteJson('/api/upload/'.rawurlencode($path))
            ->assertOk()
            ->assertJsonPath('success', true);

        Storage::disk('public')->assertMissing($path);
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
