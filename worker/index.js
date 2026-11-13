// Cloudflare Worker: JSON API for the Event Concierge prototype. Static assets (the React app)
// are served by Workers Assets; only /api/* reaches this code.
import { getStore } from './store.js';
import { triage, generateGuide, checkChange, answerFaq, resolveModel } from './ai.js';
import { mockTriage } from './mock.js';
import { checkText, checkGuide } from '../shared/guardrails.js';
import { mailConfig, parseRecipients, readPdf, sendGuideEmail } from './mail.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});
const uuid = () => crypto.randomUUID();
const token = () => crypto.randomUUID().replace(/-/g, '').slice(0, 20);
const typeLabel = { corporate: 'Corporate event', social: 'Social event', wedding: 'Wedding', mitzvah: 'Mitzvah' };

async function faqProbe(env) {
  const r = await answerFaq(env, 'What AV is available?', { title: 'Health check', event_type: 'corporate' });
  if (r.engine !== 'claude') throw new Error(r.error || 'Model call fell back to template');
  return true;
}

function isCoordinator(req, env) {
  if (!env.DEMO_PASSCODE) return true;
  return req.headers.get('x-demo-pass') === env.DEMO_PASSCODE;
}

function clientView(e, requests) {
  return {
    title: e.title, event_type: e.event_type, status: e.status,
    contact: { name: e.contact?.name },
    intake_submitted: !!e.intake?.submitted_at,
    guide: e.status === 'guide_shared' ? e.guide : null,
    requests: requests.filter((r) => r.source === 'client_portal').map((r) => ({
      id: r.id, kind: r.kind, body: r.body, created_at: r.created_at, status: r.status, answer: r.analysis?.answer || null, applied: !!r.analysis?.applied_at,
    })),
  };
}

// Keep the client's planning guide in step when the coordinator applies a new guest count.
function syncGuideGuests(guide, from, to) {
  if (!guide || !to || from === to) return guide;
  const g = structuredClone(guide);
  if (g.estimate?.guests) {
    const ratio = to / g.estimate.guests;
    g.estimate.low = Math.round((g.estimate.low * ratio) / 100) * 100;
    g.estimate.high = Math.round((g.estimate.high * ratio) / 100) * 100;
    g.estimate.guests = to;
  }
  if (from) {
    const fix = (t) => typeof t !== 'string' ? t : t
      .replace(new RegExp(`(Guests:\\s*(?:about|around|roughly)?\\s*)${from}\\b`, 'gi'), `$1${to}`)
      .replace(new RegExp(`\\b(about|around|roughly|for)\\s+${from}\\b`, 'gi'), `$1 ${to}`)
      .replace(new RegExp(`\\b${from}(\\s+(?:seated\\s+)?(?:guests|people|friends|attendees|covers))`, 'gi'), `${to}$1`);
    g.intro = fix(g.intro);
    g.sections = (g.sections || []).map((s) => ({ ...s, body: fix(s.body), items: (s.items || []).map(fix) }));
    g.decisions = (g.decisions || []).map((d) => ({ ...d, text: fix(d.text) }));
    g.next_steps = (g.next_steps || []).map((n) => ({ ...n, text: fix(n.text) }));
  }
  g.updated_at = new Date().toISOString();
  g.update_note = `Updated to ${to} guests`;
  return g;
}

