# AM Application Specialist — Project Context

## What this project is
An AI-powered 3D printing material selection advisor built as a single `index.html` file.
The agent guides engineers through a structured requirements-gathering process and recommends
the optimal material and printing technology based on the **Ashby methodology**
(Materials Selection in Mechanical Design — Prof. Michael F. Ashby).

**Current version:** v1.19  
**Repository:** GitHub → hosted on GitHub Pages (static, single file)

---

## Tech stack
- Single `index.html` file — no framework, no build step, no server
- Vanilla JS + CSS
- Calls Anthropic API directly from the browser (`claude-sonnet-4-20250514`)
- Hosted on GitHub Pages (static)
- User enters their own Anthropic API key on first load (stored in localStorage)

---

## File structure
```
AM Application Specialist Chatbot/
  index.html              ← entire app lives here
  AM-Materials-DB.csv     ← source of truth for materials (53 materials)
  AM-Printers-DB.csv      ← source of truth for printers (13 printers)
  CONTEXT.md              ← this file
```

---

## Databases (embedded in index.html as JS arrays)

### Materials — `MAT` array (53 materials)
Each object has these fields:
```js
{
  n:    "material name",
  v:    "vendor",           // Formlabs / HP / Markforged
  f:    "family",           // resin / powder / filament
  p:    "process",          // SLA/DLP / SLS / MJF / FFF+CFR
  transp: "yes/no",         // optical transparency
  esd:    "yes/no",
  fr:     "yes/no",         // flame retardant
  fs:     "yes/no",         // fluid sealing
  bio:    "yes/no",         // biocompatibility
  autoclave: "yes/no",      // autoclave sterilization (BioMed materials only)
  hdt:  number,             // Heat Deflection Temperature °C
  ts:   number,             // tensile strength MPa
  em:   number,             // elastic modulus GPa
  el:   number,             // elongation at break %
  imp:  number,             // impact strength J/m
  cost: number,             // ILS per kg
  std:  "standard",         // e.g. "UL94 V0", "ISO 10993 / USP VI", "FAR 25.853"
  gn:   "general notes",    // critical notes, warnings, substitutes (from CSV column general_notes)
  link: "url"               // shop.systematics.co.il link (27 Formlabs materials have this)
}
```

### Printers — `PRN` array (13 printers)
```js
{
  n:    "printer name",
  mfr:  "manufacturer",
  tech: "technology",       // LFD/SLA / SLS / MJF / FFF+CFR / FDM/FFF
  bx, by, bz: number,       // build volume mm
  res:  number,             // XY resolution µm
  acc:  "string",           // accuracy e.g. "±0.2%"
  esd:  "yes/no",
  fr:   "yes/no",
  bio:  "yes/no",
  opt:  "yes/no"            // optically clear materials support
}
```

---

## Agent workflow (10 steps)

### Steps 0–6 — Requirements gathering
Each step shows clickable multi-select option buttons (text appends to input box).
User can go back and edit any completed step by clicking it in the sidebar.

| Step | Topic | Option buttons |
|---|---|---|
| 0 | Application type | Visual prototype / Functional prototype / Manufacturing aid / End-use part |
| 1 | Part description | Free text |
| 2 | Functional requirements | None / Optical transparency / ESD / Biocompatibility |
| 3 | Mechanical requirements | None / High tensile / Impact rigid / Flexible elastic |
| 4 | Environmental requirements | None / High temp / Chemical resistance / UV outdoor |
| 5 | Geometry & size | 6 size categories (see below) |
| 6 | Manufacturing context | 1–5 prototypes / Small batch / Cost priority / Performance priority |

**Geometry step size categories (step 5):**

| Label | Max dimension | Engineering analogy |
|---|---|---|
| Miniature | ≤10 mm | Drill bit |
| Small | ≤50 mm | Socket |
| Medium | ≤100 mm | Hammer head |
| Large | ≤200 mm | C-clamp |
| Very Large | ≤300 mm | Screwdriver |
| Huge | ≤500 mm | Welding torch |

### Step 7 — Analysis (Ashby screening & ranking)
- After step 6, goes directly to formatted report (no intermediate text bubble)
- Claude returns JSON → parsed → rendered as styled report with 4 tabs
- `sanitizeJSONString()` escapes literal newlines before `JSON.parse` (fixes Hebrew mode errors)

### Step 8 — Feedback loop
- Quick refinement buttons (6 presets) + custom textarea
- Thread-style: refined reports appear below, old reports stay visible
- Each report iteration has a unique DOM id `report-iter-N`
- Tab switching scoped to `btn.closest(".report-box")` to avoid cross-report interference

### Step 9 — Approved / Final report
- On approval: `doApprove()` → shows export options + triggers `sendEmailReport()`

---

## Report panel tabs
1. **Overview** — 3 material cards with key properties + shop link button if available
2. **Comparison** — full property table with visual bar charts
3. **Equipment** — printer cards with build volume, resolution, accuracy
4. **Risks** — risk items (high/medium/low) + expert note + next steps

Shop links: 27 Formlabs materials have `link` field → shows `🛒 Buy at Systematics` button on material card.

---

## Agent domain knowledge rules (in `buildSystem()`)

### Rule 1 — Medical / Biocompatibility → BioMed materials
**Trigger:** medical devices, surgical tools, patient contact, dental, implants, biocompatibility.
- Prioritize: BioMed Clear, White, Black, Amber, Durable, Elastic, Flex 80A
- Certified: ISO 10993 / USP Class VI
- Require: Form 4B or Form 4BL printer
- Always ask about autoclave sterilization

