import posthog from 'posthog-js'

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com'

let initialized = false

export function initAnalytics() {
  if (initialized) return
  if (!POSTHOG_KEY) {
    if (import.meta.env.DEV) console.warn('[analytics] VITE_POSTHOG_KEY not set — events are no-ops')
    return
  }
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    person_profiles: 'identified_only',
    capture_pageview: true,
    capture_pageleave: true,
  })
  initialized = true
}

export function track(event, props) {
  if (!initialized) return
  try { posthog.capture(event, props) } catch (e) { console.error('[analytics]', e) }
}

export function identify(userId, props) {
  if (!initialized || !userId) return
  try { posthog.identify(userId, props) } catch (e) { console.error('[analytics]', e) }
}

export function resetAnalytics() {
  if (!initialized) return
  try { posthog.reset() } catch (e) { console.error('[analytics]', e) }
}
