<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'

const props = defineProps<{ editor: Editor }>()

const open = ref(false)
const hoverRows = ref(0)
const hoverCols = ref(0)

const maxRows = 8
const maxCols = 8

const selectSize = (rows: number, cols: number) => {
  props.editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()
  open.value = false
  hoverRows.value = 0
  hoverCols.value = 0
}
</script>

<template>
  <UPopover v-model:open="open" :ui="{ content: 'p-2' }">
    <UButton
      icon="i-lucide-table"
      color="neutral"
      variant="ghost"
      size="sm"
      aria-label="Insert table"
      :title="hoverRows && hoverCols ? `Insert ${hoverRows} by ${hoverCols} table` : 'Insert table'"
    />

    <template #content>
      <div class="flex flex-col gap-2">
        <div class="grid gap-0.5" :style="{ gridTemplateColumns: `repeat(${maxCols}, minmax(0, 1rem))` }">
          <template v-for="row in maxRows" :key="`row-${row}`">
            <button
              v-for="col in maxCols"
              :key="`cell-${row}-${col}`"
              type="button"
              class="size-4 rounded-sm border border-default"
              :class="row <= hoverRows && col <= hoverCols ? 'border-primary bg-primary/70' : 'bg-default'"
              @mouseenter="hoverRows = row; hoverCols = col"
              @click="selectSize(row, col)"
            />
          </template>
        </div>
        <span class="text-xs text-muted">
          {{ hoverRows && hoverCols ? `${hoverRows} by ${hoverCols}` : 'Select size' }}
        </span>
      </div>
    </template>
  </UPopover>
</template>
