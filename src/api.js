const PASS_KEY = 'fc-demo-pass';

export function getPass() {
  try { return localStorage.getItem(PASS_KEY) || ''; } catch { return ''; }
}
export function setPass(v) {
  try { localStorage.setItem(PASS_KEY, v); } catch { /* storage unavailable */ }
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-demo-pass': getPass() },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// Minimal client-side router.
export function navigate(to) {
  window.history.pushState({}, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo(0, 0);
}

export const timeAgo = (iso) => {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};

export const STAGES = [
  { id: 'inquiry', label: 'New inquiry' },
  { id: 'replied', label: 'Reply sent' },
  { id: 'concierge_sent', label: 'Concierge sent' },
  { id: 'in_review', label: 'Guide in review' },
  { id: 'guide_shared', label: 'Guide shared' },
];
export const stageIndex = (status) => {
  const s = status === 'intake_complete' ? 'in_review' : status;
  return STAGES.findIndex((x) => x.id === s);
};
