import PromptModal from '~/components/PromptModal.vue'

// Asks for one line of text in a modal and resolves to it, or null
export const usePrompt = () => {
  const modal = useOverlay().create(PromptModal)
  return async (props: InstanceType<typeof PromptModal>['$props']) =>
    ((await modal.open(props).result) as string | null | undefined) ?? null
}
