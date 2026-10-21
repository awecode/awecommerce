<script setup lang="ts">
import type { EditorToolbarItem } from '@nuxt/ui'
import { TableKit } from '@tiptap/extension-table'
import EditorTablePopover from './editor/EditorTablePopover.vue'
import { tableToolbarItems } from './editor/TableToolbar'

// A rich text field, saved as HTML: headings, bold and italic, lists, quotes
// and tables, in a bordered box with its toolbar. Empty is ''.
defineProps<{ placeholder?: string }>()
const model = defineModel<string | null>({ default: '' })
const html = computed({
  get: () => model.value ?? '',
  // An emptied editor leaves an empty paragraph
  set: (value: string) => (model.value = value === '<p></p>' ? '' : value),
})

const items: EditorToolbarItem[][] = [
  [
    { kind: 'heading', level: 2, icon: 'i-lucide-heading-2', 'aria-label': 'Heading' },
    { kind: 'heading', level: 3, icon: 'i-lucide-heading-3', 'aria-label': 'Subheading' },
  ],
  [
    { kind: 'mark', mark: 'bold', icon: 'i-lucide-bold', 'aria-label': 'Bold' },
    { kind: 'mark', mark: 'italic', icon: 'i-lucide-italic', 'aria-label': 'Italic' },
  ],
  [
    { kind: 'bulletList', icon: 'i-lucide-list', 'aria-label': 'Bulleted list' },
    { kind: 'orderedList', icon: 'i-lucide-list-ordered', 'aria-label': 'Numbered list' },
    { kind: 'blockquote', icon: 'i-lucide-text-quote', 'aria-label': 'Quote' },
  ],
  [
    { slot: 'table' as const, icon: 'i-lucide-table', 'aria-label': 'Table' },
  ],
]
</script>

<template>
  <div class="rounded-md border border-default">
    <UEditor
      v-slot="{ editor }"
      v-model="html"
      content-type="html"
      :image="false"
      :mention="false"
      :extensions="[TableKit]"
      :placeholder="placeholder"
      class="min-h-24 px-3 py-2"
    >
      <UEditorToolbar :editor="editor" :items="items" class="-mx-3 -mt-2 mb-2 border-b border-default px-1.5 py-1">
        <template #table>
          <EditorTablePopover :editor="editor" />
        </template>
      </UEditorToolbar>
      <UEditorToolbar
        :editor="editor"
        :items="tableToolbarItems(editor)"
        layout="bubble"
        :should-show="({ editor: current }) => current.isActive('table')"
      />
    </UEditor>
  </div>
</template>
