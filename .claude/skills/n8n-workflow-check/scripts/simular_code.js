#!/usr/bin/env node
// Simulate one n8n JavaScript Code node with fixtures, without running n8n.
// Usage:
//   node simular_code.js WORKFLOW.json "Node name" CASES.json [--ver]
//   node simular_code.js WORKFLOW.json "Node name" --plantilla
//
// CASES.json is an ordered array sharing $getWorkflowStaticData for duplicate tests.
// Keep original fixture keys and enum values for compatibility:
// [{
//   "nombre": "valid expense", "tipo": "valido",
//   "entrada": [{"message": {"text": "Gasté 10000 en peaje"}}],
//   "nodos": {"Config": [{"chatId": "123456789"}]},
//   "ejecucion": "1234", "ahora": "2026-10-03T10:15:00",
//   "espera": {"error": false, "cantidad": 1,
//     "salida": [{"tipo": "gasto", "monto": 10000}],
//     "contiene": ["!C5"], "no_contiene": ["undefined", "NaN"]}
// }]
// tipo values: valido, invalido, duplicado (report labels only).
// entrada contains $input JSON items; nodos supplies $('Node') output.
// ejecucion sets $execution.id (default 1000 + case index).
// ahora fixes Bogotá time for $now, DateTime.now(), and new Date().
// espera supports expected error text, count, partial output, and presence/absence checks.
// entrada/nodos may use "@file.json" relative to CASES.json.
// No Telegram, Sheets, or Gemini calls; HTTP helpers deliberately fail.
// $('Node').item uses the matching index, without full n8n pairedItem semantics.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let luxon;
try {
  luxon = require(path.join(__dirname, '..', 'node_modules', 'luxon'));
} catch (e) {
  console.error('Luxon is missing. When dependency installation is authorized, run:  npm install --prefix "' + path.join(__dirname, '..') + '"');
  process.exit(2);
}
const { DateTime, Duration, Interval, Settings } = luxon;
const ZONA = 'America/Bogota';
Settings.defaultZone = ZONA;

const args = process.argv.slice(2);
const ver = args.includes('--ver');
const plantilla = args.includes('--plantilla');
const [rutaFlujo, nombreNodo, rutaCasos] = args.filter((a) => !a.startsWith('--'));
if (!rutaFlujo || !nombreNodo || (!rutaCasos && !plantilla)) {
  console.error('Usage: node simular_code.js WORKFLOW.json "Node" CASES.json [--ver] | --plantilla');
  process.exit(2);
}

const flujo = JSON.parse(fs.readFileSync(rutaFlujo, 'utf8'));
const nodo = flujo.nodes.find((n) => n.name === nombreNodo);
if (!nodo) {
  console.error(`Node does not exist: "${nombreNodo}". Code nodes: ` +
    flujo.nodes.filter((n) => n.type === 'n8n-nodes-base.code').map((n) => n.name).join(', '));
  process.exit(2);
}
if (nodo.type !== 'n8n-nodes-base.code') {
  console.error(`"${nombreNodo}" is ${nodo.type}, not a Code node.`);
  process.exit(2);
}
const p = nodo.parameters || {};
if ((p.language || 'javaScript') !== 'javaScript') {
  console.error('Only JavaScript Code nodes can be simulated.');
  process.exit(2);
}
const codigo = p.jsCode || '';
const porItem = p.mode === 'runOnceForEachItem';
const referencias = [...new Set([...codigo.matchAll(/\$\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]))];

if (plantilla) {
  const ej = {
    nombre: 'valid case',
    tipo: 'valido',
    entrada: [{}],
    nodos: Object.fromEntries(referencias.map((r) => [r, [{}]])),
    ahora: DateTime.now().setZone(ZONA).toFormat("yyyy-MM-dd'T'HH:mm:ss"),
    espera: { error: false, cantidad: 1, salida: [{}], no_contiene: ['undefined', 'NaN'] },
  };
  const dup = { ...ej, nombre: 'same message repeated', tipo: 'duplicado' };
  const inv = { ...ej, nombre: 'empty or invalid input', tipo: 'invalido', entrada: [{}] };
  console.log(JSON.stringify([ej, inv, dup], null, 2));
  console.error(`Mode: ${porItem ? 'once per item' : 'once for all items'}. Referenced nodes: ${referencias.join(', ') || '(none)'}`);
  process.exit(0);
}

const dirCasos = path.dirname(path.resolve(rutaCasos));
const cargar = (v) => (typeof v === 'string' && v.startsWith('@')
  ? JSON.parse(fs.readFileSync(path.resolve(dirCasos, v.slice(1)), 'utf8')) : v);
const casos = JSON.parse(fs.readFileSync(rutaCasos, 'utf8'));
const estatico = { global: {}, node: {} };

const aItems = (lista) => (lista || []).map((j) => (j && j.json && Object.keys(j).every((k) => ['json', 'binary', 'pairedItem'].includes(k)) ? j : { json: j }));

function relojFijo(ms) {
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(ms); else super(...a); }
    static now() { return ms; }
  }
  return FakeDate;
}

function coincide(real, esperado) {
  if (esperado === null || typeof esperado !== 'object') return real === esperado;
  if (Array.isArray(esperado)) return Array.isArray(real) && esperado.every((e, i) => coincide(real[i], e));
  return real && typeof real === 'object' && Object.keys(esperado).every((k) => coincide(real[k], esperado[k]));
}

