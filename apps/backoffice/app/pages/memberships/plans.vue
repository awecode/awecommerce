<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

// Membership plans: tiers grouped by program, and the product variants that
// sell them (terms, saved as they are added or removed)
type Plan = CatalogRow & { program: string; rank: number; description: string | null; termCount: number }

useSeoMeta({ title: 'Membership plans' })
// Save also adds a term picked but not yet added
const terms = useTemplateRef<{ pending: boolean; addPicked: () => Promise<boolean> }>('terms')

const columns: TableColumn<Plan>[] = [
  { accessorKey: 'program', header: 'Program' },
  { accessorKey: 'rank', header: 'Rank', meta: { class: { td: 'tabular-nums' } } },
  {
    id: 'terms',
    header: 'Sold as',
    cell: ({ row }) => (row.original.termCount ? `${row.original.termCount} term${row.original.termCount === 1 ? '' : 's'}` : 'Not sold'),
    meta: { class: { td: 'text-muted' } },
  },
]
</script>

<template>
  <CatalogPage
    resource="membership-plans"
    title="Membership plans"
    singular="membership plan"
    icon="i-lucide-crown"
    :columns="columns"
    :defaults="{ program: '', rank: 1, description: '' }"
    :create-schema="createMembershipPlanSchema"
    :update-schema="updateMembershipPlanSchema"
    slug-help="Identifies the plan"
    active-help="Inactive plans cannot be granted or bought; current members keep theirs until it ends"
    :pending-changes="terms?.pending"
    :before-save="async () => (terms ? await terms.addPicked() : true)"
  >
    <template #fields="form">
      <UFormField label="Program" name="program" required help="Plans with the same program, such as music, are tiers of one membership: a member has one of them at a time">
        <UInput v-model="form.state.program" placeholder="music" class="w-full" />
      </UFormField>
      <UFormField label="Rank" name="rank" required help="Higher is better: buying a higher tier replaces a lower one">
        <UInputNumber v-model="form.state.rank" :min="0" class="w-32" />
      </UFormField>
      <UFormField label="Description" name="description" help="What members get, shown with the plan in the store">
        <RichTextEditor :key="form.editing?.id ?? 'new'" v-model="form.state.description" placeholder="Perks, what is included" />
      </UFormField>
      <UFormField v-if="form.editing" label="Sold as" help="Each product variant here sells the plan for its months, at the variant's price. Add saves at once; so does Save, for one picked but not added.">
        <MembershipsPlanTerms ref="terms" :plan-id="form.editing.id" />
      </UFormField>
    </template>
  </CatalogPage>
</template>
