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
    formField: compact,
    // Rich text at the size of the rest of the form
    editor: {
      slots: {
        base: 'sm:px-0 text-sm *:my-3 [&_p]:leading-6 [&_h2]:text-lg [&_h3]:text-base',
      },
    },
    table: {
      slots: {
        th: 'py-2 px-3 text-xs font-medium text-muted',
        td: 'py-1.5 px-3 text-sm',
      },
    },
  },
})
