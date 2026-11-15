// T-019: unlock document PDFs using plate as user password.
// PURE JS MD5/RC4/AES-128-CBC; Apps Script lacks suitable byte-output primitives.
// Standard R2/R3/R4 RC4/AESV2 supported; AES-256 R5/R6, xref streams and /ObjStm unsupported.
// Limitation: per-stream Crypt filters and hybrid /Prev chains unsupported; extend when needed.
// Bytes integer arrays0..255; adapter converts Utilities signed bytes.

const PDF_PAD = [0x28, 0xBF, 0x4E, 0x5E, 0x4E, 0x75, 0x8A, 0x41, 0x64, 0x00, 0x4E, 0x56, 0xFF, 0xFA, 0x01, 0x08,
  0x2E, 0x2E, 0x00, 0xB6, 0xD0, 0x68, 0x3E, 0x80, 0x2F, 0x0C, 0xA9, 0xFE, 0x64, 0x53, 0x69, 0x7A];
const PDF_NOSOP = 'no soportado';

// ---------- bytes/binary text ----------
function pdfBs(arr) { // latin1: one character per byte.
  const out = [];
  for (let i = 0; i < arr.length; i += 8192) out.push(String.fromCharCode.apply(null, Array.prototype.slice.call(arr, i, i + 8192)));
  return out.join('');
}
function pdfBa(s) {
  const a = new Array(s.length);
  for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 255;
  return a;
}
function pdfHex(arr) {
  let h = '<';
  for (let i = 0; i < arr.length; i++) h += (arr[i] < 16 ? '0' : '') + arr[i].toString(16);
  return h + '>';
}
function pdfIgual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ---------- MD5 ----------
function pdfMd5(msg) {
  const K = [], S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
  for (let i = 0; i < 64; i++) K.push(Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296));
  const m = Array.prototype.slice.call(msg), n = m.length;
  m.push(0x80);
  while (m.length % 64 !== 56) m.push(0);
  const bits = n * 8, lo = bits >>> 0, hi = Math.floor(bits / 4294967296);
  for (let j = 0; j < 4; j++) m.push((lo >>> (8 * j)) & 255);
  for (let j = 0; j < 4; j++) m.push((hi >>> (8 * j)) & 255);
  let a0 = 0x67452301, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476;
  for (let o = 0; o < m.length; o += 64) {
    const M = [];
    for (let i = 0; i < 16; i++) M.push(m[o + 4 * i] | (m[o + 4 * i + 1] << 8) | (m[o + 4 * i + 2] << 16) | (m[o + 4 * i + 3] << 24));
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i] + M[g]) | 0;
      A = D; D = C; C = B;
      B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) | 0;
    }
    a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
  }
  const r = [];
  [a0, b0, c0, d0].forEach(function (w) { for (let j = 0; j < 4; j++) r.push((w >>> (8 * j)) & 255); });
  return r;
}

// ---------- RC4 ----------
function pdfRc4(key, data) {
  const s = [];
  for (let i = 0; i < 256; i++) s.push(i);
  let j = 0, t;
  for (let i = 0; i < 256; i++) { j = (j + s[i] + key[i % key.length]) & 255; t = s[i]; s[i] = s[j]; s[j] = t; }
  const out = new Array(data.length);
  let a = 0, b = 0;
  for (let k = 0; k < data.length; k++) {
    a = (a + 1) & 255; b = (b + s[a]) & 255;
    t = s[a]; s[a] = s[b]; s[b] = t;
    out[k] = data[k] ^ s[(s[a] + s[b]) & 255];
  }
  return out;
}

