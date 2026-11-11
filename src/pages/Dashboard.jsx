import React, { lazy, Suspense, useEffect, useState } from 'react';
import { api, navigate, timeAgo, STAGES, stageIndex } from '../api.js';
import { SAMPLE_INQUIRIES } from '../../shared/samples.js';
import { Actor, FitPill } from '../components/ui.jsx';

const PipelineScene = lazy(() => import('../components/PipelineScene.jsx'));

function NewInquiry({ onClose, flash }) {
  const [text, setText] = useState('');
  const [contact, setContact] = useState({ name: '', email: '', company: '', is_member: false });
  const [busy, setBusy] = useState(false);
  const useSample = (s) => { setText(s.text); setContact(s.contact); };
  const submit = async () => {
    setBusy(true);
    try {
      const r = await api('/events', { method: 'POST', body: { inquiry_text: text, contact } });
      flash(r.ms < 1000 ? 'Triaged in under a second' : `Triaged in ${(r.ms / 1000).toFixed(1)}s`);
      navigate(`/events/${r.id}`);
    } catch (e) { flash(e.message); setBusy(false); }
  };
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="eyebrow">Simulates a new Tripleseat lead</div>
        <h2 style={{ margin: '4px 0 14px' }}>New inquiry</h2>
        <div className="row" style={{ marginBottom: 14 }}>
          <span className="small muted">Samples:</span>
          {SAMPLE_INQUIRIES.map((s) => <button key={s.label} className="chip" onClick={() => useSample(s)}>{s.label}</button>)}
        </div>
        <div className="grid2" style={{ gap: 12 }}>
          <label className="field"><span>Name</span><input className="input" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} /></label>
          <label className="field"><span>Company (optional)</span><input className="input" value={contact.company} onChange={(e) => setContact({ ...contact, company: e.target.value })} /></label>
          <label className="field"><span>Email</span><input className="input" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></label>
          <label className="field row" style={{ alignItems: 'end' }}>
            <input type="checkbox" checked={contact.is_member} onChange={(e) => setContact({ ...contact, is_member: e.target.checked })} />
            <span style={{ margin: 0 }}>Club member</span>
          </label>
        </div>
        <label className="field" style={{ marginTop: 12 }}><span>Inquiry message</span>
          <textarea className="input" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the inquiry as it arrived…" />
        </label>
        <div className="spread" style={{ marginTop: 16 }}>
          <span className="small muted">AI reads it, suggests spaces, scores fit and drafts a reply for you to edit.</span>
          <div className="row">
            <button className="btn ghost" onClick={onClose}>Cancel</button>
            <button className="btn brass" disabled={!text.trim() || !contact.name || busy} onClick={submit}>
              {busy ? <><span className="spinner" /> Triaging…</> : 'Triage inquiry'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard({ flash }) {
  const [data, setData] = useState(null);
  const [modal, setModal] = useState(false);
  useEffect(() => { api('/events').then(setData).catch((e) => flash(e.message)); }, []);
  if (!data) return <div className="page"><span className="spinner dark" /></div>;

  const ev = data.events;
  const count = (fn) => ev.filter(fn).length;
  const kpis = [
    { n: count((e) => e.status === 'inquiry'), l: 'New inquiries awaiting a reply' },
    { n: count((e) => ['replied', 'concierge_sent'].includes(e.status)), l: 'With the client' },
    { n: count((e) => ['in_review', 'intake_complete'].includes(e.status)), l: 'Guides to review' },
    { n: ev.reduce((s, e) => s + (e.open_requests || 0), 0), l: 'Open client questions & changes' },
  ];

  return (
    <main className="page">
      <section className="dash-hero">
        <div className="dash-copy">
          <div className="eyebrow">Coordinator console</div>
          <h1>Events <em>pipeline</em></h1>
          <p>AI drafts and flags. You review, approve and send. Each orb is an inquiry landing in the space the concierge suggests.</p>
          <button className="btn brass" onClick={() => setModal(true)}>+ New inquiry</button>
          <div className="legend">
            <span><i style={{ background: '#FFFFFF' }} />New inquiry</span>
            <span><i style={{ background: '#8FB4CC' }} />With client</span>
            <span><i style={{ background: '#7FD1A4' }} />Guide shared</span>
          </div>
        </div>
        <div className="dash-art">
          <Suspense fallback={<div className="pipeline3d" />}><PipelineScene events={ev} /></Suspense>
        </div>
      </section>

      <div className="kpis">
        {kpis.map((k) => <div className="card kpi" key={k.l}><div className="n">{k.n}</div><div className="l">{k.l}</div></div>)}
      </div>

      <div className="section-title"><h2>Pipeline</h2><span className="small muted">Click any event to open it</span></div>
      <div className="board">
        {STAGES.map((s, i) => {
          const items = ev.filter((e) => stageIndex(e.status) === i);
          return (
            <div className="col" key={s.id}>
              <div className="col-h"><span>{s.label}</span><span>{items.length}</span></div>
              {items.map((e) => (
                <div className="ecard" key={e.id} onClick={() => navigate(`/events/${e.id}`)}>
                  <div className="t">{e.title}</div>
                  <div className="m">{e.contact?.name}{e.contact?.is_member ? ' · Member' : ''}</div>
                  <div className="m">{[e.guests && `${e.guests} guests`, e.date].filter(Boolean).join(' · ')}</div>
                  <div className="row" style={{ gap: 6, marginTop: 8 }}>
                    {e.fit && i === 0 && <FitPill fit={e.fit} />}
                    {e.open_requests > 0 && <span className="pill bad">{e.open_requests} open</span>}
                    <span className="pill">{e.event_type}</span>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <div className="section-title"><h2>Recent activity</h2><span className="small muted">Every AI action is logged for after-the-fact review</span></div>
      <div className="card">
        <ul className="activity">
          {data.activity.map((a) => (
            <li key={a.id}>
              <Actor actor={a.actor} />
              <div style={{ flex: 1 }}>
                <div>{a.action}</div>
                <div className="small muted">{a.event_title} · {timeAgo(a.created_at)}{a.detail?.engine ? ` · ${a.detail.engine}` : ''}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
      {modal && <NewInquiry onClose={() => setModal(false)} flash={flash} />}
    </main>
  );
}
