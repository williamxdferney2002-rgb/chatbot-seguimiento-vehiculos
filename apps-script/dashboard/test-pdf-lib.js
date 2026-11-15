// T-019: Pdf.gs test helpers. SYNTHETIC PDF encryption (R2/R3 RC4, R4 AESV2, simulated R6), using Node MD5/AES
// and an independent RC4 implementation. This helper is not part of the bot.
const crypto = require('crypto');
const zlib = require('zlib');

const PAD = Buffer.from('28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A', 'hex');
const md5 = b => crypto.createHash('md5').update(b).digest();
function rc4(key, data) {
  const s = Array.from({ length: 256 }, (_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i++) { j = (j + s[i] + key[i % key.length]) & 255; [s[i], s[j]] = [s[j], s[i]]; }
  const out = Buffer.alloc(data.length);
  let a = 0, b = 0;
  for (let k = 0; k < data.length; k++) { a = (a + 1) & 255; b = (b + s[a]) & 255; [s[a], s[b]] = [s[b], s[a]]; out[k] = data[k] ^ s[(s[a] + s[b]) & 255]; }
  return out;
}
const le = (n, bytes) => Buffer.from(Array.from({ length: bytes }, (_, i) => (n >> (8 * i)) & 255));

// Known content that the tests must recover.
const TITULO = 'Pol(iza) \\ SOAT (anidado) \r fin';
const TITULO2 = 'Segunda version (incremental)';
const CONTENIDO = 'BT /F1 12 Tf (Hola SOAT TRK101) Tj ET';
const BINARIO = crypto.createHash('sha512').update('semilla').digest(); // 64 fixed bytes
const BIN = Buffer.concat(Array.from({ length: 50 }, (_, i) => md5(Buffer.from('b' + i)))); // 800 bytes with a random-looking distribution
const FLATE_PLANO = Buffer.from('texto comprimido '.repeat(200));

// o: { R: 2|3|4|6, aes, pw (user password), encMeta (R4), indirecto (indirect Length), incremental }
function crearPdf(o) {
  const R = o.R, n = R === 2 ? 5 : 16, aes = !!o.aes, pw = Buffer.from(o.pw === undefined ? '' : o.pw, 'latin1');
  const encMeta = o.encMeta !== false, P = -1852, O = md5(Buffer.from('owner')).subarray(0, 16);
  const O32 = Buffer.concat([O, O]), id = md5(Buffer.from('id-doc')), pad = Buffer.concat([pw.subarray(0, 32), PAD]).subarray(0, 32);
  let h = md5(Buffer.concat([pad, O32, le(P, 4), id, R >= 4 && !encMeta ? Buffer.alloc(4, 255) : Buffer.alloc(0)]));
  if (R >= 3) for (let i = 0; i < 50; i++) h = md5(h.subarray(0, n));
  const key = h.subarray(0, n);
  let U;
  if (R === 2) U = rc4(key, PAD);
  else {
    let x = rc4(key, md5(Buffer.concat([PAD, id])));
    for (let i = 1; i <= 19; i++) x = rc4(Buffer.from(key.map(b => b ^ i)), x);
    U = Buffer.concat([x, Buffer.alloc(16, 7)]);
  }
  const cif = (num, gen, data) => {
    const k = md5(Buffer.concat([key, le(num, 3), le(gen, 2), aes ? Buffer.from('sAlT') : Buffer.alloc(0)])).subarray(0, Math.min(n + 5, 16));
    if (!aes) return rc4(k, data);
    const iv = md5(Buffer.concat([Buffer.from('iv'), le(num, 3), data])); // distinct IV for each object
    const c = crypto.createCipheriv('aes-128-cbc', k, iv);
    return Buffer.concat([iv, c.update(data), c.final()]);
  };
  const lit = b => { let s = '('; for (const x of b) s += x === 40 ? '\\(' : x === 41 ? '\\)' : x === 92 ? '\\\\' : x === 13 ? '\\r' : String.fromCharCode(x); return s + ')'; };
  const hex = b => '<' + b.toString('hex') + '>';

  const cuerpoEnc = R === 6
    ? '<< /Filter /Standard /V 5 /R 6 /Length 256 /O ' + hex(Buffer.alloc(48, 1)) + ' /U ' + hex(Buffer.alloc(48, 2)) + ' /P -1852 /CF << /StdCF << /CFM /AESV3 /Length 32 >> >> /StmF /StdCF /StrF /StdCF >>'
    : R === 4
      ? '<< /Filter /Standard /V 4 /R 4 /Length 128 /CF << /StdCF << /AuthEvent /DocOpen /CFM /' + (aes ? 'AESV2' : 'V2') + ' /Length 16 >> >> /StmF /StdCF /StrF /StdCF /O ' + hex(O32) + ' /U ' + hex(U) + ' /P -1852' + (encMeta ? '' : ' /EncryptMetadata false') + ' >>'
      : '<< /Filter /Standard /V ' + (R === 2 ? 1 : 2) + ' /R ' + R + (R === 3 ? ' /Length 128' : '') + ' /O ' + hex(O32) + ' /U ' + hex(U) + ' /P -1852 >>';
  const flate = zlib.deflateSync(FLATE_PLANO);
  const info = (num, titulo) => '<< /Title ' + lit(cif(num, 0, Buffer.from(titulo, 'latin1'))) + ' /Author ' + hex(cif(num, 0, Buffer.from('Hello'))) + ' >>';
  const stream = (num, extra, data) => { const c = cif(num, 0, data); return { dict: extra, len: c.length, data: c.toString('latin1') }; };

  const cont = stream(4, '', Buffer.from(CONTENIDO)), bin = stream(8, '', BIN), fl = stream(9, '/Filter /FlateDecode', flate);
  const objs = {
    1: '<< /Type /Catalog /Pages 2 0 R >>',
    2: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    3: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>',
    4: cont, 5: String(cont.len), 6: info(6, TITULO), 7: cuerpoEnc, 8: bin, 9: fl };
  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offs = {};
  const emit = (num, o2) => {
    offs[num] = out.length;
    const body = typeof o2 === 'string' ? o2
      : '<< ' + (o.indirecto && num === 4 ? '/Length 5 0 R' : '/Length ' + o2.len) + (o2.dict ? ' ' + o2.dict : '') + ' >>\nstream\n' + o2.data + '\nendstream';
    out += num + ' 0 obj\n' + body + '\nendobj\n';
  };
  [1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(k => emit(k, objs[k]));
  const idTxt = '[' + hex(id) + hex(id) + ']';
  const entry = (off, g, t) => String(off).padStart(10, '0') + ' ' + String(g).padStart(5, '0') + ' ' + t + ' \n';
  const x1 = out.length;
  out += 'xref\n0 10\n' + entry(0, 65535, 'f') + [1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => entry(offs[k], 0, 'n')).join('') +
    'trailer\n<< /Size 10 /Root 1 0 R /Info 6 0 R /Encrypt 7 0 R /ID ' + idTxt + ' >>\nstartxref\n' + x1 + '\n%%EOF\n';
  if (o.incremental) { // incremental update: replace Info (object 6) and add /Prev
    const o6 = out.length;
    out += '6 0 obj\n' + info(6, TITULO2) + '\nendobj\n';
    const x2 = out.length;
    out += 'xref\n6 1\n' + entry(o6, 0, 'n') + 'trailer\n<< /Size 10 /Root 1 0 R /Info 6 0 R /Encrypt 7 0 R /ID ' + idTxt + ' /Prev ' + x1 + ' >>\nstartxref\n' + x2 + '\n%%EOF\n';
  }
  return Buffer.from(out, 'latin1');
}

module.exports = { crearPdf, TITULO, TITULO2, CONTENIDO, BIN, FLATE_PLANO, md5, rc4 };
