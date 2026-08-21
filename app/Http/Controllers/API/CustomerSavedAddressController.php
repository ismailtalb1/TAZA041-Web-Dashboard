<?php

namespace App\Http\Controllers\API;

use App\Models\Customer;
use App\Models\CustomerSavedAddress;
use App\Support\CustomerInputRules;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class CustomerSavedAddressController extends BaseController
{
    public function index(Request $request)
    {
        $customer = $this->customer($request);
        if (! $customer) {
            return $this->unauthorized('هذا المسار للزبائن فقط');
        }

        return $this->success([
            'addresses' => $this->addresses($customer),
        ]);
    }

    public function sync(Request $request)
    {
        $customer = $this->customer($request);
        if (! $customer) {
            return $this->unauthorized('هذا المسار للزبائن فقط');
        }

        $validator = Validator::make($request->all(), [
            'current_password' => 'required|string|max:128',
            'addresses' => 'present|array|max:3',
            'addresses.*.type' => ['required', 'string', Rule::in(CustomerSavedAddress::TYPES), 'distinct'],
            'addresses.*.address' => CustomerInputRules::safeText(true, 500, 3),
            'addresses.*.details' => CustomerInputRules::safeText(false, 500, 2, true),
            'addresses.*.latitude' => 'required|numeric|between:-90,90',
            'addresses.*.longitude' => 'required|numeric|between:-180,180',
        ], $this->messages());

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }
        if (! Hash::check((string) $request->input('current_password'), $customer->password_hash)) {
            return $this->error('كلمة المرور الحالية غير صحيحة', 422);
        }

        $addresses = collect($validator->validated()['addresses']);
        DB::transaction(function () use ($customer, $addresses) {
            $types = $addresses->pluck('type')->all();
            $customer->savedAddresses()->whereNotIn('type', $types)->delete();
            foreach ($addresses as $address) {
                $this->upsert($customer, $address);
            }
        });

        return $this->success([
            'addresses' => $this->addresses($customer),
        ], 'تمت مزامنة العناوين المحفوظة');
    }

    public function update(Request $request, string $type)
    {
        $customer = $this->customer($request);
        if (! $customer) {
            return $this->unauthorized('هذا المسار للزبائن فقط');
        }
        if (! in_array($type, CustomerSavedAddress::TYPES, true)) {
            return $this->notFound('نوع العنوان غير موجود');
        }

        $validator = Validator::make($request->all(), [
            'current_password' => 'required|string|max:128',
            'address' => CustomerInputRules::safeText(true, 500, 3),
            'details' => CustomerInputRules::safeText(false, 500, 2, true),
            'latitude' => 'required|numeric|between:-90,90',
            'longitude' => 'required|numeric|between:-180,180',
        ], $this->messages());

        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }
        if (! Hash::check((string) $request->input('current_password'), $customer->password_hash)) {
            return $this->error('كلمة المرور الحالية غير صحيحة', 422);
        }

        $address = $this->upsert($customer, ['type' => $type, ...$validator->safe()->except('current_password')]);

        return $this->success([
            'address' => $address->toCustomerPayload(),
            'addresses' => $this->addresses($customer),
        ], 'تم حفظ العنوان');
    }

    public function destroy(Request $request, string $type)
    {
        $customer = $this->customer($request);
        if (! $customer) {
            return $this->unauthorized('هذا المسار للزبائن فقط');
        }
        if (! in_array($type, CustomerSavedAddress::TYPES, true)) {
            return $this->notFound('نوع العنوان غير موجود');
        }

        $validator = Validator::make($request->all(), [
            'current_password' => 'required|string|max:128',
        ], $this->messages());
        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }
        if (! Hash::check((string) $request->input('current_password'), $customer->password_hash)) {
            return $this->error('كلمة المرور الحالية غير صحيحة', 422);
        }

        $customer->savedAddresses()->where('type', $type)->delete();

        return $this->success([
            'addresses' => $this->addresses($customer),
        ], 'تم حذف العنوان');
    }

    private function customer(Request $request): ?Customer
    {
        $customer = $request->user();

        return $customer instanceof Customer && ! $customer->isBanned() ? $customer : null;
    }

    private function upsert(Customer $customer, array $data): CustomerSavedAddress
    {
        return $customer->savedAddresses()->updateOrCreate(
            ['type' => $data['type']],
            [
                'address' => trim($data['address']),
                'details' => isset($data['details']) ? trim((string) $data['details']) : null,
                'latitude' => $data['latitude'],
                'longitude' => $data['longitude'],
            ],
        );
    }

    private function addresses(Customer $customer): array
    {
        return $customer->getSavedAddressesPayload();
    }

    private function messages(): array
    {
        return [
            'current_password.required' => 'كلمة المرور الحالية مطلوبة لحماية العناوين',
            'addresses.*.type.distinct' => 'لا يمكن تكرار نوع العنوان',
            'address.required' => 'وصف العنوان مطلوب',
            'addresses.*.address.required' => 'وصف العنوان مطلوب',
            'latitude.required' => 'تثبيت الموقع على الخريطة مطلوب',
            'longitude.required' => 'تثبيت الموقع على الخريطة مطلوب',
        ];
    }
}
