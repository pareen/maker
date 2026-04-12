#!/usr/bin/env node

/**
 * Error Monitor — watches Supabase error_logs and emails on new errors.
 *
 * Usage:
 *   RESEND_API_KEY=re_xxx node scripts/error-monitor.js
 *
 * Or set all env vars in .env and run:
 *   node --env-file=.env scripts/error-monitor.js
 *
 * Polls every 60 seconds. Sends one email per error.
 * Free Resend account: https://resend.com (100 emails/day)
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const RESEND_API_KEY = process.env.RESEND_API_KEY
const NOTIFY_EMAIL = 'pareen@redcom.in'
const POLL_INTERVAL_MS = 60_000 // 1 minute

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
if (!RESEND_API_KEY) {
  console.error('Missing RESEND_API_KEY. Get one free at https://resend.com')
  process.exit(1)
}

let lastChecked = new Date().toISOString()

async function fetchNewErrors() {
  const url = `${SUPABASE_URL}/rest/v1/error_logs?created_at=gt.${lastChecked}&order=created_at.asc`
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    }
  })

  if (!res.ok) {
    console.error(`Supabase query failed: ${res.status} ${await res.text()}`)
    return []
  }

  return res.json()
}

async function getUsernames(userIds) {
  if (userIds.length === 0) return {}
  const url = `${SUPABASE_URL}/rest/v1/profiles?id=in.(${userIds.join(',')})&select=id,username`
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    }
  })
  if (!res.ok) return {}
  const profiles = await res.json()
  const map = {}
  for (const p of profiles) map[p.id] = p.username
  return map
}

async function sendEmail(subject, html) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Makerly Errors <pareen@makerly.me>',
      to: [NOTIFY_EMAIL],
      subject,
      html,
    })
  })

  if (!res.ok) {
    const body = await res.text()
    console.error(`Resend API error: ${res.status} ${body}`)
    return false
  }
  return true
}

function formatError(error, username) {
  const time = new Date(error.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
  const meta = error.metadata || {}

  return `
    <div style="background:#1c1917;border:1px solid #292524;border-radius:8px;padding:16px;margin-bottom:12px;font-family:monospace">
      <div style="color:#ef4444;font-weight:bold;margin-bottom:8px">${error.action}</div>
      <div style="color:#e7e5e4;margin-bottom:8px">${error.error_message || 'No message'}</div>
      ${error.error_code ? `<div style="color:#78716c;font-size:12px">Code: ${error.error_code}</div>` : ''}
      <div style="color:#78716c;font-size:12px">User: ${username || error.user_id || 'unknown'}</div>
      <div style="color:#78716c;font-size:12px">Time: ${time}</div>
      ${meta.url ? `<div style="color:#78716c;font-size:12px">URL: ${meta.url}</div>` : ''}
      ${meta.userAgent ? `<div style="color:#57534e;font-size:11px;margin-top:4px">${meta.userAgent}</div>` : ''}
    </div>
  `
}

async function poll() {
  try {
    const errors = await fetchNewErrors()
    if (errors.length === 0) return

    // Update checkpoint
    lastChecked = errors[errors.length - 1].created_at

    // Resolve usernames
    const userIds = [...new Set(errors.map(e => e.user_id).filter(Boolean))]
    const usernames = await getUsernames(userIds)

    // Send one email per error (or batch if many)
    if (errors.length <= 3) {
      for (const error of errors) {
        const username = usernames[error.user_id] || null
        const subject = `[Makerly Error] ${error.action}${username ? ` — @${username}` : ''}`
        const html = `
          <div style="background:#0c0a09;color:#e7e5e4;padding:24px;font-family:sans-serif">
            <h2 style="color:#fbbf24;margin-top:0">Makerly Error</h2>
            ${formatError(error, username)}
            <div style="margin-top:16px">
              <a href="https://makerly.me/admin" style="color:#fbbf24">View in Admin Panel →</a>
            </div>
          </div>
        `
        const sent = await sendEmail(subject, html)
        console.log(`${new Date().toISOString()} | ${sent ? 'SENT' : 'FAILED'} | ${error.action} | ${username || error.user_id || 'anon'}`)
      }
    } else {
      // Batch digest for many errors at once
      const subject = `[Makerly] ${errors.length} new errors`
      const html = `
        <div style="background:#0c0a09;color:#e7e5e4;padding:24px;font-family:sans-serif">
          <h2 style="color:#fbbf24;margin-top:0">${errors.length} New Errors</h2>
          ${errors.map(e => formatError(e, usernames[e.user_id])).join('')}
          <div style="margin-top:16px">
            <a href="https://makerly.me/admin" style="color:#fbbf24">View in Admin Panel →</a>
          </div>
        </div>
      `
      const sent = await sendEmail(subject, html)
      console.log(`${new Date().toISOString()} | ${sent ? 'SENT' : 'FAILED'} | batch of ${errors.length} errors`)
    }
  } catch (err) {
    console.error('Poll error:', err)
  }
}

// Start
console.log(`Error monitor started. Polling every ${POLL_INTERVAL_MS / 1000}s. Emailing ${NOTIFY_EMAIL}`)
console.log(`Watching: ${SUPABASE_URL}`)
poll() // immediate first check
setInterval(poll, POLL_INTERVAL_MS)