### Rule 2 — High toughness / impact resistance → probe rigid vs. flexible
**Trigger:** high toughness, impact resistance, drop tests, shock loads.
- Ask: rigid stiffness OR flexible energy-absorption?
- Rigid: Markforged Onyx/fiber, HP PA 11, Tough 2000, Tough 1500
- Flexible: TPU 90A (SLS), Flexible 80A, Elastic 50A, Silicone 40A, HP TPU, Markforged TPU

### Rule 3 — Smallest feature size → technology gate
**Trigger:** always — asked during geometry step.

| Smallest feature | Allowed technologies |
|---|---|
| < 0.5 mm | SLA/LFD only (Form 4 family) |
| 0.5–1 mm | SLA/LFD preferred; SLS acceptable |
| 1–2 mm | SLA, SLS, or MJF |
| > 2 mm | Any; FDM/FFF also viable |

FDM/FFF must not be recommended when smallest feature < 1 mm.

### Rule 4 — General notes (`gn` field)
- Always read the `gn` field for each candidate material
- Reference relevant notes explicitly in rationale and summary
- Treat warnings (e.g. "NOT suitable for impact") as hard constraints

---

## Bilingual support (Hebrew / English)

- Language toggle in ⚙ Settings modal (was top-bar button, moved to Settings in v1.16)
- Stored in `localStorage("am_lang")`; default: `"en"`
- Full `LANG` object with `en` and `he` keys; `t(key)` helper for all UI strings
- RTL layout via `[dir=rtl]` CSS selectors on `document.documentElement`
- Hebrew mode: Claude responds in Hebrew for conversation, returns JSON with Hebrew string values
- `sanitizeJSONString()` prevents Hebrew unescaped-newline JSON parse errors

---

## Email report feature

Sends a summary email automatically when the user approves a run.

**Service:** EmailJS (free tier — 200 emails/month)  
**Trigger:** `doApprove()` → calls `sendEmailReport()`  
**Silent skip** if email not configured.

**Configuration** (in ⚙ Settings → "Email Report" section):
- Recipient email
- EmailJS Service ID
- EmailJS Template ID
- EmailJS Public Key

**EmailJS template** must have `{{subject}}` as subject and `{{body}}` in the body.

**Email content:**
- Run date, iteration count
- All collected requirements
- Top 3 recommended materials + rationale
- Professional note + next steps
- Token counts (input / output / total) + estimated USD cost

---

## Token tracking & cost

Variables: `totalInputTokens`, `totalOutputTokens` — accumulated in `callClaude()` from `d.usage`.  
Reset in `clearSession()`.

`calcRunCost()` — estimates cost using each model's actual rates.

**Current cost per run: ~$0.08** (down from ~$0.20 before v1.19)

### Cost architecture (v1.19)

`callClaude(messages, fullCtx=false)` selects model and system prompt based on context:

| Call type | Model | System prompt | Cost driver |
|---|---|---|---|
| Chat steps 0–6 | `claude-haiku-4-5-20251001` | `buildSystem()` — no DB | ~$0.003 for 7 calls |
| Analysis + refinements | `claude-sonnet-4-20250514` | `buildSystemFull()` — with MAT+PRN DB | ~$0.05–0.07 per call |

- `buildSystem()` — domain rules + requirements, **no DB** (~1,500 tokens)
- `buildSystemFull()` — `buildSystem()` + full MAT+PRN JSON (~8,000 tokens), used only in `runAnalysis()`
- Rates: Haiku $0.80/1M input + $4/1M output; Sonnet $3/1M input + $15/1M output

**Rollback:** `git checkout v1.18` (tagged) restores the pre-optimization state.

---

## UI structure

- **Left sidebar:** "Process Steps" label (EN) / "שלבי התהליך" (HE), step tracker (10 steps), iteration badge, Export PDF, New Run, Settings
- **Top bar:** title, tech pills (SLA/DLP · SLS · MJF · FFF+CFR)
- **Message area:** chat bubbles, report panels (thread-style — accumulated), feedback panel
- **Input area:** textarea + send button + multi-select option buttons

### Settings modal sections
1. Interface Language (EN / HE toggle)
2. API Key (current masked + change field)
3. Email Report (recipient + EmailJS credentials + Save/Test buttons)

---

## Design system
- Light theme: background `#eef0f4`, surface `#ffffff`
- Font: DM Sans (body) + DM Mono (numbers/code)
- Accent: blue `#2563eb`, cyan `#0891b2`, green `#059669`, amber `#d97706`, red `#dc2626`
- Rank colors: green (1st), blue (2nd), purple (3rd)
- Technology colors: purple=SLA, amber=SLS, cyan=MJF, green=CFR, slate=FDM

---

## How to update materials from CSV

The `MAT` array is hardcoded in `index.html`. When the CSV is updated:
1. Edit `AM-Materials-DB.csv`
2. Run a Node.js sync script to update the relevant fields in the `MAT` array
3. For shop links specifically: match `Shop_Link` column (col 28) to `MAT[].n` by material name

Fields in MAT that come from CSV: all properties + `gn` (general_notes col 19) + `link` (Shop_Link col 28).

---

## Git / deployment
- Repository: `github.com/guyaros/am-application-specialist`
- Hosting: GitHub Pages (static, single file)
- Branch: `main`
- No build step — push `index.html` and it's live within ~1 minute
