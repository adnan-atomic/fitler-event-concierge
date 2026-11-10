import React, { useMemo, useState } from 'react';
import { money, range } from '../../shared/kb.js';
import { STAGES, stageIndex } from '../api.js';

export function Actor({ actor }) {
  const label = { ai: 'AI', coordinator: 'CO', client: 'CL', system: 'SY' }[actor] || '?';
  return <span className={`actor a-${actor}`} title={actor}>{label}</span>;
}

export function FitPill({ fit }) {
  const tone = /strong/i.test(fit) ? 'good' : /review/i.test(fit) ? 'bad' : 'warn';
  return <span className={`pill ${tone}`}>{fit}</span>;
}

export function Stepper({ status }) {
  const idx = stageIndex(status);
  return (
    <div className="stepper">
      {STAGES.map((s, i) => <div key={s.id} className={`step ${i < idx ? 'done' : ''} ${i === idx ? 'now' : ''}`}>{s.label}</div>)}
    </div>
  );
}

export function Flags({ flags, compact }) {
  if (!flags) return null;
  if (!flags.length) return <div className="okbox">✓ Guardrail check passed: no availability, firm-price, discount, vendor or policy commitments.</div>;
  return (
    <div className="flagbox">
      <b>{flags.length} guardrail flag{flags.length > 1 ? 's' : ''}.</b> {compact ? '' : 'Fix before this reaches the client.'}
      <ul>{flags.map((f, i) => <li key={i}><b>{f.label}:</b> “{f.match}” <span className="muted">· {f.why}</span></li>)}</ul>
    </div>
  );
}

export function BeoView({ beo, changed = [] }) {
  if (!beo) return null;
  const hit = (k) => changed.some((c) => c.toLowerCase().includes(k));
  return (
    <div className="beo">
      <div className="beo-h">
        <div><div className="small" style={{ letterSpacing: '.14em', textTransform: 'uppercase' }}>Banquet event order · draft</div><b>{beo.event_name}</b></div>
        <span className="pill" style={{ background: 'rgba(255,255,255,.08)', color: '#EAF1F7', borderColor: 'rgba(255,255,255,.2)' }}>Revision {beo.revision || 1}</span>
      </div>
      <div className="beo-grid">
        <div><label>Date</label>{beo.date}</div>
        <div className={hit('guest') ? 'changed' : ''}><label>Guests</label>{beo.guest_count}</div>
        <div><label>Space</label>{beo.space}</div>
        <div className={hit('setup') ? 'changed' : ''}><label>Setup</label>{beo.setup}</div>
      </div>
      <div className="beo-sec">
        <h4>Timeline</h4>
        <table className="t"><tbody>
          {(beo.timeline || []).map((t, i) => (
            <tr key={i} className={hit('start time') && changed.some((c) => t.item.toLowerCase().includes(c.split(' ')[0].toLowerCase())) ? 'changed' : ''}>
              <td style={{ width: 80, fontWeight: 600 }}>{t.time}</td><td>{t.item}</td>
            </tr>
          ))}
        </tbody></table>
      </div>
      <div className="beo-sec grid2" style={{ gap: 16 }}>
        <div><h4>Menu</h4>{beo.menu?.style}<div className="small muted">{beo.menu?.notes}</div><h4 style={{ marginTop: 12 }}>Bar</h4>{beo.bar}</div>
        <div className={hit('dietary') ? 'changed' : ''} style={{ padding: 4, borderRadius: 6 }}>
          <h4>Dietary</h4>
          {(beo.dietary || []).length ? (beo.dietary || []).map((d, i) => <div key={i}>{d.need}: <b>{d.count ?? 'count TBC'}</b></div>) : <span className="muted">None noted</span>}
        </div>
      </div>
      <div className="beo-sec grid2" style={{ gap: 16 }}>
        <div className={hit('av') ? 'changed' : ''} style={{ padding: 4, borderRadius: 6 }}><h4>AV</h4>{(beo.av || []).length ? beo.av.join(' · ') : <span className="muted">None</span>}</div>
        <div><h4>Parking & notes</h4>{beo.parking}{beo.notes ? <div className="small muted">{beo.notes}</div> : null}</div>
      </div>
    </div>
  );
}

