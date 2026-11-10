// Policy guardrails: the client's own "the tool must never..." list, enforced as rules.
// Runs in the browser (live, as the coordinator edits) and on the server (before publishing).

const RULES = [
  {
    id: 'availability', label: 'Confirms availability',
    why: 'The tool must never confirm a date or space is available.',
    patterns: [
      /\b(?:date|space|room|hall|venue|evening|day|weekend)\b[^.!?\n]{0,40}?\b(?:is|are|has been|have been)\s+(?:confirmed|available|reserved|booked|held|secured|locked in)\b/gi,
      /\bwe(?:'ve| have| are|'re)?\s+(?:confirmed|reserved|held|booked|locked in|secured)\s+(?:the\s+|your\s+|this\s+)?(?:date|space|room|hall|evening|day|venue|you in|it)\b/gi,
      /\b(?:we|i|can|will|to)\s+guarantee(?:d)?\s+(?:you\s+)?(?:the\s+|your\s+)?(?:date|availability|space|room)\b/gi,
      /\bguaranteed?\s+(?:the|your)\s+(?:date|availability|space|room)\b/gi,
    ],
  },
  {
    id: 'firm_price', label: 'Quotes a firm price',
    why: 'Only indicative ranges may be shown — never a firm price.',
    patterns: [
      /\b(?:total|final price|price|cost|quote|it will be|it's|that's)\b[^.!?\n]{0,25}?\$\s?\d[\d,]*(?:\.\d{2})?(?!\s*(?:–|-|to)\s*\$?\d)/gi,
      /\b(?:firm|fixed|final|locked)\s+(?:quote|price|pricing|rate)\b/gi,
    ],
  },
  {
    id: 'discount', label: 'Promises a discount',
    why: 'The tool must never promise a discount, waiver or comp.',
    patterns: [
      /\b(?:discount(?:ed)?|\d{1,2}\s?%\s?off|waive[ds]?|complimentary|free of charge|on the house|price match)\b/gi,
    ],
  },
  {
    id: 'vendor', label: 'Commits a vendor',
    why: 'Vendors are suggestions only — never committed.',
    patterns: [
      /\bwe(?:'ve| have)?\s+(?:booked|secured|hired|confirmed)\s+(?:your\s+|the\s+)?(?:florist|photographer|dj|band|quartet|planner|baker|rentals?)\b/gi,
      /\b(?:will be|is)\s+your\s+(?:florist|photographer|dj|band|planner|baker)\b/gi,
    ],
  },
  {
    id: 'policy', label: 'Goes outside standard policy',
    why: 'The tool must never agree to anything outside standard policy.',
    patterns: [
      /\b(?:no deposit(?: required)?|full refund|we can make an exception|exception to (?:our|the) policy|extend(?:ed)? the cancellation|no minimum)\b/gi,
    ],
  },
];

export function checkText(text = '', where = '') {
  const flags = [];
  if (!text) return flags;
  for (const rule of RULES) {
    for (const re of rule.patterns) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) {
        // Allow ranges/indicative language right around a dollar amount.
        const ctx = text.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30).toLowerCase();
        if (rule.id === 'firm_price' && /(indicative|estimate|approx|starting|range|typically|from \$)/.test(ctx)) continue;
        if (rule.id === 'discount' && /\b(no|never|not)\b[^.]{0,20}(discount|complimentary|waive)/.test(ctx)) continue;
        flags.push({ rule: rule.id, label: rule.label, why: rule.why, match: m[0].trim(), where });
      }
    }
  }
  // de-duplicate
  const seen = new Set();
  return flags.filter((f) => { const k = f.rule + f.match.toLowerCase() + f.where; if (seen.has(k)) return false; seen.add(k); return true; });
}

// Walk any JSON value (e.g. a planning guide) and check every string in it.
export function checkGuide(guide) {
  const flags = [];
  const walk = (v, path) => {
    if (typeof v === 'string') flags.push(...checkText(v, path));
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => walk(x, path ? `${path}.${k}` : k));
  };
  walk(guide, '');
  return flags;
}

export const GUARDRAIL_RULES = RULES.map(({ id, label, why }) => ({ id, label, why }));
