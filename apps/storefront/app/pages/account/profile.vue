<script setup lang="ts">
// The buyer's name and photo. The name is saved on their account; a chosen
// photo is uploaded and becomes their account's image at once.
definePageMeta({ auth: true })
useSeoMeta({ title: 'Your profile', robots: 'noindex' })

const { user, client, fetchSession } = useAuth()
const toast = useToast()
const failed = (title: string, error?: unknown) =>
  toast.add({ title, description: error ? cartErrorMessage(error) : undefined, color: 'error', icon: 'i-lucide-circle-alert' })

const name = ref(user.value?.name ?? '')
const savingName = ref(false)
const saveName = async () => {
  const next = name.value.trim()
  if (!next) return failed('Enter your name')
  savingName.value = true
  try {
    const { error } = await client.updateUser({ name: next })
    if (error) return failed('Could not save your name')
    await fetchSession()
    toast.add({ title: 'Name saved', icon: 'i-lucide-check' })
  } finally {
    savingName.value = false
  }
}

const photoInput = useTemplateRef('photoInput')
const uploadingPhoto = ref(false)
const uploadPhoto = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  uploadingPhoto.value = true
  try {
    const body = new FormData()
    body.append('file', file)
    await $fetch('/api/store/profile/photo', { method: 'POST', body })
    await fetchSession()
    toast.add({ title: 'Photo saved', icon: 'i-lucide-check' })
  } catch (error) {
    failed('Could not save the photo', error)
  } finally {
    uploadingPhoto.value = false
  }
}
</script>

<template>
  <AccountShell title="Your profile">
    <div class="max-w-lg space-y-10">
      <section aria-labelledby="photo" class="space-y-4">
        <h2 id="photo" class="text-xl font-medium">Photo</h2>
        <div class="flex flex-wrap items-center gap-6">
          <AppImage
            v-if="user?.image"
            :src="user.image"
            alt="Your photo"
            :width="224"
            :height="224"
            class="size-28 rounded-full object-cover ring-1 ring-default"
          />
          <div v-else class="flex size-28 items-center justify-center rounded-full bg-muted text-muted" aria-hidden="true">
            <UIcon name="i-lucide-user" class="size-10" />
          </div>
          <div class="space-y-2">
            <input ref="photoInput" type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" aria-label="Photo file" @change="uploadPhoto">
            <UButton :label="user?.image ? 'Change photo' : 'Add photo'" icon="i-lucide-camera" color="neutral" variant="outline" :loading="uploadingPhoto" @click="photoInput?.click()" />
            <p class="text-sm text-muted">JPEG, PNG or WebP, up to 8 MB.</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="name" class="space-y-4">
        <h2 id="name" class="text-xl font-medium">Name</h2>
        <UForm :state="{ name }" class="flex flex-wrap items-end gap-3" @submit="saveName">
          <UFormField label="Your name" name="name" class="w-full max-w-sm">
            <UInput v-model="name" autocomplete="name" size="lg" class="w-full" />
          </UFormField>
          <UButton type="submit" label="Save name" :loading="savingName" />
        </UForm>
      </section>
    </div>
  </AccountShell>
</template>
