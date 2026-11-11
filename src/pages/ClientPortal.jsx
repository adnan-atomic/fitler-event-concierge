import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { intakeQuestions } from '../../shared/intake.js';
import { KB } from '../../shared/kb.js';
import { GuideView } from '../components/ui.jsx';
import { Mark } from '../components/Mark.jsx';

function FaqPanel({ token }) {
  const [q, setQ] = useState('');
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const ask = async (question) => {
    if (!question.trim()) return;
    setBusy(true); setQ('');
    setLog((l) => [...l, { me: true, text: question }]);
    try {
      const r = await api(`/c/${token}/faq`, { method: 'POST', body: { question } });
      setLog((l) => [...l, { me: false, text: r.answer, routed: !r.answered }]);
    } catch { setLog((l) => [...l, { me: false, text: 'Sorry, something went wrong. Your coordinator can help.' }]); }
    setBusy(false);
  };
  return (
    <aside className="faq-panel no-print">
      <div className="eyebrow">Questions?</div>
      <h3 style={{ margin: '4px 0 10px' }}>Ask the concierge</h3>
      <div className="row" style={{ gap: 6 }}>
        {KB.faqs.map((f) => <button key={f.id} className="chip" style={{ fontSize: 12 }} onClick={() => ask(f.q)} disabled={busy}>{f.q.replace(/\?$/, '')}</button>)}
      </div>
      <div style={{ maxHeight: 340, overflowY: 'auto', marginTop: 10 }}>
        {log.map((m, i) => <div key={i} className={`bubble ${m.me ? 'me' : 'bot'}`} style={{ fontSize: 13.5 }}>{m.text}{m.routed && <span className="note">↪ Sent to your coordinator</span>}</div>)}
        {busy && <div className="bubble bot"><span className="spinner dark" /></div>}
      </div>
      <form className="row" style={{ marginTop: 10, flexWrap: 'nowrap' }} onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a question…" />
        <button className="btn sm" disabled={busy || !q.trim()}>Ask</button>
      </form>
      <p className="small muted" style={{ marginBottom: 0 }}>Your coordinator confirms dates, pricing and anything specific to your event.</p>
    </aside>
  );
}

function Intake({ token, data, onDone }) {
  const questions = intakeQuestions(data.event_type);
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState({});
  const [draft, setDraft] = useState('');
  const [multi, setMulti] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const end = useRef(null);
  const first = (data.contact?.name || '').split(' ')[0];
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [i, submitting]);

  const q = questions[i];
  const commit = (val) => {
    setAnswers((a) => ({ ...a, [q.id]: val }));
    setDraft(''); setMulti([]);
    setI((n) => n + 1);
  };
  const fmt = (v) => (Array.isArray(v) ? v.join(', ') : String(v ?? ''));
  const submit = async () => {
    setSubmitting(true);
    try { await api(`/c/${token}/intake`, { method: 'POST', body: { answers } }); onDone(); }
    catch (e) { alert(e.message); setSubmitting(false); }
  };

  return (
    <div className="chat">
      <div className="progress"><div style={{ width: `${Math.min(100, (i / questions.length) * 100)}%` }} /></div>
      <div className="bubble bot">Hello{first ? ` ${first}` : ''}, and thank you for visiting Fitler Club. I'm your planning concierge. A few questions, about five minutes, and I'll put together a personalised planning guide that your coordinator will review and share with you.</div>
      {questions.slice(0, i).map((qq) => (
        <React.Fragment key={qq.id}>
          <div className="bubble bot">{qq.prompt}</div>
          <div className="bubble me">{fmt(answers[qq.id]) || <i>Skipped</i>}</div>
        </React.Fragment>
      ))}
      {q && (
        <>
          <div className="bubble bot">{q.prompt}{q.note && <span className="note">{q.note}</span>}</div>
          <div className="answer-area">
            {q.type === 'chips' && <div className="row" style={{ gap: 8 }}>{q.options.map((o) => <button key={o} className="chip" onClick={() => commit(o)}>{o}</button>)}</div>}
            {q.type === 'multi' && (
              <>
                <div className="row" style={{ gap: 8 }}>{q.options.map((o) => <button key={o} className={`chip ${multi.includes(o) ? 'on' : ''}`} onClick={() => setMulti((m) => (m.includes(o) ? m.filter((x) => x !== o) : [...m, o]))}>{o}</button>)}</div>
                <div className="row" style={{ marginTop: 10, justifyContent: 'flex-end' }}><button className="btn sm" disabled={!multi.length} onClick={() => commit(multi)}>Continue</button></div>
              </>
            )}
            {['text', 'number', 'longtext'].includes(q.type) && (
              <form onSubmit={(e) => { e.preventDefault(); if (draft.trim() || q.optional) commit(q.type === 'number' ? Number(draft) || draft : draft.trim()); }}>
                {q.type === 'longtext'
                  ? <textarea className="input" rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={q.placeholder} autoFocus />
                  : <input className="input" type={q.type === 'number' ? 'number' : 'text'} inputMode={q.type === 'number' ? 'numeric' : undefined} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={q.placeholder} autoFocus />}
                <div className="row" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
                  {q.optional && <button type="button" className="btn ghost sm" onClick={() => commit('')}>Skip</button>}
                  <button className="btn sm" disabled={!draft.trim()}>Continue</button>
                </div>
              </form>
            )}
            {q.optional && q.type === 'chips' && <div className="row" style={{ marginTop: 8, justifyContent: 'flex-end' }}><button className="btn ghost sm" onClick={() => commit('')}>Skip</button></div>}
          </div>
        </>
      )}
      {!q && (
        <>
          <div className="bubble bot">Thank you, that's everything I need. Shall I send this to your coordinator to prepare your guide?</div>
          <div className="answer-area row" style={{ justifyContent: 'space-between' }}>
            <button className="btn ghost sm" onClick={() => setI(questions.length - 1)} disabled={submitting}>Change my last answer</button>
            <button className="btn brass" onClick={submit} disabled={submitting}>{submitting ? <><span className="spinner" /> Preparing your guide…</> : 'Send to my coordinator'}</button>
          </div>
        </>
      )}
      <div ref={end} />
    </div>
  );
}

