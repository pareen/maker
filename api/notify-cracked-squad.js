export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'RESEND_API_KEY not configured' });
  }

  const { applicantName, applicantUsername, biggestProblem, peersOpinion } = req.body;
  if (!applicantUsername) {
    return res.status(400).json({ error: 'Missing applicant info' });
  }

  const html = `
    <div style="font-family: monospace; max-width: 600px; margin: 0 auto; background: #0c0a09; color: #e7e5e4; padding: 32px; border-radius: 12px;">
      <div style="font-size: 11px; letter-spacing: 0.15em; color: #ef4444; font-weight: 600; margin-bottom: 16px;">NEW CRACKED SQUAD APPLICATION</div>
      <h2 style="font-size: 20px; margin: 0 0 4px;">${applicantName || applicantUsername}</h2>
      <p style="color: #78716c; font-size: 13px; margin: 0 0 24px;">makerly.me/${applicantUsername}</p>

      <div style="margin-bottom: 20px;">
        <div style="font-size: 11px; color: #78716c; margin-bottom: 6px; font-weight: 600;">BIGGEST PROBLEM IN THEIR LIFE:</div>
        <div style="background: rgba(255,255,255,0.05); padding: 12px 16px; border-radius: 8px; font-size: 13px; line-height: 1.5;">${biggestProblem}</div>
      </div>

      <div style="margin-bottom: 24px;">
        <div style="font-size: 11px; color: #78716c; margin-bottom: 6px; font-weight: 600;">WHAT THEY THINK OF THEIR PEERS:</div>
        <div style="background: rgba(255,255,255,0.05); padding: 12px 16px; border-radius: 8px; font-size: 13px; line-height: 1.5;">${peersOpinion}</div>
      </div>

      <a href="https://makerly.me/admin" style="display: inline-block; background: #fbbf24; color: #0c0a09; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 13px;">Review in Admin</a>
    </div>
  `;

  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Makerly <onboarding@resend.dev>',
        to: ['pareen@redcom.in'],
        subject: `Cracked Squad application: ${applicantName || applicantUsername}`,
        html,
      })
    });

    if (!emailRes.ok) {
      const err = await emailRes.text();
      console.error('Resend error:', err);
      return res.status(500).json({ error: 'Failed to send email' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Email send error:', err);
    return res.status(500).json({ error: 'Failed to send email' });
  }
}
