// Number fields keep what is typed until they lose focus. ⌘S saves without
// leaving the field, so the save handlers call this first: the field is
// blurred, so its value counts, then focused again.
export const commitFocusedField = async () => {
  const field = document.activeElement
  if (!(field instanceof HTMLElement) || field === document.body) return
  field.blur()
  await nextTick()
  field.focus()
}
