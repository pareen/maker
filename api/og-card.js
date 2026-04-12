import { createClient } from '@supabase/supabase-js'

// Generates an HTML profile card that can be screenshotted or rendered as an image.
// Usage: /api/og-card?username=pareen
// Returns: HTML card (renderable by Vercel OG or any screenshot service)
export default async function handler(req, res) {
  const { username } = req.query;
  if (!username) {
    return res.status(400).json({ error: 'Missing username' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Server config missing' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: profile } = await supabase
    .from('profiles')
    .select('username, name, bio, today_making, domains, cracked_squad, total_raised, total_users, socials')
    .eq('username', username)
    .single();

  if (!profile) {
    return res.status(404).json({ error: 'Profile not found' });
  }

  const { count: projectCount } = await supabase
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', (await supabase.from('profiles').select('id').eq('username', username).single()).data?.id);

  const name = esc(profile.name || profile.username);
  const bio = esc(profile.bio || '');
  const making = profile.today_making ? esc(profile.today_making) : '';
  const domains = (profile.domains || []).slice(0, 4).map(esc);
  const isCracked = profile.cracked_squad;
  const twitter = profile.socials?.twitter || '';
  const projects = projectCount || 0;

  // Stats chips
  const stats = [];
  if (projects > 0) stats.push(`${projects} project${projects !== 1 ? 's' : ''}`);
  if (profile.total_users > 0) stats.push(`${formatNum(profile.total_users)} users`);
  if (profile.total_raised > 0) stats.push(`$${formatNum(profile.total_raised)} raised`);

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0c0a09;display:flex;align-items:center;justify-content:center;min-height:100vh;">
<div style="width:1200px;height:630px;background:linear-gradient(135deg,#0c0a09 0%,#1c1917 50%,#0c0a09 100%);display:flex;flex-direction:column;justify-content:center;padding:80px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;position:relative;overflow:hidden;">
  <!-- Subtle grid pattern -->
  <div style="position:absolute;inset:0;background-image:radial-gradient(rgba(251,191,36,0.03) 1px,transparent 1px);background-size:32px 32px;"></div>

  <!-- Top bar -->
  <div style="display:flex;align-items:center;gap:16px;margin-bottom:40px;position:relative;">
    <div style="font-size:13px;letter-spacing:0.2em;color:#fbbf24;font-weight:600;">MAKERLY</div>
    ${isCracked ? '<div style="font-size:11px;letter-spacing:0.2em;color:#ef4444;font-weight:600;margin-left:8px;">CRACKED SQUAD</div>' : ''}
  </div>

  <!-- Name -->
  <div style="font-size:64px;font-weight:700;color:#fafaf9;margin-bottom:12px;line-height:1.1;position:relative;">${name}</div>

  ${twitter ? `<div style="font-size:18px;color:#78716c;margin-bottom:24px;position:relative;">@${esc(twitter)}</div>` : ''}

  <!-- Bio -->
  ${bio ? `<div style="font-size:22px;color:#a8a29e;max-width:800px;line-height:1.5;margin-bottom:32px;position:relative;">${bio.length > 120 ? bio.slice(0, 117) + '...' : bio}</div>` : ''}

  <!-- Making now -->
  ${making ? `<div style="font-size:16px;color:#57534e;margin-bottom:32px;position:relative;">Building: <span style="color:#d6d3d1;">${making.length > 80 ? making.slice(0, 77) + '...' : making}</span></div>` : ''}

  <!-- Stats + Domains row -->
  <div style="display:flex;gap:12px;flex-wrap:wrap;position:relative;">
    ${stats.map(s => `<div style="background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.2);padding:8px 16px;border-radius:20px;font-size:14px;color:#fbbf24;font-weight:500;">${s}</div>`).join('')}
    ${domains.map(d => `<div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);padding:8px 16px;border-radius:20px;font-size:14px;color:#a8a29e;">${d}</div>`).join('')}
  </div>

  <!-- Bottom URL -->
  <div style="position:absolute;bottom:40px;right:80px;font-size:16px;color:#44403c;letter-spacing:0.05em;">makerly.me/${esc(profile.username)}</div>
</div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.status(200).send(html);
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}