// ---------- AES-128 CBC decryption ----------
let PDF_AES = null;
function pdfAesTablas() { // Build Rijndael S-box once.
  if (PDF_AES) return PDF_AES;
  const sb = [], isb = [];
  const rot = function (x, s) { return ((x << s) | (x >> (8 - s))) & 255; };
  let p = 1, q = 1;
  do {
    p = (p ^ (p << 1) ^ (p & 0x80 ? 0x11B : 0)) & 255;
    q = (q ^ (q << 1)) & 255; q = (q ^ (q << 2)) & 255; q = (q ^ (q << 4)) & 255;
    if (q & 0x80) q ^= 0x09;
    sb[p] = (q ^ rot(q, 1) ^ rot(q, 2) ^ rot(q, 3) ^ rot(q, 4) ^ 0x63) & 255;
  } while (p !== 1);
  sb[0] = 0x63;
  for (let i = 0; i < 256; i++) isb[sb[i]] = i;
  const mul = function (a, b) {
    let r = 0;
    while (b) { if (b & 1) r ^= a; a = ((a << 1) ^ (a & 0x80 ? 0x11B : 0)) & 255; b >>= 1; }
    return r;
  };
  const m9 = [], m11 = [], m13 = [], m14 = [];
  for (let i = 0; i < 256; i++) { m9.push(mul(i, 9)); m11.push(mul(i, 11)); m13.push(mul(i, 13)); m14.push(mul(i, 14)); }
  PDF_AES = { sb: sb, isb: isb, m9: m9, m11: m11, m13: m13, m14: m14 };
  return PDF_AES;
}
function pdfAesClaves(key) { // Eleven 16-byte round keys.
  const T = pdfAesTablas(), w = Array.prototype.slice.call(key, 0, 16);
  let rcon = 1;
  for (let i = 16; i < 176; i += 4) {
    let t = [w[i - 4], w[i - 3], w[i - 2], w[i - 1]];
    if (i % 16 === 0) { t = [T.sb[t[1]] ^ rcon, T.sb[t[2]], T.sb[t[3]], T.sb[t[0]]]; rcon = ((rcon << 1) ^ (rcon & 0x80 ? 0x11B : 0)) & 255; }
    for (let j = 0; j < 4; j++) w[i + j] = w[i - 16 + j] ^ t[j];
  }
  return w;
}
// IV16+blocks, PKCS#5 padding; invalid length returns[].
function pdfAesCbc(key, data) {
  if (data.length < 32 || data.length % 16 !== 0) return [];
  const T = pdfAesTablas(), rk = pdfAesClaves(key), out = [];
  const st = new Array(16), tmp = new Array(16);
  for (let o = 16; o < data.length; o += 16) {
    for (let i = 0; i < 16; i++) st[i] = data[o + i] ^ rk[160 + i];
    for (let r = 9; r >= 0; r--) {
      for (let c = 0; c < 4; c++) for (let rw = 0; rw < 4; rw++) tmp[rw + 4 * ((c + rw) % 4)] = st[rw + 4 * c]; // InvShiftRows.
      for (let i = 0; i < 16; i++) st[i] = T.isb[tmp[i]] ^ rk[16 * r + i];                                      // InvSubBytes+AddRoundKey.
      if (r > 0) {
        for (let c = 0; c < 4; c++) { // InvMixColumns.
          const a = st[4 * c], b = st[4 * c + 1], d = st[4 * c + 2], e = st[4 * c + 3];
          st[4 * c] = T.m14[a] ^ T.m11[b] ^ T.m13[d] ^ T.m9[e];
          st[4 * c + 1] = T.m9[a] ^ T.m14[b] ^ T.m11[d] ^ T.m13[e];
          st[4 * c + 2] = T.m13[a] ^ T.m9[b] ^ T.m14[d] ^ T.m11[e];
          st[4 * c + 3] = T.m11[a] ^ T.m13[b] ^ T.m9[d] ^ T.m14[e];
        }
      }
    }
    for (let i = 0; i < 16; i++) out.push(st[i] ^ data[o - 16 + i]);
  }
  const p = out[out.length - 1];
  return p >= 1 && p <= 16 ? out.slice(0, out.length - p) : out;
}

