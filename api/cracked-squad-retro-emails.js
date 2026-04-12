import { createClient } from '@supabase/supabase-js'

// One-time endpoint to send welcome emails to existing Cracked Squad members.
// Call once, then delete this file.
// POST /api/cracked-squad-retro-emails { adminId: "..." }

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

  const { adminId } = req.body;
  if (adminId !== 'a21214a3-a805-4549-b774-d9d73069c352') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // Get all cracked squad members
    const { data: members, error } = await supabase
      .from('profiles')
      .select('id, username, name')
      .eq('cracked_squad', true);

    if (error) throw error;
    if (!members?.length) return res.status(200).json({ ok: true, sent: 0, message: 'No squad members found' });

    // Get auth emails
    const { data: { users: authUsers } } = await supabase.auth.admin.listUsers();
    const emailMap = {};
    for (const au of (authUsers || [])) {
      emailMap[au.id] = au.email;
    }

    const results = [];

    for (const p of members) {
      const email = emailMap[p.id];
      if (!email) {
        results.push({ username: p.username, status: 'skipped', reason: 'no email' });
        continue;
      }

      const displayName = (p.name || p.username).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const safeUsername = p.username.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      const html = `
        <div style="font-family: monospace; max-width: 600px; margin: 0 auto; background: #0c0a09; color: #e7e5e4; padding: 40px; border-radius: 12px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <div style="font-size: 11px; letter-spacing: 0.3em; color: #ef4444; font-weight: 600; margin-bottom: 16px;">CRACKED SQUAD</div>
            <h1 style="font-size: 28px; margin: 0 0 8px; font-family: serif;">You're in.</h1>
            <p style="color: #78716c; font-size: 14px; margin: 0;">Welcome to the squad, ${displayName}.</p>
          </div>

          <div style="background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2); border-radius: 12px; padding: 28px; margin-bottom: 24px; text-align: center;">
            <div style="font-size: 10px; letter-spacing: 0.3em; color: #ef4444; font-weight: 600; margin-bottom: 12px;">CRACKED SQUAD</div>
            <div style="font-size: 22px; font-weight: 600; margin-bottom: 4px; font-family: serif;">${displayName}</div>
            <div style="font-size: 12px; color: #78716c; margin-bottom: 16px;">makerly.me/${safeUsername}</div>
            <div style="width: 40px; height: 1px; background: rgba(239,68,68,0.3); margin: 0 auto 12px;"></div>
            <div style="font-size: 10px; color: #57534e; letter-spacing: 0.1em;">MAKERLY</div>
          </div>

          <p style="color: #a8a29e; font-size: 13px; line-height: 1.6; margin-bottom: 24px; text-align: center;">
            You've been selected for the Cracked Squad — a small group of teenage builders who are unreasonably ambitious, unreasonably hardworking, and unreasonably good at making things people want.
          </p>

          <p style="color: #a8a29e; font-size: 13px; line-height: 1.6; margin-bottom: 24px; text-align: center;">
            Your profile now has the Cracked Squad badge. Log in to find your shareable card — post it on X, LinkedIn, or Instagram.
          </p>

          <div style="text-align: center; margin-bottom: 16px;">
            <a href="https://makerly.me/${safeUsername}" style="display: inline-block; background: #ef4444; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 13px; letter-spacing: 0.05em;">VIEW YOUR PROFILE</a>
          </div>

          <p style="color: #57534e; font-size: 11px; text-align: center; margin: 0;">Keep building. Keep shipping. That's all.</p>
        </div>
      `;

      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Pareen from Makerly <pareen@makerly.me>',
            to: [email],
            subject: "You're in the Cracked Squad",
            html,
          })
        });

        if (emailRes.ok) {
          results.push({ username: p.username, email, status: 'sent' });
        } else {
          const errText = await emailRes.text();
          results.push({ username: p.username, status: 'failed', error: errText });
        }
      } catch (err) {
        results.push({ username: p.username, status: 'failed', error: err.message });
      }
    }

    return res.status(200).json({ ok: true, sent: results.filter(r => r.status === 'sent').length, results });
  } catch (err) {
    console.error('Retro email error:', err);
    return res.status(500).json({ error: 'Failed' });
  }
}
