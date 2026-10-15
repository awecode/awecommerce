// A delivery address as the forms hold it: every field text, empty when unset
export type AddressState = {
  line1: string
  line2: string
  city: string
  province: string
  postalCode: string
  country: string
  instructions: string
}

export const emptyAddress = (): AddressState => ({
  line1: '',
  line2: '',
  city: '',
  province: '',
  postalCode: '',
  country: '',
  instructions: '',
})

// The address to send: trimmed, without empty fields
export const addressBody = (state: AddressState) =>
  Object.fromEntries(Object.entries(state).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v)) as Partial<AddressState> &
    Pick<AddressState, 'line1' | 'city' | 'country'>

// The required fields that are empty, as form errors
export const addressErrors = (state: AddressState) =>
  [
    ['line1', 'Enter the street address'],
    ['city', 'Enter the city'],
    ['country', 'Enter the country'],
  ]
    .filter(([name]) => !state[name as keyof AddressState].trim())
    .map(([name, message]) => ({ name: name!, message: message! }))

// One line for lists: "9 Lake Rd, Pokhara, Nepal"
export const addressLine = (address: Partial<Record<keyof AddressState, string | null>>) =>
  [address.line1, address.line2, address.city, address.province, address.postalCode, address.country].filter(Boolean).join(', ')
