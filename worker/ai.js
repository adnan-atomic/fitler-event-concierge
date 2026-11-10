// Claude-powered generation, grounded in the Fitler Club knowledge base.
// Every function falls back to the deterministic template (mock.js) if the model is
// unavailable, so the demo never breaks in front of a client.
import { KB } from '../shared/kb.js';
import { mockTriage, mockGuide, mockChangeCheck, mockFaq } from './mock.js';

const KB_JSON = JSON.stringify(KB);

const BASE_RULES = `You work for Fitler Club, a private members club in Philadelphia with a boutique hotel and 10,000 sq ft of event space.
Tone: warm, polished, personal luxury hospitality. Plain language, no hype, no emojis.
Use ONLY facts from the knowledge base below. If something is not in it, say the coordinator will confirm.
Hard rules (these come from Fitler Club and are non-negotiable):
${KB.never.map((r) => `- ${r}`).join('\n')}
- Prices may only appear as ranges taken from the knowledge base and must be labelled "indicative".
- Say "under consideration" or "your coordinator will confirm" for dates and spaces.

KNOWLEDGE BASE (sample data):
${KB_JSON}`;

const anthropicHeaders = (env) => ({
  'x-api-key': env.ANTHROPIC_API_KEY.trim(),
  'anthropic-version': '2023-06-01',
  'content-type': 'application/json',
});

