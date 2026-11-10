// Deterministic "template AI" used when no Anthropic key is configured or a model call fails.
// It keeps the demo working offline and doubles as the fallback shape for model output.
import { KB, money, range } from '../shared/kb.js';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_RE = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?/i;

export function parseGuests(text = '') {
  const m = text.match(/(\d{2,4})\s*(?:-|–|to)?\s*(\d{2,4})?\s*(?:guests|people|attendees|ppl|pax|persons|colleagues|of us|employees|team members|friends|adults)/i)
    || text.match(/(?:group of|party of|now|about|around|roughly|~)\s*(\d{2,4})\b(?!\s*(?:am|pm|:))/i);
  if (!m) return null;
  return Number(m[2] || m[1]);
}

export function parseDate(text = '', now = new Date()) {
  const m = text.match(MONTH_RE);
  if (!m) return null;
  const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
  const day = Number(m[2]);
  const year = m[3] ? Number(m[3]) : now.getUTCFullYear();
  let d = new Date(Date.UTC(year, mi, day));
  if (!m[3] && d < now) d = new Date(Date.UTC(year + 1, mi, day));
  return { label: m[0].trim(), iso: d.toISOString().slice(0, 10), daysOut: Math.round((d - now) / 86400000) };
}

export function detectType(text = '') {
  const t = text.toLowerCase();
  if (/\bwedding|rehearsal dinner|engagement party/.test(t)) return 'wedding';
  if (/mitzvah/.test(t)) return 'mitzvah';
  if (/donor|fundraiser|gala|nonprofit|non-profit|foundation|\bfund\b|offsite|off-site|conference|board meeting|client|launch|our team|company|corporate|summit|workshop|quarterly|leadership|panel|investor|firm|holiday party for (?:our|the) (?:team|staff|office)|ceo|cfo/.test(t)) return 'corporate';
  return 'social';
}

function formatFrom(text = '') {
  const t = text.toLowerCase();
  if (/dinner|seated|plated/.test(t) && !/offsite|meeting|workshop|strategy/.test(t)) return 'seated dinner';
  if (/meeting|offsite|workshop|board|strategy|conference|session/.test(t)) return 'meeting';
  if (/cocktail|reception|happy hour|mixer|networking/.test(t)) return 'reception';
  if (/brunch|lunch|breakfast/.test(t)) return 'daytime meal';
  if (/screening|film|movie/.test(t)) return 'screening';
  return 'reception';
}

function capOf(s, format) {
  if (format === 'reception') return s.reception;
  if (format === 'screening') return s.theatre || 0;
  if (format === 'meeting') return Math.max(s.seated, s.theatre || 0);
  return s.seated;
}

export function suggestSpaces(guests, format, type) {
  const g = guests || 40;
  const pool = format === 'meeting' ? KB.spaces.filter((s) => ['boardroom', 'gallery', 'hall'].includes(s.id)) : KB.spaces;
  const roomy = (s) => (capOf(s, format) >= g * 1.15 ? 0 : 1); // prefer some headroom
  const fits = pool.filter((s) => capOf(s, format) >= g).sort((a, b) => roomy(a) - roomy(b) || capOf(a, format) - capOf(b, format));
  const out = fits.slice(0, 2).map((s, i) => ({
    space_id: s.id, name: s.name, capacity: capOf(s, format),
    reason: `${i === 0 ? 'Best fit' : 'Alternative'}: holds ${capOf(s, format)} for a ${format}. Highlights: ${s.features.slice(0, 2).join(', ')}.`,
  }));
  if (type === 'corporate' && format === 'meeting' && g <= 40 && !out.find((s) => s.space_id === 'pdr')) {
    out.push({ space_id: 'pdr', name: 'Private Dining Room', capacity: 40, reason: 'Pair with the meeting space for a seated team dinner.' });
  }
  if (!out.length) out.push({ space_id: 'hall', name: 'Main Event Hall', capacity: 500, reason: 'Largest space; this group size may need a full buyout.' });
  return out;
}