// ---------- lexer ----------
// Read literal/hex string at t[k] -> bytes and index after string.
function pdfLeerStr(t, k) {
  if (t.charAt(k) === '<') {
    const e = t.indexOf('>', k);
    if (e < 0) throw new Error('hex');
    let h = t.slice(k + 1, e).replace(/[^0-9A-Fa-f]/g, '');
    if (h.length % 2) h += '0';
    const b = [];
    for (let i = 0; i < h.length; i += 2) b.push(parseInt(h.substr(i, 2), 16));
    return { b: b, fin: e + 1 };
  }
  const esc = { n: 10, r: 13, t: 9, b: 8, f: 12 }, b = [];
  let d = 1, i = k + 1;
  while (i < t.length) {
    const c = t.charAt(i);
    if (c === '\\') {
      const n = t.charAt(i + 1);
      if (n >= '0' && n <= '7') {
        let o = n, j = i + 2;
        while (j < i + 4 && t.charAt(j) >= '0' && t.charAt(j) <= '7') o += t.charAt(j++);
        b.push(parseInt(o, 8) & 255); i = j; continue;
      }
      if (n === '\r') { i += t.charAt(i + 2) === '\n' ? 3 : 2; continue; } // Line continuation.
      if (n === '\n') { i += 2; continue; }
      b.push(esc.hasOwnProperty(n) ? esc[n] : n.charCodeAt(0) & 255); i += 2; continue;
    }
    if (c === '(') d++;
    else if (c === ')') { d--; if (!d) return { b: b, fin: i + 1 }; }
    b.push(c.charCodeAt(0) & 255); i++;
  }
  throw new Error('string');
}
// Replace strings with decrypted hex to avoid escaping issues.
function pdfStrings(t, fn) {
  const out = [];
  let ult = 0, k = 0;
  while (k < t.length) {
    const c = t.charAt(k);
    if (c === '(' || (c === '<' && t.charAt(k + 1) !== '<')) {
      const r = pdfLeerStr(t, k);
      out.push(t.slice(ult, k), pdfHex(fn(r.b)));
      k = ult = r.fin;
    } else if (c === '<') k += 2;
    else if (c === '%') { while (k < t.length && t.charAt(k) !== '\n' && t.charAt(k) !== '\r') k++; }
    else k++;
  }
  out.push(t.slice(ult));
  return out.join('');
}
// End after >> of dictionary starting << at t[i].
function pdfFinDict(t, i) {
  let d = 0, k = i;
  while (k < t.length) {
    const c = t.charAt(k);
    if (c === '(') k = pdfLeerStr(t, k).fin;
    else if (c === '<') { if (t.charAt(k + 1) === '<') { d++; k += 2; } else k = pdfLeerStr(t, k).fin; }
    else if (c === '>' && t.charAt(k + 1) === '>') { d--; k += 2; if (!d) return k; }
    else if (c === '%') { while (k < t.length && t.charAt(k) !== '\n' && t.charAt(k) !== '\r') k++; }
    else k++;
  }
  throw new Error('dict');
}
function pdfLongitud(dict, xr, s) { // Direct/indirect /Length, or null.
  const m = /\/Length(?![0-9A-Za-z])\s+(\d+)(?:\s+(\d+)\s+R)?/.exec(dict);
  if (!m) return null;
  if (!m[2]) return parseInt(m[1], 10);
  const e = xr[parseInt(m[1], 10)];
  if (!e || e.t !== 'n') return null;
  const n = parseInt(pdfLeerObj(s, e.off, xr).dict, 10);
  return isNaN(n) ? null : n;
}
// Object at offset: num/gen/dictionary and optional binary stream.
function pdfLeerObj(s, off, xr) {
  const re = /\s*(\d+)\s+(\d+)\s+obj/y;
  re.lastIndex = off;
  const m = re.exec(s);
  if (!m) throw new Error('obj');
  const ini = re.lastIndex;
  let k = ini, w = '';
  for (;;) {
    if (k >= s.length) throw new Error('endobj');
    const c = s.charAt(k);
    if (c === '(') k = pdfLeerStr(s, k).fin;
    else if (c === '<') k = s.charAt(k + 1) === '<' ? k + 2 : pdfLeerStr(s, k).fin;
    else if (c === '%') { while (k < s.length && s.charAt(k) !== '\n' && s.charAt(k) !== '\r') k++; }
    else if (c === '/') { k++; while (k < s.length && !/[\s\/<>\[\]()%]/.test(s.charAt(k))) k++; }
    else if (/[A-Za-z]/.test(c)) {
      let e = k;
      while (e < s.length && /[A-Za-z]/.test(s.charAt(e))) e++;
      w = s.slice(k, e);
      if (w === 'stream' || w === 'endobj') break;
      k = e;
    } else k++;
  }
  const dict = s.slice(ini, k).trim(), o = { num: parseInt(m[1], 10), gen: parseInt(m[2], 10), dict: dict, data: null };
  if (w === 'endobj') return o;
  let p = k + 6;
  if (s.charAt(p) === '\r' && s.charAt(p + 1) === '\n') p += 2; else if (s.charAt(p) === '\n' || s.charAt(p) === '\r') p++;
  const len = pdfLongitud(dict, xr || {}, s);
  let e;
  if (len !== null && len >= 0 && /^\s*endstream/.test(s.substr(p + len, 24))) e = p + len;
  else {
    e = s.indexOf('endstream', p);
    if (e < 0) throw new Error('endstream');
    if (s.charAt(e - 1) === '\n') e--;
    if (s.charAt(e - 1) === '\r') e--;
  }
  o.data = s.slice(p, e);
  return o;
}
// xref chain newest first; entries and trailer per section.
function pdfCadenaXref(s) {
  const sx = s.lastIndexOf('startxref');
  if (sx < 0) throw new Error('startxref');
  let off = parseInt(/\d+/.exec(s.substr(sx + 9, 30))[0], 10);
  const secs = [], visto = {};
  while (off !== null) {
    if (visto[off]) throw new Error('ciclo');
    visto[off] = true;
    const re = /\s*xref/y;
    re.lastIndex = off;
    if (!re.exec(s)) throw new Error(PDF_NOSOP); // xref stream.
    let i = re.lastIndex;
    const entries = {}, rs = /\s*(\d+)\s+(\d+)/y, re2 = /\s*(\d+)\s+(\d+)\s+([nf])/y;
    for (;;) {
      const tr = /\s*trailer/y;
      tr.lastIndex = i;
      if (tr.exec(s)) { i = tr.lastIndex; break; }
      rs.lastIndex = i;
      const h = rs.exec(s);
      if (!h) throw new Error('xref');
      i = rs.lastIndex;
      const a = parseInt(h[1], 10), cnt = parseInt(h[2], 10);
      for (let n = 0; n < cnt; n++) {
        re2.lastIndex = i;
        const e = re2.exec(s);
        if (!e) throw new Error('xref entry');
        entries[a + n] = { t: e[3], off: parseInt(e[1], 10), gen: parseInt(e[2], 10) };
        i = re2.lastIndex;
      }
    }
    while (/\s/.test(s.charAt(i))) i++;
    const trailer = s.slice(i, pdfFinDict(s, i));
    if (/\/XRefStm/.test(trailer)) throw new Error(PDF_NOSOP);
    secs.push({ entries: entries, trailer: trailer });
    const pv = /\/Prev\s+(\d+)/.exec(trailer);
    off = pv ? parseInt(pv[1], 10) : null;
  }
  return secs;
}

