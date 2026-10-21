import type { EditorToolbarItem } from '@nuxt/ui'
import type { Editor } from '@tiptap/vue-3'

// The table actions, shown while the cursor is inside a table
export function tableToolbarItems(editor: Editor): EditorToolbarItem[][] {
  const run = (command: () => boolean) => () => {
    command()
  }
  return [[
    {
      icon: 'i-lucide-arrow-left-to-line',
      tooltip: { text: 'Add column before' },
      'aria-label': 'Add column before',
      onClick: run(() => editor.chain().focus().addColumnBefore().run()),
    },
    {
      icon: 'i-lucide-arrow-right-to-line',
      tooltip: { text: 'Add column after' },
      'aria-label': 'Add column after',
      onClick: run(() => editor.chain().focus().addColumnAfter().run()),
    },
    {
      icon: 'i-lucide-minus-square',
      tooltip: { text: 'Delete column' },
      'aria-label': 'Delete column',
      onClick: run(() => editor.chain().focus().deleteColumn().run()),
    },
  ], [
    {
      icon: 'i-lucide-arrow-up-to-line',
      tooltip: { text: 'Add row above' },
      'aria-label': 'Add row above',
      onClick: run(() => editor.chain().focus().addRowBefore().run()),
    },
    {
      icon: 'i-lucide-arrow-down-to-line',
      tooltip: { text: 'Add row below' },
      'aria-label': 'Add row below',
      onClick: run(() => editor.chain().focus().addRowAfter().run()),
    },
    {
      icon: 'i-lucide-minus-circle',
      tooltip: { text: 'Delete row' },
      'aria-label': 'Delete row',
      onClick: run(() => editor.chain().focus().deleteRow().run()),
    },
  ], [
    {
      icon: 'i-lucide-layout-panel-top',
      tooltip: { text: 'Toggle header row' },
      'aria-label': 'Toggle header row',
      onClick: run(() => editor.chain().focus().toggleHeaderRow().run()),
    },
    {
      icon: 'i-lucide-layout-panel-left',
      tooltip: { text: 'Toggle header column' },
      'aria-label': 'Toggle header column',
      onClick: run(() => editor.chain().focus().toggleHeaderColumn().run()),
    },
  ], [
    {
      icon: 'i-lucide-trash-2',
      tooltip: { text: 'Delete table' },
      'aria-label': 'Delete table',
      onClick: run(() => editor.chain().focus().deleteTable().run()),
    },
  ]]
}