async function correr(caso, i) {
  const entrada = aItems(cargar(caso.entrada) || [{}]);
  const otros = Object.fromEntries(Object.entries(caso.nodos || {}).map(([k, v]) => [k, aItems(cargar(v))]));
  const faltan = referencias.filter((r) => !(r in otros));
  const ahoraDT = caso.ahora ? DateTime.fromISO(caso.ahora, { zone: ZONA }) : DateTime.now().setZone(ZONA);
  if (!ahoraDT.isValid) throw new Error(`Invalid "ahora": ${caso.ahora}`);
  const ms = ahoraDT.toMillis();
  Settings.now = () => ms;

  const logs = [];
  const nodoRef = (nombre, idx) => {
    if (!(nombre in otros)) throw new Error(`Referenced node doesn't exist or has not run: '${nombre}' (add it to "nodos")`);
    const its = otros[nombre];
    return {
      all: () => its, first: () => its[0], last: () => its[its.length - 1],
      get item() { return its[Math.min(idx, its.length - 1)]; },
      itemMatching: (k) => its[Math.min(k, its.length - 1)], isExecuted: true,
    };
  };
  const base = (idx) => ({
    $input: {
      all: () => entrada, first: () => entrada[0], last: () => entrada[entrada.length - 1],
      get item() { return entrada[idx]; },
    },
    $: (n) => nodoRef(n, idx),
    $json: entrada[idx] ? entrada[idx].json : {},
    $binary: entrada[idx] ? entrada[idx].binary || {} : {},
    $execution: { id: String(caso.ejecucion || 1000 + i), mode: 'production', resumeUrl: '' },
    $workflow: { id: flujo.id || 'sim', name: flujo.name, active: true },
    $now: ahoraDT, $today: ahoraDT.startOf('day'),
    $getWorkflowStaticData: (t) => (t === 'node' ? estatico.node : estatico.global),
    $vars: {}, $env: new Proxy({}, { get() { throw new Error('access to env vars denied'); } }),
    $jmespath: () => { throw new Error('$jmespath is not simulated'); },
    DateTime, Duration, Interval, luxon,
    Date: relojFijo(ms),
    console: { log: (...a) => logs.push(a.map(String).join(' ')), warn: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')) },
    require: (m) => { if (m === 'luxon') return luxon; throw new Error(`require('${m}') is not allowed in n8n`); },
    helpers: { prepareBinaryData: async (buf, fileName, mimeType) => ({ data: buf.toString('base64'), fileName, mimeType }), getBinaryDataBuffer:async (i, prop) => Buffer.from(entrada[i].binary[prop].data, 'base64'), httpRequest: () => { throw new Error('this.helpers.httpRequest is not executed in the simulator'); } },
  });

  const ejecutar = async (idx) => {
    const ctx = base(idx);
    if (porItem) ctx.$input.item = entrada[idx];
    const fn = vm.runInNewContext('(async function () {\n' + codigo + '\n})', { ...ctx, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Error, Promise, Set, Map, parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent, escape, unescape, Buffer }, { filename: nombreNodo, timeout: 5000 });
    return fn.call({ helpers: ctx.helpers, getWorkflowStaticData: ctx.$getWorkflowStaticData });
  };

  let salida;
  if (porItem) {
    salida = [];
    for (let k = 0; k < entrada.length; k++) {
      const r = await ejecutar(k);
      if (r !== undefined && r !== null) salida.push(r.json ? r : { json: r });
    }
  } else {
    salida = await ejecutar(0);
  }
  if (!Array.isArray(salida)) throw new Error('Code must return an item array: return [{ json: {...} }]');
  salida = salida.map((x) => (x && x.json ? x : { json: x }));
  return { salida, logs, faltan };
}

(async () => {
  let fallidos = 0;
  console.log(`Simulating "${nombreNodo}" (${porItem ? 'once per item' : 'once for all items'}) — ${casos.length} cases\n`);
  for (let i = 0; i < casos.length; i++) {
    const c = casos[i];
    const e = c.espera || {};
    const etiqueta = `${i + 1}. [${c.tipo || 'case'}] ${c.nombre || ''}`;
    const problemas = [];
    let res = null;
    let error = null;
    try { res = await correr(c, i); } catch (err) { error = err; }
    if (error) {
      if (!e.error) problemas.push('failed: ' + error.message);
      else if (typeof e.error === 'string' && !String(error.message).includes(e.error)) problemas.push(`unexpected error: ${error.message}`);
    } else {
      const jsons = res.salida.map((x) => x.json);
      const texto = JSON.stringify(jsons);
      if (e.error) problemas.push('expected an error, but execution succeeded');
      if (e.cantidad !== undefined && jsons.length !== e.cantidad) problemas.push(`returned ${jsons.length} items (expected ${e.cantidad})`);
      if (e.salida && !coincide(jsons, e.salida)) problemas.push('output does not match "espera.salida"');
      for (const t of e.contiene || []) if (!texto.includes(t)) problemas.push(`output does not contain "${t}"`);
      for (const t of e.no_contiene || []) if (texto.includes(t)) problemas.push(`output contains "${t}"`);
    }
    if (problemas.length) fallidos++;
    console.log(`${problemas.length ? '❌' : '✅'} ${etiqueta}`);
    problemas.forEach((pb) => console.log('     - ' + pb));
    if (res && res.faltan.length) console.log(`     (unsupplied nodes fail only if referenced: ${res.faltan.join(', ')})`);
    if (res && (ver || problemas.length)) {
      const s = JSON.stringify(res.salida.map((x) => x.json), null, 1);
      console.log('     output: ' + (s.length > 1500 ? s.slice(0, 1500) + ' …' : s).replace(/\n/g, '\n     '));
      if (res.logs.length) console.log('     console.log: ' + res.logs.join(' | ').slice(0, 500));
    }
  }
  console.log(`\nResult: ${casos.length - fallidos}/${casos.length} cases passed`);
  console.log('Reminder: this simulates node code; it does not test Telegram, Sheets, or Gemini inside n8n.');
  process.exit(fallidos ? 1 : 0);
})();
