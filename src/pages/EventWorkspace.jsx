import React, { useEffect, useMemo, useState } from 'react';
import { api, navigate, timeAgo } from '../api.js';
import { checkText, checkGuide } from '../../shared/guardrails.js';
import { SAMPLE_CHANGE_EMAIL } from '../../shared/samples.js';
import { Actor, FitPill, Stepper, Flags, BeoView, GuideView } from '../components/ui.jsx';

const lines = (arr) => (arr || []).join('\n');
const unlines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);

function InquiryTab({ e, reload, flash }) {
  const [reply, setReply] = useState(e.reply_draft || '');
  const [busy, setBusy] = useState('');
  const [track, setTrack] = useState(e.event_type === 'social' ? 'social' : 'corporate');
  const flags = useMemo(() => checkText(reply), [reply]);
  const t = e.triage || {};
  const x = t.extracted || {};
  const link = `${window.location.origin}/c/${e.client_token}`;

  const send = async () => {
    setBusy('send');
    try { await api(`/events/${e.id}/send-reply`, { method: 'POST', body: { reply } }); flash('Reply sent (logged; email sending is off in the prototype)'); reload(); }
    catch (err) { flash(err.message); } finally { setBusy(''); }
  };
  const sendConcierge = async () => {
    setBusy('concierge');
    try { await api(`/events/${e.id}/send-concierge`, { method: 'POST', body: { event_type: track } }); flash('Concierge link sent'); reload(); }
    catch (err) { flash(err.message); } finally { setBusy(''); }
  };
  const retriage = async () => {
    setBusy('triage');
    try { const r = await api(`/events/${e.id}/triage`, { method: 'POST' }); flash(`Re-triaged (${r.engine})`); reload(); }
    catch (err) { flash(err.message); } finally { setBusy(''); }
  };

  return (
    <div className="grid2" style={{ gridTemplateColumns: '1fr 1.15fr' }}>
      <div className="stack">
        <div className="card">
          <div className="spread"><h3>Inquiry</h3><span className="small muted">{timeAgo(e.created_at)} · via Tripleseat (simulated)</span></div>
          <div className="quote">{e.inquiry_text}</div>
          <div className="row" style={{ gap: 6, marginTop: 12 }}>
            {x.event_type && <span className="pill brass">{x.event_type}</span>}
            {x.guests && <span className="pill">{x.guests} guests</span>}
            {x.date && <span className="pill">{x.date}</span>}
            {x.format && <span className="pill">{x.format}</span>}
            {x.budget && <span className="pill">Budget {x.budget}</span>}
            {x.is_member && <span className="pill good">Member</span>}
          </div>
        </div>
        <div className="card">
          <div className="spread"><h3>Is it worth pursuing?</h3>{t.fit && <FitPill fit={t.fit} />}</div>
          {(t.signals || []).map((s, i) => <div className="signal" key={i}><span className={`dot ${s.tone}`} style={{ marginTop: 7 }} /><div><b>{s.label}</b> {s.value}</div></div>)}
          <p className="small muted" style={{ marginBottom: 0 }}>Uses your criteria: space availability, the minimum, membership and lead time. You make the call.</p>
        </div>
        <div className="card">
          <h3>Suggested spaces</h3>
          {(t.spaces || []).map((s, i) => (
            <div key={i} className="signal"><span className="pill brass" style={{ minWidth: 26, justifyContent: 'center' }}>{i + 1}</span><div><b style={{ minWidth: 0 }}>{s.name}</b> <span className="muted">· up to {s.capacity}</span><div className="small muted">{s.reason}</div></div></div>
          ))}
          <p className="small muted" style={{ marginBottom: 0 }}>Availability is not checked here. Confirm in Tripleseat.</p>
        </div>
      </div>

      <div className="stack">
        <div className="card">
          <div className="spread">
            <h3>Personal reply</h3>
            <div className="row" style={{ gap: 8 }}>
              <span className="pill brass">AI draft, your voice</span>
              {e.status === 'inquiry' && <button className="btn ghost sm" onClick={retriage} disabled={!!busy}>{busy === 'triage' ? <span className="spinner dark" /> : 'Redraft'}</button>}
            </div>
          </div>
          <textarea className={`input ${flags.length ? 'flagged' : ''}`} rows={14} value={reply} onChange={(ev) => setReply(ev.target.value)} disabled={e.status !== 'inquiry'} />
          <div style={{ marginTop: 10 }}><Flags flags={flags} /></div>
          <div className="spread" style={{ marginTop: 12 }}>
            <span className="small muted">Pre-contract stays personal: you edit and send. Nothing goes out automatically.</span>
            {e.status === 'inquiry'
              ? <button className="btn" disabled={!!flags.length || !!busy} onClick={send}>{busy === 'send' ? <span className="spinner" /> : 'Send reply'}</button>
              : <span className="pill good">✓ Sent</span>}
          </div>
        </div>

        {e.status !== 'inquiry' && (
          <div className="card">
            <h3>After the site visit</h3>
            {e.status === 'replied' ? (
              <>
                <p className="muted" style={{ marginTop: 0 }}>Once you've toured the club together, send the client the concierge. It guides them through planning and builds their personalised guide for you to review.</p>
                <div className="row">
                  <span className="small muted">Track:</span>
                  {['corporate', 'social'].map((k) => <button key={k} className={`chip ${track === k ? 'on' : ''}`} onClick={() => setTrack(k)}>{k === 'corporate' ? 'Corporate' : 'Social'}</button>)}
                  <button className="btn brass" style={{ marginLeft: 'auto' }} onClick={sendConcierge} disabled={!!busy}>{busy === 'concierge' ? <span className="spinner" /> : 'Send concierge link'}</button>
                </div>
                {(e.event_type === 'wedding' || e.event_type === 'mitzvah') && <div className="notice" style={{ marginTop: 10 }}>Weddings and mitzvahs stay on the hand-held process in v1; you can still send the corporate or social track if helpful.</div>}
              </>
            ) : (
              <div className="stack">
                <div className="row"><span className="pill good">✓ Concierge sent</span><span className="small muted">{e.intake?.submitted_at ? `Client completed it ${timeAgo(e.intake.submitted_at)}` : 'Waiting for the client'}</span></div>
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <input className="input" readOnly value={link} onFocus={(ev) => ev.target.select()} />
                  <button className="btn ghost sm" onClick={() => { navigator.clipboard?.writeText(link); flash('Link copied'); }}>Copy</button>
                  <a className="btn sm" href={`/c/${e.client_token}`} target="_blank" rel="noreferrer">Open as client ↗</a>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function GuideTab({ e, reload, flash }) {
  const [g, setG] = useState(e.guide);
  const [mode, setMode] = useState(e.status === 'guide_shared' ? 'preview' : 'edit');
  const [busy, setBusy] = useState('');
  const [override, setOverride] = useState('');
  const flags = useMemo(() => (g ? checkGuide(g) : []), [g]);
  if (!g) {
    return <div className="card"><h3>No guide yet</h3><p className="muted">The planning guide is drafted automatically when the client finishes the concierge intake{e.status === 'concierge_sent' ? '. The link has been sent.' : '.'}</p>
      {e.status === 'concierge_sent' && <a className="btn sm" href={`/c/${e.client_token}`} target="_blank" rel="noreferrer">Open the client concierge ↗</a>}</div>;
  }
  const setSec = (i, patch) => setG({ ...g, sections: g.sections.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const save = async () => { setBusy('save'); try { await api(`/events/${e.id}`, { method: 'PATCH', body: { guide: g } }); flash('Draft saved'); } finally { setBusy(''); } };
  const approve = async () => {
    setBusy('approve');
    try {
      await api(`/events/${e.id}/approve`, { method: 'POST', body: { guide: g, override_note: flags.length ? override : undefined } });
      flash('Guide approved and shared with the client'); reload();
    } catch (err) { flash(err.status === 409 ? 'Blocked by guardrails' : err.message); } finally { setBusy(''); }
  };
  const regen = async () => { setBusy('regen'); try { const r = await api(`/events/${e.id}/generate`, { method: 'POST' }); flash(`Redrafted (${r.engine})`); reload(); } catch (err) { flash(err.message); } finally { setBusy(''); } };
  const shared = e.status === 'guide_shared';

  return (
    <div className="stack">
      <div className="card tight" style={{ position: 'sticky', top: 64, zIndex: 5 }}>
        <div className="spread">
          <div className="row">
            {['edit', 'preview'].map((m) => <button key={m} className={`chip ${mode === m ? 'on' : ''}`} onClick={() => setMode(m)}>{m === 'edit' ? 'Review & edit' : 'Preview as client'}</button>)}
            {shared ? <span className="pill good">✓ Shared with client</span> : <span className="pill warn">Awaiting your approval</span>}
          </div>
          <div className="row">
            {!shared && <button className="btn ghost sm" onClick={regen} disabled={!!busy}>{busy === 'regen' ? <span className="spinner dark" /> : 'Redraft with AI'}</button>}
            <button className="btn ghost sm" onClick={save} disabled={!!busy}>Save draft</button>
            <button className="btn brass sm" onClick={approve} disabled={!!busy || (flags.length > 0 && override.trim().length < 5)}>
              {busy === 'approve' ? <span className="spinner" /> : shared ? 'Re-share updated guide' : 'Approve & share with client'}
            </button>
          </div>
        </div>
        <div style={{ marginTop: 10 }}><Flags flags={flags} compact /></div>
        {flags.length > 0 && <input className="input" style={{ marginTop: 8 }} placeholder="To share anyway, note why these flags are acceptable (logged)" value={override} onChange={(ev) => setOverride(ev.target.value)} />}
      </div>

      {mode === 'preview' ? <GuideView guide={g} contactName={e.contact?.name} eventType={e.event_type} /> : (
        <div className="stack">
          <div className="notice">Every edit is checked live against the client's “never” list. Try typing <i>“Great news, your date is confirmed”</i> into any section.</div>
          <div className="card">
            <label className="field"><span>Title</span><input className="input" value={g.title} onChange={(ev) => setG({ ...g, title: ev.target.value })} /></label>
            <label className="field" style={{ marginTop: 10 }}><span>Introduction</span><textarea className={`input ${checkText(g.intro).length ? 'flagged' : ''}`} rows={3} value={g.intro} onChange={(ev) => setG({ ...g, intro: ev.target.value })} /></label>
          </div>
          <div className="grid2">
            {g.sections.map((s, i) => {
              const bad = checkText(`${s.heading}\n${s.body}\n${lines(s.items)}`).length > 0;
              return (
                <div className="card" key={s.id} style={bad ? { borderColor: 'var(--bad)' } : null}>
                  <input className="input" style={{ fontFamily: 'var(--serif)', fontSize: 18, fontWeight: 600, border: 0, padding: '0 0 6px' }} value={s.heading} onChange={(ev) => setSec(i, { heading: ev.target.value })} />
                  <textarea className="input" rows={2} value={s.body} onChange={(ev) => setSec(i, { body: ev.target.value })} placeholder="Short paragraph" />
                  <textarea className="input" style={{ marginTop: 8 }} rows={Math.min(8, Math.max(3, (s.items || []).length + 1))} value={lines(s.items)} onChange={(ev) => setSec(i, { items: ev.target.value.split('\n') })} placeholder="One point per line" onBlur={(ev) => setSec(i, { items: unlines(ev.target.value) })} />
                </div>
              );
            })}
          </div>
          <div className="grid2">
            <div className="card"><h3>Decisions needed from the client</h3>
              <textarea className="input" rows={6} value={lines(g.decisions.map((d) => d.text))} onChange={(ev) => setG({ ...g, decisions: ev.target.value.split('\n').map((t, i) => ({ id: `d${i + 1}`, text: t })) })} /></div>
            <div className="card"><h3>Next steps</h3>
              <textarea className="input" rows={6} value={lines(g.next_steps.map((n) => `${n.owner}: ${n.text}`))}
                onChange={(ev) => setG({ ...g, next_steps: ev.target.value.split('\n').map((l) => { const [o, ...r] = l.split(':'); return r.length ? { owner: o.trim(), text: r.join(':').trim() } : { owner: 'Fitler Club', text: l }; }) })} />
              <div className="small muted">Format: “You: …” or “Fitler Club: …”</div></div>
          </div>
        </div>
      )}
    </div>
  );
}

function BriefTab({ e, reload, flash }) {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [applying, setApplying] = useState(false);
  if (!e.brief) return <div className="card"><h3>No brief yet</h3><p className="muted">The internal brief and BEO draft are produced from the client's concierge answers.</p></div>;
  const b = e.brief;
  const rows = [['Event type', b.event_type], ['Guest count', b.guest_count], ['Date window', b.date_window], ['Space', b.space_preference], ['F&B direction', b.fnb_direction], ['Dietary', b.dietary],
    ['AV needs', b.av_needs], ['Timeline', b.timeline], ['Parking / arrival', b.parking], ['Add-ons of interest', b.addons_interest], ['Vendors', b.vendors], ['Approvers', b.approvers], ['Budget', b.budget], ['Open questions', b.open_questions], ['Client notes', b.client_notes]];
  const check = async () => {
    setBusy(true);
    try { const r = await api(`/events/${e.id}/check-change`, { method: 'POST', body: { message: msg } }); setResult(r.request); reload(true); }
    catch (err) { flash(err.message); } finally { setBusy(false); }
  };
  const apply = async () => {
    if (applying) return;
    setApplying(true);
    try { await api(`/requests/${result.id}/apply`, { method: 'POST' }); flash('BEO updated. Revised order ready to send'); setResult(null); setMsg(''); await reload(); } catch (err) { flash(err.message); } finally { setApplying(false); }
  };
  return (
    <div className="grid2" style={{ gridTemplateColumns: '1fr 1.2fr' }}>
      <div className="stack">
        <div className="card">
          <div className="spread"><h3>Internal briefing</h3><span className="pill brass">From the concierge</span></div>
          <dl className="kv">{rows.filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{String(v)}</dd></React.Fragment>)}</dl>
        </div>
        <div className="card">
          <h3>Check a client message against the BEO</h3>
          <p className="small muted" style={{ marginTop: 0 }}>Paste an email or call note. AI flags anything that differs from the BEO and routes it to the right team.</p>
          <textarea className="input" rows={5} value={msg} onChange={(ev) => setMsg(ev.target.value)} placeholder="Paste the client's latest email…" />
          <div className="spread" style={{ marginTop: 10 }}>
            <button className="chip" onClick={() => setMsg(SAMPLE_CHANGE_EMAIL)}>Use sample email</button>
            <button className="btn brass sm" disabled={!msg.trim() || busy} onClick={check}>{busy ? <><span className="spinner" /> Checking…</> : 'Check against BEO'}</button>
          </div>
          {result && <div style={{ marginTop: 14 }}><Mismatches analysis={result.analysis} /><button className="btn sm" style={{ marginTop: 10 }} onClick={apply} disabled={applying || !result.analysis?.mismatches?.length}>{applying ? <><span className="spinner" /> Applying…</> : 'Apply to BEO draft'}</button></div>}
        </div>
      </div>
      <div><BeoView beo={e.beo} changed={e.beo?.revision > 1 ? (e.beo.changed || []) : []} /></div>
    </div>
  );
}

function Mismatches({ analysis }) {
  if (!analysis) return null;
  const mm = analysis.mismatches || [];
  return (
    <div className="stack">
      <div className={mm.length ? 'flagbox' : 'okbox'} style={mm.length ? { background: 'var(--warn-bg)', borderColor: 'transparent', color: 'var(--warn)' } : null}><b>{analysis.summary}</b></div>
      {mm.length > 0 && (
        <table className="t">
          <thead><tr><th>What changed</th><th>On BEO</th><th>Client now says</th><th>Notify</th></tr></thead>
          <tbody>{mm.map((m, i) => (
            <tr key={i}>
              <td><b>{m.field}</b><div className="small muted">{m.note}</div></td>
              <td>{m.current}</td>
              <td><span className={`pill ${m.severity === 'high' ? 'bad' : 'warn'}`}>{m.requested}</span></td>
              <td><div className="row" style={{ gap: 4 }}>{(m.departments || []).map((d) => <span className="pill info" key={d}>{d}</span>)}</div></td>
            </tr>))}
          </tbody>
        </table>
      )}
      {analysis.suggested_reply && <div><div className="small muted" style={{ marginBottom: 4 }}>Suggested reply (edit before sending)</div><div className="quote" style={{ fontStyle: 'normal' }}>{analysis.suggested_reply}</div></div>}
    </div>
  );
}

function RequestsTab({ e, requests, reload, flash }) {
  const [answers, setAnswers] = useState({});
  const [busyId, setBusyId] = useState(null);
  if (!requests.length) return <div className="card"><h3>No client questions or changes yet</h3><p className="muted">Questions the concierge can't answer, change requests from the guide, and checked emails land here.</p></div>;
  const resolve = async (r) => {
    try { await api(`/requests/${r.id}/resolve`, { method: 'POST', body: { answer: answers[r.id] } }); flash(answers[r.id] ? 'Answer sent to the client guide' : 'Resolved'); reload(); }
    catch (err) { flash(err.status === 409 ? 'Answer blocked by guardrails. Rephrase it.' : err.message); }
  };
  const apply = async (r) => {
    if (busyId) return;
    setBusyId(r.id);
    try { await api(`/requests/${r.id}/apply`, { method: 'POST' }); flash('BEO updated'); await reload(); } catch (err) { flash(err.message); } finally { setBusyId(null); }
  };
  return (
    <div className="stack">
      {requests.map((r) => {
        const aFlags = checkText(answers[r.id] || '');
        return (
          <div className="card" key={r.id}>
            <div className="spread">
              <div className="row" style={{ gap: 8 }}>
                <span className={`pill ${r.kind === 'question' ? 'info' : 'brass'}`}>{r.kind === 'email' ? 'Client email' : r.kind === 'change' ? 'Change request' : 'Question'}</span>
                <span className="small muted">{r.source === 'client_portal' ? 'From the client guide' : 'Pasted by coordinator'} · {timeAgo(r.created_at)}</span>
              </div>
              <span className={`pill ${r.status === 'open' ? 'warn' : 'good'}`}>{r.status}</span>
            </div>
            <div className="quote" style={{ marginTop: 10 }}>{r.body}</div>
            {r.analysis?.selections && <div className="row" style={{ marginTop: 10, gap: 6 }}><span className="small muted">Add-ons picked:</span>{r.analysis.selections.map((s) => <span className="pill brass" key={s}>{s}</span>)}</div>}
            {r.analysis?.mismatches && <div style={{ marginTop: 12 }}><Mismatches analysis={r.analysis} /></div>}
            {r.analysis?.answer && <div className="okbox" style={{ marginTop: 10 }}><b>Your answer:</b> {r.analysis.answer}</div>}
            {r.status === 'open' && (
              <div style={{ marginTop: 12 }}>
                {r.kind === 'question' ? (
                  <>
                    <textarea className={`input ${aFlags.length ? 'flagged' : ''}`} rows={3} placeholder="Write your answer. It appears in the client's guide." value={answers[r.id] || ''} onChange={(ev) => setAnswers({ ...answers, [r.id]: ev.target.value })} />
                    {aFlags.length > 0 && <div style={{ marginTop: 8 }}><Flags flags={aFlags} compact /></div>}
                    <div className="row" style={{ marginTop: 8, justifyContent: 'flex-end' }}><button className="btn sm" disabled={!answers[r.id]?.trim() || aFlags.length > 0} onClick={() => resolve(r)}>Send answer</button></div>
                  </>
                ) : (
                  <div className="row" style={{ justifyContent: 'flex-end' }}>
                    {r.analysis?.mismatches?.length > 0 && <button className="btn sm" disabled={!!busyId} onClick={() => apply(r)}>{busyId === r.id ? <><span className="spinner" /> Applying…</> : 'Apply to BEO draft'}</button>}
                    <button className="btn ghost sm" onClick={() => resolve(r)}>Mark resolved</button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function EventWorkspace({ id, flash }) {
  const [d, setD] = useState(null);
  const [tab, setTab] = useState(null);
  const load = (keepTab) => api(`/events/${id}`).then((r) => {
    setD(r);
    if (!keepTab && !tab) {
      const s = r.event.status;
      const open = r.requests.filter((x) => x.status === 'open').length;
      setTab(s === 'in_review' || s === 'intake_complete' ? 'guide' : s === 'guide_shared' ? (open ? 'requests' : 'brief') : 'inquiry');
    }
  }).catch((e) => flash(e.message));
  useEffect(() => { load(); }, [id]);
  if (!d) return <div className="page"><span className="spinner dark" /></div>;
  const e = d.event;
  const open = d.requests.filter((r) => r.status === 'open').length;
  const tabs = [['inquiry', 'Inquiry & reply'], ['guide', 'Planning guide'], ['brief', 'Brief & BEO'], ['requests', `Client requests${open ? ` (${open})` : ''}`], ['activity', 'Activity log']];

  return (
    <main className="page">
      <a href="/" className="small" onClick={(ev) => { ev.preventDefault(); navigate('/'); }}>← Pipeline</a>
      <div className="spread" style={{ marginTop: 8 }}>
        <div>
          <h1>{e.title}</h1>
          <div className="muted" style={{ marginTop: 4 }}>{e.contact?.name}{e.contact?.company ? ` · ${e.contact.company}` : ''}{e.contact?.email ? ` · ${e.contact.email}` : ''} {e.contact?.is_member && <span className="pill good" style={{ marginLeft: 6 }}>Member</span>}</div>
        </div>
      </div>
      <Stepper status={e.status} />
      <div className="tabs">{tabs.map(([k, l]) => <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'inquiry' && <InquiryTab key={e.updated_at} e={e} reload={load} flash={flash} />}
      {tab === 'guide' && <GuideTab key={e.updated_at} e={e} reload={load} flash={flash} />}
      {tab === 'brief' && <BriefTab e={e} reload={load} flash={flash} />}
      {tab === 'requests' && <RequestsTab e={e} requests={d.requests} reload={load} flash={flash} />}
      {tab === 'activity' && (
        <div className="card"><ul className="activity">{d.activity.map((a) => (
          <li key={a.id}><Actor actor={a.actor} /><div style={{ flex: 1 }}><div>{a.action}</div>
            <div className="small muted">{new Date(a.created_at).toLocaleString()}{a.detail?.engine ? ` · engine: ${a.detail.engine}` : ''}{a.detail?.ms ? ` · ${(a.detail.ms / 1000).toFixed(1)}s` : ''}{a.detail?.override_note ? ` · override: “${a.detail.override_note}”` : ''}</div></div></li>))}
        </ul></div>
      )}
    </main>
  );
}
