import { describe, it, expect } from 'vitest'

// Test the routing logic extracted from App.jsx
// (getInitialRoute is defined inline, so we replicate the logic here)
function getInitialRoute(path) {
  const cleaned = path.replace(/^\/+|\/+$/g, '')
  if (cleaned === 'login') return { view: 'login' }
  if (cleaned === 'signup') return { view: 'signup' }
  if (cleaned === 'admin') return { view: 'admin' }
  if (cleaned === 'makers') return { view: 'makers' }
  if (cleaned === 'hire') return { view: 'hire' }
  if (cleaned === 'memo') return { view: 'memo' }
  if (cleaned && cleaned !== '' && !cleaned.includes('/')) return { view: 'publicProfile', username: cleaned }
  return { view: null }
}

describe('getInitialRoute', () => {
  it('routes / to null (landing)', () => {
    expect(getInitialRoute('/')).toEqual({ view: null })
  })

  it('routes /login to login view', () => {
    expect(getInitialRoute('/login')).toEqual({ view: 'login' })
  })

  it('routes /signup to signup view', () => {
    expect(getInitialRoute('/signup')).toEqual({ view: 'signup' })
  })

  it('routes /admin to admin view', () => {
    expect(getInitialRoute('/admin')).toEqual({ view: 'admin' })
  })

  it('routes /makers to makers view', () => {
    expect(getInitialRoute('/makers')).toEqual({ view: 'makers' })
  })

  it('routes /hire to hire view', () => {
    expect(getInitialRoute('/hire')).toEqual({ view: 'hire' })
  })

  it('routes /memo to memo view', () => {
    expect(getInitialRoute('/memo')).toEqual({ view: 'memo' })
  })

  it('routes /username to publicProfile view', () => {
    expect(getInitialRoute('/pareen')).toEqual({ view: 'publicProfile', username: 'pareen' })
  })

  it('routes username with dots to publicProfile', () => {
    expect(getInitialRoute('/koshik.raj')).toEqual({ view: 'publicProfile', username: 'koshik.raj' })
  })

  it('strips trailing slashes', () => {
    expect(getInitialRoute('/login/')).toEqual({ view: 'login' })
  })

  it('returns null for nested paths', () => {
    expect(getInitialRoute('/some/nested/path')).toEqual({ view: null })
  })

  it('returns null for empty string', () => {
    expect(getInitialRoute('')).toEqual({ view: null })
  })
})