// Apply flagged BEO differences to the BEO draft (coordinator-initiated).
function applyToBeo(beo, mismatches = []) {
  const next = structuredClone(beo || {});
  const applied = [];
  for (const m of mismatches) {
    if (!m.requested || /not stated|unclear|unknown|tbd|tbc|to confirm|n\/a/i.test(String(m.requested))) continue; // nothing concrete to apply
    applied.push(m.field);
    if (m.field === 'Guest count' && /^\d+$/.test(m.requested)) next.guest_count = Number(m.requested);
    else if (m.field.startsWith('Dietary: ')) {
      const need = m.field.slice(9);
      next.dietary = next.dietary || [];
      const cur = next.dietary.find((d) => d.need === need);
      if (cur) cur.count = Number(m.requested) || m.requested; else next.dietary.push({ need, count: Number(m.requested) || m.requested });
    } else if (/start time/i.test(m.field)) {
      const word = m.field.split(' ')[0].toLowerCase();
      const entry = (next.timeline || []).find((x) => x.item.toLowerCase().includes(word));
      if (entry) entry.time = m.requested.replace(/\s?(AM|PM)$/i, ''); else next.start_time = m.requested;
    } else if (m.field === 'AV') {
      const item = m.requested.replace(/^add\s+(a|an|the)?\s*/i, '');
      next.av = [...new Set([...(next.av || []), item.charAt(0).toUpperCase() + item.slice(1)])];
    } else if (m.field === 'Room setup') {
      if (/rounds|long table|theatre|theater|classroom|cocktail|reception|boardroom|u-shape|banquet|lounge|standing/i.test(m.requested)) next.setup = m.requested;
      else applied.pop(); // not a concrete layout: leave for the coordinator
    }
  }
  next.changed = applied;
  next.revision = (next.revision || 1) + 1;
  next.revised_at = new Date().toISOString();
  return next;
}

