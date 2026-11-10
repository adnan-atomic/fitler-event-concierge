// Demo seed data: three fictional events at different stages of the workflow.
import { mockTriage, mockGuide } from './mock.js';

const ago = (days, hours = 0) => new Date(Date.now() - (days * 24 + hours) * 3600000).toISOString();

export function seedEvents() {
  const events = [];
  const requests = [];
  const activity = [];
  const log = (event_id, actor, action, detail, created_at) => activity.push({ id: activity.length + 1, event_id, actor, action, detail: detail || null, created_at });

  // 1. Corporate offsite: guide shared, ready for the BEO change demo.
  const e1Contact = { name: 'Priya Shah', email: 'priya.shah@example.com', company: 'Halvorsen Capital', is_member: false };
  const e1Inquiry = "Hi, I'm Chief of Staff at Halvorsen Capital. We're planning a leadership offsite for about 35 people on March 12: strategy sessions during the day and a dinner in the evening. Could you share options?";
  const e1 = {
    id: '11111111-1111-4111-8111-111111111111', created_at: ago(9), updated_at: ago(1), status: 'guide_shared',
    client_token: 'demo-halvorsen-7k2m', title: 'Halvorsen Capital · Leadership offsite', event_type: 'corporate',
    contact: e1Contact, inquiry_text: e1Inquiry, triage: mockTriage(e1Inquiry, e1Contact), reply_draft: null,
    intake: { submitted_at: ago(2), answers: {
      occasion: "Annual leadership offsite for Halvorsen Capital's senior team, with a dinner on the first evening.",
      date: 'Thursday, March 12 (Friday the 13th as a backup)', guests: 36, timing: 'Full day',
      format: ['Meeting / workshop', 'Presentations or keynote', 'Breakout sessions', 'Seated dinner'],
      agenda: '8:30 arrivals, 9:00 CEO kickoff, morning strategy sessions, lunch, two afternoon breakouts, 6:00 drinks, 7:00 dinner',
      branding: 'Yes', fnb: 'Plated dinner', dietary: ['Vegetarian', 'Gluten-free', 'Nut allergy'],
      dietary_detail: '4 vegetarian, 2 gluten-free, 1 nut allergy', bar: 'Beer & wine',
      av: ['Screen / projector', 'Microphones', 'Livestream / hybrid'], arrival: 'A mix', rooms: 'Possibly',
      approvers: 'our COO (budget) and CEO (agenda)', budget: '$15k–$35k',
      anything: 'Two partners will join remotely for the morning session.',
    } },
  };
  Object.assign(e1, mockGuide(e1));
  e1.guide.approved_at = ago(1); e1.guide.approved_by = 'Coordinator';
  events.push(e1);
  log(e1.id, 'ai', 'Inquiry triaged; reply drafted', null, ago(9));
  log(e1.id, 'coordinator', 'Reply sent to client', null, ago(9));
  log(e1.id, 'coordinator', 'Site visit completed; concierge link sent', null, ago(4));
  log(e1.id, 'client', 'Concierge intake completed', null, ago(2));
  log(e1.id, 'ai', 'Planning guide, brief and BEO drafted', null, ago(2));
  log(e1.id, 'coordinator', 'Guide reviewed (0 guardrail flags) and shared', null, ago(1));
  requests.push({ id: 'aaaaaaa1-0000-4000-8000-000000000001', event_id: e1.id, created_at: ago(0, 5), kind: 'question', source: 'client_portal',
    body: 'Can our two remote partners present over video during the morning session, and will someone help them test beforehand?', analysis: null, status: 'open' });
  log(e1.id, 'client', 'Asked a question in the guide', null, ago(0, 5));

  // 2. Member birthday: concierge link sent, intake not started (client-side demo).
  const e2Contact = { name: 'Maya Okafor', email: 'maya.okafor@example.com', company: '', is_member: true };
  const e2Inquiry = "Hello! I'm a member and want to host my husband's 40th birthday dinner on May 9 for about 30 friends. Somewhere intimate, great food and wine.";
  events.push({
    id: '22222222-2222-4222-8222-222222222222', created_at: ago(6), updated_at: ago(1), status: 'concierge_sent',
    client_token: 'demo-okafor-4p9x', title: "Okafor · 40th birthday dinner", event_type: 'social',
    contact: e2Contact, inquiry_text: e2Inquiry, triage: mockTriage(e2Inquiry, e2Contact), reply_draft: null,
    intake: null, guide: null, brief: null, beo: null,
  });
  log('22222222-2222-4222-8222-222222222222', 'ai', 'Inquiry triaged; reply drafted', null, ago(6));
  log('22222222-2222-4222-8222-222222222222', 'coordinator', 'Reply sent to client', null, ago(6));
  log('22222222-2222-4222-8222-222222222222', 'coordinator', 'Site visit completed; concierge link sent', null, ago(1));

  // 3. Fresh inquiry waiting for a reply.
  const e3Contact = { name: 'James Corrigan', email: 'jcorrigan@example.com', company: 'Corrigan & Webb LLP', is_member: false };
  const e3Inquiry = 'Our firm would like to host a client appreciation cocktail reception for roughly 90 guests on January 22. Looking for something elegant, with a few short remarks from our managing partner.';
  const t3 = mockTriage(e3Inquiry, e3Contact);
  events.push({
    id: '33333333-3333-4333-8333-333333333333', created_at: ago(0, 3), updated_at: ago(0, 3), status: 'inquiry',
    client_token: 'demo-corrigan-8d1q', title: 'Corrigan & Webb · Client reception', event_type: 'corporate',
    contact: e3Contact, inquiry_text: e3Inquiry, triage: t3, reply_draft: t3.reply_draft,
    intake: null, guide: null, brief: null, beo: null,
  });
  log('33333333-3333-4333-8333-333333333333', 'ai', 'Inquiry triaged; reply drafted', null, ago(0, 3));

  return { events, requests, activity };
}
