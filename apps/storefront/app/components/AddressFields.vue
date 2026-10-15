<script setup lang="ts">
// The fields of a delivery address, for checkout and the account's addresses.
// Field errors use the names line1, city and country (see addressErrors).
const address = defineModel<AddressState>({ required: true })
</script>

<template>
  <div class="grid gap-4 sm:grid-cols-2">
    <UFormField label="Address" name="line1" required class="sm:col-span-2">
      <UInput v-model="address.line1" autocomplete="address-line1" size="lg" class="w-full" />
    </UFormField>
    <UFormField label="Apartment, suite" name="line2" hint="Optional" class="sm:col-span-2">
      <UInput v-model="address.line2" autocomplete="address-line2" size="lg" class="w-full" />
    </UFormField>
    <UFormField label="City" name="city" required>
      <UInput v-model="address.city" autocomplete="address-level2" size="lg" class="w-full" />
    </UFormField>
    <UFormField label="Province or state" name="province" hint="Optional">
      <UInput v-model="address.province" autocomplete="address-level1" size="lg" class="w-full" />
    </UFormField>
    <UFormField label="Postal code" name="postalCode" hint="Optional">
      <UInput v-model="address.postalCode" autocomplete="postal-code" size="lg" class="w-full" />
    </UFormField>
    <UFormField label="Country" name="country" required>
      <UInput v-model="address.country" autocomplete="country-name" size="lg" class="w-full" />
    </UFormField>
    <UFormField label="Delivery instructions" name="instructions" hint="Optional" class="sm:col-span-2">
      <UTextarea v-model="address.instructions" :rows="2" autoresize class="w-full" />
    </UFormField>
    <slot />
  </div>
</template>
