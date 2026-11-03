#!/usr/bin/env node
'use strict';
/*
 * Detects drift between the CSV source-of-truth files (AM-Materials-DB.csv,
 * AM-Printers-DB.csv) and the MAT/PRN arrays embedded in index.html (the
 * data the agent actually sees at runtime).
 *
 * Usage:
 *   node tools/check-sync.js          — report problems, exit 1 if any are fatal
 *   node tools/check-sync.js --fix    — also insert AUTO-ADDED entries for
 *                                       anything missing from MAT/PRN, then
 *                                       re-check (still review before shipping)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HTML_PATH = path.join(ROOT, 'index.html');
const MATERIALS_CSV = path.join(ROOT, 'AM-Materials-DB.csv');
const PRINTERS_CSV = path.join(ROOT, 'AM-Printers-DB.csv');

// ── CSV parsing (RFC4180-ish: quoted fields, embedded commas/newlines/"") ──
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* skip */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function loadCSV(filePath) {
  // read as latin1: byte-preserving for legacy (Windows-1252-ish) files,
  // and ± lands on the same codepoint in both latin1 and cp1252.
  const text = fs.readFileSync(filePath, 'latin1');
  const all = parseCSV(text);
  const header = all[0];
  const rows = all.slice(1).filter(r => (r[0] || '').trim() !== '');
  const col = name => {
    const idx = header.indexOf(name);
    if (idx === -1) throw new Error(`Column "${name}" not found in ${path.basename(filePath)}`);
    return idx;
  };
  return { header, rows, col };
}

// ── Extract the MAT / PRN array literals out of index.html ──
function extractArrayBlock(html, varName) {
  const marker = `const ${varName} = [`;
  const start = html.indexOf(marker);
  if (start === -1) throw new Error(`"const ${varName} = [" not found in index.html`);
  const open = start + marker.length - 1; // index of '['
  let depth = 0, inStr = false, strCh = '', i = open;
  for (; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === strCh) inStr = false;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = true; strCh = c; continue; }
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) break; }
  }
  return { openIdx: open, closeIdx: i, text: html.slice(open, i + 1) };
}

