<?php

namespace Database\Seeders;

use App\Models\Offer;
use App\Models\Product;
use Illuminate\Database\Seeder;

class CatalogSeeder extends Seeder
{
    public function run(): void
    {
        $products = [
            ['name' => 'Crispy Meal', 'name_ar' => 'وجبة كرسبي', 'name_en' => 'Crispy Meal', 'description' => 'A crispy meal served with fries and a drink.', 'description_ar' => 'وجبة مقرمشة مع بطاطا ومشروب', 'description_en' => 'A crispy meal served with fries and a drink.', 'category' => Product::CATEGORY_MEAL, 'price' => 280],
            ['name' => 'Classic Burger', 'name_ar' => 'برغر كلاسيك', 'name_en' => 'Classic Burger', 'description' => 'A classic burger with a balanced flavour.', 'description_ar' => 'برغر كلاسيكي بنكهة متوازنة', 'description_en' => 'A classic burger with a balanced flavour.', 'category' => Product::CATEGORY_SANDWICH, 'price' => 190],
            ['name' => 'Chicken Shawarma', 'name_ar' => 'شاورما دجاج', 'name_en' => 'Chicken Shawarma', 'description' => 'Popular chicken shawarma with a rich signature marinade.', 'description_ar' => 'شاورما دجاج محبوبة مع تتبيلة غنية', 'description_en' => 'Popular chicken shawarma with a rich signature marinade.', 'category' => Product::CATEGORY_SANDWICH, 'price' => 170],
            ['name' => 'Pepsi', 'name_ar' => 'بيبسي', 'name_en' => 'Pepsi', 'description' => 'A chilled soft drink.', 'description_ar' => 'مشروب غازي بارد', 'description_en' => 'A chilled soft drink.', 'category' => Product::CATEGORY_DRINK, 'price' => 50],
            ['name' => 'Orange Fresh', 'name_ar' => 'عصير برتقال طازج', 'name_en' => 'Orange Fresh', 'description' => 'A refreshing chilled orange drink.', 'description_ar' => 'مشروب برتقال بارد ومنعش', 'description_en' => 'A refreshing chilled orange drink.', 'category' => Product::CATEGORY_DRINK, 'price' => 90],
            ['name' => "Today's Pizza", 'name_ar' => 'بيتزا اليوم', 'name_en' => "Today's Pizza", 'description' => 'Fresh pizza prepared for today.', 'description_ar' => 'بيتزا طازجة محضّرة لليوم', 'description_en' => 'Fresh pizza prepared for today.', 'category' => Product::CATEGORY_MEAL, 'price' => 280],
        ];

        $catalog = [];
        foreach ($products as $data) {
            $product = Product::query()
                ->where('name_en', $data['name_en'])
                ->orWhere('name', $data['name'])
                ->first();

            if (! $product) {
                $product = Product::create($data + [
                    'stock_quantity' => 100,
                    'is_active' => true,
                ]);
            } else {
                foreach (['name_ar', 'name_en', 'description_ar', 'description_en'] as $field) {
                    if (blank($product->{$field})) {
                        $product->{$field} = $data[$field];
                    }
                }
                $product->save();
            }

            $catalog[$data['name_en']] = $product;
        }

        $offerData = [
            'name' => 'Pizza Today Offer',
            'name_ar' => 'عرض بيتزا اليوم',
            'name_en' => 'Pizza Today Offer',
            'description' => "Today's pizza offer served with a drink.",
            'description_ar' => 'عرض بيتزا اليوم مع مشروب',
            'description_en' => "Today's pizza offer served with a drink.",
            'category' => 'mixed',
            'offer_price' => 250,
            'original_price' => 330,
            'is_active' => true,
        ];

        $offer = Offer::query()
            ->where('name_en', $offerData['name_en'])
            ->orWhere('name', $offerData['name'])
            ->first();

        if (! $offer) {
            $offer = Offer::create($offerData);
        } else {
            foreach (['name_ar', 'name_en', 'description_ar', 'description_en'] as $field) {
                if (blank($offer->{$field})) {
                    $offer->{$field} = $offerData[$field];
                }
            }
            $offer->save();
        }

        $offer->products()->syncWithoutDetaching([
            $catalog["Today's Pizza"]->id => ['quantity' => 1],
            $catalog['Pepsi']->id => ['quantity' => 1],
        ]);
        $offer->syncOriginalPrice();
    }
}
