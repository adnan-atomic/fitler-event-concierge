# Fitler Club · AI Event Planning Concierge (prototype)

A working prototype built by **Atomic Computing** for the Fitler Club AI assessment. It shows the Wave 1 event workflow end to end, from first inquiry to a client-ready planning guide and a BEO that keeps up with client changes.

> Sample data only. Space names, capacities, menus, prices, vendors and policies in `shared/kb.js` are placeholders to be replaced with Fitler Club actuals. Not connected to Tripleseat.

## What it demonstrates

| Screen | Proposal capability | What happens |
|---|---|---|
| **Inquiry & reply** | 3 · Speed-to-Lead | AI reads a new inquiry, extracts details, scores fit against Fitler's own criteria (space, minimum, membership, lead time, budget), suggests spaces and drafts a *personal* reply. The coordinator edits and sends. |
| **Client concierge** (`/c/:token`) | 2 · Event Planning Concierge | Sent **after the site visit**. Guided intake (corporate and social tracks) plus an "Ask the concierge" panel that answers the top-5 FAQs from the knowledge base. |
| **Planning guide review** | 2 · Concierge | AI drafts a branded guide: run of show, F&B, dietary, AV, parking, add-ons, vendor ideas, decisions needed, next steps. **Guardrails** block anything on the client's "never" list. The coordinator approves before the client sees it. |
| **Brief & BEO** | 1 · Proposal & BEO Copilot | Internal brief (F&B, AV, timeline, parking, add-ons, vendors, guest count) and a BEO draft. Paste a client email and AI flags every difference from the BEO, routes it to Kitchen / AV / Staffing, and applies it as a new revision. |
| **Client guide** | 2 · Concierge | Shared guide with decisions checklist, add-on explorer (indicative ranges only), questions and change requests that go back to the coordinator. Save as PDF to share with stakeholders. |

### Guardrails (from Fitler Club's own answers)
Never confirm a date is available · never quote a firm price · never commit a vendor · never promise a discount · never agree to anything outside policy. Enforced in `shared/guardrails.js` live in the browser and again on the server before anything is sent or published. Every AI and human action is written to an activity log.

**Live demo:** https://fitler-event-concierge.adnan-sajid.workers.dev (coordinator console behind a passcode; client links work without it)

## 7-minute demo script
Before you start: click **Reset demo** twice (top right) to restore the starting data. Expect ~15s for triage and ~45s for the planning guide, because Claude writes them live.

1. **Pipeline**: three sample events at different stages.
2. **+ New inquiry → "Corporate offsite" sample → Triage**: fit signals, space suggestions, reply draft in seconds. Send it.
3. **Send concierge link** (after the site visit) → **Open as client** on a phone.
4. Complete the intake; ask the concierge "What is the cancellation policy?"
5. Back in the console: **Planning guide** tab. Type *"Great news, your date is confirmed"*: the approval button locks. Remove it, **Approve & share**.
6. Open the client link again: the guide, add-on explorer, "Send my picks".
7. **Halvorsen Capital → Brief & BEO → Use sample email → Check against BEO**: four differences flagged and routed. **Apply to BEO draft**: revision 2 is highlighted.

Use **Reset demo** (top right) to restore the starting data before each run.

## Architecture
- **Frontend**: React + Vite (`src/`), served as static assets by Cloudflare Workers.
- **API**: Cloudflare Worker (`worker/index.js`), routes under `/api/*`.
- **Data**: Supabase Postgres via REST (`worker/store.js`, schema in `supabase/schema.sql`). Falls back to in-memory storage when Supabase isn't configured.
- **AI**: Claude via the Anthropic Messages API (`worker/ai.js`), grounded in `shared/kb.js`. If no key is set or a call fails, a deterministic template engine (`worker/mock.js`) produces the same shapes, so the demo never breaks.
- **Security**: service-role key and API key live only in Worker secrets; RLS on all tables with no public policies; client links are unguessable tokens; coordinator console behind `DEMO_PASSCODE`; no payment data anywhere.

## Run locally
```bash
npm install
cp .dev.vars.example .dev.vars   # optional: add keys; leave empty for template + in-memory mode
npm run dev:worker               # builds the app and serves everything on http://localhost:8787
```

## Deploy (Cloudflare + Supabase)
1. **Supabase**: create a project, open SQL Editor, run `supabase/schema.sql`.
2. **Cloudflare**: Workers & Pages → Create → Import a repository → this repo.
   - Build command: `npm run build` · Deploy command: `npx wrangler deploy`
3. Worker **Settings → Variables and secrets** (as *Secret*):
   `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `DEMO_PASSCODE`
   (optional plain var `ANTHROPIC_MODEL` to change the model).
4. Open the deployed URL, enter the passcode, click **Reset demo** once to seed Supabase.

## Path to production (Vibe-to-Production)
Replace sample KB with Fitler's spaces, menus, pricing and policies → Tripleseat read integration (24 months of records available) → write-back of BEO drafts → HubSpot lead sync → SSO for staff → deploy into Fitler's AWS environment.
