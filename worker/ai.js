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

async function claudeJSON(env, { system, prompt, maxTokens = 3000 }) {
  if (!env.ANTHROPIC_API_KEY) return null;
  const call = async (model, strict = true) => fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: anthropicHeaders(env),
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: `${system}\n\nAlways answer by calling the respond tool with a single JSON object.`,
      messages: [{ role: 'user', content: prompt }],
      tools: [RESPOND_TOOL],
      tool_choice: strict ? { type: 'tool', name: 'respond' } : { type: 'any' },
      ...(strict ? { thinking: { type: 'disabled' } } : {}),
    }),
  });
  let model = await resolveModel(env);
  let res = await call(model);
  if (res.status === 404) { model = await resolveModel(env, true); res = await call(model); } // configured model not found
  if (res.status === 400) { // a model that rejects the thinking/tool_choice combination: retry in relaxed mode
    const body = await res.text();
    if (/thinking|tool_choice/i.test(body)) res = await call(model, false);
    else throw new Error(`Anthropic 400: ${body.slice(0, 300)}`);
  }
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
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
    const out = await claudeJSON(env, {
      system: `${BASE_RULES}\n\nYou draft a personalised planning guide for a client after their site visit. A coordinator reviews it before the client sees it. Return ONLY JSON.`,
      prompt: `Event: ${event.title} (${event.event_type})
Client: ${event.contact?.name}${event.contact?.company ? `, ${event.contact.company}` : ''}
Original inquiry: """${event.inquiry_text || ''}"""
Intake answers: ${JSON.stringify(event.intake?.answers || {})}
Coordinator triage: ${JSON.stringify(event.triage?.spaces || [])}

Here is a structurally correct draft built from templates. Rewrite it so it reads as personal and specific to this client (reference their occasion, honoree, agenda, approvers). Keep the same JSON shape and section ids, keep all prices as the KB ranges labelled "indicative", keep "options" and "estimate" unchanged, and keep "brief" and "beo" factual.
${JSON.stringify(base)}

Return JSON: {"guide": {...}, "brief": {...}, "beo": {...}}`,
      maxTokens: 12000,
    });
    return {
      guide: { ...base.guide, ...(out.guide || {}), options: base.guide.options, estimate: base.guide.estimate },
      brief: { ...base.brief, ...(out.brief || {}) },
      beo: { ...base.beo, ...(out.beo || {}) },
    };
  }, fallback);
}

export async function checkChange(env, beo, message) {
  const fallback = () => mockChangeCheck(beo, message);
  return withFallback(env, 'change', async () => {
    const out = await claudeJSON(env, {
      system: `${BASE_RULES}\n\nYou compare a client's new message with the current Banquet Event Order (BEO) and flag every difference that operations must act on. Return ONLY JSON.`,
      prompt: `Current BEO: ${JSON.stringify(beo)}
Client message: """${message}"""

Return JSON:
{"summary":"one sentence","mismatches":[{"field":"...","current":"value on BEO","requested":"what the client now says","departments":["Kitchen"|"AV"|"Staffing"|"Setup"|"Coordinator"],"severity":"high","note":"why it matters operationally"}],
 "suggested_reply":"a short warm reply from the coordinator acknowledging the changes and saying a revised BEO will follow. Never confirm availability, firm prices or discounts."}`,
      maxTokens: 3000,
    });
    if (!Array.isArray(out.mismatches)) throw new Error('bad shape');
    return out;
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
