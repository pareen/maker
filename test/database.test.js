import { describe, it, expect } from 'vitest'
import { isAdmin } from '../src/lib/database.js'

describe('isAdmin', () => {
  it('returns true for the known admin ID', () => {
    expect(isAdmin('a21214a3-a805-4549-b774-d9d73069c352')).toBe(true)
  })

  it('returns false for a random user ID', () => {
    expect(isAdmin('00000000-0000-0000-0000-000000000000')).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isAdmin(undefined)).toBe(false)
  })

  it('returns false for null', () => {
    expect(isAdmin(null)).toBe(false)
  })
})