function menuFor(format, timing = '') {
  const t = `${format} ${timing}`.toLowerCase();
  const by = (id) => KB.menus.find((m) => m.id === id);
  if (/breakfast|morning/.test(t)) return by('breakfast');
  if (/brunch/.test(t)) return by('brunch');
  if (/family/.test(t)) return by('family');
  if (/plated|seated|evening/.test(t)) return by('plated');
  if (/midday|lunch|daytime|meeting|full day/.test(t)) return by('lunch');
  return by('reception');
}

const joinList = (arr) => (arr.length <= 1 ? arr.join('') : `${arr.slice(0, -1).join(', ')} and ${arr[arr.length - 1]}`);

export function mockTriage(inquiry, contact = {}) {
  const guests = parseGuests(inquiry);
  const date = parseDate(inquiry);
  const type = detectType(inquiry);
  const format = formatFrom(inquiry);
  const spaces = suggestSpaces(guests, format, type);
  const isMember = !!contact.is_member || /\bI(?:'m| am) a member|\bmember\b/i.test(inquiry);
  const planner = /planner|agency|on behalf of|assistant to|\bEA\b|executive assistant|coordinator for/i.test(inquiry);
  const menu = menuFor(format, /dinner/i.test(inquiry) ? 'evening' : '');
  const estFnb = guests ? guests * ((menu.pp[0] + menu.pp[1]) / 2 + 40) : null;
  const top = KB.spaces.find((s) => s.id === spaces[0].space_id);

  const signals = [];
  signals.push(guests ? { label: 'Capacity', value: `${guests} guests fits the ${spaces[0].name} (up to ${spaces[0].capacity})`, tone: 'good' }
    : { label: 'Capacity', value: 'Guest count not stated. Ask.', tone: 'warn' });
  signals.push(isMember ? { label: 'Membership', value: 'Member: more flexibility on minimums', tone: 'good' }
    : { label: 'Membership', value: 'Non-member', tone: 'neutral' });
  if (date) {
    signals.push(date.daysOut < 21
      ? { label: 'Lead time', value: `${date.daysOut} days out. Short notice${isMember ? ', but a member' : '; be selective'}.`, tone: isMember ? 'warn' : 'bad' }
      : { label: 'Lead time', value: `${date.daysOut} days out`, tone: 'good' });
  } else signals.push({ label: 'Lead time', value: 'No date given. Ask for options.', tone: 'warn' });
  if (estFnb && top?.fnbMin) {
    signals.push(estFnb >= top.fnbMin[0]
      ? { label: 'F&B minimum', value: `Indicative spend ~${money(estFnb)} likely meets the minimum`, tone: 'good' }
      : { label: 'F&B minimum', value: `Indicative spend ~${money(estFnb)} may fall short of the minimum`, tone: 'warn' });
  }
  const budgetTxt = (inquiry.match(/\$\s?(\d[\d,.]*)\s*(k)?/i) || []);
  const budgetNum = budgetTxt[1] ? Number(budgetTxt[1].replace(/,/g, '')) * (budgetTxt[2] ? 1000 : 1) : null;
  if (budgetNum && top?.fnbMin && budgetNum < top.fnbMin[0]) {
    const i = signals.findIndex((x) => x.label === 'F&B minimum'); if (i >= 0) signals.splice(i, 1);
    signals.push({ label: 'Budget', value: `Stated budget ${money(budgetNum)} is below the ${top.name} minimum (from ${money(top.fnbMin[0])})`, tone: 'bad' });
  }
  if (planner) signals.push({ label: 'Who is asking', value: 'Assistant or professional planner', tone: 'neutral' });
  if (type === 'wedding' || type === 'mitzvah') signals.push({ label: 'Event type', value: `${type[0].toUpperCase() + type.slice(1)}: hand-held track, outside concierge v1`, tone: 'warn' });

  const bad = signals.filter((s) => s.tone === 'bad').length;
  const warn = signals.filter((s) => s.tone === 'warn').length;
  const fit = bad ? 'Review before pursuing' : warn > 1 ? 'Good fit, a few things to ask' : 'Strong fit';

  const missing = [];
  if (!guests) missing.push('your approximate guest count');
  if (!date) missing.push('the dates you are considering');
  missing.push(type === 'corporate' ? 'a rough outline of the agenda' : 'the feel you have in mind for the evening');
  if (!/budget|\$/.test(inquiry)) missing.push('whether you are working to a budget');

  const first = (contact.name || 'there').split(' ')[0];
  const occasion = `your ${type === 'corporate' ? 'event' : 'celebration'}${guests ? ` for ${guests}` : ''}`;
  const reply = `Hi ${first},

Thank you so much for reaching out to Fitler Club about ${occasion}. I'd love to help bring it together.

From what you've shared, the ${spaces[0].name} comes to mind first. It comfortably holds ${spaces[0].capacity}, and guests love the ${KB.spaces.find((s) => s.id === spaces[0].space_id)?.features[0]}.${spaces[1] ? ` The ${spaces[1].name} could also work well, depending on the format.` : ''}${date ? ` I'll check our calendar for ${date.label} and come back to you with options.` : ''}

So I can put together the right proposal, could you share ${joinList(missing.slice(0, 3))}?

I'd also love to show you the club in person. Would a 30-minute tour sometime next week work for you?

Warm regards,
Fitler Club Events`;

  return {
    extracted: {
      event_type: type, guests, date: date?.label || null, date_iso: date?.iso || null,
      format, is_member: isMember, planner, budget: (inquiry.match(/\$\s?\d[\d,]*k?/i) || [null])[0],
    },
    spaces, signals, fit, missing, reply_draft: reply,
  };
}

const list = (arr) => (arr || []).filter(Boolean);
const asArr = (v) => (Array.isArray(v) ? v : v ? [v] : []);

export function mockGuide(event, coordinator = 'the Fitler Club Events Team') {
  const a = event.intake?.answers || {};
  const type = event.event_type === 'social' ? 'social' : 'corporate';
  const guests = Number(a.guests) || event.triage?.extracted?.guests || 40;
  const formats = asArr(a.format);
  const format = formats.some((f) => /dinner/i.test(f)) ? 'seated dinner'
    : formats.some((f) => /meeting|presentation|breakout/i.test(f)) ? 'meeting' : 'reception';
  const spaces = event.triage?.spaces?.length ? event.triage.spaces : suggestSpaces(guests, format, type);
  const space = KB.spaces.find((s) => s.id === spaces[0].space_id) || KB.spaces[0];
  const by = (id) => KB.menus.find((m) => m.id === id);
  const fnb = a.fnb || '';
  const menu = /family/i.test(fnb) ? by('family') : /plated/i.test(fnb) ? by('plated') : /buffet/i.test(fnb) ? by('lunch')
    : /breakfast|brunch/i.test(fnb) ? by('brunch') : /passed|station/i.test(fnb) ? by('reception') : menuFor(format, a.timing);
  const barTxt = a.bar || '';
  const bar = /beer/i.test(barTxt) ? KB.bar[0] : /full|signature/i.test(barTxt) ? KB.bar[1] : /consumption/i.test(barTxt) ? KB.bar[2] : /zero/i.test(barTxt) ? KB.bar[3] : KB.bar[0];
  const avMap = { 'Screen / projector': 'screen', Microphones: 'mics', Podium: 'podium', 'Livestream / hybrid': 'stream', 'Music / DJ sound': 'dj', Uplighting: 'uplight' };
  const avItems = asArr(a.av).map((x) => KB.av.find((v) => v.id === avMap[x])).filter(Boolean);
  const diet = asArr(a.dietary).filter((x) => !/none/i.test(x));
  const driving = /driv/i.test(a.arrival || '');
  const someDriving = /mix/i.test(a.arrival || '');
  const timing = a.timing || '';
  const evening = /evening/i.test(timing);
  const fullDay = /full day|multi/i.test(timing);

  const run = fullDay
    ? ['8:30 — Arrival, coffee & light breakfast', `9:00 — Opening session in the ${space.name}`, '10:30 — Break', '12:30 — Lunch',
      '1:30 — Breakouts (Boardroom)', '4:30 — Wrap-up', '6:00 — Welcome cocktail in the Pre-function Gallery', '7:00 — Seated dinner']
    : evening
      ? ['5:30 — Vendor load-in & setup', '6:30 — Guests arrive; welcome drink', `7:15 — ${format === 'seated dinner' ? 'Seated dinner' : 'Stations open'}`,
        '8:15 — Toasts or remarks', '9:00 — Dessert & coffee', '10:00 — Last call & farewell']
      : ['Arrival & welcome', 'Main programme', 'Food & beverage service', 'Close'];

  const decisions = list([
    !fnb || /not sure/i.test(fnb) ? 'Choose a dining style (we can share sample menus)' : `Choose your ${menu.name.toLowerCase()} menu with our culinary team`,
    'Confirm your final guest count by the deadline in your contract',
    diet.length ? 'Share final counts for each dietary need' : 'Tell us about any dietary needs as RSVPs come in',
    avItems.length ? 'Confirm AV needs and send any presentation files' : null,
    'Pick any add-ons you would like priced in your proposal',
    a.approvers ? `Get sign-off from your approvers (${a.approvers.replace(/\.$/, '')})` : null,
  ]).map((text, i) => ({ id: `d${i + 1}`, text }));

  const addonIds = type === 'corporate'
    ? ['welcome', 'signage', 'dessert', 'rooms', 'valet', 'cowork', 'screening']
    : ['welcome', 'florals', 'latenight', 'photobooth', 'wine', 'rooms', 'valet'];
  const options = addonIds.map((id) => KB.addons.find((x) => x.id === id)).filter(Boolean)
    .filter((x) => x.id !== 'valet' || driving || someDriving)
    .filter((x) => x.id !== 'rooms' || !/^no/i.test(a.rooms || ''))
    .map((x) => ({ id: x.id, name: x.name, category: x.category, range: x.range, unit: x.unit }));

  const lowEst = guests * (menu.pp[0] + (bar.pp ? bar.pp[0] : 0)) + avItems.reduce((s, v) => s + v.range[0], 0);
  const highEst = guests * (menu.pp[1] + (bar.pp ? bar.pp[1] : 0)) + avItems.reduce((s, v) => s + v.range[1], 0);
  const name = event.contact?.name?.split(' ')[0] || 'there';

  const guide = {
    title: event.title || 'Your event at Fitler Club',
    intro: `Hi ${name}, thank you for walking through the club with us. This guide pulls together everything you shared so you, your team and anyone who signs off can see the plan in one place. ${coordinator.charAt(0).toUpperCase() + coordinator.slice(1)} will keep it up to date with you.`,
    sections: [
      { id: 'glance', heading: 'Your event at a glance', body: a.occasion || '', items: list([
        `Date under consideration: ${a.date || 'to be discussed'} (your coordinator confirms availability)`,
        `Guests: about ${guests}`,
        timing ? `Timing: ${timing}` : null,
        formats.length ? `Format: ${formats.join(', ')}` : null,
      ]) },
      { id: 'spaces', heading: 'Spaces we discussed', body: `For about ${guests} guests we suggest the ${space.name}, with ${space.features.join(', ')}.`, items: list([
        `Layout options: ${space.layouts.join(', ')}`,
        spaces[1] ? `Also worth considering: ${spaces[1].name}` : null,
      ]) },
      { id: 'run', heading: 'Suggested run of show', body: 'A starting point to react to. We will refine the timings together.', items: run },
      { id: 'fnb', heading: 'Food & beverage direction', body: `Based on your answers: ${menu.name.toLowerCase()}, with ${bar.name.toLowerCase()}.`, items: [
        `${menu.name}: indicative ${range(menu.pp)} per guest`,
        `${bar.name}: ${bar.pp ? `indicative ${range(bar.pp)} per guest` : bar.note}`,
        'Your menu is built with our culinary team once you book.',
      ] },
      { id: 'dietary', heading: 'Dietary needs', body: KB.dietaryNote,
        items: diet.length ? list([...diet, a.dietary_detail ? `Counts so far: ${a.dietary_detail}` : null]) : ['None noted yet'] },
      { id: 'av', heading: 'AV & production', body: avItems.length ? 'In-house AV for what you described:' : 'No AV requested so far. It is easy to add later.',
        items: avItems.map((v) => `${v.name}: indicative ${range(v.range)}`) },
      { id: 'arrival', heading: 'Getting here & parking', body: KB.policies.parking, items: list([
        driving ? 'Most guests are driving, so valet is worth considering (see the add-ons below).' : someDriving ? 'Some guests will drive; valet is available if helpful.' : null,
        /yes|possibly/i.test(a.rooms || '') ? `Our ${KB.venue.hotelKeys}-room boutique hotel is in the building; a room block can be included in your proposal.` : null,
      ]) },
      { id: 'vendors', heading: 'Vendor ideas', body: 'Suggestions only. You are always welcome to bring your own.', items: KB.vendors
        .filter((v) => (type === 'corporate' ? /Photo|AV|Florals/.test(v.category) : !/AV production/.test(v.category)))
        .map((v) => `${v.category}: ${v.names.join(' or ')}`) },
      { id: 'policies', heading: 'Good to know', body: '', items: [KB.policies.guarantee, KB.policies.access, KB.policies.deposit] },
    ],
    decisions,
    next_steps: [
      { owner: 'Fitler Club', text: 'Review your answers and come back with date options and a proposal' },
      { owner: 'You', text: a.approvers ? `Share this guide with the people who sign off (${a.approvers.replace(/\.$/, '')})` : 'Share this guide with anyone who needs to weigh in' },
      { owner: 'You', text: 'Tick any add-ons you are curious about and send us your questions' },
      { owner: 'Fitler Club', text: 'Set up a menu conversation with our culinary team once you book' },
    ],
    options,
    estimate: { low: Math.round(lowEst / 100) * 100, high: Math.round(highEst / 100) * 100, guests,
      note: 'Indicative only. Excludes add-ons, service charge and tax. Your proposal sets the actual pricing.' },
  };

  const brief = {
    event_type: type, guest_count: guests, date_window: a.date || 'Not stated', space_preference: space.name,
    fnb_direction: `${menu.name}; ${bar.name}`,
    dietary: diet.length ? `${diet.join(', ')}${a.dietary_detail ? ` (${a.dietary_detail})` : ''}` : 'None noted',
    av_needs: avItems.map((v) => v.name).join(', ') || 'None', timeline: run.join(' | '),
    parking: a.arrival || 'Unknown', addons_interest: options.slice(0, 3).map((o) => o.name).join(', '),
    vendors: 'Suggestions shared; none committed', approvers: a.approvers || 'Not stated',
    budget: a.budget || 'Not stated', client_notes: a.anything || '',
    open_questions: list([!a.date ? 'Date options' : null, /not sure/i.test(fnb) ? 'Dining style' : null, 'Final dietary counts']).join('; '),
  };

  const dietCounts = diet.map((d) => {
    const m = (a.dietary_detail || '').match(new RegExp(`(\\d+)\\s*${d.split(/[ -]/)[0]}`, 'i'));
    return { need: d, count: m ? Number(m[1]) : null };
  });
  const beo = {
    event_name: event.title || 'Event', date: a.date || 'TBC', guest_count: guests, space: space.name,
    setup: fullDay ? 'Classroom for sessions; banquet rounds of 10 for dinner' : format === 'seated dinner' ? 'Banquet rounds of 10' : format === 'meeting' ? 'Classroom, with dinner in rounds' : 'Cocktail reception with high-tops',
    start_time: fullDay ? '8:30 AM' : evening ? '6:30 PM' : 'TBC',
    timeline: run.map((r) => { const [time, ...rest] = r.split(' — '); return rest.length ? { time, item: rest.join(' — ') } : { time: '', item: r }; }),
    menu: { style: menu.name, notes: 'Menu selection pending with culinary team' },
    dietary: dietCounts, bar: bar.name, av: avItems.map((v) => v.name),
    parking: driving ? 'Valet recommended' : 'Standard', notes: a.anything || '',
  };
  return { guide, brief, beo };
}

const DIET_WORDS = { vegan: 'Vegan', vegetarian: 'Vegetarian', gluten: 'Gluten-free', nut: 'Nut allergy', kosher: 'Kosher-style', halal: 'Halal', dairy: 'Dairy-free', shellfish: 'Shellfish allergy' };

export function mockChangeCheck(beo = {}, text = '') {
  const mismatches = [];
  const t = text.toLowerCase();
  const g = parseGuests(text);
  if (g && beo.guest_count && g !== Number(beo.guest_count)) {
    const diff = g - beo.guest_count;
    mismatches.push({ field: 'Guest count', current: String(beo.guest_count), requested: String(g), departments: ['Kitchen', 'Staffing', 'Setup'],
      severity: Math.abs(diff) / beo.guest_count > 0.1 ? 'high' : 'medium',
      note: `${diff > 0 ? '+' : ''}${diff} guests changes covers and staffing${diff > 0 ? ', and may change the layout' : ''}.` });
    const space = KB.spaces.find((s) => s.name === beo.space);
    const max = space ? Math.max(space.seated, space.reception) : null;
    if (max && g > max) mismatches.push({ field: 'Space capacity', current: `${beo.space} (max ${max})`, requested: `${g} guests`, departments: ['Coordinator'], severity: 'high', note: 'Exceeds the booked space. Coordinator to discuss options.' });
  }
  const dietRe = /(\d+)\s*(?:of (?:them|us|the guests)\s*(?:are|is)?\s*|guests?\s*(?:are|who are)?\s*)?(vegan|vegetarian|gluten[- ]?free|nut|kosher|halal|dairy[- ]?free|shellfish)/gi;
  let m;
  while ((m = dietRe.exec(text))) {
    const key = Object.keys(DIET_WORDS).find((k) => m[2].toLowerCase().startsWith(k));
    const need = DIET_WORDS[key];
    const cur = (beo.dietary || []).find((d) => d.need === need);
    if (!cur || Number(cur.count) !== Number(m[1])) {
      mismatches.push({ field: `Dietary: ${need}`, current: cur ? (cur.count != null ? String(cur.count) : 'noted, no count') : 'not on BEO',
        requested: m[1], departments: ['Kitchen'], severity: 'high', note: 'Kitchen prep and plating counts change.' });
    }
  }
  const tm = text.match(/(?:start|begin|push|move|arriv|kick ?off)[^.!?\n]{0,30}?(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);
  if (tm) {
    const seg = (text.slice(Math.max(0, tm.index - 20), tm.index + tm[0].length).match(/dinner|lunch|reception|cocktail|breakfast|drinks/i) || [])[0];
    const entry = seg && (beo.timeline || []).find((x) => x.item.toLowerCase().includes(seg.toLowerCase()));
    const current = entry ? `${entry.time}${/am|pm/i.test(entry.time) ? '' : ' PM'}` : beo.start_time;
    const norm = (s) => String(s || '').replace(/\s|pm|am/gi, '');
    if (current && norm(tm[1]) !== norm(current)) {
      mismatches.push({ field: entry ? `${seg[0].toUpperCase() + seg.slice(1).toLowerCase()} start time` : 'Start time', current, requested: tm[1].toUpperCase().replace(/\s*(AM|PM)$/, ' $1'),
        departments: ['Kitchen', 'AV', 'Staffing'], severity: 'medium', note: 'Shifts service timing, AV call time and staff shifts.' });
    }
  }
  const avWords = { mic: 'Wireless microphones', microphone: 'Wireless microphones', projector: 'Projector & screen', livestream: 'Livestream / hybrid', zoom: 'Livestream / hybrid', dj: 'DJ sound', podium: 'Podium' };
  const avAsked = [...new Set(Object.keys(avWords).filter((w) => new RegExp(`\\b${w}s?\\b`, 'i').test(text)).map((w) => avWords[w]))];
  for (const item of avAsked) {
    const onBeo = (beo.av || []).some((x) => x.toLowerCase().includes(item.split(/[ /]/)[0].toLowerCase()));
    if (!onBeo) mismatches.push({ field: 'AV', current: (beo.av || []).join(', ') || 'none', requested: `Add ${item}`, departments: ['AV'], severity: 'medium', note: 'Not on the current BEO.' });
  }
  const setupWords = { rounds: 'Banquet rounds', 'long table': 'Long tables', theatre: 'Theatre seating', classroom: 'Classroom', cocktail: 'Cocktail reception' };
  for (const [w, label] of Object.entries(setupWords)) {
    if (t.includes(w) && !String(beo.setup || '').toLowerCase().includes(w.split(' ')[0])) {
      mismatches.push({ field: 'Room setup', current: beo.setup, requested: label, departments: ['Setup', 'Staffing'], severity: 'medium', note: 'Floor plan and setup crew instructions change.' });
      break;
    }
  }
  const d = parseDate(text);
  if (d && /move|change|switch|instead|reschedul/i.test(text)) mismatches.push({ field: 'Event date', current: beo.date, requested: d.label, departments: ['Coordinator'], severity: 'high', note: 'Date changes need a manual availability check.' });

  const summary = mismatches.length
    ? `${mismatches.length} difference${mismatches.length > 1 ? 's' : ''} between this message and the current BEO.`
    : 'No differences from the current BEO detected.';
  const suggested = mismatches.length
    ? `Thank you for the update! I've noted the changes to ${joinList([...new Set(mismatches.map((x) => x.field.replace(/^Dietary: (.*)/, (_, n) => `${n.toLowerCase()} count`).replace(/^AV$/, 'AV needs').replace(/^(?!AV)(.)/, (c) => c.toLowerCase())))])}. I'll review it with our kitchen and operations team and send you a revised event order to confirm.`
    : 'Thank you for the note! Everything you mentioned matches the current plan.';
  return { summary, mismatches, suggested_reply: suggested };
}

export function mockFaq(question = '') {
  const q = question.toLowerCase();
  const pick = (id) => KB.faqs.find((f) => f.id === id);
  let f = null;
  if (/park|valet|garage|train|drive|driving/.test(q)) return { answer: KB.policies.parking, answered: true, source: 'Policies: parking' };
  if (/price|cost|how much|budget|minimum|expensive/.test(q)) return { answer: `Pricing depends on your date, space and menu, so the concierge only shows indicative ranges. ${KB.policies.minimums} Your coordinator will send a proposal with actual pricing.`, answered: true, source: 'Policies: minimums' };
  if (/layout|setup|set up|seat|table|capacity|fit/.test(q)) f = pick('layouts');
  else if (/menu|diet|vegan|vegetarian|allerg|gluten|kosher|halal|food/.test(q)) f = pick('dietary');
  else if (/access|load|when can|early|arrive/.test(q)) f = pick('access');
  else if (/cancel|refund|deposit|guarantee|count due/.test(q)) f = pick('cancellation');
  else if (/\bav\b|audio|mic|projector|screen|sound|livestream|zoom|presentation/.test(q)) f = pick('av');
  if (f) return { answer: f.a, answered: true, source: `FAQ: ${f.q}` };
  return { answer: "That's a great question for your coordinator. I've passed it along so they can answer you personally.", answered: false };
}
