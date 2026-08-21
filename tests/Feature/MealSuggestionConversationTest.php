<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Employee;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class MealSuggestionConversationTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    public function test_customer_can_send_an_image_and_track_manager_review_status(): void
    {
        Storage::fake('public');

        $customer = Customer::create([
            'name' => 'Meal Idea Customer',
            'email' => 'meal-idea@example.test',
            'password_hash' => bcrypt('Password123'),
            'status' => Customer::STATUS_REGISTERED,
            'loyalty_points' => 0,
        ]);
        $manager = Employee::where('role', Employee::ROLE_COMMUNICATION_MANAGER)->firstOrFail();

        $created = $this->actingAs($customer, 'sanctum')
            ->post('/api/customer/meal-suggestion', [
                'suggestion_text' => 'أقترح وجبة دجاج مدخن مع صلصة خاصة وخضار مشوية',
                'image' => UploadedFile::fake()->createWithContent(
                    'meal-idea.png',
                    base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZPioAAAAASUVORK5CYII=')
                ),
            ])
            ->assertCreated()
            ->assertJsonPath('data.suggestion.status', 'pending');

        $suggestionId = $created->json('data.suggestion.id');
        $imageUrl = $created->json('data.suggestion.image_url');
        $this->assertNotEmpty($imageUrl);

        $this->actingAs($customer, 'sanctum')
            ->getJson('/api/customer/meal-suggestions')
            ->assertOk()
            ->assertJsonPath('data.suggestions.0.id', $suggestionId)
            ->assertJsonPath('data.suggestions.0.status', 'pending')
            ->assertJsonPath('data.suggestions.0.image_url', $imageUrl);

        $this->actingAs($manager, 'sanctum')
            ->getJson('/api/communication/meal-suggestions/'.$suggestionId)
            ->assertOk()
            ->assertJsonPath('data.suggestion.image_url', $imageUrl);

        $this->actingAs($manager, 'sanctum')
            ->putJson('/api/communication/meal-suggestions/'.$suggestionId.'/review', [
                'note' => 'تمت مراجعة الفكرة وسيتم تقييم إمكانية إضافتها للقائمة',
            ])
            ->assertOk()
            ->assertJsonPath('data.suggestion.status', 'reviewed');

        $this->actingAs($customer, 'sanctum')
            ->getJson('/api/customer/meal-suggestions')
            ->assertOk()
            ->assertJsonPath('data.suggestions.0.status', 'reviewed')
            ->assertJsonPath('data.suggestions.0.admin_note', 'تمت مراجعة الفكرة وسيتم تقييم إمكانية إضافتها للقائمة');
    }
}
