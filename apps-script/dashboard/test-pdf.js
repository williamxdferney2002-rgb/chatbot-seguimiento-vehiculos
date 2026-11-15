// T-019: Pdf.gs core tests (password-protected PDF unlocking). Usage: node apps-script/dashboard/test-pdf.js
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');
const L = require('./test-pdf-lib.js');

const SRC = fs.readFileSync(path.join(__dirname, 'Pdf.gs'), 'utf8');
function cargar(src) {
  const ctx = vm.createContext({ Utilities: {} });
  vm.runInContext(src, ctx, { filename: 'Pdf.gs' });
  return vm.runInContext('({ desbloquearPdf, pdfMd5, pdfRc4, pdfAesCbc, pdfLeerStr, pdfCadenaXref, pdfLeerObj, pdfStrings })', ctx);
}
const B = a => Buffer.from(a);
const hex = s => '<' + Buffer.from(s, 'latin1').toString('hex') + '>';

// Read an output PDF using the core helpers: { objects by number, object count, trailer }
function leer(G, buf) {
  const s = buf.toString('latin1'), secs = G.pdfCadenaXref(s), xr = {};
  secs.forEach(sec => Object.keys(sec.entries).forEach(n => { if (!(n in xr)) xr[n] = sec.entries[n]; }));
  const objs = {};
  Object.keys(xr).filter(n => xr[n].t === 'n').forEach(n => { const o = G.pdfLeerObj(s, xr[n].off, xr); assert.strictEqual(String(o.num), n); objs[n] = o; });
  return { objs, n: Object.keys(objs).length, trailer: secs[0].trailer, secs: secs.length };
}

const CASOS = [
  { nombre: 'R4 AESV2', o: { R: 4, aes: true } },
  { nombre: 'R4 RC4 (V2)', o: { R: 4, aes: false } },
  { nombre: 'R3 RC4 128', o: { R: 3 } },
  { nombre: 'R2 RC4 40', o: { R: 2 } },
  { nombre: 'R4 AESV2 EncryptMetadata false', o: { R: 4, aes: true, encMeta: false } },
  { nombre: 'R4 AESV2 /Length indirecto', o: { R: 4, aes: true, indirecto: true } },
  { nombre: 'R4 AESV2 incremental (/Prev)', o: { R: 4, aes: true, incremental: true } },
  { nombre: 'R3 incremental + /Length indirecto', o: { R: 3, incremental: true, indirecto: true } }
];