// ---------- Standard encryption ----------
function pdfEnt(d, nombre) { const m = new RegExp('/' + nombre + '(?![A-Za-z0-9])\\s*(-?\\d+)').exec(d); return m ? parseInt(m[1], 10) : null; }
function pdfStrCampo(d, nombre) {
  const m = new RegExp('/' + nombre + '(?![A-Za-z0-9])\\s*[(<]').exec(d);
  return m ? pdfLeerStr(d, m.index + m[0].length - 1).b : null;
}
function pdfMetodo(d, nombre) { // StmF/StrF -> aes/rc4/empty Identity.
  const n = new RegExp('/' + nombre + '(?![A-Za-z0-9])\\s*/([^\\s/<>\\[\\]()]+)').exec(d);
  if (!n || n[1] === 'Identity') return '';
  const cf = new RegExp('/' + n[1] + '\\s*<<([^>]*)>>').exec(d);
  const c = cf && /\/CFM\s*\/(\w+)/.exec(cf[1]);
  return !c ? '' : c[1] === 'AESV2' ? 'aes' : c[1] === 'V2' ? 'rc4' : '';
}
function pdfParametros(enc) {
  if (!/\/Filter\s*\/Standard/.test(enc)) throw new Error(PDF_NOSOP);
  const V = pdfEnt(enc, 'V'), R = pdfEnt(enc, 'R');
  if ([1, 2, 4].indexOf(V) < 0 || [2, 3, 4].indexOf(R) < 0) throw new Error(PDF_NOSOP); // AES-256 R5/R6 out of scope.
  let n = R === 2 ? 5 : V === 4 ? 16 : Math.floor((pdfEnt(enc, 'Length') || 40) / 8);
  n = Math.max(5, Math.min(16, n));
  const O = pdfStrCampo(enc, 'O'), U = pdfStrCampo(enc, 'U'), P = pdfEnt(enc, 'P');
  if (!O || !U || P === null || O.length < 32 || U.length < 16) throw new Error(PDF_NOSOP);
  return { V: V, R: R, n: n, O: O, U: U, P: P | 0, encMeta: !/\/EncryptMetadata\s+false/.test(enc),
    stm: V === 4 ? pdfMetodo(enc, 'StmF') : 'rc4', str: V === 4 ? pdfMetodo(enc, 'StrF') : 'rc4' };
}
// ISO32000-1 algorithms2 and4/5: key for correct user password, otherwise null.
function pdfProbarClave(clave, enc, id) {
  const pw = pdfBa(clave).slice(0, 32), n = enc.n;
  const pad = pw.concat(PDF_PAD.slice(0, 32 - pw.length));
  let h = pdfMd5(pad.concat(enc.O.slice(0, 32), [enc.P & 255, (enc.P >> 8) & 255, (enc.P >> 16) & 255, (enc.P >> 24) & 255], id,
    enc.R >= 4 && !enc.encMeta ? [255, 255, 255, 255] : []));
  if (enc.R >= 3) for (let i = 0; i < 50; i++) h = pdfMd5(h.slice(0, n));
  const key = h.slice(0, n);
  if (enc.R === 2) return pdfIgual(pdfRc4(key, PDF_PAD), enc.U.slice(0, 32)) ? key : null;
  let x = pdfRc4(key, pdfMd5(PDF_PAD.concat(id)));
  for (let i = 1; i <= 19; i++) x = pdfRc4(key.map(function (b) { return b ^ i; }), x);
  return pdfIgual(x, enc.U.slice(0, 16)) ? key : null;
}
function pdfClaveObj(key, num, gen, aes) {
  const k = key.concat([num & 255, (num >> 8) & 255, (num >> 16) & 255, gen & 255, (gen >> 8) & 255]);
  if (aes) k.push(0x73, 0x41, 0x6C, 0x54); // sAlT ASCII.
  return pdfMd5(k).slice(0, Math.min(key.length + 5, 16));
}
function pdfDescifrar(metodo, key, num, gen, bytes) {
  if (!metodo) return bytes;
  const k = pdfClaveObj(key, num, gen, metodo === 'aes');
  return metodo === 'aes' ? pdfAesCbc(k, bytes) : pdfRc4(k, bytes);
}