async function handle(req, env, url) {
  const store = getStore(env);
  const path = url.pathname.replace(/\/+$/, '');
  const method = req.method;
  const body = method === 'GET' ? {} : await req.json().catch(() => ({}));
  const parts = path.split('/').filter(Boolean); // ['api', ...]

  if (path === '/api/config') {
    return json({ needsPasscode: !!env.DEMO_PASSCODE, store: store.kind, ai: env.ANTHROPIC_API_KEY ? 'claude' : 'template', model: env.ANTHROPIC_API_KEY ? (env.ANTHROPIC_MODEL || 'auto') : null, email: mailConfig(env).enabled });
  }
  if (path === '/api/health') {
    // Coordinator-only diagnostics: checks Supabase and Claude connectivity without exposing secrets.
    if (!isCoordinator(req, env)) return json({ error: 'Passcode required' }, 401);
    const mc = mailConfig(env);
    const out = { store: store.kind, ai: env.ANTHROPIC_API_KEY ? 'claude' : 'template', email: mc.enabled ? { provider: 'mailgun', domain: mc.domain, region: mc.base.includes('.eu.') ? 'eu' : 'us', from: mc.from, bcc: !!mc.bcc, reply_to: !!mc.replyTo } : 'off' };
    try { out.events = (await store.listEvents()).length; out.store_ok = true; } catch (e) { out.store_ok = false; out.store_error = e.message.slice(0, 200); }
    if (env.ANTHROPIC_API_KEY) {
      try { out.model = await resolveModel(env); out.ai_ok = !!(await faqProbe(env)); } catch (e) { out.ai_ok = false; out.ai_error = e.message.slice(0, 200); }
    }
    return json(out);
  }
  if (path === '/api/login') {
    return json({ ok: !env.DEMO_PASSCODE || body.passcode === env.DEMO_PASSCODE }, !env.DEMO_PASSCODE || body.passcode === env.DEMO_PASSCODE ? 200 : 401);
  }

  // ---------------- Client portal (token-scoped) ----------------
  if (parts[1] === 'c' && parts[2]) {
    const e = await store.getEventByToken(parts[2]);
    if (!e) return json({ error: 'Not found' }, 404);
    const action = parts[3];
    if (!action && method === 'GET') return json({ ...clientView(e, await store.listRequests(e.id)), email_enabled: mailConfig(env).enabled, contact_email: e.contact?.email || '' });

    if (action === 'intake' && method === 'POST') {
      if (e.status !== 'concierge_sent') return json({ error: 'Intake already submitted' }, 409);
      const intake = { answers: body.answers || {}, submitted_at: new Date().toISOString() };
      await store.updateEvent(e.id, { intake, status: 'intake_complete' });
      await store.log({ event_id: e.id, actor: 'client', action: 'Concierge intake completed' });
      const gen = await generateGuide(env, { ...e, intake });
      await store.updateEvent(e.id, { ...gen.result, status: 'in_review' });
      await store.log({ event_id: e.id, actor: 'ai', action: 'Planning guide, brief and BEO drafted for coordinator review', detail: { engine: gen.engine, ms: gen.ms } });
      return json({ ok: true });
    }
    if (action === 'faq' && method === 'POST') {
      const q = String(body.question || '').slice(0, 500);
      const out = await answerFaq(env, q, e);
      let { answer, answered, source } = out.result;
      if (checkText(answer).length) { answer = "That's one for your coordinator, who will follow up with you personally."; answered = false; }
      if (!answered) {
        await store.insertRequest({ id: uuid(), event_id: e.id, created_at: new Date().toISOString(), kind: 'question', source: 'client_portal', body: q, analysis: { ai_attempt: out.result.answer }, status: 'open' });
      }
      await store.log({ event_id: e.id, actor: 'ai', action: answered ? 'Answered a client FAQ' : 'Routed a client question to the coordinator', detail: { question: q, engine: out.engine } });
      return json({ answer, answered, source, engine: out.engine });
    }
    if (action === 'request' && method === 'POST') {
      const kind = body.kind === 'change' ? 'change' : 'question';
      const text = String(body.body || '').slice(0, 2000);
      let analysis = null;
      if (kind === 'change' && e.beo) analysis = (await checkChange(env, e.beo, text)).result;
      if (body.selections?.length) analysis = { ...(analysis || {}), selections: body.selections };
      await store.insertRequest({ id: uuid(), event_id: e.id, created_at: new Date().toISOString(), kind, source: 'client_portal', body: text, analysis, status: 'open' });
      await store.log({ event_id: e.id, actor: 'client', action: kind === 'change' ? 'Requested a change from the guide' : 'Asked a question in the guide' });
      return json({ ok: true });
    }
    if (action === 'email' && method === 'POST') {
      // Client emails their approved guide (PDF made in the browser) to themselves or colleagues.
      if (!mailConfig(env).enabled) return json({ error: 'Email is not set up yet. Your coordinator can send the guide instead.' }, 503);
      if (e.status !== 'guide_shared' || !e.guide) return json({ error: 'The guide is not ready to send yet' }, 409);
      const { valid, invalid } = parseRecipients(body.to);
      if (invalid.length) return json({ error: `Please check this address: ${invalid[0]}` }, 400);
      if (!valid.length) return json({ error: 'Add at least one email address' }, 400);
      if (valid.length > 3) return json({ error: 'You can send to up to 3 people at a time' }, 400);
      const hourAgo = Date.now() - 3600e3;
      const recent = (await store.listActivity(e.id, 100)).filter((a) => a.action?.startsWith('Emailed the planning guide') && new Date(a.created_at).getTime() > hourAgo);
      if (recent.length >= 5) return json({ error: 'This guide has been emailed several times in the last hour. Please try again later.' }, 429);
      let pdf;
      try { pdf = readPdf(body.pdf_base64); } catch (err) { return json({ error: err.message }, err.status || 400); }
      const slug = String(e.title || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'event';
      try {
        const sent = await sendGuideEmail(env, {
          to: valid, senderName: e.contact?.name, eventTitle: e.title,
          note: String(body.note || '').trim().slice(0, 600), pdf, filename: `fitler-club-${slug}-guide.pdf`,
        });
        await store.log({ event_id: e.id, actor: 'client', action: `Emailed the planning guide to ${valid.length === 1 ? valid[0] : `${valid.length} people`}`, detail: { to: valid, mailgun_id: sent.id, bytes: pdf.length } });
        return json({ ok: true, to: valid });
      } catch (err) {
        await store.log({ event_id: e.id, actor: 'system', action: 'Guide email failed', detail: { error: err.message, detail: err.detail } });
        return json({ error: err.status === 503 ? err.message : `The email could not be sent (${err.message}).` }, err.status || 502);
      }
    }
    return json({ error: 'Unknown client action' }, 404);
  }

  // ---------------- Coordinator API ----------------
  if (!isCoordinator(req, env)) return json({ error: 'Passcode required' }, 401);

  if (path === '/api/reset' && method === 'POST') { await store.reset(); return json({ ok: true }); }

  if (path === '/api/events' && method === 'GET') {
    const [events, requests, activity] = await Promise.all([store.listEvents(), store.listRequests(), store.listActivity(null, 15)]);
    const open = {};
    for (const r of requests) if (r.status === 'open') open[r.event_id] = (open[r.event_id] || 0) + 1;
    return json({
      events: events.map((e) => ({ id: e.id, title: e.title, status: e.status, event_type: e.event_type, contact: e.contact, created_at: e.created_at, updated_at: e.updated_at,
        fit: e.triage?.fit, guests: e.beo?.guest_count || e.triage?.extracted?.guests, date: e.intake?.answers?.date || e.triage?.extracted?.date, open_requests: open[e.id] || 0, space: e.triage?.spaces?.[0]?.space_id || e.triage?.spaces?.[0]?.id || null })),
      activity: activity.map((a) => ({ ...a, event_title: events.find((e) => e.id === a.event_id)?.title })),
    });
  }

  if (path === '/api/events' && method === 'POST') {
    const inquiry = String(body.inquiry_text || '').trim();
    if (!inquiry) return json({ error: 'inquiry_text required' }, 400);
    const contact = body.contact || {};
    const t = await triage(env, inquiry, contact);
    let reply = t.result.reply_draft;
    if (checkText(reply).length) reply = mockTriage(inquiry, contact).reply_draft; // never let a risky draft through
    const type = t.result.extracted?.event_type || 'social';
    const e = {
      id: uuid(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), status: 'inquiry', client_token: token(),
      title: `${contact.company || contact.name || 'New client'} · ${typeLabel[type] || 'Event'}`, event_type: type === 'corporate' ? 'corporate' : type === 'social' ? 'social' : type,
      contact, inquiry_text: inquiry, triage: t.result, reply_draft: reply, intake: null, guide: null, brief: null, beo: null,
    };
    await store.insertEvent(e);
    await store.log({ event_id: e.id, actor: 'ai', action: 'Inquiry triaged; reply drafted', detail: { engine: t.engine, ms: t.ms } });
    return json({ id: e.id, engine: t.engine, ms: t.ms });
  }

  if (parts[1] === 'events' && parts[2]) {
    const e = await store.getEvent(parts[2]);
    if (!e) return json({ error: 'Not found' }, 404);
    const action = parts[3];
    if (!action && method === 'GET') {
      const [requests, activity] = await Promise.all([store.listRequests(e.id), store.listActivity(e.id, 50)]);
      return json({ event: e, requests, activity });
    }
    if (!action && method === 'PATCH') {
      const allowed = {};
      for (const k of ['reply_draft', 'guide', 'title', 'event_type']) if (k in body) allowed[k] = body[k];
      return json({ event: await store.updateEvent(e.id, allowed) });
    }
    if (action === 'triage' && method === 'POST') {
      const t = await triage(env, e.inquiry_text, e.contact);
      const reply = checkText(t.result.reply_draft).length ? mockTriage(e.inquiry_text, e.contact).reply_draft : t.result.reply_draft;
      await store.updateEvent(e.id, { triage: t.result, reply_draft: reply });
      await store.log({ event_id: e.id, actor: 'ai', action: 'Inquiry re-triaged', detail: { engine: t.engine, ms: t.ms } });
      return json({ ok: true, engine: t.engine });
    }
    if (action === 'send-reply' && method === 'POST') {
      const flags = checkText(body.reply || e.reply_draft || '');
      if (flags.length && !body.override_note) return json({ error: 'Guardrail flags', flags }, 409);
      await store.updateEvent(e.id, { reply_draft: body.reply ?? e.reply_draft, status: 'replied' });
      await store.log({ event_id: e.id, actor: 'coordinator', action: 'Reply sent to client', detail: { override_note: body.override_note || null } });
      return json({ ok: true });
    }
    if (action === 'send-concierge' && method === 'POST') {
      await store.updateEvent(e.id, { status: 'concierge_sent', event_type: body.event_type || e.event_type });
      await store.log({ event_id: e.id, actor: 'coordinator', action: 'Site visit completed; concierge link sent' });
      return json({ ok: true, link: `/c/${e.client_token}` });
    }
    if (action === 'generate' && method === 'POST') {
      if (!e.intake) return json({ error: 'No intake yet' }, 409);
      const gen = await generateGuide(env, e);
      await store.updateEvent(e.id, { ...gen.result, status: 'in_review' });
      await store.log({ event_id: e.id, actor: 'ai', action: 'Planning guide regenerated', detail: { engine: gen.engine, ms: gen.ms } });
      return json({ ok: true, engine: gen.engine });
    }
    if (action === 'approve' && method === 'POST') {
      const guide = body.guide || e.guide;
      const flags = checkGuide(guide);
      if (flags.length && !body.override_note) return json({ error: 'Guardrail flags', flags }, 409);
      const approved = { ...guide, approved_at: new Date().toISOString(), approved_by: 'Coordinator' };
      await store.updateEvent(e.id, { guide: approved, status: 'guide_shared' });
      await store.log({ event_id: e.id, actor: 'coordinator', action: `Guide reviewed and shared with client${flags.length ? ` (${flags.length} flag(s) overridden)` : ' (0 guardrail flags)'}`, detail: { override_note: body.override_note || null } });
      return json({ ok: true, link: `/c/${e.client_token}` });
    }
    if (action === 'check-change' && method === 'POST') {
      if (!e.beo) return json({ error: 'No BEO yet' }, 409);
      const msg = String(body.message || '').slice(0, 4000);
      const out = await checkChange(env, e.beo, msg);
      const r = { id: uuid(), event_id: e.id, created_at: new Date().toISOString(), kind: 'email', source: 'coordinator', body: msg, analysis: out.result, status: 'open' };
      await store.insertRequest(r);
      await store.log({ event_id: e.id, actor: 'ai', action: `Client email checked against BEO: ${out.result.mismatches?.length || 0} difference(s) flagged`, detail: { engine: out.engine, ms: out.ms } });
      return json({ request: r, engine: out.engine });
    }
  }

  if (parts[1] === 'requests' && parts[2] && method === 'POST') {
    const action = parts[3];
    const all = await store.listRequests();
    const r = all.find((x) => x.id === parts[2]);
    if (!r) return json({ error: 'Not found' }, 404);
    if (action === 'apply') {
      if (r.status !== 'open' || r.analysis?.applied_at) return json({ error: 'These changes are already on the BEO' }, 409);
      const e = await store.getEvent(r.event_id);
      const beo = applyToBeo(e.beo, r.analysis?.mismatches);
      const gc = (r.analysis?.mismatches || []).find((m) => m.field === 'Guest count' && /^\d+$/.test(String(m.requested)));
      const from = Number((String(gc?.current || e.beo?.guest_count || '').match(/\d+/) || [])[0]) || null;
      const guide = gc && e.guide ? syncGuideGuests(e.guide, from, Number(gc.requested)) : e.guide;
      await store.updateEvent(e.id, guide !== e.guide ? { beo, guide } : { beo });
      if (guide !== e.guide) await store.log({ event_id: e.id, actor: 'coordinator', action: `Client guide updated to ${gc.requested} guests to match the BEO` });
      await store.updateRequest(r.id, { status: 'resolved', analysis: { ...(r.analysis || {}), applied_at: new Date().toISOString() } });
      await store.log({ event_id: e.id, actor: 'coordinator', action: `Applied ${r.analysis?.mismatches?.length || 0} change(s) to BEO (revision ${beo.revision})`, detail: null });
      return json({ ok: true, beo });
    }
    if (action === 'resolve') {
      const answer = body.answer ? String(body.answer).slice(0, 2000) : null;
      if (answer && checkText(answer).length && !body.override_note) return json({ error: 'Guardrail flags', flags: checkText(answer) }, 409);
      await store.updateRequest(r.id, { status: answer ? 'answered' : 'resolved', analysis: { ...(r.analysis || {}), answer } });
      await store.log({ event_id: r.event_id, actor: 'coordinator', action: answer ? 'Answered a client question' : 'Resolved a request' });
      return json({ ok: true });
    }
  }

  return json({ error: 'Not found' }, 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS ? env.ASSETS.fetch(req) : new Response('Not found', { status: 404 });
    try {
      return await handle(req, env, url);
    } catch (err) {
      console.error(err);
      return json({ error: err.message || 'Server error' }, 500);
    }
  },
};