function RequestBox({ token, onSent }) {
  const [kind, setKind] = useState('question');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try { await api(`/c/${token}/request`, { method: 'POST', body: { kind, body: text } }); setText(''); onSent(kind === 'change' ? 'Change request sent to your coordinator' : 'Question sent to your coordinator'); }
    finally { setBusy(false); }
  };
  return (
    <div className="gsec no-print">
      <h3>Something not covered?</h3>
      <div className="row" style={{ gap: 6, margin: '6px 0 10px' }}>
        <button className={`chip ${kind === 'question' ? 'on' : ''}`} onClick={() => setKind('question')}>Ask a question</button>
        <button className={`chip ${kind === 'change' ? 'on' : ''}`} onClick={() => setKind('change')}>Request a change</button>
      </div>
      <textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === 'change' ? 'e.g. We are now 42 guests, and 6 are vegan' : 'Ask anything. Your coordinator replies here.'} />
      <div className="spread" style={{ marginTop: 10 }}>
        <span className="small muted">{kind === 'change' ? 'Changes go to your coordinator, who updates your event order.' : 'Your coordinator reads every question.'}</span>
        <button className="btn sm" disabled={!text.trim() || busy} onClick={send}>Send</button>
      </div>
    </div>
  );
}

export default function ClientPortal({ token }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const load = () => api(`/c/${token}`).then(setData).catch((e) => setErr(e.message));
  useEffect(() => { load(); document.title = 'Your event · Fitler Club'; }, [token]);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2600); load(); };

  const header = (
    <div className="client-top">
      <Mark word />
      <div className="sub">Event Planning Concierge</div>
      <div className="tag">Every detail handled, so you can enjoy every moment.</div>
    </div>
  );
  if (err) return <div className="client">{header}<div className="client-wrap single"><div className="card"><h2>This link isn't available</h2><p className="muted">Please contact your coordinator for a fresh link.</p></div></div></div>;
  if (!data) return <div className="client">{header}<div className="client-wrap single"><span className="spinner dark" /></div></div>;

  const notYet = ['inquiry', 'replied'].includes(data.status);
  const inReview = data.intake_submitted && data.status !== 'guide_shared';
  const sendPicks = async (names, guests) => {
    await api(`/c/${token}/request`, { method: 'POST', body: { kind: 'change', body: `I'd like these add-ons priced in my proposal (for about ${guests} guests): ${names.join(', ')}.`, selections: names } });
    flash('Your picks were sent to your coordinator');
  };

  return (
    <div className="client">
      {header}
      {notYet && <div className="client-wrap single"><div className="card"><h2>Your concierge isn't open yet</h2><p className="muted">Your coordinator will send it after your site visit.</p></div></div>}
      {data.status === 'concierge_sent' && (
        <div className="client-wrap">
          <Intake token={token} data={data} onDone={load} />
          <FaqPanel token={token} />
        </div>
      )}
      {inReview && (
        <div className="client-wrap">
          <div className="chat" style={{ minHeight: 0, textAlign: 'center', padding: '44px 24px' }}>
            <div className="eyebrow">Thank you</div>
            <h1 style={{ margin: '8px 0' }}>Your guide is with your coordinator</h1>
            <p className="muted" style={{ maxWidth: 480, margin: '0 auto' }}>We've turned your answers into a personalised planning guide. Your coordinator is reviewing it now and will share it with you shortly. In the meantime, ask the concierge anything.</p>
          </div>
          <FaqPanel token={token} />
        </div>
      )}
      {data.status === 'guide_shared' && data.guide && (
        <div className="client-wrap">
          <div className="stack">
            <GuideView guide={data.guide} contactName={data.contact?.name} eventType={data.event_type} interactive onSendSelections={sendPicks} />
            {data.requests.length > 0 && (
              <div className="gsec no-print">
                <h3>Your questions & requests</h3>
                {data.requests.map((r) => (
                  <div key={r.id} className="check" style={{ display: 'block' }}>
                    <div className="row" style={{ gap: 8 }}><span className="pill">{r.kind === 'change' ? 'Change' : 'Question'}</span><span>{r.body}</span></div>
                    <div className="small" style={{ marginTop: 6, color: r.answer || r.applied ? 'var(--good)' : 'var(--slate)' }}>{r.answer ? `Coordinator: ${r.answer}` : r.applied ? '✓ Updated in your event plan by your coordinator' : r.status === 'open' ? 'With your coordinator' : 'Handled by your coordinator'}</div>
                  </div>
                ))}
              </div>
            )}
            <RequestBox token={token} onSent={flash} />
            <div className="row no-print" style={{ justifyContent: 'center' }}><button className="btn ghost" onClick={() => window.print()}>Save as PDF to share</button></div>
            <p className="small muted" style={{ textAlign: 'center' }}>Indicative information only. Your coordinator confirms dates, pricing and vendors in your proposal and contract.</p>
          </div>
          <FaqPanel token={token} />
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
