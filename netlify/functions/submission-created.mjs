// Runs on every VERIFIED Netlify Forms submission (Netlify's `submission-created` event; spam never reaches it).
// Sends the person an immediate acknowledgement from the site's own address and, when a partner who has agreed
// to take our requests serves their area, forwards the request to that one partner. Logic: netlify/autoreply/core.mjs.
// Needs RESEND_API_KEY in the project's environment; without it nothing is sent and the submission is unaffected.

import { plan } from '../autoreply/core.mjs';

async function send(key, msg) {
  const body = { from: msg.from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text, reply_to: msg.reply_to };
  if (msg.cc) body.cc = [msg.cc];
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`resend ${r.status} ${(await r.text()).slice(0, 200)}`);
}

export const handler = async (event) => {
  let payload;
  try {
    payload = JSON.parse(event.body || '{}').payload;
  } catch {
    return { statusCode: 200 };
  }
  const messages = plan(payload);
  const key = process.env.RESEND_API_KEY;
  if (!messages.length) return { statusCode: 200 };
  if (!key) {
    console.log(`[autoreply] skipped (no RESEND_API_KEY): form=${payload?.form_name} site=${payload?.site_url}`);
    return { statusCode: 200 };
  }
  for (const m of messages) {
    try {
      await send(key, m);
      console.log(`[autoreply] sent ${m.kind}${m.partner ? `:${m.partner}` : ''} form=${payload.form_name}`);
    } catch (err) {
      console.error(`[autoreply] ${m.kind} failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  return { statusCode: 200 };
};
