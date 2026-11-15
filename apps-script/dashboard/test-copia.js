// T-038: offline limpiarCopiaReal tests. Usage: node apps-script/dashboard/test-copia.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ---- minimal fake spreadsheet (counts writes per tab) ----
function hojaFalsa(nombre, pestanas) {
  const escrituras = {}, sheets = {};
  Object.keys(pestanas).forEach(function (n) {
    const datos = pestanas[n].map(f => f.slice());
    const vacia = f => f.every(v => v === '' || v === null);
    sheets[n] = {
      datos,
      getLastRow() { let i = datos.length; while (i > 0 && vacia(datos[i - 1])) i--; return i; },
      getLastColumn() { return datos.reduce((m, f) => Math.max(m, f.length), 0); },
      getDataRange() { return this.getRange(1, 1, this.getLastRow(), this.getLastColumn()); },
      getRange(r, c, nr = 1, nc = 1) {
        const marca = () => { escrituras[n] = (escrituras[n] || 0) + 1; };
        const poner = vals => vals.forEach((f, i) => f.forEach((v, j) => {
          while (datos.length < r + i) datos.push([]);
          const fila = datos[r - 1 + i]; while (fila.length < c + j) fila.push('');
          fila[c - 1 + j] = v;
        }));
        return {
          getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => ((datos[r - 1 + i] || [])[c - 1 + j] ?? ''))),
          setValues: vals => { assert.strictEqual(vals.length, nr); vals.forEach(f => assert.strictEqual(f.length, nc)); marca(); poner(vals); },
          setValue: v => { marca(); poner([[v]]); },
          clearContent: () => { marca(); poner(Array.from({ length: nr }, () => Array(nc).fill(''))); }
        };
      }
    };
  });
  return { getName: () => nombre, getSheetByName: n => sheets[n] || null, sheets, escrituras };
}