function extractNames(blockText) {
  const names = new Set();
  const re = /\{\s*n:"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(blockText))) names.add(m[1]);
  return names;
}

function extractMlLists(blockText) {
  const lists = [];
  const re = /ml:"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(blockText))) lists.push(m[1].split(';').map(s => s.trim()).filter(Boolean));
  return lists;
}

// ── helpers ──
const yesNo = v => (String(v || '').trim().toLowerCase() === 'yes' ? 'yes' : 'no');

function numOrZ(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (s === '') return undefined;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  let m = s.match(/Z:?\s*(-?\d+(\.\d+)?)/i);       // "Z:43" / "Z6"
  if (m) return Number(m[1]);
  m = s.match(/(-?\d+(\.\d+)?)\s*Z\b/i);            // "15Z"
  if (m) return Number(m[1]);
  return s; // unrecognized compound shape — kept as a string, flagged for review
}

function jsVal(v) {
  return typeof v === 'number' ? String(v) : JSON.stringify(v);
}

// ── auto-add entry builders ──
function buildMaterialEntry(row, col) {
  const get = n => (row[col(n)] ?? '').trim();
  const name = get('material_name');
  const transp = yesNo(get('supports_light_transparency'));
  const esd = yesNo(get('supports_esd'));
  const fr = yesNo(get('supports_flame_retardant'));
  const bio = yesNo(get('supports_biocompatibility'));
  const hdt = numOrZ(get('Heat_Defletion_Temperture_hdt_c'));
  const ts = numOrZ(get('tensile_strength_mpa'));
  const em = numOrZ(get('elastic_modulus_gpa'));
  const el = numOrZ(get('elongation_at_break_pct_min'));
  const imp = numOrZ(get('impact_strength__notched_j_per_m'));
  const costRaw = get('material_cost_ILS_kg');
  const flameStd = get('flame_standard');
  const std = (fr === 'yes' && flameStd && !/^no$/i.test(flameStd)) ? flameStd : undefined;
  const gnRaw = get('general_notes').replace(/\s*\n\s*/g, ' ').trim();
  const link = get('Shop_Link');

  const fields = [
    `n:${JSON.stringify(name)}`, `v:${JSON.stringify(get('vendor'))}`,
    `f:${JSON.stringify(get('material_family'))}`, `p:${JSON.stringify(get('process_family'))}`,
    `transp:${JSON.stringify(transp)}`, `esd:${JSON.stringify(esd)}`,
    `fr:${JSON.stringify(fr)}`, `bio:${JSON.stringify(bio)}`,
  ];
  if (hdt !== undefined) fields.push(`hdt:${jsVal(hdt)}`);
  if (ts !== undefined) fields.push(`ts:${jsVal(ts)}`);
  if (em !== undefined) fields.push(`em:${jsVal(em)}`);
  if (el !== undefined) fields.push(`el:${jsVal(el)}`);
  if (imp !== undefined) fields.push(`imp:${jsVal(imp)}`);
  fields.push(`cost:${costRaw === '' ? 'null' : Number(costRaw)}`);
  if (std) fields.push(`std:${JSON.stringify(std)}`);
  if (gnRaw) fields.push(`gn:${JSON.stringify(gnRaw)}`);
  if (link) fields.push(`link:${JSON.stringify(link)}`);
  return `  {${fields.join(',')}}, // AUTO-ADDED by tools/check-sync.js — review fs/std/gn, and "fs" (fluid seal) has no CSV column, before shipping`;
}

function buildPrinterEntry(row, col) {
  const get = n => (row[col(n)] ?? '').trim();
  const fullName = get('printer_name');
  const mfr = get('manufacturer');
  const n = fullName.startsWith(mfr + ' ') ? fullName.slice(mfr.length + 1) : fullName;
  const bx = Number(get('build_x_mm')) || undefined;
  const by = Number(get('build_y_mm')) || undefined;
  const bz = Number(get('build_z_mm')) || undefined;
  const res = Number(get('resolution_xy_um_raw')) || undefined;
  const acc = get('accuracy_lt100_raw');

  const fields = [`n:${JSON.stringify(n)}`, `mfr:${JSON.stringify(mfr)}`, `tech:${JSON.stringify(get('technology'))}`];
  if (bx) fields.push(`bx:${bx}`);
  if (by) fields.push(`by:${by}`);
  if (bz) fields.push(`bz:${bz}`);
  if (res) fields.push(`res:${res}`);
  if (acc) fields.push(`acc:${JSON.stringify(acc)}`);
  fields.push(
    `esd:${JSON.stringify(yesNo(get('supports_esd')))}`,
    `fr:${JSON.stringify(yesNo(get('supports_flame_retardant')))}`,
    `bio:${JSON.stringify(yesNo(get('supports_biocompatible')))}`,
    `opt:${JSON.stringify(yesNo(get('supports_optically_clear')))}`
  );
  return `  {${fields.join(',')},\n   ml:${JSON.stringify(get('supported_materials_list'))}}, // AUTO-ADDED by tools/check-sync.js — review "tech" string before shipping`;
}

// ── printer name matching: CSV keeps the manufacturer prefix, PRN sometimes drops it ──
function printerAliases(fullName, mfr) {
  const aliases = new Set([fullName]);
  if (fullName.startsWith(mfr + ' ')) aliases.add(fullName.slice(mfr.length + 1));
  return aliases;
}

// ── material name matching: MAT sometimes appends "(vendor)" to disambiguate
// same-named materials from different vendors (e.g. CSV "TPU" → three different
// vendors, MAT "TPU 90A" / "TPU (HP)" / "TPU (Markforged)"). A handful of names
// diverge beyond that simple pattern (marketing text dropped, etc.) — those are
// listed explicitly below rather than guessed.
const MATERIAL_NAME_OVERRIDES = {
  'Nylon 12 by Evonik|HP': 'Nylon 12 (HP)',
  'TPU|Formlabs': 'TPU 90A',
};
function materialAliases(name, vendor) {
  const aliases = new Set([name, `${name} (${vendor})`]);
  const override = MATERIAL_NAME_OVERRIDES[`${name}|${vendor}`];
  if (override) aliases.add(override);
  return aliases;
}

// ── value drift: fields MAT copies from the materials CSV ──
// Numeric fields go through numOrZ, so an anisotropic "25XY,15Z" compares as its
// Z value — the convention MAT already uses.
const VALUE_FIELDS = [
  ['cost', 'material_cost_ILS_kg'], ['link', 'Shop_Link'],
  ['hdt', 'Heat_Defletion_Temperture_hdt_c'], ['ts', 'tensile_strength_mpa'],
  ['em', 'elastic_modulus_gpa'], ['el', 'elongation_at_break_pct_min'],
  ['imp', 'impact_strength__notched_j_per_m'],
];

function csvFieldValue(key, raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (s === '') return undefined;
  return key === 'link' ? s : numOrZ(s);
}

function findObjectEnd(text, start) {
  let depth = 0, inStr = false, strCh = '';
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === strCh) inStr = false;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = true; strCh = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

// Printer fields PRN copies from the printers CSV. Not acc (formatting differs)
// or ml (PRN's list is the curated, exact-name version of the CSV's loose list).
const PRINTER_VALUE_FIELDS = [
  ['bx', 'build_x_mm'], ['by', 'build_y_mm'], ['bz', 'build_z_mm'], ['res', 'resolution_xy_um_raw'],
  ['esd', 'supports_esd'], ['fr', 'supports_flame_retardant'],
  ['bio', 'supports_biocompatible'], ['opt', 'supports_optically_clear'],
  ['rn', 'Surface_Roughness_No_Post_Process_ISO_N_Grade'], ['ra', 'Surface_Roughness_No_Post_Process_um'],
];
const PRINTER_NUMERIC = new Set(['bx', 'by', 'bz', 'res']);
const PRINTER_FLAGS = new Set(['esd', 'fr', 'bio', 'opt']); // yes/no, compared case-insensitively

// Sets (or adds) one field on the MAT/PRN entry named `name`, leaving the rest of the entry untouched.
function setEntryField(html, varName, name, key, value) {
  const block = extractArrayBlock(html, varName);
  const start = block.text.indexOf(`{n:${JSON.stringify(name)},`);
  if (start === -1) return html;
  const obj = block.text.slice(start, findObjectEnd(block.text, start) + 1);
  const re = new RegExp(`([,{])${key}:(null|-?\\d+(?:\\.\\d+)?|"(?:[^"\\\\]|\\\\.)*")`);
  const v = jsVal(value);
  const newObj = re.test(obj) ? obj.replace(re, (_, sep) => `${sep}${key}:${v}`) : `${obj.slice(0, -1)},${key}:${v}}`;
  const absStart = block.openIdx + start;
  return html.slice(0, absStart) + newObj + html.slice(absStart + obj.length);
}

// ── main ──
function main() {
  const fix = process.argv.includes('--fix');
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const matBlock = extractArrayBlock(html, 'MAT');
  const prnBlock = extractArrayBlock(html, 'PRN');
  const matNames = extractNames(matBlock.text);
  const prnNames = extractNames(prnBlock.text);

  const materials = loadCSV(MATERIALS_CSV);
  const printers = loadCSV(PRINTERS_CSV);

  const problems = []; // {level:'fatal'|'warn', msg}

  // 1. materials present in CSV but missing from MAT (allowing for the "(vendor)"
  // disambiguation suffix MAT sometimes adds — see materialAliases)
  const materialAliasMap = new Map(); // alias -> csv row
  const missingMaterialRows = [];
  materials.rows.forEach(r => {
    const name = r[materials.col('material_name')].trim();
    const vendor = r[materials.col('vendor')].trim();
    const aliases = materialAliases(name, vendor);
    aliases.forEach(a => materialAliasMap.set(a, r));
    const matched = [...aliases].some(a => matNames.has(a));
    if (!matched) missingMaterialRows.push(r);
  });
  missingMaterialRows.forEach(r =>
    problems.push({ level: 'fatal', msg: `MISSING_MATERIAL: "${r[materials.col('material_name')].trim()}" is in AM-Materials-DB.csv but not in index.html's MAT array` }));

  // 2. MAT entries with no matching CSV row (rename/removal drift)
  matNames.forEach(n => { if (!materialAliasMap.has(n)) problems.push({ level: 'warn', msg: `ORPHAN_MATERIAL: MAT has "${n}" which is not in AM-Materials-DB.csv` }); });

  // 3. printers present in CSV but missing from PRN (by alias)
  const printerAliasMap = new Map(); // alias -> csv row
  const missingPrinterRows = [];
  printers.rows.forEach(r => {
    const fullName = r[printers.col('printer_name')].trim();
    const mfr = r[printers.col('manufacturer')].trim();
    const aliases = printerAliases(fullName, mfr);
    aliases.forEach(a => printerAliasMap.set(a, r));
    const matched = [...aliases].some(a => prnNames.has(a));
    if (!matched) missingPrinterRows.push(r);
  });
  missingPrinterRows.forEach(r =>
    problems.push({ level: 'fatal', msg: `MISSING_PRINTER: "${r[printers.col('printer_name')].trim()}" is in AM-Printers-DB.csv but not in index.html's PRN array` }));

  // 4. PRN entries with no matching CSV row
  prnNames.forEach(n => { if (!printerAliasMap.has(n)) problems.push({ level: 'warn', msg: `ORPHAN_PRINTER: PRN has "${n}" which is not in AM-Printers-DB.csv` }); });

  // 5. every PRN.ml reference must exist as a real MAT material name (exact match — GUARDRAIL-P3 relies on this)
  extractMlLists(prnBlock.text).flat().forEach(ref => {
    if (!matNames.has(ref)) problems.push({ level: 'fatal', msg: `BROKEN_ML_REF: PRN references material "${ref}" which does not exist in MAT (typo or wrong delimiter?)` });
  });

  // 6. every material's compatible_printers reference should resolve to a real printer.
  // Warning only: this CSV column is documentation (historical/discontinued printer
  // compatibility) and is never loaded into MAT/PRN, so it can't break the live agent —
  // unlike PRN.ml above, which IS loaded and IS what GUARDRAIL-P3 matches against.
  materials.rows.forEach(r => {
    const name = r[materials.col('material_name')].trim();
    const compat = r[materials.col('compatible_printers')].split(';').map(s => s.trim()).filter(Boolean);
    compat.forEach(ref => {
      if (!printerAliasMap.has(ref)) problems.push({ level: 'warn', msg: `BROKEN_COMPAT_REF: material "${name}" lists printer "${ref}" which does not match any printer in AM-Printers-DB.csv (typo, wrong delimiter, or a discontinued printer never added there?)` });
    });
  });

  // 7. values MAT copies from the CSV (price, shop link, mechanical properties) must match it
  const matData = new Function(`return ${matBlock.text}`)();
  const valueFixes = [];
  materials.rows.forEach(r => {
    const name = r[materials.col('material_name')].trim();
    const vendor = r[materials.col('vendor')].trim();
    const aliases = materialAliases(name, vendor);
    const db = matData.find(x => aliases.has(x.n) && x.v === vendor) || matData.find(x => aliases.has(x.n));
    if (!db) return;
    VALUE_FIELDS.forEach(([key, column]) => {
      const csvVal = csvFieldValue(key, r[materials.col(column)]);
      const matVal = db[key] == null || db[key] === '' ? undefined : db[key];
      if (csvVal === undefined) {
        if (matVal !== undefined) problems.push({ level: 'warn', msg: `VALUE_ONLY_IN_MAT: "${db.n}" ${key}=${JSON.stringify(matVal)} in MAT but empty in AM-Materials-DB.csv (kept as is)` });
        return;
      }
      if (String(csvVal) !== String(matVal)) {
        problems.push({ level: 'fatal', msg: `VALUE_DRIFT: "${db.n}" ${key} is ${JSON.stringify(csvVal)} in AM-Materials-DB.csv but ${matVal === undefined ? 'missing' : JSON.stringify(matVal)} in MAT` });
        valueFixes.push({ varName: 'MAT', name: db.n, key, value: csvVal });
      }
    });
  });

  // 8. printer dimensions/resolution and capability flags must match the printers CSV
  const prnData = new Function(`return ${prnBlock.text}`)();
  printers.rows.forEach(r => {
    const fullName = r[printers.col('printer_name')].trim();
    const mfr = r[printers.col('manufacturer')].trim();
    const db = prnData.find(x => printerAliases(fullName, mfr).has(x.n));
    if (!db) return;
    PRINTER_VALUE_FIELDS.forEach(([key, column]) => {
      const raw = r[printers.col(column)].trim();
      if (raw === '') return;
      const csvVal = PRINTER_NUMERIC.has(key) ? Number(raw) : PRINTER_FLAGS.has(key) ? raw.toLowerCase() : raw;
      const prnVal = PRINTER_NUMERIC.has(key) ? db[key] : PRINTER_FLAGS.has(key) ? String(db[key] ?? '').toLowerCase() : (db[key] ?? '');
      if (String(csvVal) !== String(prnVal)) {
        problems.push({ level: 'fatal', msg: `VALUE_DRIFT: printer "${db.n}" ${key} is ${JSON.stringify(csvVal)} in AM-Printers-DB.csv but ${JSON.stringify(db[key])} in PRN` });
        valueFixes.push({ varName: 'PRN', name: db.n, key, value: csvVal });
      }
    });
  });

  // ── report ──
  const fatals = problems.filter(p => p.level === 'fatal');
  const warns = problems.filter(p => p.level === 'warn');
  if (!problems.length) console.log('✓ MAT/PRN arrays in index.html are in sync with the CSVs.');
  else {
    if (fatals.length) { console.log(`✗ ${fatals.length} problem(s) that break the agent's data:`); fatals.forEach(p => console.log('  ' + p.msg)); }
    if (warns.length) { console.log(`! ${warns.length} warning(s):`); warns.forEach(p => console.log('  ' + p.msg)); }
  }

  if (fix && (missingMaterialRows.length || missingPrinterRows.length || valueFixes.length)) {
    let newHtml = html;
    valueFixes.forEach(f => { newHtml = setEntryField(newHtml, f.varName, f.name, f.key, f.value); });
    if (missingPrinterRows.length) {
      const b = extractArrayBlock(newHtml, 'PRN');
      const insertion = missingPrinterRows.map(r => buildPrinterEntry(r, printers.col)).join('\n') + '\n';
      newHtml = newHtml.slice(0, b.closeIdx) + insertion + newHtml.slice(b.closeIdx);
    }
    if (missingMaterialRows.length) {
      const b = extractArrayBlock(newHtml, 'MAT');
      const insertion = missingMaterialRows.map(r => buildMaterialEntry(r, materials.col)).join('\n') + '\n';
      newHtml = newHtml.slice(0, b.closeIdx) + insertion + newHtml.slice(b.closeIdx);
    }
    fs.writeFileSync(HTML_PATH, newHtml, 'utf8');
    console.log(`\n→ Updated ${valueFixes.length} value(s) from the CSV; inserted ${missingMaterialRows.length} material(s) and ${missingPrinterRows.length} printer(s), marked AUTO-ADDED. Review the diff, then run this check again.`);
    process.exit(0);
  }

  process.exit(fatals.length ? 1 : 0);
}

main();
