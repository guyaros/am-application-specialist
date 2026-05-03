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
  AM-Materials-DB.csv     ← source of truth for materials (51 materials)
  AM-Printers-DB.csv      ← source of truth for printers (13 printers)
  CONTEXT.md              ← this file
```

---

## Databases (embedded in index.html as JS arrays)

### Materials — `MAT` array (51 materials)
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

## Agent workflow (Ashby 4-stage process)

### Stage 0 — Application type
User selects: Visual prototype / Functional prototype / Manufacturing aid / End-use part

### Stage 1 — Requirements translation
Agent asks one question at a time across these categories:
- **Functional:** optical transparency, ESD, flame retardant (UL94/FAR), fluid sealing, RF transparency, biocompatibility, autoclave sterilization
- **Mechanical:** tensile strength, elastic modulus, elongation, impact strength, Shore hardness
- **Environmental:** service temperature (HDT), chemical resistance, UV/outdoor
- **Geometry:** max part size, **smallest feature / min wall thickness**, accuracy/tolerance, surface finish (Ra)
- **Manufacturing:** quantity, cost vs performance priority, available printers

### Stage 2 — Screening
Filter out materials that fail hard constraints (functional flags, HDT, build volume).

### Stage 3 — Ranking
Score remaining materials by fit. Return top 3 with compatible printers.

### Stage 4 — Supporting information
Rationale, risks, expert note.

---

---

## Agent domain knowledge rules

These rules are injected into the Claude system prompt on every API call (`buildSystem()` in `index.html`).
To add or modify a rule, update the `=== DOMAIN KNOWLEDGE ===` section inside `buildSystem()` **and** update this file.

---

### Rule 1 — Medical / Biocompatibility → BioMed materials

**Trigger:** user mentions medical devices, surgical tools, patient contact, dental, implants, sterile environments, or biocompatibility.

**Agent behavior:**
- Prioritize Formlabs BioMed materials: BioMed Clear, BioMed White, BioMed Black, BioMed Amber, BioMed Durable, BioMed Elastic, BioMed Flex 80A
- These are certified to ISO 10993 / USP Class VI
- Require **Form 4B** or **Form 4BL** printer
- Always ask whether autoclave sterilization is needed (all BioMed materials support it)

---

### Rule 2 — High toughness / impact resistance → probe rigid vs. flexible

**Trigger:** user mentions high toughness, impact resistance, drop tests, shock loads, or durable flexible parts.

**Agent behavior:**
- Ask whether **rigid high-strength** or **flexible energy-absorbing** behavior is preferred — these lead to very different material families
- **Rigid high-toughness candidates:** Markforged Onyx, continuous fiber composites, HP PA 11, Formlabs Tough 2000, Tough 1500
- **Flexible energy-absorbing candidates:** Formlabs TPU 90A (SLS), Formlabs Flexible 80A, Formlabs Elastic 50A, Formlabs Silicone 40A, HP TPU, Markforged TPU
- If flexible is acceptable: probe elastic modulus range and Shore hardness to select the right grade

---

### Rule 3 — Smallest feature size → technology gate

**Trigger:** always — asked during the geometry step alongside max part size.

**Agent behavior:**
- Always ask for the smallest feature or minimum wall thickness in the design
- Apply this technology gate in screening:

| Smallest feature | Allowed technologies |
|---|---|
| < 0.5 mm | SLA/LFD only (Formlabs Form 4 family) |
| 0.5 – 1 mm | SLA/LFD preferred; SLS (Fuse1+) acceptable |
| 1 – 2 mm | SLA, SLS, or MJF all suitable |
| > 2 mm | Any technology; FDM/FFF (Markforged, Snapemaker) viable |

- **FDM/FFF must not be recommended when smallest feature < 1 mm**

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
- **Left sidebar:** Ashby step tracker (10 steps, completed steps 0–6 are clickable to jump back and edit), iteration badge, Export PDF button, New Run button, Settings button
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
- Light grey theme: background `#eef0f4`, surface `#ffffff`
- Font: DM Sans (body) + DM Mono (numbers/code)
- Accent colors: blue `#2563eb`, cyan `#0891b2`, green `#059669`, amber `#d97706`, red `#dc2626`
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