export function GuideView({ guide, contactName, interactive, onSendSelections }) {
  const [checked, setChecked] = useState({});
  const [picked, setPicked] = useState({});
  const [guests, setGuests] = useState(guide?.estimate?.guests || 40);
  const options = guide?.options || [];
  const addOnRange = useMemo(() => options.filter((o) => picked[o.id]).reduce((acc, o) => {
    const mult = /guest|person/.test(o.unit) ? guests : /table/.test(o.unit) ? Math.ceil(guests / 10) : /car/.test(o.unit) ? Math.ceil(guests / 3) : /room/.test(o.unit) ? 4 : 1;
    return [acc[0] + o.range[0] * mult, acc[1] + o.range[1] * mult];
  }, [0, 0]), [picked, guests, options]);
  if (!guide) return null;
  const scale = guide.estimate?.guests ? guests / guide.estimate.guests : 1;

  return (
    <div className="stack" style={{ '--gap': '16px' }}>
      <div className="guide-hero">
        <div className="eyebrow">Your planning guide{contactName ? ` · prepared for ${contactName}` : ''}</div>
        <h1 style={{ margin: '8px 0 10px' }}>{guide.title}</h1>
        <p style={{ margin: 0, maxWidth: 680 }}>{guide.intro}</p>
        {guide.estimate && (
          <div className="estimate">
            <div><div className="small">Indicative range for food, bar & AV</div>
              <div className="big">{money(guide.estimate.low * scale)} – {money(guide.estimate.high * scale)}</div></div>
            <div className="small" style={{ maxWidth: 340 }}>{guide.estimate.note}</div>
          </div>
        )}
        {guide.approved_at && <div className="small" style={{ marginTop: 14, color: 'var(--ember)', fontFamily: 'var(--mono)', letterSpacing: '.08em', textTransform: 'uppercase', fontSize: 10.5 }}>✓ Reviewed by your coordinator · {new Date(guide.approved_at).toLocaleDateString()}</div>}
      </div>

      <div className="grid2">
        {(guide.sections || []).filter((s) => s.body || s.items?.length).map((s) => (
          <div className="gsec" key={s.id}>
            <h3>{s.heading}</h3>
            {s.body && <div className="muted">{s.body}</div>}
            {s.items?.length > 0 && <ul>{s.items.map((it, i) => <li key={i}>{it}</li>)}</ul>}
          </div>
        ))}
      </div>

      <div className="grid2">
        <div className="gsec">
          <h3>Decisions we need from you</h3>
          {(guide.decisions || []).map((d) => (
            <label className="check" key={d.id}>
              <input type="checkbox" checked={!!checked[d.id]} onChange={(e) => setChecked({ ...checked, [d.id]: e.target.checked })} disabled={!interactive} />
              <span style={{ textDecoration: checked[d.id] ? 'line-through' : 'none', color: checked[d.id] ? 'var(--muted)' : 'inherit' }}>{d.text}</span>
            </label>
          ))}
        </div>
        <div className="gsec">
          <h3>Next steps</h3>
          {(guide.next_steps || []).map((n, i) => (
            <div className="check" key={i}>
              <span className={`owner ${n.owner === 'You' ? 'you' : 'fc'}`}>{n.owner}</span><span>{n.text}</span>
            </div>
          ))}
        </div>
      </div>

      {options.length > 0 && (
        <div className="gsec">
          <div className="spread">
            <div><h3>Explore add-ons</h3><div className="muted small">Play with ideas. Nothing is booked; your coordinator prices anything you pick in your proposal.</div></div>
            <label className="small row" style={{ gap: 8 }}>Guests
              <input type="range" min="10" max="250" value={guests} onChange={(e) => setGuests(Number(e.target.value))} disabled={!interactive} />
              <b style={{ minWidth: 30 }}>{guests}</b>
            </label>
          </div>
          <div className="grid2" style={{ gap: 8, marginTop: 12 }}>
            {options.map((o) => (
              <label key={o.id} className={`opt ${picked[o.id] ? 'on' : ''}`}>
                <span className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
                  <input type="checkbox" checked={!!picked[o.id]} disabled={!interactive} onChange={(e) => setPicked({ ...picked, [o.id]: e.target.checked })} />
                  <span><b style={{ fontWeight: 500 }}>{o.name}</b><br /><span className="small muted">{o.category}</span></span>
                </span>
                <span className="small" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{range(o.range)}<br /><span className="muted">{o.unit}</span></span>
              </label>
            ))}
          </div>
          {interactive && (
            <div className="spread" style={{ marginTop: 10 }}>
              <div>Selected add-ons, indicative: <b>{addOnRange[1] ? `${money(addOnRange[0])} – ${money(addOnRange[1])}` : '—'}</b></div>
              <button className="btn brass sm no-print" disabled={!Object.values(picked).some(Boolean)}
                onClick={() => onSendSelections?.(options.filter((o) => picked[o.id]).map((o) => o.name), guests)}>
                Send my picks to my coordinator
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
