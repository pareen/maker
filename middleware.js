const BOT_AGENTS = /facebookexternalhit|Twitterbot|LinkedInBot|WhatsApp|Slackbot|TelegramBot|Discordbot|Googlebot|bingbot/i

const SUPABASE_URL = 'https://debsbrmowqqzviwttamt.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlYnNicm1vd3FxenZpd3R0YW10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4Mjc0MjgsImV4cCI6MjA4NDQwMzQyOH0.tKHH7KvGhAT6Z4jZJd07UStC1TGgnCe0DAuezIFuqsw'

export default async function middleware(request) {
  const ua = request.headers.get('user-agent') || ''
  if (!BOT_AGENTS.test(ua)) return

  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/+|\/+$/g, '')

  // Only intercept profile routes (single segment, not static files or known routes)
  if (!path || path.includes('/') || path.includes('.') ||
      ['login', 'signup', 'admin', 'makers', 'hire', 'memo', 'api'].includes(path)) {
    return
  }

  // Fetch profile from Supabase
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?username=eq.${encodeURIComponent(path)}&select=username,name,bio,today_making,domains`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    )
    const profiles = await res.json()
    if (!profiles?.length) return

    const profile = profiles[0]
    const name = profile.name || profile.username
    const bio = profile.bio || 'Maker on Makerly'
    const making = profile.today_making ? `Currently making: ${profile.today_making}` : ''
    const domains = (profile.domains || []).join(', ')

    // Get project count
    const projRes = await fetch(
      `${SUPABASE_URL}/rest/v1/projects?user_id=eq.${profile.id}&select=id`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    )
    const projects = await projRes.json()
    const projectCount = projects?.length || 0

    const title = `${name} — Maker Profile`
    const description = [
      bio,
      making,
      projectCount > 0 ? `${projectCount} project${projectCount !== 1 ? 's' : ''} built` : '',
      domains ? `Domains: ${domains}` : ''
    ].filter(Boolean).join(' · ')

    const profileUrl = `https://makerly.me/${profile.username}`

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:type" content="profile" />
  <meta property="og:url" content="${profileUrl}" />
  <meta property="og:site_name" content="Makerly" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${profileUrl}" />
  <meta http-equiv="refresh" content="0;url=${profileUrl}" />
</head>
<body>
  <h1>${escapeHtml(name)}</h1>
  <p>${escapeHtml(bio)}</p>
  ${making ? `<p>${escapeHtml(making)}</p>` : ''}
  ${projectCount > 0 ? `<p>${projectCount} projects built</p>` : ''}
  <a href="${profileUrl}">View full profile on Makerly</a>
</body>
</html>`

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' }
    })
  } catch (_err) {
    return
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export const config = {
  matcher: '/((?!api|_next|assets|favicon|vite).*)',
}
