# AM Application Specialist — Project Context

## What this project is
An AI-powered 3D printing material selection advisor built as a single `index.html` file.
The agent guides engineers through a structured requirements-gathering process and recommends
the optimal material and printing technology based on the **Ashby methodology**
(Materials Selection in Mechanical Design — Prof. Michael F. Ashby).

---

## Tech stack
- Single `index.html` file — no framework, no build step, no server
- Vanilla JS + CSS
- Calls Anthropic API directly from the browser (`claude-sonnet-4-20250514`)
- Hosted on GitHub Pages (static)
- User enters their own Anthropic API key on first load (stored in memory only)

---

## File structure
```
AM Application Specialist Chatbot/
  index.html              ← entire app lives here
  AM-Materials-DB.xlsx    ← source data (not loaded at runtime, embedded in JS)
  AM-Printers-DB.xlsx     ← source data (not loaded at runtime, embedded in JS)
  CONTEXT.md              ← this file
```

---

## Databases (embedded in index.html as JS arrays)

### Materials — `MAT` array (27 materials)
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
  std:  "standard"          // e.g. "UL94 V0", "ISO 10993 / USP VI", "FAR 25.853"
}
```

### Printers — `PRN` array (11 printers)
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

## Agent workflow (Ashby 4-stage process)

### Stage 0 — Application type
User selects: Visual prototype / Functional prototype / Manufacturing aid / End-use part

### Stage 1 — Requirements translation
Agent asks one question at a time across these categories:
- **Functional:** optical transparency, ESD, flame retardant (UL94/FAR), fluid sealing, RF transparency, biocompatibility, autoclave sterilization
- **Mechanical:** tensile strength, elastic modulus, elongation, impact strength, Shore hardness
- **Environmental:** service temperature (HDT), chemical resistance, UV/outdoor
- **Geometry:** max part size, accuracy/tolerance, surface finish (Ra)
- **Manufacturing:** quantity, cost vs performance priority, available printers

### Stage 2 — Screening
Filter out materials that fail hard constraints (functional flags, HDT, build volume).

### Stage 3 — Ranking
Score remaining materials by fit. Return top 3 with compatible printers.

### Stage 4 — Supporting information
Rationale, risks, expert note.

---

## Feedback loop
After initial analysis, user can:
- Click a quick refinement button (6 preset options)
- Type a custom refinement
- Approve the result

On refinement → re-run full Ashby analysis with updated requirements.
Iteration counter increments each time. Report shows "Updated" badge on revised analyses.

On approval → offer PDF export via `window.print()`.

---

## UI structure
- **Left sidebar:** Ashby step tracker (10 steps), iteration badge, Export PDF button, Change API Key button
- **Top bar:** title, tech pills (SLA/DLP · SLS · MJF · FFF+CFR)
- **Message area:** chat bubbles (agent + user), report panel, feedback panel
- **Input area:** textarea + send button

### Report panel tabs
1. **Overview** — 3 material cards with key properties
2. **Comparison** — full property table with visual bar charts
3. **Equipment** — printer cards with build volume, resolution, accuracy
4. **Risks** — risk items (high/medium/low) + expert note

---

## Design system
- Dark theme: navy `#0a1628` background
- Font: DM Sans (body) + DM Mono (numbers/code)
- Accent colors: blue `#1a56db`, cyan `#06b6d4`, green `#10b981`, amber `#f59e0b`
- Rank colors: green (1st), blue (2nd), purple (3rd)
- Technology colors: purple=SLA, amber=SLS, cyan=MJF, green=CFR, slate=FDM

---

## Known issues / things to improve
- Materials DB is hardcoded in JS — updating requires editing the array manually
- PDF export uses browser print (basic) — could be improved with a proper PDF library
- No user authentication — anyone with an API key can use it
- No session persistence — refreshing the page resets everything

---

## How to add/update materials
Find the `MAT` array in `index.html` and add a new object following the schema above.
Example — adding a new Formlabs resin:
```js
{n:"New Material V1", v:"Formlabs", f:"resin", p:"SLA/DLP",
 transp:"no", esd:"no", fr:"yes", fs:"no", bio:"no",
 hdt:85, ts:55, em:3.2, el:8, imp:20, cost:750, std:"UL94 V0"}
```

---

## Git / deployment
- Repository: GitHub
- Hosting: GitHub Pages (static, single file)
- Branch: main
- No build step — push `index.html` and it's live
