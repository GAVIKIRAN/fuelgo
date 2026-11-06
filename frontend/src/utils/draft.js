// The request being composed (form → provider selection). Kept in sessionStorage so a
// page refresh on the provider-selection screen doesn't lose it.
const KEY = 'fuelgo.draft'

export function saveDraft(draft) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft))
  } catch {
    /* ignore */
  }
}

export function loadDraft() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY)) || null
  } catch {
    return null
  }
}

// Files can't go into sessionStorage; hold the optional problem photo in memory.
let pendingPhoto = null
export function setPendingPhoto(file) {
  pendingPhoto = file
}
export function takePendingPhoto() {
  const f = pendingPhoto
  pendingPhoto = null
  return f
}

export function clearDraft() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
