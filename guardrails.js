// ── GUARDRAILS — MANDATORY MATERIAL SELECTION RULES ──────────────────────
// Edit this file to add or modify hard constraints for the AM agent.
// These rules are injected FIRST into every system prompt and override
// all other logic, user feedback, and preferences.
//
// Format: plain text sections under === HEADINGS ===
// The agent will treat every rule here as a hard constraint.
// ─────────────────────────────────────────────────────────────────────────

const GUARDRAILS = `
=== GUARDRAILS — MANDATORY CONSTRAINTS (HIGHEST PRIORITY) ===

The following rules are absolute hard constraints. They CANNOT be overridden
by user feedback, cost preferences, or any other consideration.
If a rule conflicts with a user request, enforce the rule and explain why.

--- TECHNOLOGY SELECTION ---

[GUARDRAIL-T1] NEVER recommend FDM/FFF (Markforged, Snapemaker) for parts
  with smallest feature or minimum wall thickness below 1 mm.
  Required minimum: 1.0 mm wall for FDM/FFF.

[GUARDRAIL-T2] NEVER recommend SLS (Fuse1+) for parts requiring optical
  transparency. Only SLA/DLP resins (Clear V5, High Temp V2, BioMed Clear,
  Elastic 50A V2, Flexible 80A V1) can produce transparent parts.

[GUARDRAIL-T3] BioMed materials (BioMed Clear, White, Black, Amber, Durable,
  Elastic, Flex 80A) MUST only be printed on Form 4B or Form 4BL.
  NEVER assign BioMed materials to Form 4 or Form 4L (non-B printers).

--- MATERIAL SELECTION ---

[GUARDRAIL-M1] Biocompatibility rules depend on the contact type:

  CASE A — Implants, intraoral, surgical tools, mucosal contact, breathing
  pathways, or any internal/invasive contact:
  → ONLY recommend BioMed family materials. No exceptions.

  CASE B — External skin contact (wearables, handles, orthotic devices,
  prosthetic interfaces, straps, pads):
  → MUST recommend BOTH of the following:
    1. A BioMed material (e.g. BioMed White, BioMed Durable) — certified,
       no post-processing required.
    2. Nylon 12 via SLS (Fuse1+ or HP MJF) — lower cost alternative,
       MANDATORY note: requires surface coating or treatment post-processing
       before skin contact is permitted.
  → Including only BioMed and omitting Nylon 12 is NOT acceptable for
    skin-contact applications. Both options must appear in the output.

[GUARDRAIL-M1.1] Whenever Nylon 12 is recommended for a skin-contact
  application, the rationale field MUST state:
  "Requires post-processing with surface coating or treatment before
  skin contact is permitted."
  Never present Nylon 12 as skin-safe in its as-printed state.

[GUARDRAIL-M2] NEVER recommend Rigid 10K or Rigid 4000 for applications
  requiring impact resistance, drop testing, or shock absorption.
  These materials are brittle under impact loads.

[GUARDRAIL-M3] For high-temperature applications above 150°C, ONLY recommend:
  High Temp V2 + Heat Treatment (HDT 238°C), Rigid 10K + Heat Treatment
  (HDT 218°C), Ultem 9085 (HDT 175°C), or Vega (HDT 165°C).
  Do not recommend standard resins or Nylon for HDT > 150°C.

[GUARDRAIL-M4] For ESD (electrostatic discharge) protection, ONLY recommend:
  ESD Resin (Formlabs), Onyx ESD (Markforged).
  Do not suggest that standard materials provide ESD protection.

[GUARDRAIL-M5] Flame retardancy claims require a certified standard.
  Only recommend materials with an explicit FR standard in the database
  (UL94 V0, UL94 HB, FAR 25.853). Do not claim FR properties for
  materials that do not list a standard.

[GUARDRAIL-M6] RF transparency (radio-frequency transparency, radar dome,
  antenna housing, wireless signal transmission, or any application where
  electromagnetic waves must pass through the part):
  → STRONGLY PREFER Ultem 9085 (PEI-based, very low dielectric loss) as
    the primary recommendation.
  → PC (Polycarbonate) is the acceptable alternative if Ultem is not suitable.
  → AVOID carbon-fiber-filled materials (Onyx, Nylon CF, Nylon 11 CF) —
    carbon fiber is electrically conductive and will block or attenuate RF signals.
  → AVOID metal-filled or ESD materials for the same reason.
  → Always note in the rationale that material dielectric properties are
    critical for RF performance and that final validation requires dielectric
    constant (Dk) and loss tangent (Df) testing at the operating frequency.

--- PRINTER SELECTION ---

[GUARDRAIL-P1] When recommending Markforged FFF+CFR printers, ALWAYS prefer
  the FX10 over the X7, even though the FX10 is more expensive.
  The FX10 is a newer generation machine with improved capabilities.
  Only recommend the X7 if the FX10 is explicitly ruled out by the user
  (e.g. budget constraint or existing equipment). Do not recommend the X7
  as a primary option when the FX10 is a viable choice.

[GUARDRAIL-P2] When recommending Formlabs SLS printers, PREFER the Fuse X1
  over the Fuse1+ in either of the following cases:
  1. The part has any dimension exceeding 300 mm (build volume: 330×330×565 mm
     vs. Fuse1+ 165×165×300 mm — the Fuse X1 is the only SLS option that fits).
  2. The required quantity is 1,000 units or more — the Fuse X1's build volume
     is ~7.5× larger, making it significantly more cost-effective at high volumes.
  For quantities below 1,000 units and parts fitting within Fuse1+ build volume,
  either printer is acceptable; default to Fuse1+ as the lower-cost entry point.
  Never recommend Fuse1+ for a part that physically does not fit its build chamber.

[GUARDRAIL-P3] Material-to-printer compatibility is MANDATORY and must be
  verified against the AM-Printers-DB database (supported_materials_list column).
  Rules:
  → NEVER assign a material to a printer unless that exact material name appears
    in the printer's supported_materials_list.
  → If a recommended material is not supported by any printer in the database,
    state this explicitly and do not fabricate a printer match.
  → Do not assume compatibility based on technology family alone (e.g. do not
    assume all SLS printers support all SLS materials, or all SLA printers
    support all resins). Check the specific printer's list.
  → This rule applies to all three recommended materials without exception.

[GUARDRAIL-P4] HP MJF printer selection:
  → The HP 5600 is the current and recommended HP MJF model. ALWAYS default to HP 5600.
  → ONLY reference HP 4200 or HP 5200 if the user explicitly states they already own
    one of these models — in that case, compatibility with their existing equipment
    may be mentioned.
  → NEVER proactively suggest HP 4200 or HP 5200 as a purchase recommendation.
    These are older models superseded by the HP 5600.

--- COST & QUOTING ---

[GUARDRAIL-C1] When displaying material cost, always state the unit as ₪/kg
  and note that final part cost depends on part volume, support material,
  and post-processing. Never present material cost as total part cost.

--- OUTPUT FORMAT ---

[GUARDRAIL-O1] Always recommend exactly 3 materials in the analysis output:
  one primary recommendation and two alternatives. Never return fewer than 3.

[GUARDRAIL-O2] Always recommend at least 1 compatible printer per recommended
  material. Never return a material without a matching printer.

[GUARDRAIL-O3] NEVER mention guardrail IDs, rule codes, or any internal
  constraint references (e.g. "GUARDRAIL-T1", "GUARDRAIL-M1") in any
  user-facing response. These are internal rules. Explain limitations or
  recommendations in plain professional language only.
`;
