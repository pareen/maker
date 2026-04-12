import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;

  if (!supabaseUrl || !serviceRoleKey || !resendKey) {
    return res.status(500).json({ error: 'Server config missing' });
  }

  const { adminId, dryRun } = req.body;

  // Verify admin
  const ADMIN_ID = 'a21214a3-a805-4549-b774-d9d73069c352';
  if (adminId !== ADMIN_ID) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Get all profiles
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, name, bio, today_making, domains, cracked_squad, total_raised, total_users, socials')
    .order('created_at', { ascending: true });

  if (!profiles?.length) {
    return res.status(200).json({ ok: true, sent: 0, message: 'No profiles found' });
  }

  // Get project counts
  const { data: projectRows } = await supabase
    .from('projects')
    .select('user_id');

  const projectCounts = {};
  for (const row of (projectRows || [])) {
    projectCounts[row.user_id] = (projectCounts[row.user_id] || 0) + 1;
  }

  // Get auth emails
  const { data: { users: authUsers } } = await supabase.auth.admin.listUsers();
  const emailMap = {};
  for (const au of (authUsers || [])) {
    emailMap[au.id] = au.email;
  }

  if (dryRun) {
    const recipients = profiles.filter(p => emailMap[p.id]).map(p => ({
      email: emailMap[p.id],
      name: p.name || p.username,
      username: p.username,
    }));
    return res.status(200).json({ ok: true, dryRun: true, count: recipients.length, recipients });
  }

  let sent = 0;
  let failed = 0;
  const errors = [];

  for (const profile of profiles) {
    const email = emailMap[profile.id];
    if (!email) continue;

    const name = esc(profile.name || profile.username);
    const username = esc(profile.username);
    const bio = esc(profile.bio || 'Building things people want.');
    const making = profile.today_making ? esc(profile.today_making) : '';
    const domains = (profile.domains || []).slice(0, 3).map(esc);
    const isCracked = profile.cracked_squad;
    const twitter = profile.socials?.twitter || '';
    const projects = projectCounts[profile.id] || 0;

    // Stats for the card
    const statChips = [];
    if (projects > 0) statChips.push(`${projects} project${projects !== 1 ? 's' : ''}`);
    if (profile.total_users > 0) statChips.push(`${formatNum(profile.total_users)} users`);
    if (profile.total_raised > 0) statChips.push(`$${formatNum(profile.total_raised)} raised`);

    const profileUrl = `https://makerly.me/${profile.username}`;
    const tweetText = encodeURIComponent(`Check out my maker profile on @makabordi's Makerly\n\n${profileUrl}`);
    const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(profileUrl)}`;
    const whatsappText = encodeURIComponent(`Check out my maker profile: ${profileUrl}`);

    const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#0c0a09;color:#e7e5e4;padding:0;border-radius:12px;overflow:hidden;">
  <!-- Header -->
  <div style="padding:40px 40px 0;">
    <div style="font-size:11px;letter-spacing:0.3em;color:#fbbf24;font-weight:600;margin-bottom:24px;">MAKERLY</div>
    <h1 style="font-size:28px;margin:0 0 8px;font-family:serif;color:#fafaf9;">Your maker profile is live.</h1>
    <p style="color:#78716c;font-size:14px;margin:0 0 32px;line-height:1.5;">
      Hey ${name}, your profile on Makerly is ready for the world. Share it everywhere. Resumes are dead... show what you've made.
    </p>
  </div>

  <!-- Profile Card (the shareable unit) -->
  <div style="margin:0 24px 32px;background:linear-gradient(135deg,#1c1917,#0c0a09);border:1px solid rgba(251,191,36,0.15);border-radius:16px;padding:32px;position:relative;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px;">
      <span style="font-size:10px;letter-spacing:0.2em;color:#fbbf24;font-weight:600;">MAKERLY</span>
      ${isCracked ? '<span style="font-size:10px;letter-spacing:0.2em;color:#ef4444;font-weight:600;margin-left:8px;">CRACKED SQUAD</span>' : ''}
    </div>

    <div style="font-size:24px;font-weight:700;color:#fafaf9;margin-bottom:4px;">${name}</div>
    ${twitter ? `<div style="font-size:13px;color:#78716c;margin-bottom:12px;">@${esc(twitter)}</div>` : ''}
    <div style="font-size:14px;color:#a8a29e;line-height:1.5;margin-bottom:16px;">${bio.length > 100 ? bio.slice(0, 97) + '...' : bio}</div>

    ${making ? `<div style="font-size:12px;color:#57534e;margin-bottom:16px;">Building: <span style="color:#d6d3d1;">${making.length > 60 ? making.slice(0, 57) + '...' : making}</span></div>` : ''}

    <!-- Stats -->
    <div style="margin-bottom:8px;">
      ${statChips.map(s => `<span style="display:inline-block;background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.2);padding:4px 12px;border-radius:12px;font-size:12px;color:#fbbf24;font-weight:500;margin-right:6px;margin-bottom:6px;">${s}</span>`).join('')}
      ${domains.map(d => `<span style="display:inline-block;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);padding:4px 12px;border-radius:12px;font-size:12px;color:#a8a29e;margin-right:6px;margin-bottom:6px;">${d}</span>`).join('')}
    </div>

    <div style="font-size:12px;color:#44403c;margin-top:12px;">makerly.me/${username}</div>
  </div>

  <!-- Share CTA -->
  <div style="padding:0 40px 32px;text-align:center;">
    <p style="font-size:14px;color:#d6d3d1;margin:0 0 20px;font-weight:500;">Share your profile and let people find you.</p>

    <!-- Share buttons -->
    <div style="margin-bottom:24px;">
      <a href="https://twitter.com/intent/tweet?text=${tweetText}" style="display:inline-block;background:#1d9bf0;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;margin:0 4px 8px;">Share on X</a>
      <a href="${linkedinUrl}" style="display:inline-block;background:#0a66c2;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;margin:0 4px 8px;">Share on LinkedIn</a>
      <a href="https://wa.me/?text=${whatsappText}" style="display:inline-block;background:#25d366;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;margin:0 4px 8px;">Share on WhatsApp</a>
    </div>

    <a href="${profileUrl}" style="display:inline-block;background:#fbbf24;color:#0c0a09;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">View Your Profile</a>
  </div>

  <!-- Viral hook -->
  <div style="background:rgba(251,191,36,0.04);border-top:1px solid rgba(251,191,36,0.1);padding:24px 40px;">
    <p style="font-size:13px;color:#a8a29e;margin:0 0 8px;text-align:center;line-height:1.5;">
      Know someone who should be on Makerly?
    </p>
    <div style="text-align:center;">
      <a href="https://makerly.me/signup" style="color:#fbbf24;font-size:13px;text-decoration:none;font-weight:600;">Invite them to create a profile →</a>
    </div>
  </div>

  <!-- Footer -->
  <div style="padding:20px 40px;border-top:1px solid rgba(255,255,255,0.04);">
    <p style="font-size:11px;color:#44403c;margin:0;text-align:center;">
      Makerly — resumes are dead. Show what you've made.
    </p>
  </div>
</div>`;

    try {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Makerly <onboarding@resend.dev>',
          to: [email],
          subject: `${profile.name || profile.username}, your maker profile is live`,
          html,
        })
      });

      if (emailRes.ok) {
        sent++;
      } else {
        failed++;
        const err = await emailRes.text();
        errors.push({ email, error: err });
      }
    } catch (err) {
      failed++;
      errors.push({ email, error: err.message });
    }

    // Rate limit: 2 emails per second (Resend free tier)
    await new Promise(r => setTimeout(r, 500));
  }

  return res.status(200).json({ ok: true, sent, failed, errors: errors.slice(0, 10) });
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}
