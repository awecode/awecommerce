import type { Ref } from 'vue'

// A settings form with an explicit save, like the product page: the fields
// are loaded from `url`, saved with PATCH (the button or ⌘S), and leaving with
// unsaved changes asks first. `form` is the page's UForm, checked before
// saving. Returns the state to bind and what the page header needs.
export const useSettingsForm = <S extends Record<string, unknown>>(options: {
  // The query key other screens read the settings under, refreshed on save
  key: string
  url: string
  // The form's fields from the API's answer
  fields: (settings: Record<string, any>) => S
  // The fields as the API takes them
  body?: (state: S) => Record<string, unknown>
  savedTitle: string
  form: Ref<{ validate: (options?: object) => Promise<unknown> } | null | undefined>
}) => {
  const toast = useToast()
  const confirm = useConfirm()
  const queryCache = useQueryCache()
  // The settings routes take a path given at run time
  const api = $fetch as <T>(url: string, init?: Record<string, unknown>) => Promise<T>

  const { data, isLoading } = useQuery({
    key: [options.key],
    query: () => api<Record<string, any>>(options.url),
  })

  const state = reactive({}) as S
  const saved = ref('')
  const dirty = computed(() => Boolean(saved.value) && JSON.stringify(state) !== saved.value)
  const load = (settings: Record<string, any>) => {
    Object.assign(state, options.fields(settings))
    saved.value = JSON.stringify(state)
  }
  watch(data, (settings) => {
    if (settings && !dirty.value) load(settings)
  }, { immediate: true })

  const saving = ref(false)
  const save = async () => {
    if (saving.value || !dirty.value) return
    try {
      await options.form.value?.validate({})
    } catch {
      toast.add({ title: 'Check the highlighted fields', color: 'error', icon: 'i-lucide-circle-alert' })
      return
    }
    saving.value = true
    try {
      const settings = await api<Record<string, any>>(options.url, {
        method: 'PATCH',
        body: options.body ? options.body(state) : state,
      })
      load(settings)
      queryCache.setQueryData([options.key], settings)
      await queryCache.invalidateQueries({ key: [options.key] })
      toast.add({ title: options.savedTitle, color: 'success', icon: 'i-lucide-check' })
    } catch (error) {
      toast.add({ title: 'Could not save', description: apiErrorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' })
    } finally {
      saving.value = false
    }
  }
  const discard = () => data.value && load(data.value)

  defineShortcuts({ meta_s: { usingInput: true, handler: async () => { await commitFocusedField(); await save() } } })
  onBeforeRouteLeave(async () =>
    !dirty.value || (await confirm({ title: 'Discard changes?', description: 'Your changes have not been saved.', confirmLabel: 'Discard', color: 'error' })))
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (dirty.value) event.preventDefault()
  }
  onMounted(() => window.addEventListener('beforeunload', beforeUnload))
  onUnmounted(() => window.removeEventListener('beforeunload', beforeUnload))

  return { state, loaded: computed(() => Boolean(saved.value)), isLoading, dirty, saving, save, discard }
}
