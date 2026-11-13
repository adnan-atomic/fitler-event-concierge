// Mailgun email for the client guide. Configure in Cloudflare (Worker → Settings → Variables and Secrets):
//   MAILGUN_API_KEY   (secret)  Mailgun private API key
//   MAILGUN_DOMAIN              sending domain, e.g. mg.fitlerclub.com
//   MAILGUN_FROM      optional  "Fitler Club Events <events@mg.fitlerclub.com>"
//   MAILGUN_REGION    optional  "us" (default) or "eu"
//   MAILGUN_REPLY_TO  optional  where client replies go, e.g. events@fitlerclub.com
//   MAILGUN_BCC       optional  coordinator copy of every guide sent
// With no key or domain the feature reports itself as off and nothing is sent.

export function mailConfig(env) {
  const enabled = !!(env.MAILGUN_API_KEY && env.MAILGUN_DOMAIN);
  return {
    enabled,
    domain: env.MAILGUN_DOMAIN,
    from: env.MAILGUN_FROM || (env.MAILGUN_DOMAIN ? `Fitler Club Events <events@${env.MAILGUN_DOMAIN}>` : ''),
    base: env.MAILGUN_API_BASE || (String(env.MAILGUN_REGION || '').toLowerCase() === 'eu' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net'),
    replyTo: env.MAILGUN_REPLY_TO || '',
    bcc: env.MAILGUN_BCC || '',
  };
}

const EMAIL_RE = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[a-z]{2,}$/i;
export function parseRecipients(input) {
  const list = (Array.isArray(input) ? input : String(input || '').split(/[,;\s]+/))
    .map((s) => String(s).trim().toLowerCase()).filter(Boolean);
  const uniq = [...new Set(list)];
  return { valid: uniq.filter((x) => EMAIL_RE.test(x)), invalid: uniq.filter((x) => !EMAIL_RE.test(x)) };
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function decodeBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function readPdf(b64, maxBytes = 9 * 1024 * 1024) {
  const clean = String(b64 || '').replace(/^data:application\/pdf[^,]*,/, '');
  if (!clean) throw Object.assign(new Error('The PDF was empty'), { status: 400 });
  if (clean.length > Math.ceil(maxBytes * 4 / 3) + 8) throw Object.assign(new Error('The PDF is too large to email'), { status: 413 });
  const bytes = decodeBase64(clean);
  const head = String.fromCharCode(...bytes.slice(0, 5));
  if (head !== '%PDF-') throw Object.assign(new Error('That file is not a PDF'), { status: 400 });
  return bytes;
}

export async function sendGuideEmail(env, { to, senderName, eventTitle, note, pdf, filename }) {
  const cfg = mailConfig(env);
  if (!cfg.enabled) throw Object.assign(new Error('Email is not set up yet'), { status: 503 });
  const by = senderName ? `, shared by ${senderName}` : '';
  const subject = `Your Fitler Club event guide: ${eventTitle}`;
  const text = [
    `Here is the Fitler Club planning guide for ${eventTitle}${by}. It is attached as a PDF.`,
    note ? `\nMessage from ${senderName || 'the sender'}:\n${note}` : '',
    '\nThe guide is indicative. Your Fitler Club coordinator confirms dates, pricing and vendors in your proposal and contract.',
    '\nFitler Club · Philadelphia',
  ].join('\n');
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0;background:#212327;font-family:'Century Gothic',Futura,Arial,sans-serif;color:#ffffff">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#212327;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#151515;border:1px solid #34373C">
<tr><td style="background:#071C29;padding:28px 32px;text-align:center">
<div style="font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:30px;color:#ffffff">Fitler Club</div>
<div style="margin-top:8px;font-size:11px;letter-spacing:5px;text-transform:uppercase;color:#CCD1D3;font-weight:bold">Event Planning Concierge</div>
</td></tr>
<tr><td style="padding:28px 32px;font-size:15px;line-height:1.6;color:#ffffff">
<p style="margin:0 0 14px">Here is the Fitler Club planning guide for <b>${esc(eventTitle)}</b>${esc(by)}. It is attached as a PDF.</p>
${note ? `<p style="margin:0 0 14px;padding:12px 16px;border-left:2px solid #ffffff;background:#1B1D20;font-family:Georgia,serif;font-style:italic;color:#CCD1D3">${esc(note).replace(/\n/g, '<br>')}</p>` : ''}
<p style="margin:18px 0 0;font-size:12.5px;color:#A8A8A8">The guide is indicative. Your Fitler Club coordinator confirms dates, pricing and vendors in your proposal and contract.</p>
</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid #34373C;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#A8A8A8;text-align:center">Fitler Club · Philadelphia</td></tr>
</table></td></tr></table></body></html>`;

  const form = new FormData();
  form.append('from', cfg.from);
  for (const r of to) form.append('to', r);
  if (cfg.bcc) form.append('bcc', cfg.bcc);
  if (cfg.replyTo) form.append('h:Reply-To', cfg.replyTo);
  form.append('subject', subject);
  form.append('text', text);
  form.append('html', html);
  form.append('o:tag', 'event-guide');
  form.append('attachment', new Blob([pdf], { type: 'application/pdf' }), filename);

  const res = await fetch(`${cfg.base}/v3/${encodeURIComponent(cfg.domain)}/messages`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(`api:${env.MAILGUN_API_KEY}`) },
    body: form,
  });
  const out = await res.text();
  if (!res.ok) {
    const msg = res.status === 401 ? 'Mailgun rejected the API key' : res.status === 404 ? 'Mailgun does not recognise the sending domain' : `Mailgun error ${res.status}`;
    throw Object.assign(new Error(msg), { status: 502, detail: out.slice(0, 300) });
  }
  let id = null;
  try { id = JSON.parse(out).id; } catch {}
  return { id };
}
