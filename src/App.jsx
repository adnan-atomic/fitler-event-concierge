import React, { useEffect, useState } from 'react';
import { api, getPass, setPass, navigate } from './api.js';
import Dashboard from './pages/Dashboard.jsx';
import EventWorkspace from './pages/EventWorkspace.jsx';
import ClientPortal from './pages/ClientPortal.jsx';

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
    <div className="client" style={{ display: 'grid', placeItems: 'center', padding: 16 }}>
      <form className="card" style={{ width: 'min(380px, 100%)', textAlign: 'center' }} onSubmit={submit}>
        <div className="eyebrow">Prototype</div>
        <h1 style={{ margin: '6px 0 4px' }}>Fitler Club</h1>
        <p className="muted" style={{ marginTop: 0 }}>Event Concierge · Coordinator console</p>
        <input className="input" type="password" placeholder="Demo passcode" value={v} onChange={(e) => setV(e.target.value)} autoFocus />
        {err && <p className="small" style={{ color: 'var(--bad)' }}>{err}</p>}
        <button className="btn" style={{ marginTop: 14, width: '100%', justifyContent: 'center' }}>Enter</button>
        <p className="small muted" style={{ marginTop: 16 }}>Built by Atomic Computing · sample data</p>
      </form>
    </div>
  );
}

function TopBar({ config, onReset }) {
  return (
    <header className="topbar">
      <a className="wordmark" href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }}>
        Fitler Club <small>Event Concierge</small>
      </a>
      <div className="row" style={{ gap: 10 }}>
        {config && (
          <span className="pill" title={config.model || 'Template engine (no model key configured)'}>
            <span className={`dot ${config.ai === 'claude' ? 'good' : 'warn'}`} />
            {config.ai === 'claude' ? 'AI: Claude' : 'AI: template mode'}
          </span>
        )}
        {config && <span className="pill" title="Where data is stored">{config.store === 'supabase' ? 'Supabase' : 'In-memory'}</span>}
        <button className="link" onClick={onReset}>Reset demo</button>
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
    if (!window.confirm('Reset the demo to its starting data?')) return;
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
      <div className="footer-note">Prototype by Atomic Computing · Sample spaces, menus and pricing · Not connected to Tripleseat</div>
      <Toast msg={toast} />
    </>
  );
}