let resolvedModel = null;
// Use ANTHROPIC_MODEL if set and valid; otherwise pick the newest Sonnet model the key can access.
export async function resolveModel(env, force = false) {
  if (resolvedModel && !force) return resolvedModel;
  if (env.ANTHROPIC_MODEL && !force) { resolvedModel = env.ANTHROPIC_MODEL; return resolvedModel; }
  const res = await fetch('https://api.anthropic.com/v1/models?limit=100', { headers: anthropicHeaders(env) });
  if (!res.ok) throw new Error(`Anthropic models ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const ids = ((await res.json()).data || []).map((m) => m.id);
  resolvedModel = ids.find((id) => /sonnet/i.test(id)) || ids[0];
  if (!resolvedModel) throw new Error('No models available for this key');
  return resolvedModel;
}

// Structured output: Claude must answer by calling the `respond` tool, so the API returns parsed JSON.
const RESPOND_TOOL = {
  name: 'respond',
  description: 'Return your complete answer as a JSON object with exactly the fields requested.',
  input_schema: { type: 'object', additionalProperties: true },
};

// Try the strictest request shape first, then relax for models that reject a parameter combination.
const MODES = [
  { tools: true, choice: { type: 'tool', name: 'respond' }, thinkingOff: true },
  { tools: true, choice: { type: 'auto' }, thinkingOff: false },
  { tools: false, choice: null, thinkingOff: false },
];
let workingMode = 0;

async function claudeJSON(env, { system, prompt, maxTokens = 3000 }) {
  if (!env.ANTHROPIC_API_KEY) return null;
  const call = (model, mode) => fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: anthropicHeaders(env),
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: `${system}\n\n${mode.tools ? 'Always answer by calling the respond tool with a single JSON object.' : 'Respond with a single JSON object only: no prose, no markdown fences.'}`,
      messages: [{ role: 'user', content: prompt }],
      ...(mode.tools ? { tools: [RESPOND_TOOL], tool_choice: mode.choice } : {}),
      ...(mode.thinkingOff ? { thinking: { type: 'disabled' } } : {}),
    }),
  });
  let model = await resolveModel(env);
  let res;
  const errors = [];
  for (let i = workingMode; i < MODES.length; i++) {
    res = await call(model, MODES[i]);
    if (res.status === 404 && i === workingMode) { model = await resolveModel(env, true); res = await call(model, MODES[i]); }
    if (res.status === 400) { errors.push((await res.text()).slice(0, 400)); continue; }
    workingMode = i;
    break;
  }
  if (res.status === 400) throw new Error(`Anthropic 400 in all modes: ${errors.join(' | ')}`);
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const data = await res.json();
  const tool = (data.content || []).find((c) => c.type === 'tool_use' && c.input && typeof c.input === 'object');
  if (tool) return tool.input;
  const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text || '').join('');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
  throw new Error(`No structured output (model ${model}, stop ${data.stop_reason}, blocks ${(data.content || []).map((c) => c.type).join(',')})`);
}

async function withFallback(env, label, aiFn, mockFn) {
  const t0 = Date.now();
  try {
    const out = await aiFn();
    if (out) return { result: out, engine: 'claude', ms: Date.now() - t0 };
  } catch (err) {
    console.error(`[ai:${label}]`, err.message);
    return { result: mockFn(), engine: 'template', ms: Date.now() - t0, error: err.message };
  }
  return { result: mockFn(), engine: 'template', ms: Date.now() - t0 };
}

export async function triage(env, inquiry, contact) {
  const fallback = () => mockTriage(inquiry, contact);
  return withFallback(env, 'triage', async () => {
    const base = fallback(); // deterministic capacity/lead-time maths, which the model then refines
    const out = await claudeJSON(env, {
      system: `${BASE_RULES}\n\nYou help an event coordinator triage a new inquiry. Return ONLY JSON.`,
      prompt: `New inquiry from ${contact?.name || 'a prospect'}${contact?.company ? ` (${contact.company})` : ''}${contact?.is_member ? ', who is a club member' : ''}:
"""${inquiry}"""

Pre-computed facts (trust these numbers): ${JSON.stringify({ extracted: base.extracted, spaces: base.spaces, signals: base.signals })}

Fields to return (spaces: at most 3, best first; use null for unknown values):
{
 "extracted": {"event_type":"corporate|social|wedding|mitzvah","guests":0,"date":"","format":"","is_member":false,"planner":false,"budget":""},
 "spaces": [{"space_id":"id from KB","name":"...","capacity":0,"reason":"one short sentence"}],
 "signals": [{"label":"...","value":"...","tone":"good|warn|bad|neutral"}],
 "fit": "Strong fit | Good fit, a few things to ask | Review before pursuing",
 "missing": ["what we still need to ask"],
 "reply_draft": "A short, personal first reply in the coordinator's voice (signed 'Fitler Club Events'). Suggest a space, ask for the missing details (max 3), invite them for a 30-minute tour. NEVER confirm availability, NEVER quote a price, NEVER promise a discount."
}`,
      maxTokens: 3000,
    });
    return { ...base, ...out, extracted: { ...base.extracted, ...(out.extracted || {}) } };
  }, fallback);
}

export async function generateGuide(env, event) {
  const coordinator = env.COORDINATOR_NAME || 'the Fitler Club Events Team';
  const fallback = () => mockGuide(event, coordinator);
  return withFallback(env, 'guide', async () => {
    const base = fallback();
    const g = base.guide;
    const out = await claudeJSON(env, {
      system: `${BASE_RULES}\n\nYou personalise a client planning guide after their site visit. A coordinator reviews it before the client sees it.`,
      prompt: `Event: ${event.title} (${event.event_type})
Client: ${event.contact?.name}${event.contact?.company ? `, ${event.contact.company}` : ''}
Original inquiry: """${event.inquiry_text || ''}"""
Client's concierge answers: ${JSON.stringify(event.intake?.answers || {})}
Suggested spaces: ${JSON.stringify(event.triage?.spaces || [])}

Template draft (facts and ranges are correct; wording is generic):
intro: ${JSON.stringify(g.intro)}
sections: ${JSON.stringify(g.sections.map(({ id, heading, body, items }) => ({ id, heading, body, items })))}
decisions: ${JSON.stringify(g.decisions.map((d) => d.text))}
next_steps: ${JSON.stringify(g.next_steps)}

Rewrite it for this specific client:
- Warm, specific intro (2-3 sentences) referencing their occasion and who signs off.
- Keep the same section ids and order. Keep every price exactly as given and labelled "indicative".
- Build the "run" section items from the client's own agenda where they gave one (format "HH:MM — item").
- Reflect their answers exactly (e.g. arrival "A mix" means some guests drive, not most).
- Decisions: 4-6 short items. Next steps: 3-4 items, owner "You" or "Fitler Club".
- Also return beo_timeline matching the run of show.

Return ALL five keys (beo_timeline is required): {"intro":"...","sections":[{"id":"...","heading":"...","body":"...","items":["..."]}],"decisions":["..."],"next_steps":[{"owner":"You","text":"..."}],"beo_timeline":[{"time":"8:30","item":"..."}]}`,
      maxTokens: 8000,
    });
    const o = out.guide && !out.sections ? out.guide : out; // tolerate a wrapped answer
    console.log('[ai:guide] keys', Object.keys(o || {}).join(','));
    if (!Array.isArray(o.sections) || !o.sections.length) throw new Error('Guide rewrite missing sections');
    const sections = g.sections.map((sec) => {
      const r = o.sections.find((x) => x.id === sec.id);
      return r ? { ...sec, heading: r.heading || sec.heading, body: r.body ?? sec.body, items: Array.isArray(r.items) ? r.items : sec.items } : sec;
    });
    const guide = {
      ...g,
      intro: o.intro || g.intro,
      sections,
      decisions: Array.isArray(o.decisions) && o.decisions.length ? o.decisions.map((t, i) => ({ id: `d${i + 1}`, text: typeof t === 'string' ? t : t.text })) : g.decisions,
      next_steps: Array.isArray(o.next_steps) && o.next_steps.length ? o.next_steps.map((n) => (typeof n === 'string' ? { owner: 'Fitler Club', text: n } : n)) : g.next_steps,
    };
    const beo = { ...base.beo };
    if (Array.isArray(o.beo_timeline) && o.beo_timeline.length) {
      beo.timeline = o.beo_timeline.map((t) => ({ time: String(t.time || ''), item: String(t.item || '') }));
    } else {
      // Derive the BEO timeline from the personalised run of show ("HH:MM — item").
      const run = sections.find((x) => x.id === 'run');
      const parsed = (run?.items || []).map((line) => String(line).match(/^\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*[—–-]+\s*(.+)$/i)).filter(Boolean);
      if (parsed.length >= 2) beo.timeline = parsed.map((m) => ({ time: m[1].trim(), item: m[2].trim() }));
    }
    const first = beo.timeline?.[0]?.time;
    if (first && /^\d/.test(first)) beo.start_time = /am|pm/i.test(first) ? first : `${first} ${Number(first.split(':')[0]) < 7 || Number(first.split(':')[0]) === 12 ? 'PM' : 'AM'}`;
    const brief = { ...base.brief, timeline: beo.timeline.map((t) => `${t.time} ${t.item}`.trim()).join(' | ') };
    return { guide, brief, beo };
  }, fallback);
}

const DIET_NEEDS = ['Vegetarian', 'Vegan', 'Gluten-free', 'Dairy-free', 'Nut allergy', 'Shellfish allergy', 'Kosher-style', 'Halal'];
// Map free-form model labels onto the field names the BEO "apply" step understands.
function normalizeMismatch(m) {
  const f = String(m.field || '');
  const req = String(m.requested ?? '');
  const num = (req.match(/\d+/) || [])[0];
  const text = `${f} ${req}`.toLowerCase();
  let field = f;
  let requested = req;
  if (/guest|headcount|attendee|count/i.test(f) && !/diet|vegan|vegetarian|allerg/i.test(text)) { field = 'Guest count'; requested = num || req; }
  else if (/diet|vegan|vegetarian|gluten|nut|kosher|halal|dairy|shellfish|allerg/i.test(text)) {
    const need = DIET_NEEDS.find((d) => text.includes(d.toLowerCase().split(/[ -]/)[0])) || 'Other dietary';
    field = `Dietary: ${need}`; requested = num || req;
  } else if (/time|start|schedule/i.test(f)) {
    const meal = (text.match(/dinner|lunch|breakfast|drinks|cocktail|reception/) || [])[0];
    field = meal ? `${meal[0].toUpperCase()}${meal.slice(1)} start time` : 'Start time';
    requested = (req.match(/\d{1,2}(:\d{2})?\s*(am|pm)?/i) || [req])[0].toUpperCase();
  } else if (/\bav\b|audio|podium|mic|projector|screen|livestream/i.test(text)) { field = 'AV'; requested = /^add /i.test(req) ? req : `Add ${req}`; }
  else if (/setup|layout|seating/i.test(f)) field = 'Room setup';
  else if (/capacity|space|room/i.test(f)) field = 'Space capacity';
  else if (/date/i.test(f)) field = 'Event date';
  const departments = (m.departments || []).map((d) => String(d).charAt(0).toUpperCase() + String(d).slice(1));
  return { ...m, field, requested, current: String(m.current ?? ''), departments };
}

export async function checkChange(env, beo, message) {
  const fallback = () => mockChangeCheck(beo, message);
  return withFallback(env, 'change', async () => {
    const out = await claudeJSON(env, {
      system: `${BASE_RULES}\n\nYou compare a client's new message with the current Banquet Event Order (BEO) and flag every difference that operations must act on. Return ONLY JSON.`,
      prompt: `Current BEO: ${JSON.stringify(beo)}
Client message: """${message}"""

Return JSON:
{"summary":"one sentence","mismatches":[{"field":"one of: Guest count | Dietary: <need> | <Meal> start time | AV | Room setup | Space capacity | Event date | Other","current":"value on BEO","requested":"what the client now says","departments":["Kitchen"|"AV"|"Staffing"|"Setup"|"Coordinator"],"severity":"high","note":"why it matters operationally"}],
 "suggested_reply":"a short warm reply from the coordinator acknowledging the changes and saying a revised BEO will follow. Never confirm availability, firm prices or discounts."}`,
      maxTokens: 3000,
    });
    if (!Array.isArray(out.mismatches)) throw new Error('bad shape');
    return { ...out, mismatches: out.mismatches.map(normalizeMismatch) };
  }, fallback);
}

export async function answerFaq(env, question, event) {
  const fallback = () => mockFaq(question);
  return withFallback(env, 'faq', async () => {
    const out = await claudeJSON(env, {
      system: `${BASE_RULES}\n\nYou are the Fitler Club event concierge answering a prospective client's question. Answer in 2–4 sentences from the knowledge base only. If the answer depends on availability, firm pricing, a vendor commitment, a discount or a policy exception, say the coordinator will follow up personally and set "answered": false. Return ONLY JSON.`,
      prompt: `Client event: ${event?.title || ''} (${event?.event_type || ''}). Question: """${question}"""
Return JSON: {"answer":"...","answered":true,"source":"which KB entry you used"}`,
      maxTokens: 1000,
    });
    if (!out.answer) throw new Error('bad shape');
    return out;
  }, fallback);
}
