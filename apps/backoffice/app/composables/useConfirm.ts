import ConfirmModal from '~/components/ConfirmModal.vue'

// Asks a yes/no question in a modal and resolves to the answer
export const useConfirm = () => {
  const modal = useOverlay().create(ConfirmModal)
  return async (props: InstanceType<typeof ConfirmModal>['$props']) =>
    Boolean(await modal.open(props).result)
}