function cargar(constanteTrue) {
  let respuesta = 'YES', ss = null;
  const alerts = [];
  const ui = { ButtonSet: { YES_NO: 'YES_NO' }, Button: { YES: 'YES', NO: 'NO' },
    alert: (...a) => { alerts.push(a); return a.length === 3 ? respuesta : undefined; } };
  const sandbox = {
    console, Logger: { log() {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, getUi: () => ui, flush() {} },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Session: { getActiveUser: () => ({ getEmail: () => '' }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) }
  };
  const ctx = vm.createContext(sandbox);
  for (const f of fs.readdirSync(__dirname).filter(x => x.endsWith('.gs')).sort()) {
    let src = fs.readFileSync(path.join(__dirname, f), 'utf8');
    if (constanteTrue) src = src.replace('const LIMPIAR_COMBUSTIBLE_HISTORICO = false', 'const LIMPIAR_COMBUSTIBLE_HISTORICO = true');
    vm.runInContext(src, ctx, { filename: f });
  }
  return { ESQUEMA: vm.runInContext('ESQUEMA', ctx), alerts, correr: () => vm.runInContext('limpiarCopiaReal()', ctx),
    saldoDiego: vm.runInContext('saldoDiego', ctx), armarTablas: vm.runInContext('armarTablas', ctx),
    usar: h => { ss = h; }, responder: r => { respuesta = r; } };
}

function datosBase(ESQUEMA) {
  const fila = (p, n) => ESQUEMA[p].map((c, i) => p + '-' + n + '-' + i);
  const p = {};
  Object.keys(ESQUEMA).forEach(k => { p[k] = [ESQUEMA[k].slice(), fila(k, 1), fila(k, 2)]; });
  p['Usuarios'] = [ESQUEMA['Usuarios'].slice(),
    [1000001, 'Diego', 'conductor', 'TRK202', true, 'Diego', 'si impersonal'],
    [1000002, 'Admin', 'administrador', '', true, 'Diego', 'si impersonal'],
    [1000004, 'Registrador Prueba', 'registrador', '', true, '', 'si impersonal']];
  p['Parámetros'] = [ESQUEMA['Parámetros'].slice(),
    ['chat_id_grupo', '-100123', 'grupo'], ['saldo_inicial_diego', 50000, 'Lo da Admin'],
    ['aviso_aceite_km', 500, ''], ['clave_vista_diego', 'abc', 'clave']];
  p['Cortes'] = [ESQUEMA['Cortes'].concat(['Extra']), // extra trailing column
    ['C-000', '2026-01-01', 0, 0, 0, 0, 0, 0, '', '', 'x'], ['C-001', '2026-10-01', 0, 10, 5, 0, 0, 5, 'pdf', 'Diego', 'y']];
  p['Combustible histórico'] = [['Fecha', 'Galones'], ['2026-01-01', 10], ['2026-02-01', 12]];
  return p;
}
const J = x => JSON.parse(JSON.stringify(x));

// (1) PRUEBA in the name → throw without changes
(function () {
  const t = cargar(false), h = hojaFalsa('Cuentas PRUEBA', datosBase(t.ESQUEMA));
  t.usar(h);
  assert.throws(() => t.correr(), /PRUEBA/);
  assert.deepStrictEqual(h.escrituras, {});
  assert.strictEqual(t.alerts.length, 0);
})();

// (2) NO response → no changes
(function () {
  const t = cargar(false), base = datosBase(t.ESQUEMA), h = hojaFalsa('Cuentas Diego', base);
  t.usar(h); t.responder('NO');
  assert.ok(/Cancelado/.test(t.correr()));
  assert.deepStrictEqual(h.escrituras, {});
  Object.keys(base).forEach(n => assert.deepStrictEqual(J(h.sheets[n].datos), J(base[n])));
})();

// extra: missing tab → error before any write
(function () {
  const t = cargar(false), base = datosBase(t.ESQUEMA); delete base['Log'];
  const h = hojaFalsa('Cuentas Diego', base); t.usar(h);
  assert.throws(() => t.correr(), /Falta la pestaña Log/);
  assert.deepStrictEqual(h.escrituras, {});
  assert.strictEqual(t.alerts.length, 0);
})();

// (3) YES and (4) second run → same state
(function () {
  const t = cargar(false), base = datosBase(t.ESQUEMA), h = hojaFalsa('Cuentas Diego', base);
  t.usar(h);
  const msg = t.correr();
  assert.ok(msg.includes('PASOS DESPUÉS') && msg.includes('CLAVE_API') && msg.includes('CARPETA_CORTES_ID') && msg.includes('instalarHoja'));
  const S = n => h.sheets[n];
  const vaciadas = ['Movimientos', 'Cobros', 'Pagos clientes', 'Inventario abono', 'Por confirmar', 'Log', 'Cortes'];
  const revisar = () => {
    vaciadas.forEach(n => { assert.deepStrictEqual(J(S(n).datos[0]), J(base[n][0])); assert.strictEqual(S(n).getLastRow(), 1, n); });
    ['Vehículos', 'Tarifas', 'Clientes', 'Combustible histórico'].forEach(n => assert.deepStrictEqual(J(S(n).datos), J(base[n]), n));
    const u = J(base['Usuarios']); u[3][4] = false;
    assert.deepStrictEqual(J(S('Usuarios').datos), u);
    assert.deepStrictEqual(J(S("Parámetros").datos), J([base["Parámetros"][0],
      ['chat_id_grupo', '-100123', 'grupo'], ['saldo_inicial_diego', '', 'Lo da Admin'],
      ["aviso_aceite_km", 500, ""], ["clave_vista_diego", "", "clave"]]));
    const c = S('Cambios');
    assert.deepStrictEqual(J(c.datos[0]), J(base["Cambios"][0]));
    assert.strictEqual(c.getLastRow(), 2);
    assert.strictEqual(c.datos[1][1], 'Admin');
    assert.strictEqual(c.datos[1][2], 'Limpieza copia real');
    assert.strictEqual(c.datos[1].length, 9);
    assert.ok(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(c.datos[1][0])); // fechaBogota timestamp
    assert.ok(c.datos[1][8].includes('Cortes vacío'));
  };
  revisar();
  vaciadas.concat(['Usuarios']).forEach(n => assert.strictEqual(h.escrituras[n], 1, n));
  assert.strictEqual(h.escrituras['Parámetros'], 2); // only the two cells, not the entire column
  assert.ok(h.escrituras['Cambios'] <= 2); // clear content + new row
  ['Combustible histórico', 'Vehículos', 'Tarifas', 'Clientes'].forEach(n => assert.ok(!h.escrituras[n], n));

  // Money: without closed periods, start from saldo_inicial_diego (fails if C-000 or another period remains)
  const saldoCon = (inicial) => {
    const vals = {};
    Object.keys(h.sheets).forEach(n => { vals[n] = J(h.sheets[n].datos); });
    vals['Parámetros'].forEach(f => { if (f[0] === 'saldo_inicial_diego') f[1] = inicial; });
    return t.saldoDiego(t.armarTablas(vals).T);
  };
  const sk = J(saldoCon(250000));
  assert.strictEqual(sk.saldoAnterior, 250000);
  assert.strictEqual(sk.saldo, 250000);
  // control: the old C-001 (closing balance 5) would prevent a 250000 opening balance
  const conCorte = {}; Object.keys(base).forEach(n => { conCorte[n] = J(base[n]); });
  conCorte['Parámetros'][2][1] = 250000;
  assert.notStrictEqual(t.saldoDiego(t.armarTablas(conCorte).T).saldoAnterior, 250000);

  const antes = Object.assign({}, h.escrituras);
  t.correr();
  revisar();
  assert.strictEqual(h.escrituras['Parámetros'], antes['Parámetros']); // already empty: do not rewrite
})();

// (5) true constant → clear Combustible histórico
(function () {
  const t = cargar(true), h = hojaFalsa('Cuentas Diego', datosBase(t.ESQUEMA));
  t.usar(h); t.correr();
  const ch = h.sheets['Combustible histórico'];
  assert.deepStrictEqual(ch.datos[0], ['Fecha', 'Galones']);
  assert.strictEqual(ch.getLastRow(), 1);
  assert.strictEqual(h.escrituras['Combustible histórico'], 1);
})();

console.log('test-copia OK (5 casos + pestaña faltante)');