function bateria(G) {
  // --- primitives compared against Node crypto ---
  [0, 1, 55, 56, 63, 64, 65, 1000].forEach(n => {
    const d = crypto.randomBytes(n);
    assert.ok(B(G.pdfMd5(Array.from(d))).equals(L.md5(d)), 'md5 ' + n);
  });
  const k = crypto.randomBytes(16);
  assert.ok(B(G.pdfRc4(Array.from(k), Array.from(Buffer.from('hola mundo')))).equals(L.rc4(k, Buffer.from('hola mundo'))), 'rc4');
  [1, 15, 16, 17, 100, 4096].forEach(n => {
    const iv = crypto.randomBytes(16), pl = crypto.randomBytes(n), c = crypto.createCipheriv('aes-128-cbc', k, iv);
    const data = Buffer.concat([iv, c.update(pl), c.final()]);
    assert.ok(B(G.pdfAesCbc(Array.from(k), Array.from(data))).equals(pl), 'aes ' + n);
  });
  assert.strictEqual(G.pdfAesCbc(Array.from(k), [1, 2, 3]).length, 0); // invalid length: empty result without an exception
  // --- strings: escapes, octal, nested parentheses, line continuation, odd-length hex ---
  assert.strictEqual(B(G.pdfLeerStr('(a(b)c\\051\\n\\\nd\\101\\\\)X', 0).b).toString('latin1'), 'a(b)c)\ndA\\');
  assert.strictEqual(G.pdfLeerStr('(a(b)c\\051\\n\\\nd\\101\\\\)X', 0).fin, 22);
  assert.strictEqual(B(G.pdfLeerStr('<4a 4B7>', 0).b).toString('hex'), '4a4b70');
  assert.strictEqual(G.pdfStrings('<< /A (x)>>/B <<(y)>>', b => b.map(c => c + 1)), '<< /A <79>>>/B <<<7a>>>');

  // --- unlocking ---
  CASOS.forEach(c => {
    const buf = L.crearPdf(Object.assign({ pw: 'TRK101' }, c.o));
    const r = G.desbloquearPdf(Array.from(buf), ['XXX111', 'TRK101']);
    assert.ok(r && !r.error, c.nombre + ' ' + JSON.stringify(r && r.error));
    assert.strictEqual(r.clave, 'TRK101', c.nombre);
    const out = B(r.bytes), txt = out.toString('latin1');
    assert.ok(txt.startsWith('%PDF-1.4') && !txt.includes('/Encrypt') && txt.endsWith('%%EOF\n'), c.nombre);
    const x = leer(G, out);
    assert.strictEqual(x.n, 9, c.nombre + ' objetos'); // same object count (/Encrypt becomes null)
    assert.strictEqual(x.secs, 1, c.nombre);
    assert.ok(/\/Root 1 0 R/.test(x.trailer) && /\/Info 6 0 R/.test(x.trailer) && /\/Size 10/.test(x.trailer) && !/\/Prev|\/Encrypt/.test(x.trailer), x.trailer);
    assert.ok(x.trailer.includes('/ID [' + '<' + L.md5(Buffer.from('id-doc')).toString('hex') + '>'), c.nombre + ' ID intacto');
    const t = c.o.incremental ? L.TITULO2 : L.TITULO;
    assert.ok(x.objs[6].dict.includes('/Title ' + hex(t)) && x.objs[6].dict.includes('/Author ' + hex('Hello')), c.nombre + ' strings: ' + x.objs[6].dict);
    assert.strictEqual(x.objs[4].data, L.CONTENIDO, c.nombre + ' contenido');
    assert.ok(x.objs[8].data === L.BIN.toString('latin1'), c.nombre + ' binario');
    assert.ok(zlib.inflateSync(Buffer.from(x.objs[9].data, 'latin1')).equals(L.FLATE_PLANO), c.nombre + ' flate');
    [4, 8, 9].forEach(n => assert.ok(new RegExp('/Length ' + x.objs[n].data.length + '(?![0-9])').test(x.objs[n].dict), c.nombre + ' /Length ' + n + ': ' + x.objs[n].dict));
    assert.strictEqual(x.objs[7].dict, 'null', c.nombre);
  });
  // lowercase password, empty password (owner only), wrong password
  const bajo = L.crearPdf({ R: 4, aes: true, pw: 'trk101' });
  assert.strictEqual(G.desbloquearPdf(Array.from(bajo), ['TRK101', 'trk101']).clave, 'trk101');
  assert.strictEqual(G.desbloquearPdf(Array.from(bajo), ['TRK101']).error, 'clave');
  const vacio = L.crearPdf({ R: 4, aes: true, pw: '' });
  assert.strictEqual(G.desbloquearPdf(Array.from(vacio), ['XXX111']).clave, '');
  [2, 3, 4].forEach(R => {
    const mal = L.crearPdf({ R, aes: R === 4, pw: 'TRK101' });
    assert.deepStrictEqual(Object.assign({}, G.desbloquearPdf(Array.from(mal), ['XXX111', 'trk101'])), { error: 'clave' }, 'R' + R);
    assert.deepStrictEqual(Object.assign({}, G.desbloquearPdf(Array.from(mal), [])), { error: 'clave' });
  });
  // unencrypted, garbage, and unsupported inputs
  const plano = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\nxref\n0 1\n0000000000 65535 f \ntrailer\n<< /Size 1 /Root 1 0 R >>\nstartxref\n50\n%%EOF\n';
  assert.strictEqual(G.desbloquearPdf(Array.from(Buffer.from(plano)), ['A']), null);
  assert.strictEqual(G.desbloquearPdf(Array.from(crypto.randomBytes(500)), ['A']), null);
  assert.strictEqual(G.desbloquearPdf([], ['A']), null);
  assert.strictEqual(G.desbloquearPdf(Array.from(L.crearPdf({ R: 6, pw: 'TRK101' })), ['TRK101']).error, 'no soportado');
  const trunco = Buffer.from(L.crearPdf({ R: 4, aes: true, pw: 'TRK101' }).toString('latin1').replace('startxref', 'startxrfe'), 'latin1'); // damaged PDF
  assert.strictEqual(G.desbloquearPdf(Array.from(trunco), ['TRK101']).error, 'no soportado');
  const xs = Buffer.from(L.crearPdf({ R: 4, aes: true, pw: 'TRK101' }).toString('latin1').replace('\nxref\n', '\n3 0 obj\n'), 'latin1'); // stream-based or damaged xref
  assert.strictEqual(G.desbloquearPdf(Array.from(xs), ['TRK101']).error, 'no soportado');
}

const G0 = cargar(SRC);
bateria(G0);
console.log('OK T-019: MD5/RC4/AES contra Node crypto, strings con escapes, ' + CASOS.length + ' variantes de PDF cifrado, clave mala/vacía/minúscula, no cifrado, R6 y dañado');

// --- mutations: each change breaks the core and the suite must detect it ---
const MUT = [
  ['sal AES', "k.push(0x73, 0x41, 0x6C, 0x54)", "k.push(0x73, 0x41, 0x6C, 0x55)"],
  ['50 rondas de MD5 (R3+)', 'i < 50; i++) h = pdfMd5', 'i < 49; i++) h = pdfMd5'],
  ['strings sin descifrar', 'pdfDescifrar(par.str, key, n, g, b)', 'b'],
  ['/Length sin corregir', "const L = '/Length ' + flujo.length;", "const L = '/Length ' + o.data.length;"],
  ['/P en la clave', '(enc.P >> 8) & 255, (enc.P >> 16)', '(enc.P >> 9) & 255, (enc.P >> 16)'],
  ['EncryptMetadata false', "enc.R >= 4 && !enc.encMeta ? [255, 255, 255, 255] : []", "[]"]
];
MUT.forEach(m => {
  assert.ok(SRC.includes(m[1]), 'la mutación «' + m[0] + '» ya no encuentra su texto');
  let detectada = false;
  try { bateria(cargar(SRC.split(m[1]).join(m[2]))); } catch (e) { detectada = true; }
  assert.ok(detectada, 'mutación NO detectada: ' + m[0]);
});
console.log('OK T-019: ' + MUT.length + ' mutaciones detectadas (' + MUT.map(m => m[0]).join(', ') + ')');
