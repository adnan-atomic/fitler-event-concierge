// Storage adapter: Supabase (PostgREST) when configured, otherwise in-memory for local demo.
import { seedEvents } from './seed.js';

const mem = { events: [], requests: [], activity: [], seeded: false };

function memStore() {
  if (!mem.seeded) { applySeed(mem); mem.seeded = true; }
  const byDate = (a, b) => (a.created_at < b.created_at ? 1 : -1);
  return {
    kind: 'memory',
    async listEvents() { return [...mem.events].sort(byDate); },
    async getEvent(id) { return mem.events.find((e) => e.id === id) || null; },
    async getEventByToken(t) { return mem.events.find((e) => e.client_token === t) || null; },
    async insertEvent(e) { mem.events.push(e); return e; },
    async updateEvent(id, patch) {
      const e = mem.events.find((x) => x.id === id); if (!e) return null;
      Object.assign(e, patch, { updated_at: new Date().toISOString() }); return e;
    },
    async listRequests(eventId) { return mem.requests.filter((r) => !eventId || r.event_id === eventId).sort(byDate); },
    async insertRequest(r) { mem.requests.push(r); return r; },
    async updateRequest(id, patch) { const r = mem.requests.find((x) => x.id === id); if (r) Object.assign(r, patch); return r; },
    async listActivity(eventId, limit = 50) {
      return mem.activity.filter((a) => !eventId || a.event_id === eventId).sort(byDate).slice(0, limit);
    },
    async log(a) { mem.activity.push({ id: mem.activity.length + 1, created_at: new Date().toISOString(), ...a }); },
    async reset() { mem.events = []; mem.requests = []; mem.activity = []; applySeed(mem); },
  };
}

function applySeed(target) {
  const { events, requests, activity } = seedEvents();
  target.events.push(...events); target.requests.push(...requests); target.activity.push(...activity);
}

function supaStore(env) {
  const base = env.SUPABASE_URL.trim().replace(/\/$/, '') + '/rest/v1';
  const key = env.SUPABASE_SERVICE_KEY.trim();
  const headers = {
    apikey: key,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
  // Legacy service_role keys are JWTs and also go in Authorization; new sb_secret_ keys only need apikey.
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  async function q(path, init = {}) {
    const res = await fetch(base + path, { ...init, headers: { ...headers, ...(init.headers || {}) } });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    const txt = await res.text();
    return txt ? JSON.parse(txt) : null;
  }
  const one = (rows) => (rows && rows[0]) || null;
  return {
    kind: 'supabase',
    async listEvents() { return q('/events?select=*&order=created_at.desc'); },
    async getEvent(id) { return one(await q(`/events?id=eq.${encodeURIComponent(id)}&select=*`)); },
    async getEventByToken(t) { return one(await q(`/events?client_token=eq.${encodeURIComponent(t)}&select=*`)); },
    async insertEvent(e) { return one(await q('/events', { method: 'POST', body: JSON.stringify(e) })); },
    async updateEvent(id, patch) {
      return one(await q(`/events?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) }));
    },
    async listRequests(eventId) {
      return q(`/requests?select=*${eventId ? `&event_id=eq.${encodeURIComponent(eventId)}` : ''}&order=created_at.desc`);
    },
    async insertRequest(r) { return one(await q('/requests', { method: 'POST', body: JSON.stringify(r) })); },
    async updateRequest(id, patch) { return one(await q(`/requests?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) })); },
    async listActivity(eventId, limit = 50) {
      return q(`/activity?select=*${eventId ? `&event_id=eq.${encodeURIComponent(eventId)}` : ''}&order=created_at.desc&limit=${limit}`);
    },
    async log(a) { await q('/activity', { method: 'POST', body: JSON.stringify(a), headers: { Prefer: 'return=minimal' } }); },
    async reset() {
      await q('/events?id=not.is.null', { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      await q('/activity?id=gt.0', { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      const { events, requests, activity } = seedEvents();
      if (events.length) await q('/events', { method: 'POST', body: JSON.stringify(events), headers: { Prefer: 'return=minimal' } });
      if (requests.length) await q('/requests', { method: 'POST', body: JSON.stringify(requests), headers: { Prefer: 'return=minimal' } });
      if (activity.length) await q('/activity', { method: 'POST', body: JSON.stringify(activity.map(({ id, ...a }) => a)), headers: { Prefer: 'return=minimal' } });
    },
  };
}

export function getStore(env) {
  return env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY ? supaStore(env) : memStore();
}
