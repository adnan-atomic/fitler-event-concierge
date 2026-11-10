// Guided intake questionnaire. Corporate and social tracks (v1 scope per Fitler Club).
// type: chips (single), multi, text, number, longtext

const COMMON_START = [
  { id: 'occasion', type: 'text', prompt: 'In a sentence, what are we celebrating or bringing people together for?',
    placeholder: 'e.g. Annual leadership offsite with a dinner on night one' },
  { id: 'date', type: 'text', prompt: 'What date (or dates) are you considering, and how flexible are you?',
    placeholder: 'e.g. Thursday March 12, or any Thursday that month',
    note: 'Your coordinator confirms availability personally. The concierge never holds dates.' },
  { id: 'guests', type: 'number', prompt: 'Roughly how many guests are you expecting?', placeholder: '60' },
  { id: 'timing', type: 'chips', prompt: 'What time of day works best?',
    options: ['Breakfast / morning', 'Midday', 'Afternoon', 'Evening', 'Full day', 'Multi-day'] },
];

const CORPORATE = [
  { id: 'format', type: 'multi', prompt: 'Which formats should the day include?',
    options: ['Meeting / workshop', 'Presentations or keynote', 'Breakout sessions', 'Seated dinner', 'Cocktail reception', 'Networking', 'Screening or product launch'] },
  { id: 'agenda', type: 'longtext', prompt: 'Sketch the agenda as you see it today. Rough is perfect.',
    placeholder: '9:00 arrivals & coffee, 9:30 strategy session, 12:30 lunch, 6:30 dinner…' },
  { id: 'branding', type: 'chips', prompt: 'Would you like branding on site (signage, welcome screen)?',
    options: ['Yes', 'Maybe', 'No'] },
];

const SOCIAL = [
  { id: 'honoree', type: 'text', prompt: 'Who is the event for, and what would make it feel like them?',
    placeholder: "e.g. My husband's 50th. He loves jazz and great wine." },
  { id: 'format', type: 'multi', prompt: 'What kind of gathering do you picture?',
    options: ['Seated dinner', 'Cocktail party', 'Brunch', 'Dancing', 'Speeches or toasts', 'Kids attending', 'Private screening'] },
  { id: 'entertainment', type: 'multi', prompt: 'Any entertainment in mind?',
    options: ['DJ', 'Live music', 'Photo booth', 'None needed', 'Not sure yet'] },
];

const COMMON_END = [
  { id: 'fnb', type: 'chips', prompt: 'Which dining style feels right?',
    options: ['Passed bites & stations', 'Family-style', 'Plated dinner', 'Buffet', 'Breakfast / brunch', 'Not sure yet'] },
  { id: 'dietary', type: 'multi', prompt: 'Any dietary needs we should plan around?',
    options: ['Vegetarian', 'Vegan', 'Gluten-free', 'Dairy-free', 'Nut allergy', 'Shellfish allergy', 'Kosher-style', 'Halal', 'None that I know of'] },
  { id: 'dietary_detail', type: 'text', prompt: 'If you know them, roughly how many guests for each need?', placeholder: 'e.g. 6 vegan, 2 nut allergies', optional: true },
  { id: 'bar', type: 'chips', prompt: 'And for the bar?',
    options: ['Beer & wine', 'Full open bar', 'Bar on consumption', 'Signature cocktails', 'Zero-proof only', 'Not sure yet'] },
  { id: 'av', type: 'multi', prompt: 'What AV will you need?',
    options: ['Screen / projector', 'Microphones', 'Podium', 'Livestream / hybrid', 'Music / DJ sound', 'Uplighting', 'None'] },
  { id: 'arrival', type: 'chips', prompt: 'How will most guests arrive?',
    options: ['Driving (parking needed)', 'Rideshare / taxi', 'Train or transit', 'Walking / local', 'A mix'] },
  { id: 'rooms', type: 'chips', prompt: 'Will any guests need hotel rooms?', options: ['Yes', 'Possibly', 'No'] },
  { id: 'approvers', type: 'text', prompt: 'Who else needs to sign off on the plan?',
    placeholder: 'e.g. My CFO approves budget; our CEO approves the agenda',
    note: 'We use this to make your guide easy to share with them.' },
  { id: 'budget', type: 'chips', prompt: 'Do you have a working budget in mind? (optional)',
    options: ['Under $5k', '$5k–$15k', '$15k–$35k', '$35k+', 'Prefer to discuss'], optional: true },
  { id: 'anything', type: 'longtext', prompt: 'Anything else we should know, or questions this didn’t cover?',
    placeholder: 'Your coordinator reads every word.', optional: true },
];

export function intakeQuestions(eventType) {
  const middle = eventType === 'social' ? SOCIAL : CORPORATE;
  return [...COMMON_START, ...middle, ...COMMON_END];
}
