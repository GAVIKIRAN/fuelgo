import { describe, expect, it } from 'vitest'
import { tokenStore } from '../api/client'

const owner = { access_token: 'owner-a', refresh_token: 'owner-r' }
const provider = { access_token: 'prov-a', refresh_token: 'prov-r' }

describe('tokenStore (per-tab sessions)', () => {
  it('keeps this tab signed in when another tab logs in as someone else', () => {
    tokenStore.set(owner)
    // another tab logs in as the provider: it writes localStorage (shared) only
    localStorage.setItem('fuelgo.tokens', JSON.stringify(provider))
    expect(tokenStore.get()).toEqual(owner)
  })

  it('a new tab starts with the last remembered login', () => {
    localStorage.setItem('fuelgo.tokens', JSON.stringify(provider))
    expect(tokenStore.get()).toEqual(provider)
    expect(JSON.parse(sessionStorage.getItem('fuelgo.tokens'))).toEqual(provider)
  })

  it('logging out keeps the other tab\'s remembered login', () => {
    tokenStore.set(owner)
    localStorage.setItem('fuelgo.tokens', JSON.stringify(provider))
    tokenStore.clear()
    expect(sessionStorage.getItem('fuelgo.tokens')).toBeNull()
    expect(JSON.parse(localStorage.getItem('fuelgo.tokens'))).toEqual(provider)
  })

  it('logging out forgets its own remembered login', () => {
    tokenStore.set(owner)
    tokenStore.clear()
    expect(localStorage.getItem('fuelgo.tokens')).toBeNull()
  })
})