// Bytes/password candidates -> null unencrypted, error, or unlocked bytes/password.
function desbloquearPdf(bytes, claves) {
  try {
    const s = pdfBs(bytes);
    if (s.indexOf('/Encrypt') < 0 || s.slice(0, 5) !== '%PDF-') return null;
    const secs = pdfCadenaXref(s);
    const campo = function (re) { for (let i = 0; i < secs.length; i++) { const m = re.exec(secs[i].trailer); if (m) return { m: m, t: secs[i].trailer }; } return null; };
    const xr = {};
    secs.forEach(function (sec) { Object.keys(sec.entries).forEach(function (n) { if (!(n in xr)) xr[n] = sec.entries[n]; }); }); // Newest section wins.
    // /Encrypt direct dictionary or reference.
    let encNum = -1, enc;
    const eR = campo(/\/Encrypt\s+(\d+)\s+(\d+)\s+R/);
    if (eR) {
      encNum = parseInt(eR.m[1], 10);
      if (!xr[encNum] || xr[encNum].t !== 'n') throw new Error('encrypt');
      enc = pdfLeerObj(s, xr[encNum].off, xr).dict;
    } else {
      const eD = campo(/\/Encrypt\s*(?=<<)/);
      if (!eD) return null;
      const i0 = eD.t.indexOf(eD.m[0]) + eD.m[0].length;
      enc = eD.t.slice(i0, pdfFinDict(eD.t, i0));
    }
    const par = pdfParametros(enc);
    // Unencrypted /ID[0] and raw array for new trailer.
    let id = [], idTxt = '';
    const iD = campo(/\/ID\s*\[/);
    if (iD) {
      const a = iD.t.indexOf(iD.m[0]) + iD.m[0].length - 1;
      let k = a + 1;
      while (iD.t.charAt(k) !== ']') {
        const c = iD.t.charAt(k);
        if (c === '(' || c === '<') { const r = pdfLeerStr(iD.t, k); if (!id.length) id = r.b; k = r.fin; } else k++;
      }
      idTxt = iD.t.slice(a, k + 1);
    }
    // Try empty password then candidates.
    let key = null, usada = '';
    const cand = [], visto = {};
    ['' ].concat(claves || []).forEach(function (c) { c = String(c); if (!visto[c]) { visto[c] = true; cand.push(c); } });
    for (let i = 0; i < cand.length && !key; i++) { key = pdfProbarClave(cand[i], par, id); if (key) usada = cand[i]; }
    if (!key) return { error: 'clave' };
    // Current objects.
    const nums = Object.keys(xr).map(Number).filter(function (n) { return xr[n].t === 'n' && xr[n].off > 0; }).sort(function (a, b) { return a - b; });
    const partes = [];
    let pos = 0;
    const add = function (t) { partes.push(t); pos += t.length; };
    add('%PDF-' + (/^%PDF-(\d\.\d)/.exec(s) || [0, '1.4'])[1] + '\n%\xE2\xE3\xCF\xD3\n');
    const offs = {}, gens = {};
    nums.forEach(function (n) {
      const o = pdfLeerObj(s, xr[n].off, xr), g = xr[n].gen;
      if (/\/Type\s*\/(XRef|ObjStm)(?![A-Za-z])/.test(o.dict)) throw new Error(PDF_NOSOP);
      let cuerpo, flujo = '';
      if (n === encNum) cuerpo = 'null'; // Do not decrypt /Encrypt dictionary; leave empty.
      else {
        cuerpo = pdfStrings(o.dict, function (b) { return pdfDescifrar(par.str, key, n, g, b); });
        if (o.data !== null) {
          const sinCifrar = !par.encMeta && /\/Type\s*\/Metadata(?![A-Za-z])/.test(o.dict);
          flujo = sinCifrar ? o.data : pdfBs(pdfDescifrar(par.stm, key, n, g, pdfBa(o.data)));
          const L = '/Length ' + flujo.length;
          cuerpo = /\/Length(?![0-9A-Za-z])/.test(cuerpo) ? cuerpo.replace(/\/Length(?![0-9A-Za-z])\s+\d+(?:\s+\d+\s+R)?/, L) : cuerpo.replace(/>>\s*$/, L + ' >>');
        }
      }
      offs[n] = pos; gens[n] = g;
      add(n + ' ' + g + ' obj\n' + cuerpo + '\n' + (o.data !== null && n !== encNum ? 'stream\n' + flujo + '\nendstream\n' : '') + 'endobj\n');
    });
    // New classic xref with linked free entries, trailer without /Encrypt.
    const tam = Math.max(pdfEnt(secs[0].trailer, 'Size') || 0, nums.length ? nums[nums.length - 1] + 1 : 1);
    const libres = [0];
    for (let i = 1; i < tam; i++) if (offs[i] === undefined) libres.push(i);
    const p10 = function (n) { return ('0000000000' + n).slice(-10); }, p5 = function (n) { return ('00000' + n).slice(-5); };
    const xrefPos = pos;
    let x = 'xref\n0 ' + tam + '\n';
    for (let i = 0; i < tam; i++) {
      if (offs[i] !== undefined) x += p10(offs[i]) + ' ' + p5(gens[i]) + ' n \n';
      else { const j = libres.indexOf(i); x += p10(libres[j + 1] || 0) + ' ' + (i === 0 ? '65535' : '00000') + ' f \n'; }
    }
    const root = campo(/\/Root\s+(\d+\s+\d+\s+R)/), info = campo(/\/Info\s+(\d+\s+\d+\s+R)/);
    if (!root) throw new Error('root');
    x += 'trailer\n<< /Size ' + tam + ' /Root ' + root.m[1] + (info ? ' /Info ' + info.m[1] : '') + (idTxt ? ' /ID ' + idTxt : '') + ' >>\nstartxref\n' + xrefPos + '\n%%EOF\n';
    add(x);
    return { bytes: pdfBa(partes.join('')), clave: usada };
  } catch (e) {
    return { error: PDF_NOSOP };
  }
}

// ---------- Google signed-byte adapter ----------
function bytesDeB64(b64) { return Utilities.base64Decode(b64).map(function (b) { return b & 255; }); }
function b64DeBytes(bytes) { return Utilities.base64Encode(bytes.map(function (b) { return b > 127 ? b - 256 : b; })); }

// Single-entry memo for unlocked/locked passes in same execution.
let PDF_MEMO = null;
// Validated file -> working file, optional unlocked AI file, failure flag and decryption ms.
function desbloquearArchivo(T, a) {
  const mk = a.file_unique_id + ':' + a.base64.length + ':' + a.base64.slice(-48);
  if (PDF_MEMO && PDF_MEMO.k === mk) return PDF_MEMO.v;
  const t0 = Date.now();
  let r, res = { archivo: a, cerrado: false };
  try {
    const bytes = bytesDeB64(a.base64);
    let placas = [];
    try { placas = tab(T, 'Vehículos').map(function (v) { return String(v.Placa).trim(); }).filter(function (p) { return p; }); } catch (e) { placas = []; }
    const claves = [];
    placas.forEach(function (p) { claves.push(p.toUpperCase(), p.toLowerCase()); });
    r = desbloquearPdf(bytes, claves);
    if (r && !r.error) r.b64 = b64DeBytes(r.bytes);
  } catch (e) { r = null; } // Unreadable base64/encoding failure retains original.
  if (r) {
    res.ms = Date.now() - t0;
    if (r.error) res.cerrado = true;
    else {
      const b64 = r.b64;
      res.archivo = { base64: b64, mime: a.mime, nombre: a.nombre, file_unique_id: a.file_unique_id };
      res.archivoIA = { base64: b64, mime: a.mime, nombre: a.nombre };
    }
  }
  PDF_MEMO = { k: mk, v: res };
  return res;
}
