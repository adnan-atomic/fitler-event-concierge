import React, { useEffect, useState } from 'react';
import { api, getPass, setPass, navigate } from './api.js';
import Dashboard from './pages/Dashboard.jsx';
import EventWorkspace from './pages/EventWorkspace.jsx';
import ClientPortal from './pages/ClientPortal.jsx';
import { Mark } from './components/Mark.jsx';

export function Brand({ title }) {
  return (
    <span className="brand">
      <Mark />
      {title && <><span className="brand-div" /><span className="brand-title">{title}</span></>}
    </span>
  );
}

function usePath() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const on = () => setPath(window.location.pathname);
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  return path;
}

export function Toast({ msg }) {
  return msg ? <div className="toast">{msg}</div> : null;
}

function Login({ onOk }) {
  const [v, setV] = useState('');
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setPass(v);
    try { await api('/login', { method: 'POST', body: { passcode: v } }); onOk(); } catch { setErr('That passcode did not work.'); }
  };
  return (
    <div className="login">
      <form className="card" onSubmit={submit}>
        <Mark word />
        <div className="eyebrow">Celebrate</div>
        <h1 style={{ margin: '10px 0 6px', fontSize: 30 }}>Event <em>Concierge</em></h1>
        <p className="muted" style={{ marginTop: 0 }}>Coordinator console</p>
        <input className="input" type="password" placeholder="Demo passcode" value={v} onChange={(e) => setV(e.target.value)} autoFocus />
        {err && <p className="small" style={{ color: 'var(--bad)' }}>{err}</p>}
        <button className="btn" style={{ marginTop: 14, width: '100%', justifyContent: 'center' }}>Enter</button>
        <p className="small muted" style={{ marginTop: 16 }}>Prototype · sample data</p>
      </form>
    </div>
  );
}

function TopBar({ config, onReset }) {
  const [arm, setArm] = useState(false);
  const click = () => {
    if (!arm) { setArm(true); setTimeout(() => setArm(false), 8000); return; }
    setArm(false); onReset();
  };
  return (
    <header className="topbar">
      <a className="brand-link" style={{ textDecoration: "none" }} href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }}>
        <Brand title="Event Concierge" />
      </a>
      <div className="row" style={{ gap: 10 }}>
        {config && (
          <span className="pill" title={config.model || 'Template engine (no model key configured)'}>
            <span className={`dot ${config.ai === 'claude' ? 'good' : 'warn'}`} />
            {config.ai === 'claude' ? 'AI: Claude' : 'AI: template mode'}
          </span>
        )}
        {config && (
          <span className="pill" title={config.email ? 'Clients can email their guide as a PDF (Mailgun)' : 'Add MAILGUN_API_KEY and MAILGUN_DOMAIN to turn on guide emails'}>
            <span className={`dot ${config.email ? 'good' : 'neutral'}`} />{config.email ? 'Email: on' : 'Email: off'}
          </span>
        )}
        {config && <span className="pill" title="Where data is stored">{config.store === 'supabase' ? 'Supabase' : 'In-memory'}</span>}
        <button className={`link ${arm ? 'armed' : ''}`} onClick={click}>{arm ? 'Click again to reset' : 'Reset demo'}</button>
      </div>
    </header>
  );
}

export default function App() {
  const path = usePath();
  const [config, setConfig] = useState(null);
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [toast, setToast] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const isClient = path.startsWith('/c/');

  useEffect(() => {
    api('/config').then((c) => {
      setConfig(c);
      if (!c.needsPasscode) { setAuthed(true); setChecking(false); return; }
      api('/login', { method: 'POST', body: { passcode: getPass() } })
        .then(() => setAuthed(true)).catch(() => setAuthed(false)).finally(() => setChecking(false));
    }).catch(() => setChecking(false));
  }, []);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2600); };

  if (isClient) return <ClientPortal token={path.split('/')[2]} />;
  if (checking) return <div className="page muted">Loading…</div>;
  if (!authed) return <Login onOk={() => setAuthed(true)} />;

  const reset = async () => {
    await api('/reset', { method: 'POST' });
    flash('Demo data reset');
    navigate('/');
    setReloadKey((k) => k + 1);
  };

  const eventMatch = path.match(/^\/events\/([^/]+)/);
  return (
    <>
      <TopBar config={config} onReset={reset} />
      {eventMatch
        ? <EventWorkspace key={eventMatch[1] + reloadKey} id={eventMatch[1]} flash={flash} />
        : <Dashboard key={reloadKey} flash={flash} />}
      <div className="footer-note">Fitler Club · Event Concierge prototype · Sample spaces, menus and pricing · Not connected to Tripleseat</div>
      <Toast msg={toast} />
    </>
  );
}
