// The backoffice's look: zinc neutrals with a blue accent, and compact controls
// (Nuxt UI's small sizes by default) so more fits on screen.
const compact = { defaultVariants: { size: 'sm' as const } }

export default defineAppConfig({
  ui: {
    colors: {
      primary: 'blue',
      neutral: 'zinc',
    },
    button: compact,
    input: compact,
    inputNumber: compact,
    inputMenu: compact,
    select: compact,
    selectMenu: compact,
    textarea: compact,
    checkbox: compact,
    switch: compact,
    badge: compact,
    tabs: compact,
    table: {
      slots: {
        th: 'py-2 px-3 text-xs font-medium text-muted',
        td: 'py-1.5 px-3 text-sm',
      },
    },
  },
})
