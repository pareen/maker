export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'RESEND_API_KEY not configured' });
  }

  const { toEmail, toUsername, senderName, senderEmail, message } = req.body;

  if (!toEmail || !message?.trim()) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (message.length > 2000) {
    return res.status(400).json({ error: 'Message too long (max 2000 characters)' });
  }

  const escapedMessage = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  const escapedSender = (senderName || 'Someone').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const html = `
    <div style="font-family: monospace; max-width: 600px; margin: 0 auto; background: #0c0a09; color: #e7e5e4; padding: 32px; border-radius: 12px;">
      <div style="font-size: 11px; letter-spacing: 0.15em; color: #fbbf24; font-weight: 600; margin-bottom: 16px;">NEW MESSAGE VIA MAKERLY</div>
      <p style="color: #a8a29e; font-size: 13px; margin: 0 0 24px;">
        ${escapedSender}${senderEmail ? ` (${senderEmail.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')})` : ''} sent you a message through your <a href="https://makerly.me/${toUsername}" style="color: #fbbf24;">Makerly profile</a>.
      </p>
      <div style="background: rgba(255,255,255,0.05); padding: 16px 20px; border-radius: 8px; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
        ${escapedMessage}
      </div>
      ${senderEmail ? `<a href="mailto:${senderEmail}" style="display: inline-block; background: #fbbf24; color: #0c0a09; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 13px;">Reply to ${escapedSender}</a>` : '<p style="color: #78716c; font-size: 12px;">No reply email was provided.</p>'}
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
        to: [toEmail],
        ...(senderEmail ? { reply_to: senderEmail } : {}),
        subject: `${senderName || 'Someone'} reached out via Makerly`,
        html,
      })
    });

    if (!emailRes.ok) {
      const err = await emailRes.text();
      console.error('Resend error:', err);
      return res.status(500).json({ error: 'Failed to send message' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Contact email error:', err);
    return res.status(500).json({ error: 'Failed to send message' });
  }
}
