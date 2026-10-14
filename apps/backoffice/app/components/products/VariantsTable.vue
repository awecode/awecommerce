<script setup lang="ts">
// The product's variants, each editable in its row. Removing a saved variant
// marks it, to delete on save (with Undo); a new one is dropped at once.
const rows = defineModel<VariantRow[]>({ required: true })
// The product's option names, asked for on new variants
const props = defineProps<{ optionNames: string[] }>()

const add = () => rows.value.push(newVariantRow(props.optionNames.map((name) => ({ name, value: '' }))))
const remove = (index: number) => {
  const row = rows.value[index]!
  if (row.id) row.removed = true
  else rows.value.splice(index, 1)
}
const valueLabel = (row: VariantRow) => (row.options.length ? row.options.map((o) => o.value).join(' / ') : 'Default')
</script>

<template>
  <div class="space-y-2">
    <div class="overflow-x-auto rounded-md border border-default">
      <table class="w-full text-sm">
        <thead class="bg-elevated/40 text-xs text-muted">
          <tr class="[&>th]:px-2 [&>th]:py-1.5 [&>th]:text-left [&>th]:font-medium">
            <th class="pl-3">Variant</th>
            <th>SKU</th>
            <th>Price</th>
            <th>Sale price</th>
            <th>Cost</th>
            <th>Stock</th>
            <th>Active</th>
            <th class="w-8" />
          </tr>
        </thead>
        <tbody class="divide-y divide-default">
          <tr v-for="(row, index) in rows" :key="row.key" class="align-top [&>td]:px-2 [&>td]:py-1.5" :class="{ 'opacity-50': row.removed }">
            <td class="pl-3 pt-2.5! whitespace-nowrap">
              <div v-if="row.id" class="font-medium text-highlighted" :class="{ 'line-through': row.removed }">{{ valueLabel(row) }}</div>
              <div v-else class="flex gap-1">
                <UFormField v-for="(option, optionIndex) in row.options" :key="option.name" :name="`variants.${index}.options.${optionIndex}.value`">
                  <UInput v-model="option.value" :placeholder="option.name" :aria-label="`${option.name} of new variant`" class="w-20" />
                </UFormField>
                <span v-if="!row.options.length" class="text-muted">New</span>
              </div>
            </td>
            <template v-if="!row.removed">
              <td>
                <UFormField :name="`variants.${index}.sku`">
                  <UInput v-model="row.sku" :aria-label="`SKU of ${variantLabel(row)}`" class="w-44 font-mono" />
                </UFormField>
              </td>
              <td v-for="field in (['price', 'discountedPrice', 'inventoryCost'] as const)" :key="field">
                <UFormField :name="`variants.${index}.${field}`">
                  <UInput
                    v-model="row[field]"
                    inputmode="decimal"
                    :aria-label="`${{ price: 'Price', discountedPrice: 'Sale price', inventoryCost: 'Cost' }[field]} of ${variantLabel(row)}`"
                    class="w-20"
                  />
                </UFormField>
              </td>
              <td>
                <UFormField :name="`variants.${index}.stockQuantity`">
                  <UInputNumber v-model="row.stockQuantity" :min="0" :increment="false" :decrement="false" :aria-label="`Stock of ${variantLabel(row)}`" class="w-20" />
                </UFormField>
              </td>
              <td class="pt-2.5!">
                <USwitch v-model="row.isActive" :aria-label="`${variantLabel(row)} is active`" />
              </td>
              <td>
                <UButton icon="i-lucide-trash" color="neutral" variant="ghost" :aria-label="`Remove ${variantLabel(row)}`" @click="remove(index)" />
              </td>
            </template>
            <template v-else>
              <td colspan="6" class="pt-2.5! text-xs text-muted">Deleted on save</td>
              <td>
                <UButton label="Undo" color="neutral" variant="ghost" @click="row.removed = false" />
              </td>
            </template>
          </tr>
        </tbody>
      </table>
    </div>
    <UButton icon="i-lucide-plus" color="neutral" variant="ghost" label="Add variant" @click="add" />
  </div>
</template>
