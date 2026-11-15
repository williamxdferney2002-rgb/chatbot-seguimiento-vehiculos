// Dashboard T-013 tests: shared .gs VM like test.js, no Google.
// Usage: node apps-script/dashboard/test-tablero.js.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ADMIN = 'admin@example.com', ADMIN2 = 'mario@example.com', DIEGOMAIL = 'diego@example.com';
const J = x => JSON.parse(JSON.stringify(x));

// Shared .gs context with optional mutated Tablero.gs and Google mocks.
function crear(reemplazos = {}) {
  const e = { correo: ADMIN, lockOk: true, props: {}, cache: {}, orden: [], mails: [], carpetas: [], mailFalla: false, grid: null, html: [] };
  const archivo = (nombre, fuente) => ({
    getName: () => nombre, getUrl: () => 'https://drive/' + nombre, fuente });
  const blobDe = (nombre) => { const b = { n: nombre, getAs() { return blobDe('pdf'); }, setName(x) { b.n = x; return b; }, getName: () => b.n, getBytes: () => [1, 2, 3] }; return b; };
  const sandbox = {
    // Pin the mock clock so API calls match dated fixture views.
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-15T15:00:00Z'])); } },
    console: { log: console.log, error() {} },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ s, setMimeType() { return this; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => e.props[k] || null, setProperty: (k, v) => { e.props[k] = v; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => e.lockOk, releaseLock() { e.orden.push('release'); } }) },
    CacheService: { getScriptCache: () => ({ get: k => (k in e.cache ? e.cache[k] : null), put: (k, v) => { e.cache[k] = v; }, remove: k => { delete e.cache[k]; } }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => e.ss, flush() { e.orden.push('flush'); } },
    Session: { getActiveUser: () => ({ getEmail: () => e.correo }), getEffectiveUser: () => ({ getEmail: () => 'dueno@example.com' }) },
    Utilities: { formatDate: d => d.toISOString().slice(0, 19).replace('T', ' '), getUuid: () => Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2),
      newBlob: (c, t, n) => { e.html.push(c); return blobDe(n); }, base64Encode: () => 'QUJD' },
    HtmlService: {
      createHtmlOutput: html => { const o = { html, setTitle(t) { o.titulo = t; return o; }, addMetaTag() { return o; } }; return o; },
      createTemplateFromFile: n => { const t = { n, evaluate() { const o = { plantilla: n, inicial: t.inicial, setTitle() { return o; }, addMetaTag() { return o; } }; return o; } }; return t; } },
    DriveApp: {
      getFolderById: id => { const f = e.carpetas.find(c => c.id === id); if (!f) throw new Error('no existe'); return f; },
      createFolder: nombre => { const f = { id: 'F' + (e.carpetas.length + 1), nombre, archivos: [],
        getId() { return f.id; }, getFilesByName(n) { const a = f.archivos.filter(x => x.getName() === n); let i = 0; return { hasNext: () => i < a.length, next: () => a[i++] }; },
        createFile(b) { const a = archivo(b.getName()); f.archivos.push(a); return a; } }; e.carpetas.push(f); return f; } },
    MailApp: { sendEmail: o => { if (e.mailFalla) throw new Error('cuota'); e.mails.push(o); } }
  };
  const ctx = vm.createContext(sandbox);
  for (const f of fs.readdirSync(__dirname).filter(x => x.endsWith('.gs')).sort()) {
    let src = fs.readFileSync(path.join(__dirname, f), 'utf8');
    if (reemplazos[f]) src = reemplazos[f](src);
    vm.runInContext(src, ctx, { filename: f });
  }
  const G = vm.runInContext(`({ ESQUEMA, CLAVES, saldoDiego, ultimoCorte, armarTablas, esAdministrador, listaCorreos, parametrosFaltantes, asegurarParametros,
    modeloEstado, vistaTablero, registrarAjuste, cerrarCorte, aplicarEnMemoria, htmlEstadoCuenta, contadoresPendientes, procesar, doGet,
    api_cuenta, api_ajuste, api_cerrar, api_reintentar, api_pdfEstado, pesos,
    guardarPrecio, listaPrecios, cobrosPorCliente, api_precio, textoCobros, estadoCobro, calcularPeps, vistaAbono, inventarioPorPlaca,
    vistaFletes, detalleCliente, estadoCliente, htmlEstadoCliente, api_fletes, api_pdfCliente,
    vistaAcpm, unirTanqueos, tramosRendimiento, numHist, api_acpm, armarTablas, validarEsquema, leerTablas, HOJA_HIST,
    vistaMeses, api_meses, vistaCarros, rendimientoMes, aceiteCarro, buscarRegistros, api_carros, api_registros, manejarTanqueos, textoAceite, numTxt,
    estadoLegible, TIPO_MOV, partidasDeCorte, cantUnidad, costoAcpmKm,
    vistaConsolidado, api_consolidado, cuotasProrrateo, puntosKm, kmDelMes, partirTotal, modeloCarros, sumaGasto,
    __setSaldo: (function () { const orig = saldoDiego; return function (o) { saldoDiego = o ? function () { return o; } : orig; }; })() })`, ctx);
  return { G, e, sandbox };
}

// ---------- fixtures ----------
function base(G, extra = {}) {
  const T = {};
  Object.keys(G.ESQUEMA).forEach(p => { T[p] = []; });
  T['Parámetros'] = [
    { Clave: 'chat_id_grupo', Valor: '-1009999', Nota: '' }, { Clave: 'saldo_inicial_diego', Valor: 0, Nota: '' },
    { Clave: 'correos_administradores', Valor: ' Admin@example.com , ' + ADMIN2, Nota: '' }, { Clave: 'correo_diego', Valor: DIEGOMAIL, Nota: '' }];
  T['Vehículos'] = [{ Placa: 'TRK202' }, { Placa: 'TRK101' }];
  T.Cortes = [{ ID: 'C-000', 'Fecha de cierre': '2026-01-01', 'Saldo final': 100000 }];
  return Object.assign(T, extra);
}
let n = 0;
function fila(G, hoja, o) {
  const f = {}; G.ESQUEMA[hoja].forEach(c => { f[c] = ''; });
  return Object.assign(f, { ID: 'X' + (++n) }, o);
}
const mov = (G, o) => fila(G, 'Movimientos', Object.assign({ Fecha: '2026-10-10 08:00:00', Cuenta: 'Diego', Estado: 'activo', Origen: 'Telegram', Corte: '' }, o));
const pago = (G, o) => fila(G, 'Pagos clientes', Object.assign({ Fecha: '2026-10-11 09:00:00', Cliente: 'Don Pedro', 'Recibió': 'Diego', Estado: 'activo', Corte: '', Valor: 0 }, o));
// Simulate single writer through real aplicarEnMemoria semantics.
const aplicar = (G, T, w) => G.aplicarEnMemoria(T, w);

// Mixed sheet: Diego/other accounts, voids, closed periods, customer payments.
function hojaLlena(G) {
  const T = base(G);
  T.Cobros = [fila(G, 'Cobros', { ID: 'CB1', Placa: 'TRK101', Cliente: 'Don Pedro', Estado: 'pendiente', Total: 500000 })];
  T.Movimientos = [
    mov(G, { ID: 'M1', Fecha: '2026-10-10 08:00:00', Placa: 'TRK202', Clase: 'Ganado', 'Categoría': 'Viaje', Detalle: 'Pueblo Claro', Total: 150000 }),
    mov(G, { ID: 'M2', Fecha: '2026-10-10 12:00:00', Placa: 'TRK202', Clase: 'Adelantado', 'Categoría': 'ACPM', Total: 80000, 'Pagó': 'Diego' }),
    mov(G, { ID: 'M3', Fecha: '2026-10-10 13:00:00', Placa: 'TRK202', Clase: 'Adelantado', 'Categoría': 'Peaje', Total: 9000, 'Pagó': 'Tarjeta Mario Ortiz' }), // Excluded.
    mov(G, { ID: 'M4', Fecha: '2026-10-11 10:00:00', Clase: 'Recibido', 'Categoría': 'Consignación', Total: 120000 }),
    mov(G, { ID: 'M5', Fecha: '2026-10-12 10:00:00', Clase: 'Descuento', 'Categoría': 'Seguro', Total: 20000 }),
    mov(G, { ID: 'M6', Fecha: '2026-10-12 11:00:00', Clase: 'Ganado', Total: 70000, Estado: 'anulado' }),                 // Voided: excluded but sealed.
    mov(G, { ID: 'M7', Fecha: '2026-10-12 11:00:00', Clase: 'Ganado', Total: 55000, Cuenta: '' }),                         // Other account: excluded but sealed.
    mov(G, { ID: 'M8', Fecha: '2026-09-01 11:00:00', Clase: 'Ganado', Total: 999999, Corte: 'C-000' }),                    // Old period untouched.
    mov(G, { ID: 'M9', Fecha: '2026-10-12 15:00:00', Placa: 'TRK101', Clase: 'Ganado', 'Categoría': 'Cargue', Detalle: '<b>x</b> & "y"', Total: 30000 })];
  T['Pagos clientes'] = [
    pago(G, { ID: 'PC1', 'ID del cobro': 'CB1', Valor: 200000, Fecha: '2026-10-11 09:00:00' }),
    pago(G, { ID: 'PC2', 'ID del cobro': 'CB1', Valor: 40000, 'Recibió': 'Mario Ortiz' }),                              // Mario received: excluded from Diego.
    pago(G, { ID: 'PC3', 'ID del cobro': 'CB1', Valor: 10000, Estado: 'anulado' }),
    pago(G, { ID: 'PC4', 'ID del cobro': 'CB1', Valor: 77777, Corte: 'C-000' })];
  return T;
}

// ---------- T-024 pending-price fixtures/scenarios ----------
function hojaPrecios(G) {
  const T = base(G);
  const iv = o => fila(G, 'Inventario abono', Object.assign({ Fecha: '2026-10-05 08:00:00', Placa: 'TRK202', Estado: 'activo', Origen: 'Telegram' }, o));
  const cb = o => fila(G, 'Cobros', Object.assign({ Fecha: '2026-10-06 08:00:00', Placa: 'TRK202', Tipo: 'flete', Estado: 'pendiente' }, o));
  T['Inventario abono'] = [
    iv({ ID: 'IA1', Movimiento: 'compra', Cantidad: 50, Lugar: 'Agro Sur' }),                                              // Unpriced purchase.
    iv({ ID: 'IA2', Movimiento: 'compra', Cantidad: 50, Estado: 'anulado' }),                                              // Voided excluded.
    iv({ ID: 'IA3', Movimiento: 'compra', Cantidad: 20, 'Precio unitario': 4000, Total: 80000, 'Precio dado por': 'admin@example.com' }), // Admin-priced excluded.
    iv({ ID: 'IA4', Movimiento: 'compra', Cantidad: 10, 'Precio unitario': 3000, Total: 30000, 'Precio dado por': 'Diego', Fecha: '2026-10-04 08:00:00' }), // Diego-priced included.
    iv({ ID: 'IA5', Movimiento: 'venta', Cantidad: 400, Cliente: 'Luis Herrera', Lugar: 'Lomavista', 'ID cobro': 'CBM' })];     // Unpriced sale.
  T.Cobros = [
    cb({ ID: 'CBM', Tipo: 'abono', Cliente: 'Luis Herrera', Cantidad: 400, Estado: 'sin precio', 'Lugar de descargue': 'Lomavista' }),
    cb({ ID: 'CBF', Cliente: 'Don Pedro', Cantidad: 10, Estado: 'sin precio', 'Lugar de descargue': 'Pueblo Claro', Fecha: '2026-10-07 08:00:00' }),
    cb({ ID: 'CBI', Cliente: 'Mario Ortiz', Cantidad: 10, Estado: 'interno' }),                                         // Internal is not debt.
    cb({ ID: 'CBA', Cliente: 'Don Pedro', Cantidad: 10, Estado: 'anulado' }),
    cb({ ID: 'CB1', Cliente: 'Don Pedro', Cantidad: 10, Total: 500000, 'Precio unitario': 50000, Fecha: '2026-10-01 08:00:00' }),
    cb({ ID: 'CB2', Cliente: 'Don Pedro', Cantidad: 10, Total: 300000, Estado: 'parcial', Fecha: '2026-09-20 08:00:00' }),
    cb({ ID: 'CB3', Cliente: 'Otro', Cantidad: 1, Total: 1000, Estado: 'pagado' })];
  T['Pagos clientes'] = [
    pago(G, { ID: 'PAGO1', 'ID del cobro': 'CBM', Cliente: 'Luis Herrera', Valor: 100000 }),                           // Illustrative unpriced payment already made.
    pago(G, { ID: 'PAGO2', 'ID del cobro': 'CB2', Valor: 100000 }),
    pago(G, { ID: 'PAGO3', 'ID del cobro': 'CBM', Valor: 99999, Estado: 'anulado' })];                                     // Voided excluded.
  return T;
}
const AHORA = new Date('2026-10-18T15:30:00Z');
const pEnt = (o) => Object.assign({ correo: ADMIN, clave: 'precio-0001-aaaa', id: 'IA1', precio: 2000, precioVisto: 0 }, o);
const filaDe = (T, hoja, id) => T[hoja].find(f => String(f.ID) === id);
// Illustrative quantity/price changes produce partial/paid states.
function casoLuis(G) {
  const est = (precio) => {
    const T = hojaPrecios(G), r = G.guardarPrecio(T, pEnt({ id: 'IA5', precio }), AHORA, 'E1');
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    aplicar(G, T, r.escrituras);
    return [filaDe(T, 'Cobros', 'CBM').Estado, filaDe(T, 'Cobros', 'CBM').Total, filaDe(T, 'Inventario abono', 'IA5').Total];
  };
  assert.deepStrictEqual(est(300), ['parcial', 120000, 120000]);
  assert.deepStrictEqual(est(250), ['pagado', 100000, 100000]);
  assert.deepStrictEqual(est(500), ['parcial', 200000, 200000]);
}
function guardaPrecioViejo(G) {
  const T = hojaPrecios(G);
  const r = G.guardarPrecio(T, pEnt({ id: 'IA4', precio: 3500, precioVisto: 999 }), AHORA, 'E1');
  assert.strictEqual(r.ok, false);
}

(function todo() {
  const { G } = crear();

  // ---------- 1. authorization ----------
  (function autorizacion() {
    const T = base(G);
    for (const c of [ADMIN, '  ADMIN@example.COM ', ADMIN2.toUpperCase()]) assert.strictEqual(G.esAdministrador(T, c), true, c);
    for (const c of ['', '   ', null, undefined, 'otro@example.com', 'gmail.com', 'admin@example.com.evil.com', 'x' + ADMIN, 0]) assert.strictEqual(G.esAdministrador(T, c), false, String(c));
    const vacia = base(G); vacia['Parámetros'].find(p => p.Clave === 'correos_administradores').Valor = '';
    for (const c of ['', ADMIN, null]) assert.strictEqual(G.esAdministrador(vacia, c), false, 'lista vacía ' + c);
    const sinFila = base(G); sinFila['Parámetros'] = [];
    assert.strictEqual(G.esAdministrador(sinFila, ADMIN), false);
    assert.deepStrictEqual(J(G.listaCorreos(' A@example.test ,, b@example.test;C@example.test')), ['a@example.test', 'b@example.test', 'c@example.test']);
  })();

  // ---------- 2. idempotent parameter installer ----------
  (function params() {
    assert.deepStrictEqual(J(G.parametrosFaltantes(['chat_id_grupo', ' correo_diego '])).map(p => p[0]), ['correos_administradores', 'carpeta_cortes_id']);
    let datos = [['Clave', 'Valor', 'Nota'], ['chat_id_grupo', '-100', 'g'], ['saldo_inicial_diego', 5, ''], ['correo_diego', 'k@example.test', 'ya']];
    const sh = {
      getLastColumn: () => datos[0].length, getLastRow: () => datos.length,
      getRange: (r, c, nr, nc) => ({ getValues: () => datos.slice(r - 1, r - 1 + nr).map(f => f.slice(c - 1, c - 1 + nc)),
        setValues: v => v.forEach((f, i) => { datos[r - 1 + i] = datos[r - 1 + i] || []; f.forEach((x, j) => { datos[r - 1 + i][c - 1 + j] = x; }); }) }) };
    assert.deepStrictEqual(J(G.asegurarParametros(sh)), ['correos_administradores', 'carpeta_cortes_id']);
    assert.deepStrictEqual(datos.slice(0, 4).map(f => f[0]), ['Clave', 'chat_id_grupo', 'saldo_inicial_diego', 'correo_diego']); // Preserve order/values.
    assert.strictEqual(datos[3][1], 'k@example.test');
    assert.strictEqual(datos.length, 6);
    assert.deepStrictEqual(J(G.asegurarParametros(sh)), []); // Second run adds nothing.
    assert.strictEqual(datos.length, 6);
  })();

  // ---------- 3. daily blocks reconcile with saldoDiego ----------
  (function cuadre() {
    const T = hojaLlena(G), s = G.saldoDiego(T), m = G.modeloEstado(T, '');
    assert.strictEqual(m.cuadra, true);
    // Model figures equal saldoDiego.
    assert.deepStrictEqual(J([m.saldoAnterior, m.ganado, m.adelantado, m.recibido, m.descuentos, m.saldo]),
      [s.saldoAnterior, s.ganado, s.adelantado, s.recibido + s.pagosClientes, s.descuentos, s.saldo]);
    assert.deepStrictEqual(J([m.saldoAnterior, m.ganado, m.adelantado, m.recibido, m.descuentos, m.saldo]), [100000, 180000, 80000, 320000, 20000, 20000]);
    // Block sums equal balance minus opening, also by group.
    const items = m.bloques.flatMap(b => b.items);
    assert.strictEqual(m.saldoAnterior + m.bloques.reduce((a, b) => a + b.total, 0), m.saldo);
    const por = g => items.filter(i => i.grupo === g).reduce((a, i) => a + i.valor, 0);
    assert.deepStrictEqual([por('ganado'), por('adelantado'), por('recibido'), por('descuentos')], [180000, 80000, 320000, 20000]);
    assert.deepStrictEqual(J(m.bloques.map(b => b.fecha)), ['2026-10-10', '2026-10-11', '2026-10-12']);
    const ids = items.map(i => i.id).sort();
    assert.deepStrictEqual(J(ids), ['M1', 'M2', 'M4', 'M5', 'M9', 'PC1']); // Exclude card/void/other account/closed period/Mario payment.
    assert.strictEqual(m.bloques[0].items[0].id, 'M1'); // Earned before advanced.
    assert.strictEqual(m.estado, 'La empresa le debe a Diego');
    // Zero/negative balance.
    const T2 = base(G);
    assert.strictEqual(G.modeloEstado(T2, '').estado, 'La empresa le debe a Diego'); // Illustrative opening balance.
    T2.Cortes[0]['Saldo final'] = 0;
    assert.strictEqual(G.modeloEstado(T2, '').estado, 'Cuentas en cero');
    T2.Cortes[0]['Saldo final'] = 100000;
    T2.Movimientos = [mov(G, { ID: 'N1', Clase: 'Descuento', Total: 150000 })];
    assert.strictEqual(G.modeloEstado(T2, '').estado, 'Diego le debe a la empresa');
    // Counters.
    T.Cobros.push(fila(G, 'Cobros', { ID: 'CB2', Estado: 'parcial' }), fila(G, 'Cobros', { ID: 'CB3', Estado: 'pagado' }));
    T['Inventario abono'] = [fila(G, 'Inventario abono', { ID: 'I1', Movimiento: 'venta', Estado: 'activo' }), fila(G, 'Inventario abono', { ID: 'I2', Movimiento: 'venta', Estado: 'activo', 'Precio unitario': 5000 }),
      fila(G, 'Inventario abono', { ID: 'I3', Movimiento: 'compra', Estado: 'activo' })];
    T['Por confirmar'] = [fila(G, 'Por confirmar', { ID: 'P1', Estado: 'pendiente' }), fila(G, 'Por confirmar', { ID: 'P2', Estado: 'hecho' })];
    assert.deepStrictEqual(J(G.contadoresPendientes(T)), { porConfirmar: 1, ventasSinPrecio: 1, cobrosConSaldo: 2 });
  })();

  // ---------- 4. manual adjustment ----------
  (function ajuste() {
    const ok = (o) => Object.assign({ correo: ADMIN, clave: 'clave-0001-aaaa', clase: 'Descuento', fecha: '2026-10-13', placa: '', detalle: 'Seguro del mes', valor: '50.000' }, o);
    const ahora = new Date('2026-10-14T15:30:00Z');
    const T = hojaLlena(G), antes = G.saldoDiego(T).saldo;
    // Valid four classes.
    const efecto = { Ganado: 1, Adelantado: 1, Recibido: -1, Descuento: -1 };
    for (const clase of Object.keys(efecto)) {
      const U = hojaLlena(G), a0 = G.saldoDiego(U).saldo;
      const r = G.registrarAjuste(U, ok({ clase, clave: 'clave-' + clase + '-12' }), ahora, 'T1');
      assert.strictEqual(r.ok, true, JSON.stringify(r));
      aplicar(G, U, r.escrituras);
      assert.strictEqual(G.saldoDiego(U).saldo, a0 + efecto[clase] * 50000, clase);
      const f = U.Movimientos.at(-1);
      assert.deepStrictEqual(J([f.Origen, f['Registró'], f.Cuenta, f.Estado, f.Corte, f.Total, f.Clase, f['Pagó']]),
        ['Tablero', ADMIN, 'Diego', 'activo', '', 50000, clase, clase === 'Adelantado' ? 'Diego' : '']);
      assert.strictEqual(f.Fecha, '2026-10-13 10:30:00');
      const c = U.Cambios.at(-1), l = U.Log.at(-1);
      assert.deepStrictEqual(J([c.Origen, c['Quién'], c['ID registro'], l.Origen, l.Usuario]), ['Tablero', ADMIN, f.ID, 'Tablero', ADMIN]);
      assert.strictEqual(G.modeloEstado(U, '').cuadra, true);
    }
    // Plate normalized against Vehículos.
    const rp = G.registrarAjuste(T, ok({ placa: 'trk202', clave: 'clave-placa-01' }), ahora, 'T2');
    assert.strictEqual(rp.escrituras[0].fila.Placa, 'TRK202');
    // Invalid writes nothing.
    const malos = [
      [{ valor: 0 }, 'valor'], [{ valor: '0' }, 'valor'], [{ valor: -5 }, 'valor'], [{ valor: '-5.000' }, 'valor'], [{ valor: 'abc' }, 'valor'], [{ valor: '' }, 'valor'],
      [{ valor: null }, 'valor'], [{ valor: NaN }, 'valor'], [{ valor: {} }, 'valor'], [{ valor: Infinity }, 'valor'],
      [{ clase: 'Otra' }, 'clase'], [{ clase: 'constructor' }, 'clase'], [{ clase: '' }, 'clase'],
      [{ fecha: '2026-02-30' }, 'fecha'], [{ fecha: '14/10/2026' }, 'fecha'], [{ fecha: '' }, 'fecha'], [{ fecha: '1999-01-01' }, 'fecha'],
      [{ detalle: '' }, 'detalle'], [{ detalle: '   ' }, 'detalle'], [{ detalle: 'x'.repeat(201) }, 'detalle'], [{ detalle: undefined }, 'detalle'],
      [{ placa: 'ZZZ999' }, 'placa'], [{ clave: '' }, 'clave'], [{ clave: 'corta' }, 'clave'], [{ clave: 'con espacios y <b>' }, 'clave'], [{ correo: 'otro@example.com' }, 'acceso'], [{ correo: '' }, 'acceso']];
    for (const [o, que] of malos) {
      const r = G.registrarAjuste(T, ok(o), ahora, 'T3');
      assert.strictEqual(r.ok, false, que + ' ' + JSON.stringify(o));
      assert.ok(!r.escrituras && r.error, que);
    }
    assert.strictEqual(G.saldoDiego(T).saldo, antes);
    // Same-key duplicate creates once.
    const U = hojaLlena(G), nm = U.Movimientos.length;
    const r1 = G.registrarAjuste(U, ok({ clave: 'clave-dup-0001' }), ahora, 'T4');
    aplicar(G, U, r1.escrituras);
    const r2 = G.registrarAjuste(U, ok({ clave: 'clave-dup-0001' }), new Date(ahora.getTime() + 5000), 'T5');
    assert.deepStrictEqual(J([r2.ok, r2.duplicado, r2.id, r2.escrituras]), [true, true, r1.id, []]);
    aplicar(G, U, r2.escrituras);
    assert.strictEqual(U.Movimientos.length, nm + 1);
    assert.strictEqual(U.Cambios.length, 1);
    // Different key creates another.
    const r3 = G.registrarAjuste(U, ok({ clave: 'clave-dup-0002' }), new Date(ahora.getTime() + 9000), 'T6');
    assert.strictEqual(r3.ok, true);
  })();

  // ---------- 5. latest period date after API reading ----------
  (function ordenCortes() {
    const serial = iso => Date.parse(iso + 'Z') / 86400000 + 25569;
    const enc = G.ESQUEMA.Cortes;
    for (const invertido of [false, true]) {
      const filas = [['C-000', serial('2026-01-01T00:00:00'), 0, 0, 0, 0, 0, 100000, '', ''], ['C-001', serial('2026-10-14T10:30:00'), 100000, 1, 0, 0, 0, 555000, '', '']];
      if (invertido) filas.reverse();
      const { T } = G.armarTablas({ Cortes: [enc].concat(filas), Movimientos: [G.ESQUEMA.Movimientos] });
      assert.strictEqual(T.Cortes.find(c => c.ID === 'C-001')['Fecha de cierre'], '2026-10-14 10:30:00'); // Sheets dates normalize to timestamp text.
      assert.strictEqual(G.saldoDiego(T).saldoAnterior, 555000, 'invertido=' + invertido);
      assert.strictEqual(G.ultimoCorte(T).ID, 'C-001');
    }
    // Mixed seed text date and new serial date.
    const { T } = G.armarTablas({ Cortes: [enc, ['C-000', '2026-01-01', 0, 0, 0, 0, 0, 100000, '', ''], ['C-001', serial('2026-10-14T10:30:00'), 0, 0, 0, 0, 0, 7, '', '']], Movimientos: [G.ESQUEMA.Movimientos] });
    assert.strictEqual(G.saldoDiego(T).saldoAnterior, 7);
  })();

  // ---------- 6. close period ----------
  (function cierre() {
    const ahora = new Date('2026-10-14T15:30:00Z');
    const T = hojaLlena(G), s0 = G.saldoDiego(T);
    const abiertasM = T.Movimientos.filter(m => m.Corte === '').map(m => m.ID).sort(), abiertasP = T['Pagos clientes'].filter(p => p.Corte === '').map(p => p.ID).sort();
    assert.deepStrictEqual(abiertasM, ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M9']);
    assert.deepStrictEqual(abiertasP, ['PC1', 'PC2', 'PC3']);
    const ent = (o) => Object.assign({ correo: ADMIN, clave: 'cierre-0001-aaaa', saldoVisto: s0.saldo }, o);
    const copia = JSON.stringify(T);
    // Changed balance rejects without writes.
    for (const v of [s0.saldo + 1, s0.saldo - 0.5, 0, null, 'abc', undefined]) {
      const r = G.cerrarCorte(T, ent({ saldoVisto: v }), ahora, 'T1');
      assert.deepStrictEqual(J([r.ok, r.error, r.escrituras]), [false, 'Los datos cambiaron; recargue.', null], String(v));
    }
    // Nonadmin/missing key.
    assert.strictEqual(G.cerrarCorte(T, ent({ correo: 'otro@example.com' }), ahora, 'T1').ok, false);
    assert.strictEqual(G.cerrarCorte(T, ent({ clave: '' }), ahora, 'T1').ok, false);
    assert.strictEqual(JSON.stringify(T), copia);
    // Valid close.
    const r = G.cerrarCorte(T, ent(), ahora, 'T1');
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(r.id, 'C-001');
    const cortesW = r.escrituras.filter(w => w.hoja === 'Cortes');
    assert.strictEqual(cortesW.length, 1);
    assert.deepStrictEqual(J(cortesW[0].fila), { ID: 'C-001', 'Fecha de cierre': '2026-10-14 10:30:00', 'Saldo anterior': 100000, Ganado: 180000, Adelantado: 80000,
      Recibido: 320000, Descuentos: 20000, 'Saldo final': 20000, PDF: '', 'Enviado a': '' });
    const sellados = r.escrituras.filter(w => w.op === 'actualizar').map(w => w.hoja + ':' + w.id).sort();
    assert.deepStrictEqual(J(sellados), ['Movimientos:M1', 'Movimientos:M2', 'Movimientos:M3', 'Movimientos:M4', 'Movimientos:M5', 'Movimientos:M6', 'Movimientos:M7', 'Movimientos:M9',
      'Pagos clientes:PC1', 'Pagos clientes:PC2', 'Pagos clientes:PC3']); // Only empty Corte, active/voided; old sealed rows excluded.
    assert.ok(r.escrituras.filter(w => w.op === 'actualizar').every(w => Object.keys(w.campos).join() === 'Corte' && w.campos.Corte === 'C-001'));
    const cam = r.escrituras.find(w => w.hoja === 'Cambios').fila, log = r.escrituras.find(w => w.hoja === 'Log').fila;
    assert.deepStrictEqual(J([cam.Origen, cam['Quién'], cam['Pestaña'], log.Origen, log.Usuario]), ['Tablero', ADMIN, 'Cortes', 'Tablero', ADMIN]);
    aplicar(G, T, r.escrituras);
    assert.strictEqual(T.Movimientos.find(m => m.ID === 'M8').Corte, 'C-000');
    assert.strictEqual(T['Pagos clientes'].find(p => p.ID === 'PC4').Corte, 'C-000');
    assert.strictEqual(T.Movimientos.filter(m => m.Corte === 'C-001').length, 8);
    // Postclose balance=final with zero new movements.
    const s1 = G.saldoDiego(T);
    assert.deepStrictEqual(J([s1.saldoAnterior, s1.ganado, s1.adelantado, s1.recibido, s1.descuentos, s1.pagosClientes, s1.saldo]), [20000, 0, 0, 0, 0, 0, 20000]);
    assert.strictEqual(G.modeloEstado(T, 'C-001').cuadra, true); // Reprint closed period reconciles sealed rows.
    // Repeated key/two admins one period; new key without records rejects.
    const dup = G.cerrarCorte(T, ent(), new Date(ahora.getTime() + 2000), 'T2');
    assert.deepStrictEqual(J([dup.ok, dup.duplicado, dup.id, dup.escrituras]), [true, true, 'C-001', []]);
    const otro = G.cerrarCorte(T, ent({ correo: ADMIN2, clave: 'cierre-0002-bbbb', saldoVisto: s0.saldo }), new Date(ahora.getTime() + 3000), 'T3');
    assert.strictEqual(otro.ok, false);
    assert.strictEqual(T.Cortes.length, 2);
    // Next period carries prior final balance.
    const aj = G.registrarAjuste(T, { correo: ADMIN, clave: 'ajuste-sig-0001', clase: 'Ganado', fecha: '2026-10-15', placa: '', detalle: 'viaje extra', valor: 30000 }, new Date('2026-10-16T12:00:00Z'), 'T4');
    aplicar(G, T, aj.escrituras);
    assert.strictEqual(G.saldoDiego(T).saldoAnterior, 20000);
    const r2 = G.cerrarCorte(T, { correo: ADMIN2, clave: 'cierre-0003-cccc', saldoVisto: 50000 }, new Date('2026-10-17T12:00:00Z'), 'T5');
    assert.strictEqual(r2.ok, true, JSON.stringify(r2));
    assert.deepStrictEqual(J([r2.id, r2.escrituras[0].fila['Saldo anterior'], r2.escrituras[0].fila['Saldo final']]), ['C-002', 20000, 50000]);
    aplicar(G, T, r2.escrituras);
    assert.strictEqual(T.Movimientos.filter(m => m.Corte === 'C-001').length, 8); // First period never resealed.
    assert.strictEqual(G.saldoDiego(T).saldoAnterior, 50000);
    // Empty period/missing ID.
    assert.match(G.cerrarCorte(base(G), { correo: ADMIN, clave: 'cierre-vacio-001', saldoVisto: 100000 }, ahora, 'T6').error, /No hay movimientos/);
    const S = hojaLlena(G); S.Movimientos[0].ID = '';
    assert.match(G.cerrarCorte(S, { correo: ADMIN, clave: 'cierre-sinid-001', saldoVisto: G.saldoDiego(S).saldo }, ahora, 'T7').error, /sin ID/);
  })();

  // ---------- 6b. inconsistent block/balance guard prevents close ----------
  (function guardaCuadre() { guardaCuadreDe(G); })();

  // ---------- 7. PDF escaped HTML/cell backgrounds ----------
  (function pdfHtml() {
    const T = hojaLlena(G), html = G.htmlEstadoCuenta(G.modeloEstado(T, ''), '');
    assert.ok(!html.includes('<b>x</b>') && html.includes('&lt;b&gt;x&lt;/b&gt; &amp;'), 'el detalle de la hoja va escapado');
    assert.ok(html.includes('bgcolor="#d7eb80"') && html.includes('Saldo final') && html.includes('$ 20.000'));
    assert.ok(html.includes('14/10/2026') === false && html.includes('10/10/2026'));
  })();

  // ---------- 8. bot rejects correction/void of sealed rows ----------
  (function bot() {
    const T = hojaLlena(G);
    T.Usuarios = [{ 'ID Telegram': 1000002, Nombre: 'Admin', Rol: 'administrador', Activo: true }];
    T.Movimientos[0]['ID mensaje bot'] = 555; T.Movimientos[0].Corte = 'C-001';
    const upd = { update_id: 9001, message: { message_id: 7, from: { id: 1000002 }, chat: { id: -1009999, type: 'supergroup' }, text: 'anular', reply_to_message: { message_id: 555 } } };
    const r = G.procesar(T, { update: upd, ia: null, ejecucion: 1 }, new Date());
    assert.ok(r.respuesta.texto.includes('Ese registro ya está en un corte cerrado; pida un ajuste en el tablero.'), r.respuesta.texto);
    assert.deepStrictEqual(J(r.escrituras.map(w => w.hoja)), ['Log']); // Only Log, no movements/Cambios.
  })();

  // ---------- 9. doGet/API access ----------
  (function acceso() {
    const { G, e } = crear();
    const T = hojaLlena(G);
    e.ss = montar(G, T, e);
    e.correo = '';
    let o = G.doGet({ parameter: {} });
    assert.ok(o.html.includes('Sin acceso') && !o.html.includes('20.000') && !o.html.includes('Diego le debe') && !o.html.includes('TRK202'));
    e.correo = 'otro@example.com';
    o = G.doGet({ parameter: {} });
    assert.ok(o.html.includes('Sin acceso'));
    e.correo = ADMIN.toUpperCase() + ' ';
    o = G.doGet({ parameter: {} });
    assert.ok(o.plantilla === 'Index' && JSON.parse(o.inicial).hoy.saldo === 20000 && !o.inicial.includes('<'), 'el administrador entra'); // Escape < in JSON.
    o = G.doGet({ parameter: { k: 'lo-que-sea' } });
    assert.ok(o.html.includes('Próximamente') && !o.html.includes('20.000'));
    // Never authorize effective owner; only accessing identity counts.
    e.correo = '';
    for (const f of ['api_cuenta', 'api_pdfEstado']) assert.throws(() => G[f](), /Acceso no autorizado/, f);
    const gridAntes = JSON.stringify(e.grid);
    assert.throws(() => G.api_ajuste({ clave: 'abcdefgh1234', clase: 'Ganado', fecha: '2026-10-13', detalle: 'x', valor: 5 }), /Acceso no autorizado/);
    assert.throws(() => G.api_cerrar({ clave: 'abcdefgh1234', saldoVisto: 20000 }), /Acceso no autorizado/);
    assert.throws(() => G.api_reintentar('C-000'), /Acceso no autorizado/);
    assert.strictEqual(JSON.stringify(e.grid), gridAntes);
    assert.strictEqual(e.orden.filter(x => x === 'release').length, e.orden.filter(x => x === 'flush').length); // Always release lock after flush.
  })();

  // ---------- 10. mocked end-to-end adjustment/close/PDF/Drive/email/retry ----------
  function montar(G, T, e) {
    const grid = {};
    Object.keys(G.ESQUEMA).forEach(nm => {
      grid[nm] = [G.ESQUEMA[nm].slice()];
      (T[nm] || []).forEach(f => grid[nm].push(G.ESQUEMA[nm].map(c => (f[c] === undefined ? '' : f[c]))));
    });
    e.grid = grid;
    const hoja = nm => ({
      getDataRange: () => ({ getValues: () => grid[nm].map(r => r.slice()) }),
      getLastColumn: () => grid[nm][0].length, getLastRow: () => grid[nm].length,
      appendRow: f => { grid[nm].push(f.slice()); },
      getRange: (r, c, nr, nc) => ({ getValues: () => grid[nm].slice(r - 1, r - 1 + nr).map(f => f.slice(c - 1, c - 1 + nc)),
        setValues: v => v.forEach((f, i) => f.forEach((x, j) => { (grid[nm][r - 1 + i] = grid[nm][r - 1 + i] || [])[c - 1 + j] = x; })) }) });
    return { getSheetByName: nm => (grid[nm] ? hoja(nm) : null), getId: () => 'SS1', getSpreadsheetTimeZone: () => 'America/Bogota' };
  }
  const col = (grid, hoja, c) => grid[hoja][0].indexOf(c);
  const valor = (grid, hoja, id, c) => grid[hoja].find((f, i) => i > 0 && f[0] === id)[col(grid, hoja, c)];

  (function e2e() {
    const { G, e } = crear();
    e.ss = montar(G, hojaLlena(G), e);
    const g = e.grid;
    e.correo = ADMIN;
    const v0 = G.api_cuenta();
    assert.strictEqual(v0.hoy.saldo, 20000);
    // Same-key adjustment once; updated screen returned.
    const f = { clave: 'form-0001-abcdef', clase: 'Ganado', fecha: '2026-10-13', placa: 'TRK202', detalle: 'Ajuste ruta', valor: '30.000' };
    const a1 = J(G.api_ajuste(f)), a2 = J(G.api_ajuste(f));
    assert.deepStrictEqual([a1.ok, a1.vista.hoy.saldo, a2.ok, a2.duplicado, a2.vista.hoy.saldo], [true, 50000, true, true, 50000]);
    assert.strictEqual(g.Movimientos.length, 11);
    assert.strictEqual(valor(g, 'Movimientos', a1.id, 'Origen'), 'Tablero');
    assert.ok(!('_T' in a1) && !('modelo' in a1)); // No heavy artifacts returned to browser.
    assert.deepStrictEqual(J(G.api_ajuste(Object.assign({}, f, { clave: 'form-0002-abcdef', valor: 0 }))).ok, false);
    // Stale balance close rejects, no writes.
    const filasAntes = JSON.stringify(g);
    const mal = J(G.api_cerrar({ clave: 'cierre-e2e-0001', saldoVisto: 20000 }));
    assert.deepStrictEqual([mal.ok, mal.error], [false, 'Los datos cambiaron; recargue.']);
    assert.strictEqual(JSON.stringify(g), filasAntes);
    // Valid close seals, stores PDF, emails Diego/admin copies.
    const c1 = J(G.api_cerrar({ clave: 'cierre-e2e-0002', saldoVisto: 50000 }));
    assert.deepStrictEqual([c1.ok, c1.id, c1.entrega.errores.length], [true, 'C-001', 0]);
    assert.strictEqual(g.Cortes.length, 3);
    assert.strictEqual(valor(g, 'Cortes', 'C-001', 'Saldo final'), 50000);
    assert.strictEqual(valor(g, 'Cortes', 'C-001', 'PDF'), 'https://drive/Estado de cuenta C-001.pdf');
    assert.ok(String(valor(g, 'Cortes', 'C-001', 'Enviado a')).startsWith(DIEGOMAIL));
    assert.strictEqual(e.mails.length, 1);
    assert.deepStrictEqual(J([e.mails[0].to, e.mails[0].cc]), [DIEGOMAIL, 'admin@example.com,mario@example.com']);
    assert.ok(e.mails[0].subject.includes('Hoy se cuadraron cuentas, saldo $ 50.000') && e.mails[0].body.includes('La empresa le debe a Diego') && e.mails[0].attachments.length === 1);
    assert.strictEqual(e.props.CARPETA_CORTES_ID, 'F1'); // Folder created once, ID in properties.
    assert.strictEqual(c1.vista.hoy.saldoAnterior, 50000);
    assert.strictEqual(c1.vista.reintento, '');
    const cMov = g.Movimientos.slice(1).filter(f2 => f2[col(g, 'Movimientos', 'Corte')] === 'C-001').length;
    assert.strictEqual(cMov, 9);
    // Same-key double tap no extra period/email.
    const c2 = J(G.api_cerrar({ clave: 'cierre-e2e-0002', saldoVisto: 50000 }));
    assert.deepStrictEqual([c2.ok, c2.duplicado], [true, true]);
    assert.deepStrictEqual([g.Cortes.length, e.mails.length, e.carpetas.length, e.carpetas[0].archivos.length], [3, 1, 1, 1]);
    // Always flush before lock release.
    e.orden.forEach((x, i) => { if (x === 'release') assert.strictEqual(e.orden[i - 1], 'flush'); });
    // Retry with nothing pending does not duplicate.
    assert.strictEqual(J(G.api_reintentar('C-001')).entrega.errores.length, 0);
    assert.deepStrictEqual([e.mails.length, e.carpetas[0].archivos.length], [1, 1]);

    // Email failure leaves closed period; retry completes without duplicating close.
    e.mailFalla = true;
    G.api_ajuste({ clave: 'form-0003-abcdef', clase: 'Descuento', fecha: '2026-10-14', detalle: 'Seguro', valor: 10000 });
    const c3 = J(G.api_cerrar({ clave: 'cierre-e2e-0003', saldoVisto: 40000 }));
    assert.deepStrictEqual([c3.ok, c3.id], [true, 'C-002']);
    assert.ok(c3.entrega.errores.length === 1 && c3.entrega.errores[0].startsWith('Correo:'));
    assert.strictEqual(c3.vista.reintento, 'C-002');
    assert.strictEqual(valor(g, 'Cortes', 'C-002', 'Enviado a'), '');
    assert.ok(valor(g, 'Cortes', 'C-002', 'PDF'));
    e.mailFalla = false;
    const rr = J(G.api_reintentar('C-002'));
    assert.deepStrictEqual([rr.ok, rr.entrega.errores.length, rr.vista.reintento, g.Cortes.length, e.mails.length, e.carpetas[0].archivos.length], [true, 0, '', 4, 2, 2]);
    assert.ok(valor(g, 'Cortes', 'C-002', 'Enviado a'));
    assert.strictEqual(J(G.api_cuenta()).hoy.saldoAnterior, 40000);
    // Open-statement PDF.
    const p = G.api_pdfEstado();
    assert.ok(p.nombre.endsWith('.pdf') && p.base64);
    // Reread dates still select correct next period.
    assert.strictEqual(G.saldoDiego(G.armarTablas(Object.fromEntries(Object.keys(g).map(k => [k, g[k]]))).T).saldoAnterior, 40000);
  })();

  // ---------- T-024 Home/pending prices ----------
  (function precios() {
    // 1. Unpriced purchases/sales/freight, editable Diego prices; exclude void/internal/admin prices.
    const T = hojaPrecios(G), L = J(G.listaPrecios(T));
    assert.deepStrictEqual(L.map(x => x.id), ['IA4', 'IA1', 'IA5', 'CBF']); // By date.
    assert.deepStrictEqual(L.map(x => x.tipo), ['compra', 'compra', 'venta', 'flete']);
    assert.deepStrictEqual(L.map(x => x.deDiego), [true, false, false, false]);
    assert.ok(!('inv' in L[0]) && !('cob' in L[0]));
    const m = L.find(x => x.id === 'IA5');
    assert.deepStrictEqual([m.cliente, m.cantidad, m.pagado, m.precio, m.lugar, m.unidad], ['Luis Herrera', 400, 100000, 0, 'Lomavista', 'bulto']); // Voided payment excluded.
    assert.ok(!L.some(x => ['IA2', 'IA3', 'CBI', 'CBA', 'CBM'].includes(x.id)), 'CBM va ligado a su venta; no sale dos veces');

    // 2. Home balance/unpriced/customer debts/expiry<=15days.
    T['Vehículos'][0]['SOAT vence'] = '2026-11-02'; T['Vehículos'][0]['Técnico-mecánica vence'] = '2026-11-20'; T['Vehículos'][1]['Seguro vence'] = '2026-10-10';
    const v = J(G.vistaTablero(T, ADMIN, AHORA)), ini = v.inicio;
    assert.deepStrictEqual([ini.saldo, ini.sinPrecio, v.precios.length], [G.saldoDiego(T).saldo, 3, 4]);
    assert.deepStrictEqual(ini.cobros, [{ cliente: 'Don Pedro', debe: 700000, desde: '2026-09-20', items: [
      { fecha: '2026-09-20', placa: 'TRK202', producto: '', cantidad: 10, saldo: 200000 }, { fecha: '2026-10-01', placa: 'TRK202', producto: '', cantidad: 10, saldo: 500000 }] }]); // Sum priced debts; unpriced not debt.
    assert.strictEqual(ini.totalCobros, 700000);
    assert.deepStrictEqual(ini.vencimientos.map(x => [x.placa, x.docs.map(d => d.nombre + ':' + d.nivel)]), [['TRK202', ['SOAT:pronto']], ['TRK101', ['Seguro:vencido']]]);
    const dom = G.textoCobros(T); // Same Sunday criteria.
    assert.ok(dom.includes('Don Pedro') && dom.includes(G.pesos(700000)) && dom.includes('20/09/2026'), dom);

    // 3. Fertilizer purchase.
    const r = G.guardarPrecio(T, pEnt({ precio: '2.000' }), AHORA, 'E1');
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.deepStrictEqual(J(r.escrituras.filter(w => w.op === 'actualizar')), [{ op: 'actualizar', hoja: 'Inventario abono', id: 'IA1', campos: { 'Precio unitario': 2000, Total: 100000, 'Precio dado por': ADMIN } }]);
    assert.strictEqual(r.total, 100000);
    const cam = r.escrituras.filter(w => w.hoja === 'Cambios').map(w => w.fila), log = r.escrituras.find(w => w.hoja === 'Log').fila;
    assert.deepStrictEqual(J(cam.map(c => c.Campo)), ['Precio unitario', 'Total', 'Precio dado por']);
    assert.ok(cam.every(c => c['Quién'] === ADMIN && c.Origen === 'Tablero' && c['Pestaña'] === 'Inventario abono' && c['ID registro'] === 'IA1' && c.Motivo.includes('clave:precio-0001-aaaa')));
    assert.deepStrictEqual([log.Origen, log.Usuario], ['Tablero', ADMIN]);
    aplicar(G, T, r.escrituras);
    assert.ok(!G.listaPrecios(T).some(x => x.id === 'IA1'), 'ya no está pendiente');
    assert.strictEqual(filaDe(T, 'Cobros', 'CBM').Estado, 'sin precio'); // Only targeted row changed.

    // 4. Same-key duplicate one write.
    const nc = T.Cambios.length, nl = T.Log.length;
    const d = G.guardarPrecio(T, pEnt({ precio: '2.000' }), new Date(AHORA.getTime() + 4000), 'E2');
    assert.deepStrictEqual(J([d.ok, d.duplicado, d.id, d.escrituras]), [true, true, 'IA1', []]);
    aplicar(G, T, d.escrituras);
    assert.deepStrictEqual([T.Cambios.length, T.Log.length], [nc, nl]);

    // 5. Fertilizer sale/charge with prior illustrative payment.
    casoLuis(G);
    const U = hojaPrecios(G), rv = G.guardarPrecio(U, pEnt({ id: 'IA5', precio: 300, clave: 'precio-luis-01' }), AHORA, 'E1');
    assert.deepStrictEqual(J(rv.escrituras.filter(w => w.op === 'actualizar')), [
      { op: 'actualizar', hoja: 'Inventario abono', id: 'IA5', campos: { 'Precio unitario': 300, Total: 120000, 'Precio dado por': ADMIN } },
      { op: 'actualizar', hoja: 'Cobros', id: 'CBM', campos: { 'Precio unitario': 300, Total: 120000, Estado: 'parcial' } }]);
    assert.deepStrictEqual(J(rv.escrituras.filter(w => w.hoja === 'Cambios').map(w => w.fila['Pestaña'] + '.' + w.fila.Campo)),
      ['Inventario abono.Precio unitario', 'Inventario abono.Total', 'Inventario abono.Precio dado por', 'Cobros.Precio unitario', 'Cobros.Total', 'Cobros.Estado']);
    // Below already-paid total rejected, no writes.
    const bajo = G.guardarPrecio(U, pEnt({ id: 'IA5', precio: 200, clave: 'precio-luis-02' }), AHORA, 'E1');
    assert.deepStrictEqual(J([bajo.ok, /por debajo de lo ya pagado/.test(bajo.error), bajo.escrituras]), [false, true, null]);

    // 6. Customer freight.
    const F = hojaPrecios(G), rf = G.guardarPrecio(F, pEnt({ id: 'CBF', precio: 1500, clave: 'precio-flete-001' }), AHORA, 'E1');
    assert.deepStrictEqual(J(rf.escrituras.filter(w => w.op === 'actualizar')), [{ op: 'actualizar', hoja: 'Cobros', id: 'CBF', campos: { 'Precio unitario': 1500, Total: 15000, Estado: 'pendiente' } }]);
    aplicar(G, F, rf.escrituras);
    assert.deepStrictEqual(J(G.cobrosPorCliente(F).map(x => [x.cliente, x.debe])), [['Don Pedro', 715000]]); // Now debt.
    // Whole total always.
    const Q = hojaPrecios(G); Q['Inventario abono'][0].Cantidad = 33;
    assert.strictEqual(G.guardarPrecio(Q, pEnt({ precio: 1234 }), AHORA, 'E1').total, 40722);

    // 7. Edit Diego-set price.
    const K = hojaPrecios(G), rk = G.guardarPrecio(K, pEnt({ id: 'IA4', precio: 3500, precioVisto: 3000, clave: 'precio-diego-001' }), AHORA, 'E1');
    assert.strictEqual(rk.ok, true);
    const ck = rk.escrituras.filter(w => w.hoja === 'Cambios').map(w => [w.fila.Campo, w.fila.Antes, w.fila['Después']]);
    assert.deepStrictEqual(J(ck), [['Precio unitario', 3000, 3500], ['Total', 30000, 35000], ['Precio dado por', 'Diego', ADMIN]]);
    aplicar(G, K, rk.escrituras);
    assert.ok(!G.listaPrecios(K).some(x => x.id === 'IA4')); // Now admin-priced.

    // 8. Rejections write nothing.
    const malos = [
      [{ precio: 0 }, 'precio'], [{ precio: '0' }, 'precio'], [{ precio: -5 }, 'precio'], [{ precio: '-2.000' }, 'precio'], [{ precio: 'abc' }, 'precio'], [{ precio: '' }, 'precio'],
      [{ precio: null }, 'precio'], [{ precio: NaN }, 'precio'], [{ precio: 2.5 }, 'precio'], [{ precio: 1e9 }, 'precio'], [{ precio: {} }, 'precio'],
      [{ clave: '' }, 'clave'], [{ clave: 'corta' }, 'clave'], [{ correo: 'otro@example.com' }, 'acceso'], [{ correo: '' }, 'acceso'],
      [{ id: 'IA2' }, 'anulado'], [{ id: 'IA3' }, 'precio de administrador'], [{ id: 'CBI' }, 'interno'], [{ id: 'CBA' }, 'cobro anulado'], [{ id: 'CB1' }, 'cobro con precio'],
      [{ id: 'CBM' }, 'cobro de venta (se guarda por la venta)'], [{ id: 'nada' }, 'no existe'], [{ id: 'IA4', precioVisto: 0, precio: 3500 }, 'cambió: Diego ya había puesto precio'],
      [{ id: 'IA4', precioVisto: 2000, precio: 3500 }, 'cambió: precio distinto al visto'], [{ id: 'IA4', precioVisto: 3000, precio: 3000 }, 'mismo precio']];
    for (const [o, que] of malos) {
      const x = G.guardarPrecio(hojaPrecios(G), pEnt(o), AHORA, 'E1');
      assert.strictEqual(x.ok, false, que + ' ' + JSON.stringify(o));
      assert.ok(!x.escrituras && x.error, que);
    }
    // Concurrent void of purchase/sale gives clear error.
    for (const [hoja, id, id2] of [['Inventario abono', 'IA5', 'IA5'], ['Inventario abono', 'IA1', 'IA1'], ['Cobros', 'CBF', 'CBF'], ['Cobros', 'CBM', 'IA5']]) {
      const A = hojaPrecios(G); filaDe(A, hoja, id).Estado = 'anulado';
      const x = G.guardarPrecio(A, pEnt({ id: id2, clave: 'precio-anul-0001' }), AHORA, 'E1');
      assert.deepStrictEqual(J([x.ok, /ya cambió/.test(x.error), x.escrituras]), [false, true, null], hoja + id);
    }
    // Cash charge cannot reprice, like bot.
    const C = hojaPrecios(G); C['Pagos clientes'].push(pago(G, { ID: 'PGM', 'ID del cobro': 'CBM', Valor: 1 }));
    assert.ok(/de contado/.test(G.guardarPrecio(C, pEnt({ id: 'IA5', precio: 300 }), AHORA, 'E1').error));
    // Sale/charge quantity mismatch never guessed.
    const D = hojaPrecios(G); filaDe(D, 'Cobros', 'CBM').Cantidad = 399;
    assert.ok(/cantidades distintas/.test(G.guardarPrecio(D, pEnt({ id: 'IA5', precio: 300 }), AHORA, 'E1').error));
    // ADMIN2 case/whitespace accepted; driver/other denied.
    assert.strictEqual(G.guardarPrecio(hojaPrecios(G), pEnt({ correo: ADMIN2 }), AHORA, 'E1').ok, true);
    assert.strictEqual(G.guardarPrecio(hojaPrecios(G), pEnt({ correo: DIEGOMAIL }), AHORA, 'E1').ok, false);

    // 9. Mock end-to-end admin save/updated screen/dedupe/authorization.
    const { G: G2, e } = crear();
    e.ss = montar(G2, hojaPrecios(G2), e);
    const g = e.grid;
    e.correo = ADMIN2.toUpperCase();
    const f = { clave: 'precio-e2e-00001', id: 'IA5', precio: '300', precioVisto: 0 };
    const p1 = J(G2.api_precio(f)), p2 = J(G2.api_precio(f));
    assert.deepStrictEqual([p1.ok, p1.id, p2.ok, p2.duplicado], [true, 'IA5', true, true]);
    assert.ok(!p1.vista.precios.some(x => x.id === 'IA5') && p1.vista.inicio.sinPrecio === 2); // No reload: priced row removed from list.
    assert.deepStrictEqual([valor(g, 'Cobros', 'CBM', 'Estado'), valor(g, 'Cobros', 'CBM', 'Total'), valor(g, 'Inventario abono', 'IA5', 'Precio dado por')], ['parcial', 120000, ADMIN2]);
    assert.strictEqual(g.Cambios.length - 1, 6); // Six fields once.
    const lg = g.Log[g.Log.length - 1];
    assert.deepStrictEqual([lg[g.Log[0].indexOf('Origen')], lg[g.Log[0].indexOf('Usuario')]], ['Tablero', ADMIN2]);
    assert.ok(!('_T' in p1) && !('modelo' in p1));
    const rv2 = J(G2.api_precio({ clave: 'precio-e2e-00002', id: 'IA5', precio: 400, precioVisto: 0 })); // Concurrent new price never overwritten.
    assert.strictEqual(rv2.ok, false);
    assert.strictEqual(valor(g, 'Cobros', 'CBM', 'Total'), 120000);
    e.correo = DIEGOMAIL;
    const antes = JSON.stringify(g);
    assert.throws(() => G2.api_precio({ clave: 'precio-e2e-00003', id: 'IA1', precio: 2000, precioVisto: 0 }), /Acceso no autorizado/);
    assert.strictEqual(JSON.stringify(g), antes);
    e.orden.forEach((x, i) => { if (x === 'release') assert.strictEqual(e.orden[i - 1], 'flush'); });
    // 10. Screen sections/escaping.
    const html = fs.readFileSync(path.join(__dirname, 'Index.html'), 'utf8');
    assert.ok(html.includes('data-t="precios"') && html.includes('api_precio') && html.includes('function vPrecios') && html.includes('function vCobros'));
  })();

  console.log('OK: pruebas del tablero (T-013) completas');
})();

// Force VM saldoDiego/block disagreement; close must refuse without writes.
function guardaCuadreDe(G, ctxOf) {
  const T = hojaLlena(G), real = G.saldoDiego;
  const ahora = new Date('2026-10-14T15:30:00Z');
  for (const sesgo of [{ ganado: 1, saldo: 1 }, { saldo: 1 }]) { // Different groups or same groups/different net.
    const sk = Object.assign({}, J(real(T)));
    Object.keys(sesgo).forEach(k => { sk[k] += sesgo[k]; });
    G.__setSaldo(sk);
    const m = G.modeloEstado(T, '');
    assert.strictEqual(m.cuadra, false, JSON.stringify(sesgo));
    const r = G.cerrarCorte(T, { correo: ADMIN, clave: 'cierre-cuad-0001', saldoVisto: m.saldo }, ahora, 'T1');
    assert.deepStrictEqual(J([r.ok, /no cuadran/.test(r.error), r.escrituras]), [false, true, null]);
  }
  G.__setSaldo(null);
}

// ---------- 11. mutation detects missing empty-Corte sealing filter ----------
(function mutacion() {
  const FILTRO = "return tab(T, hoja).filter(function (r) { return String(r.Corte).trim() === ''; });";
  const fuente = fs.readFileSync(path.join(__dirname, 'Tablero.gs'), 'utf8');
  assert.ok(fuente.includes(FILTRO), 'el filtro del sellado cambió: actualice la mutación');
  const sella = (G) => { // Same real-close check: sealed stays sealed.
    const T = hojaLlena(G);
    const r = G.cerrarCorte(T, { correo: ADMIN, clave: 'cierre-mut-0001', saldoVisto: G.saldoDiego(T).saldo }, new Date('2026-10-14T15:30:00Z'), 'T1');
    assert.strictEqual(r.ok, true);
    aplicar(G, T, r.escrituras);
    assert.strictEqual(T.Movimientos.find(m => m.ID === 'M8').Corte, 'C-000');
    assert.strictEqual(T['Pagos clientes'].find(p => p.ID === 'PC4').Corte, 'C-000');
  };
  sella(crear().G); // Original passes.
  const mutada = crear({ 'Tablero.gs': s => s.replace(FILTRO, 'return tab(T, hoja).slice();') }).G;
  assert.throws(() => sella(mutada), /C-001|C-000/, 'la mutación debe hacer fallar la prueba');
  // Balance/net guard mutations.
  const GUARDA = "if (!m.cuadra) return", NETO = "Math.abs(neto - r.saldo) < 0.005";
  assert.ok(fuente.includes(GUARDA) && fuente.includes(NETO));
  guardaCuadreDe(crear().G);
  assert.throws(() => guardaCuadreDe(crear({ 'Tablero.gs': s => s.replace(GUARDA, 'if (false) return') }).G), 'sin la guarda debe fallar');
  assert.throws(() => guardaCuadreDe(crear({ 'Tablero.gs': s => s.replace(NETO, 'true') }).G), 'sin el neto debe fallar');
  console.log('OK: mutación detectada (sin el filtro de Corte vacío la prueba de sellado falla)');
})();

// ---------- T-017 expiry card ----------
(function vencimientosTarjeta() {
  const { G } = crear();
  const T = base(G);
  const V = T['Vehículos'];
  V[0]['SOAT vence'] = '2026-11-02';           // 15days soon.
  V[0]['Técnico-mecánica vence'] = '2026-11-03'; // 16days normal.
  V[0]['SOAT archivo'] = 'https://drive.google.com/file/d/X/view';
  V[1]['Seguro vence'] = '2026-10-10';         // Expired.
  const hoy = new Date('2026-10-18T14:00:00Z');
  const v = J(G.vistaTablero(T, ADMIN, hoy).vencimientos);
  const d = (i, n) => v[i].docs.find(x => x.nombre === n);
  assert.deepStrictEqual(v.map(x => x.placa), ['TRK202', 'TRK101']);
  assert.deepStrictEqual([d(0, 'SOAT').nivel, d(0, 'SOAT').dias, d(0, 'Técnico-mecánica').nivel, d(0, 'Seguro').nivel], ['pronto', 15, 'normal', 'sindato']);
  assert.deepStrictEqual([d(1, 'Seguro').nivel, d(1, 'Seguro').dias], ['vencido', -8]);
  assert.ok(!JSON.stringify(v).includes('drive.google'), 'sin enlaces en el tablero');
  console.log('OK: tarjeta Vencimientos (normal / pronto ≤15 días / vencido)');
})();

// ---------- T-024 state-recalculation/changed-record guard mutation ----------
(function mutacionPrecios() {
  const ESTADO = 'estado = estadoCobro(total, pagado);', VISTO = 'Math.abs((num(e.precioVisto) || 0) - it.precio) > 0.005';
  const fuente = fs.readFileSync(path.join(__dirname, 'Tablero.gs'), 'utf8');
  assert.ok(fuente.includes(ESTADO) && fuente.includes(VISTO), 'el código de precios cambió: actualice la mutación');
  casoLuis(crear().G); guardaPrecioViejo(crear().G); // Original passes.
  assert.throws(() => casoLuis(crear({ 'Tablero.gs': s => s.replace(ESTADO, "estado = estadoCobro(total, 0);") }).G), 'sin contar lo pagado el estado queda mal y la prueba falla');
  assert.throws(() => casoLuis(crear({ 'Tablero.gs': s => s.replace(ESTADO, "estado = 'pendiente';") }).G), 'estado fijo debe fallar');
  assert.throws(() => guardaPrecioViejo(crear({ 'Tablero.gs': s => s.replace(VISTO, 'false') }).G), 'sin la guarda de precio visto debe fallar');
  console.log('OK: mutación detectada (recálculo de estado y guarda de registro cambiado)');
})();

// ---------- T-025 fertilizer inventory/month/FIFO ----------
function hojaAbono(G) {
  const T = base(G);
  const iv = (id, fecha, placa, mov, cant, precio, extra = {}) => fila(G, 'Inventario abono', Object.assign({ ID: id, Fecha: fecha + ' 08:00:00', Placa: placa, Movimiento: mov,
    Cantidad: cant, 'Precio unitario': precio, Total: precio ? cant * precio : '', Estado: 'activo', Lugar: mov === 'compra' ? 'Bodega' : '', Cliente: mov === 'venta' ? 'Cli ' + id : '' }, extra));
  T['Inventario abono'] = [
    iv('A1', '2026-08-05', 'TRK202', 'compra', 100, 10000), iv('A2', '2026-09-10', 'TRK202', 'compra', 50, 12000),
    iv('AX', '2026-08-06', 'TRK202', 'compra', 1000, 1, { Estado: 'anulado' }), iv('AY', '2026-10-01', 'TRK202', 'venta', 500, 99999, { Estado: 'anulado' }),
    iv('V1', '2026-10-05', 'TRK202', 'venta', 120, 20000),   // Consume across two differently priced batches.
    iv('V2', '2026-10-06', 'TRK202', 'venta', 40, 20000),    // Second batch shortage.
    iv('A3', '2026-10-07', 'TRK202', 'compra', 20, 13000),
    iv('V3', '2026-10-08', 'TRK202', 'venta', 20, 15000),    // Subsequent new batch still works.
    iv('B1', '2026-10-01', 'TRK101', 'compra', 10, 5000),
    iv('B2', '2026-10-02', 'TRK101', 'venta', 5, 0),         // Unpriced.
    iv('B3', '2026-10-03', 'TRK101', 'venta', 5, 8000),      // Illustrative consumed cost.
    iv('C1', '2026-10-01', 'ZZZ000', 'compra', 10, 0),       // Unpriced purchase.
    iv('C2', '2026-10-02', 'ZZZ000', 'venta', 4, 9000)];
  return T;
}
function pruebasAbono(G) {
  const T = hojaAbono(G), ahora = new Date('2026-10-15T15:00:00Z');
  const a = J(G.vistaAbono(T, '', ahora)), v = id => a.movimientos.find(x => x.id === id);
  assert.deepStrictEqual([a.mes, a.actual], ['2026-10', '2026-10']);
  // (a) Two-price FIFO cost/profit calculation.
  assert.deepStrictEqual([v('V1').costo, v('V1').ganancia, v('V1').motivo], [1240000, 1160000, '']);
  // (d) Overinventory sale pending shortage; next purchase/sale works.
  assert.deepStrictEqual([v('V2').ganancia, v('V2').motivo], [null, 'faltan 10 bultos comprados']);
  assert.deepStrictEqual([v('V3').costo, v('V3').ganancia], [260000, 40000]);
  // (b) Unpriced sale pending, never zero; consumed inventory retained.
  assert.deepStrictEqual([v('B2').ganancia, v('B2').motivo], [null, 'venta sin precio']);
  assert.deepStrictEqual([v('B3').costo, v('B3').ganancia], [25000, 15000]);
  assert.ok(v('B2').sinPrecio && !v('B3').sinPrecio);
  // (c) Unpriced consumed purchase pending with date.
  assert.deepStrictEqual([v('C2').ganancia, v('C2').motivo], [null, 'compra sin precio del 01/10']);
  // (e) Separate vehicles and summaries.
  const r = p => a.resumen.find(x => x.placa === p);
  assert.deepStrictEqual([r('TRK202').comprados, r('TRK202').vendidos, r('TRK202').valorVendido, r('TRK202').costo, r('TRK202').ganancia, r('TRK202').pendientes], [20, 180, 3500000, 1500000, 1200000, 1]);
  assert.deepStrictEqual([r('TRK101').ganancia, r('TRK101').pendientes, r('ZZZ000').ganancia, r('ZZZ000').pendientes], [15000, 1, 0, 1]);
  assert.deepStrictEqual([a.gananciaMes, a.pendientesMes], [1215000, 3]);
  // (f) Ignore voids in list/cost/stock.
  assert.ok(!v('AX') && !v('AY'));
  // Inventory equals /abono shared function; retain negative for red display.
  const inv = G.inventarioPorPlaca(T);
  assert.deepStrictEqual(a.inventario.map(x => [x.placa, x.bultos]), Object.keys(inv).filter(p => Math.abs(inv[p]) > 0.005).sort().map(p => [p, inv[p]]));
  assert.deepStrictEqual(a.inventario.map(x => x.placa), ['TRK202', 'ZZZ000']); // Zero TRK101 omitted like /abono.
  assert.strictEqual(a.inventario.find(x => x.placa === 'TRK202').bultos, -10); // Visible shortage.
  // (g) Month filters list; costing uses full history.
  const sep = J(G.vistaAbono(T, '2026-09', ahora));
  assert.deepStrictEqual(sep.movimientos.map(x => x.id), ['A2']);
  assert.deepStrictEqual([sep.gananciaMes, sep.pendientesMes, sep.inventario.length], [0, 0, a.inventario.length]);
  const ago = J(G.vistaAbono(T, '2026-08', ahora));
  assert.deepStrictEqual(ago.movimientos.map(x => x.id), ['A1']);
  assert.strictEqual(J(G.vistaAbono(T, 'basura', ahora)).mes, '2026-10'); // Invalid month defaults current.
  assert.strictEqual(J(G.vistaAbono(T, '2026-13', ahora)).mes, '2026-10');
  // Same timestamp respects sheet purchase/sale order; initial view includes tab.
  assert.strictEqual(J(G.vistaTablero(T, ADMIN, ahora)).abono.mes, '2026-10');
  // Pure, no writes.
  assert.deepStrictEqual(J(T['Inventario abono'].length), 13);
}
(function abono() {
  pruebasAbono(crear().G);
  console.log('OK: pestaña Abono (PEPS por carro, pendientes, mes, inventario = /abono)');
})();

// ---------- T-025 FIFO->LIFO/average mutations ----------
(function mutacionPeps() {
  const LOTE = 'const l = cola[0], t', SACA = 'cola.shift();', COSTO = 'if (l.precio > 0) costo += t * l.precio;';
  const fuente = fs.readFileSync(path.join(__dirname, 'Tablero.gs'), 'utf8');
  assert.ok(fuente.includes(LOTE) && fuente.includes(SACA) && fuente.includes(COSTO), 'el PEPS cambió: actualice la mutación');
  const ueps = s => s.replace(LOTE, 'const l = cola[cola.length - 1], t').replace(SACA, 'cola.pop();');
  const prom = s => s.replace(COSTO, 'if (l.precio > 0) costo += t * (cola.reduce(function (x, y) { return x + y.precio; }, 0) / cola.length);');
  assert.throws(() => pruebasAbono(crear({ 'Tablero.gs': ueps }).G), 'UEPS debe fallar');
  assert.throws(() => pruebasAbono(crear({ 'Tablero.gs': prom }).G), 'promedio debe fallar');
  console.log('OK: mutación detectada (UEPS y promedio hacen fallar las pruebas de Abono)');
})();

// ---------- T-026 freight debts/detail/month/customer PDF ----------
const COMPRA = 8765432; // Fertilizer purchase cost must never appear in screen/PDF.
function hojaFletes(G) {
  const T = base(G);
  const cb = (id, fecha, placa, cli, tipo, cant, prod, pu, total, estado, extra = {}) => fila(G, 'Cobros', Object.assign({ ID: id, Fecha: fecha + ' 08:00:00', Placa: placa, Cliente: cli,
    Tipo: tipo, Cantidad: cant, Producto: prod, 'Lugar de cargue': 'Mina', 'Lugar de descargue': 'Pueblo Claro', 'Precio unitario': pu, Total: total, Estado: estado }, extra));
  T.Cobros = [
    cb('F1', '2026-09-20', 'TRK202', 'Don Pedro', 'flete', 100, 'Ruedas limpias', 1000, 100000, 'parcial'),
    cb('F2', '2026-10-05', 'TRK202', 'Don Pedro', 'abono', 10, 'abono', 20000, 200000, 'pendiente', { 'Precio de compra': COMPRA }),
    cb('F3', '2026-10-06', 'TRK101', 'Don Pedro', 'flete', 50, 'Ruedas', '', 0, 'sin precio'),
    cb('F4', '2026-08-01', 'TRK101', 'Don Pedro', 'flete', 5, '', 10000, 50000, 'pagado'),
    cb('F5', '2026-10-02', 'TRK202', 'Don Pedro', 'flete', 7, 'Ruedas', 1000, 999000, 'anulado'),
    cb('F6', '2026-10-07', 'TRK202', 'Mario Ortiz', 'flete', 80, 'Ruedas limpias', 2000, 160000, 'interno'),
    cb('F7', '2026-10-08', 'TRK101', 'Doña Ana', 'flete', 40, 'Ruedas sucias', 2000, 80000, 'pendiente'),
    cb('F8', '2026-10-09', 'TRK101', 'Los <b>Pinos</b> & Cía', 'flete', 3, 'Ruedas', 1000, 3000, 'pendiente')];
  const pg = (id, cobro, valor, extra = {}) => pago(G, Object.assign({ ID: id, 'ID del cobro': cobro, Valor: valor, Cliente: 'Don Pedro', Medio: 'Nequi', Fecha: '2026-10-01 09:00:00' }, extra));
  T['Pagos clientes'] = [pg('PA1', 'F1', 30000), pg('PA2', 'F1', 5000, { Estado: 'anulado' }), pg('PA3', 'F4', 50000, { Fecha: '2026-08-02 09:00:00' }),
    pg('PA4', 'F5', 999000)];
  return T;
}
function montarLectura(G, T, e) { // Read-only Google mock; these APIs never write.
  const grid = {};
  Object.keys(G.ESQUEMA).forEach(nm => { grid[nm] = [G.ESQUEMA[nm].slice()]; (T[nm] || []).forEach(f => grid[nm].push(G.ESQUEMA[nm].map(c => (f[c] === undefined ? '' : f[c])))); });
  e.grid = grid;
  const hoja = nm => ({ getDataRange: () => ({ getValues: () => grid[nm].map(r => r.slice()) }), getLastColumn: () => grid[nm][0].length, getLastRow: () => grid[nm].length,
    getRange: (r, c, nr, nc) => ({ getValues: () => grid[nm].slice(r - 1, r - 1 + nr).map(f => f.slice(c - 1, c - 1 + nc)) }) });
  return { getSheetByName: nm => (grid[nm] ? hoja(nm) : null), getId: () => 'SS1', getSpreadsheetTimeZone: () => 'America/Bogota' };
}
function pruebasFletes({ G, e }) {
  const T = hojaFletes(G), ahora = new Date('2026-10-15T15:00:00Z'), antes = JSON.stringify(T);
  const v = J(G.vistaFletes(T, '', ahora));
  // 1. Balances match helper/Sunday; oldest date/count of outstanding charges.
  assert.deepStrictEqual(v.clientes.map(x => [x.cliente, x.debe, x.desde, x.n]),
    [['Don Pedro', 70000, '2026-09-20', 1], ['Doña Ana', 80000, '2026-10-08', 1], ['Los <b>Pinos</b> & Cía', 3000, '2026-10-09', 1]]); // T-028: freight only; fertilizer separate.
  assert.deepStrictEqual(v.clientes.map(x => [x.cliente, x.debe]), J(G.cobrosPorCliente(T, 'flete')).map(x => [x.cliente, x.debe]));
  const dom = G.textoCobros(T); // Sunday unchanged, includes freight/fertilizer.
  assert.ok(dom.includes(G.pesos(270000)) && dom.includes(G.pesos(80000)) && !dom.includes('Mario'), dom);
  assert.strictEqual(v.totalClientes, 153000);
  assert.deepStrictEqual(J(G.cobrosPorCliente(T, 'abono')).map(x => [x.cliente, x.debe]), [['Don Pedro', 200000]]);
  assert.strictEqual(J(G.cobrosPorCliente(T)).find(x => x.cliente === 'Don Pedro').debe, 270000); // No type means all as before.
  // 2. Detail ignores voided payments/charges/internal; unpriced lacks amounts; paid shown paid.
  const d = v.detalles[0], c = id => d.cobros.find(x => x.id === id);
  assert.deepStrictEqual(d.cobros.map(x => x.id), ['F4', 'F1', 'F3']); // T-028: fertilizer excluded from freight detail.
  assert.deepStrictEqual([c('F1').pagado, c('F1').saldo, c('F1').estado, c('F1').deuda], [30000, 70000, 'parcial', true]);
  assert.deepStrictEqual(J(G.detalleCliente(T, 'Don Pedro', 'abono')).cobros.map(x => [x.id, x.saldo, x.tipo]), [['F2', 200000, 'Abono']]);
  assert.deepStrictEqual([c('F4').pagado, c('F4').saldo, c('F4').estado, c('F4').deuda], [50000, 0, 'pagado', false]);
  assert.deepStrictEqual([c('F3').sinPrecio, c('F3').precio, c('F3').total, c('F3').pagado, c('F3').saldo, c('F3').estado, c('F3').deuda], [true, null, null, null, null, 'sin precio', false]);
  assert.deepStrictEqual(d.pagos.map(p => [p.cobro, p.valor, p.medio, p.recibio]), [['F4', 50000, 'Nequi', 'Diego'], ['F1', 30000, 'Nequi', 'Diego']]); // Voided payment/voided-charge payment excluded.
  assert.deepStrictEqual(J(G.detalleCliente(T, 'mario ortiz')).cobros, []); // Internal never customer debt.
  assert.deepStrictEqual(J(G.detalleCliente(T, 'don PEDRO')).cobros.length, 4); // Case-insensitive; absent type includes all.
  // 3. Monthly freight by plate, separate internal, month filter, no fertilizer/voids.
  const por = x => Object.fromEntries(x.carros.map(k => [k.placa, [k.ruedas, k.clientes, k.internos, k.sinPrecio, k.lista.length]]));
  assert.deepStrictEqual(por(v), { TRK202: [80, 0, 160000, 0, 1], TRK101: [93, 83000, 0, 1, 3] });
  assert.deepStrictEqual([v.ruedas, v.fletesClientes, v.fletesInternos], [173, 83000, 160000]);
  // 3b. T-028 plate/day newest-first blocks, labeled customer/internal, subtotals, no fertilizer.
  const dm = x => x.dias.map(k => [k.fecha, k.placa, k.ruedas, k.clientes, k.internos, k.sinPrecio, k.lineas.length]);
  assert.deepStrictEqual(dm(v), [['2026-10-09', 'TRK101', 3, 3000, 0, 0, 1], ['2026-10-08', 'TRK101', 40, 80000, 0, 0, 1], ['2026-10-07', 'TRK202', 80, 0, 160000, 0, 1], ['2026-10-06', 'TRK101', 50, 0, 0, 1, 1]]);
  const T2 = J(T);
  T2.Cobros.push(fila(G, 'Cobros', { ID: 'F9', Fecha: '2026-10-08 09:00:00', Placa: 'TRK101', Cliente: 'Mario Ortiz', Tipo: 'flete', Cantidad: 20, Producto: 'Ruedas limpias',
    'Lugar de cargue': 'Mina', 'Lugar de descargue': 'Bodega', 'Precio unitario': 2000, Total: 40000, Estado: 'interno' }),
  fila(G, 'Cobros', { ID: 'F10', Fecha: '2026-10-08 10:00:00', Placa: 'TRK202', Cliente: 'Doña Ana', Tipo: 'flete', Cantidad: 4, Producto: 'Ruedas', Total: 8000, Estado: 'pendiente' }));
  const v2 = J(G.vistaFletes(T2, '', ahora));
  assert.deepStrictEqual(dm(v2).slice(1, 3), [['2026-10-08', 'TRK101', 60, 80000, 40000, 0, 2], ['2026-10-08', 'TRK202', 4, 8000, 0, 0, 1]]); // One plate/day block, ordered plates.
  assert.deepStrictEqual(v2.dias[1].lineas.map(l => [l.cantidad, l.producto, l.lugar, l.cliente, l.interno, l.total]),
    [[40, 'Ruedas sucias', 'Pueblo Claro', 'Doña Ana', false, 80000], [20, 'Ruedas limpias', 'Bodega', 'Mario Ortiz', true, 40000]]);
  assert.deepStrictEqual([v2.ruedas, v2.fletesClientes, v2.fletesInternos], [177 + 20, 91000, 200000]); // Daily subtotals sum month.
  for (const k of ['ruedas', 'clientes', 'internos']) assert.strictEqual(v2.dias.reduce((s, d) => s + d[k], 0), k === 'ruedas' ? v2.ruedas : k === 'clientes' ? v2.fletesClientes : v2.fletesInternos);
  assert.ok(!v.dias.some(d => d.lineas.some(l => l.cliente === 'Don Pedro' && l.total === 200000)), 'el abono no sale en los fletes');
  assert.deepStrictEqual(v.carros.find(k => k.placa === 'TRK202').lista.map(x => [x.cliente, x.interno, x.total]), [['Mario Ortiz', true, 160000]]);
  const sep = J(G.vistaFletes(T, '2026-09', ahora)), ago = J(G.vistaFletes(T, '2026-08', ahora));
  assert.deepStrictEqual(por(sep), { TRK202: [100, 100000, 0, 0, 1] });
  assert.deepStrictEqual(por(ago), { TRK101: [0, 50000, 0, 0, 1] });
  assert.deepStrictEqual(J(G.vistaFletes(T, '2026-07', ahora)).carros, []);
  assert.strictEqual(J(G.vistaFletes(T, 'xx', ahora)).mes, '2026-10');
  // T-029: debtor freight oldest-first, loading location/state.
  assert.deepStrictEqual(v.detalles[0].cobros.filter(x => x.deuda).map(x => [x.fecha, x.placa, x.cantidad, x.cargue, x.total, x.pagado, x.saldo, x.estado]), [['2026-09-20', 'TRK202', 100, 'Mina', 100000, 30000, 70000, 'parcial']]);
  // T-029: monthly freight payments only, paid/partial, http(s) receipt links.
  const T3 = J(T);
  T3.Cobros.push(fila(G, 'Cobros', { ID: 'F11', Fecha: '2026-10-03 08:00:00', Placa: 'TRK101', Cliente: 'Andrés', Tipo: 'flete', Cantidad: 12, Producto: 'Ruedas', 'Precio unitario': 1000, Total: 12000, Estado: 'pagado' }),
    fila(G, 'Cobros', { ID: 'F12', Fecha: '2026-10-04 08:00:00', Placa: 'TRK202', Cliente: 'Andrés', Tipo: 'abono', Cantidad: 2, Producto: 'abono', Total: 40000, Estado: 'pagado' }));
  T3['Pagos clientes'].push(pago(G, { ID: 'PA5', 'ID del cobro': 'F11', Cliente: 'Andrés', Valor: 12000, Medio: 'Efectivo', 'Recibió': 'Mario Ortiz', Fecha: '2026-10-10 09:00:00', Comprobante: 'https://receipt.example.test/c' }),
    pago(G, { ID: 'PA6', 'ID del cobro': 'F12', Cliente: 'Andrés', Valor: 40000, Fecha: '2026-10-10 10:00:00' }),
    pago(G, { ID: 'PA7', 'ID del cobro': 'F1', Valor: 1000, Fecha: '2026-10-12 10:00:00', Comprobante: 'javascript:alert(1)' }));
  const vp = J(G.vistaFletes(T3, '', ahora));
  assert.deepStrictEqual(vp.pagos.map(x => [x.cliente, x.total, x.pagos.map(p => p.id)]), [['Andrés', 12000, ['PA5']], ['Don Pedro', 31000, ['PA7', 'PA1']]]);
  const pa5 = vp.pagos[0].pagos[0];
  assert.deepStrictEqual([pa5.fecha, pa5.valor, pa5.medio, pa5.recibio, pa5.url, pa5.flete.fecha, pa5.flete.placa, pa5.flete.cantidad, pa5.flete.pagado], ['2026-10-10', 12000, 'Efectivo', 'Mario Ortiz', 'https://receipt.example.test/c', '2026-10-03', 'TRK101', 12, true]);
  assert.deepStrictEqual([vp.pagos[1].pagos[0].url, vp.pagos[1].pagos[0].flete.pagado, vp.totalPagos], ['', false, 43000]); // javascript: is not link; charge remains partial.
  assert.deepStrictEqual(J(G.vistaFletes(T3, '2026-08', ahora)).pagos.map(x => [x.cliente, x.total]), [['Don Pedro', 50000]]); // Month selector filters payment date.
  assert.deepStrictEqual(J(G.vistaFletes(T3, '2026-07', ahora)).pagos, []);
  assert.strictEqual(sep.clientes.length, 3); // Debt independent of month.
  assert.strictEqual(J(G.vistaTablero(T, ADMIN, ahora)).fletes.mes, '2026-10');
  // 4. Correct customer statement balance, no purchase/profit, escaped sheet text.
  const m = J(G.estadoCliente(T, 'Don Pedro', ahora));
  assert.deepStrictEqual([m.saldo, m.total, m.pagado, m.cobros.length, m.pagos.length, m.sinPrecio.length, m.fecha], [70000, 100000, 30000, 1, 1, 1, '2026-10-15']); // T-028: freight only.
  assert.strictEqual(G.estadoCliente(T, 'Nadie', ahora), null);
  assert.strictEqual(G.estadoCliente(T, 'Mario Ortiz', ahora), null);
  const html = G.htmlEstadoCliente(m);
  assert.ok(html.includes(G.pesos(70000)) && !html.includes(G.pesos(270000)) && !html.includes('Abono') && html.includes('bgcolor="#d7eb80"') && html.includes('Saldo total') && html.includes('20/09/2026'));
  assert.ok(!html.includes('999.000') && !html.includes('160.000') && !/precio de compra|ganancia/i.test(html));
  const hp = G.htmlEstadoCliente(J(G.estadoCliente(T, 'Los <b>Pinos</b> & Cía', ahora)));
  assert.ok(!hp.includes('<b>Pinos') && hp.includes('&lt;b&gt;Pinos&lt;/b&gt; &amp; Cía'), 'el nombre de la hoja va escapado');
  for (const txt of [JSON.stringify(v), JSON.stringify(m), html, JSON.stringify(J(G.vistaTablero(T, ADMIN, ahora)))]) assert.ok(!txt.includes(String(COMPRA)) && !txt.includes('8.765.432'), 'precio de compra filtrado');
  assert.strictEqual(JSON.stringify(T), antes); // Pure, no writes.
  // 5. API one read/admin required/unknown customer rejected/no writes.
  e.ss = montarLectura(G, T, e); e.correo = ADMIN2.toUpperCase(); e.html.length = 0;
  const grid0 = JSON.stringify(e.grid);
  const p = J(G.api_pdfCliente('don pedro'));
  assert.ok(p.nombre.endsWith('.pdf') && p.nombre.includes('Don Pedro') && p.base64 && p.modelo.saldo === 70000 && !JSON.stringify(p).includes(String(COMPRA)));
  assert.strictEqual(e.html.length, 1);
  assert.ok(e.html[0].includes(G.pesos(70000)) && !e.html[0].includes(String(COMPRA)) && !/precio de compra|ganancia/i.test(e.html[0]));
  assert.throws(() => G.api_pdfCliente('Nadie'), /no existe/);
  assert.throws(() => G.api_pdfCliente('Mario Ortiz'), /no existe/);
  assert.throws(() => G.api_pdfCliente(), /no existe/);
  assert.strictEqual(J(G.api_fletes('2026-09')).mes, '2026-09');
  e.correo = DIEGOMAIL;
  assert.throws(() => G.api_pdfCliente('Don Pedro'), /Acceso no autorizado/);
  assert.throws(() => G.api_fletes('2026-09'), /Acceso no autorizado/);
  e.correo = '';
  assert.throws(() => G.api_pdfCliente('Don Pedro'), /Acceso no autorizado/);
  assert.strictEqual(JSON.stringify(e.grid), grid0);
}
(function fletes() {
  pruebasFletes(crear());
  // Screen tab/month selector/statement button, h escaping.
  const html = fs.readFileSync(path.join(__dirname, 'Index.html'), 'utf8');
  assert.ok(html.includes('data-t="fletes"') && html.includes('function vFletes') && html.includes("srv('api_'+p") && html.includes('api_pdfCliente'));
  console.log('OK: pestaña Fletes y cobros (saldos = domingo, detalle, fletes del mes, PDF sin precio de compra, solo admin)');
})();

// ---------- T-028 Home freight detail/fertilizer debts/all months ----------
(function t028() {
  const { G, e } = crear(), T = hojaFletes(G), ahora = new Date('2026-10-15T15:00:00Z');
  T.Cobros.push(fila(G, 'Cobros', { ID: 'F11', Fecha: '2026-10-10 08:00:00', Placa: 'TRK101', Cliente: 'Doña Ana', Tipo: 'abono', Cantidad: 30, Producto: 'abono', 'Precio unitario': 20000, Total: 600000, Estado: 'parcial', 'Lugar de descargue': 'Lomavista' }),
    fila(G, 'Cobros', { ID: 'F12', Fecha: '2026-10-11 08:00:00', Placa: 'TRK202', Cliente: 'Luis Herrera', Tipo: 'abono', Cantidad: 12, Producto: 'abono', Total: 0, Estado: 'sin precio' }));
  T['Pagos clientes'].push(pago(G, { ID: 'PA9', 'ID del cobro': 'F11', Valor: 100000, Cliente: 'Doña Ana', Medio: 'Efectivo', Fecha: '2026-10-12 09:00:00' }));
  // 1. Home freight-only breakdown and total.
  const ini = J(G.vistaTablero(T, ADMIN, ahora)).inicio;
  assert.deepStrictEqual(ini.cobros.map(x => [x.cliente, x.debe]), [['Don Pedro', 70000], ['Doña Ana', 80000], ['Los <b>Pinos</b> & Cía', 3000]]);
  assert.deepStrictEqual(ini.cobros[0].items, [{ fecha: '2026-09-20', placa: 'TRK202', producto: 'Ruedas limpias', cantidad: 100, saldo: 70000 }]);
  assert.deepStrictEqual(ini.cobros[1].items, [{ fecha: '2026-10-08', placa: 'TRK101', producto: 'Ruedas sucias', cantidad: 40, saldo: 80000 }]); // Fertilizer excluded.
  assert.strictEqual(ini.totalCobros, 153000);
  // 2. Fertilizer balance=total−active payments; unpriced separate without amounts.
  const ab = J(G.vistaAbono(T, '', ahora));
  assert.deepStrictEqual(ab.clientes.map(x => [x.cliente, x.debe, x.desde]), [['Don Pedro', 200000, '2026-10-05'], ['Doña Ana', 500000, '2026-10-10']]);
  assert.deepStrictEqual(ab.clientes[1].items, [{ fecha: '2026-10-10', placa: 'TRK101', producto: 'abono', cantidad: 30, saldo: 500000 }]);
  assert.strictEqual(ab.totalClientes, 700000);
  assert.deepStrictEqual(ab.sinPrecioClientes, [{ fecha: '2026-10-11', placa: 'TRK202', cliente: 'Luis Herrera', cantidad: 12 }]);
  assert.ok(!JSON.stringify(ab.sinPrecioClientes).includes('Total') && !JSON.stringify(ab.clientes).includes(String(COMPRA)), 'sin montos y sin precio de compra');
  assert.ok(!J(G.vistaFletes(T, '', ahora)).clientes.some(x => x.debe === 500000), 'el saldo de abono no sale en Fletes');
  // 3. All-month views exactly match individual months, no writes.
  const antes = JSON.stringify(T);
  e.ss = montarLectura(G, T, e); e.correo = ADMIN;
  const M = J(G.vistaMeses ? G.vistaMeses(T, ahora) : null);
  assert.deepStrictEqual(M.meses, ['2026-08', '2026-09', '2026-10']);
  for (const m of M.meses) {
    assert.deepStrictEqual(M.fletes[m], J(G.vistaFletes(T, m, ahora)), 'fletes ' + m);
    assert.deepStrictEqual(M.abono[m], J(G.vistaAbono(T, m, ahora)), 'abono ' + m);
    assert.deepStrictEqual(M.carros[m], J(G.vistaCarros(T, m, ahora)), 'carros ' + m);
  }
  const vt = J(G.vistaTablero(T, ADMIN, ahora));
  assert.deepStrictEqual([M.fletes['2026-10'], M.abono['2026-10'], M.carros['2026-10']], [vt.fletes, vt.abono, vt.carros]); // Current month matches initial load.
  assert.deepStrictEqual(J(G.api_meses()), M); // API same result, one read.
  e.correo = DIEGOMAIL; assert.throws(() => G.api_meses(), /Acceso no autorizado/);
  assert.strictEqual(JSON.stringify(T), antes);
  assert.deepStrictEqual(J(G.vistaMeses(base(G), ahora)).meses, ['2026-10']); // Empty sheet current month only.
  // 4. General title/screen.
  const html = fs.readFileSync(path.join(__dirname, 'Index.html'), 'utf8');
  assert.ok(html.includes('Cuentas Vehículos Mario Ortiz') && !html.includes('data-t="consol"') && !html.includes('Ver cuenta de Diego') && html.includes('api_meses'));
  assert.ok(fs.readFileSync(path.join(__dirname, 'Tablero.gs'), 'utf8').includes("setTitle('Cuentas Vehículos Mario Ortiz')"));
  console.log('OK: T-028 (Inicio solo fletes con detalle, Fletes por placa y día, Abono con clientes, todos los meses = vista por mes, título)');
})();

// ---------- T-026 voided-payment/internal-debt/purchase-cost-leak mutations ----------
(function mutacionFletes() {
  const fuente = fs.readFileSync(path.join(__dirname, 'Tablero.gs'), 'utf8');
  const PAGO = 'activoMov(p) && ids[', INTERNO = "['anulado', 'interno'].indexOf(norm(c.Estado)) < 0", TOTAL = 'td(esc(pesos(c.total)), { al: \'right\' })';
  assert.ok(fuente.includes(PAGO) && fuente.includes(INTERNO) && fuente.includes(TOTAL), 'el código de Fletes cambió: actualice la mutación');
  assert.throws(() => pruebasFletes(crear({ 'Tablero.gs': s => s.replace(PAGO, 'ids[') })), 'contar pagos anulados debe fallar');
  assert.throws(() => pruebasFletes(crear({ 'Tablero.gs': s => s.replace(INTERNO, "['anulado'].indexOf(norm(c.Estado)) < 0") })), 'el interno como deuda debe fallar');
  assert.throws(() => pruebasFletes(crear({ 'Tablero.gs': s => s.replace(TOTAL, "td(esc(pesos(c.total)) + ' ' + " + COMPRA + ", { al: 'right' })") })), 'filtrar el precio de compra debe fallar');
  console.log('OK: mutación detectada (pagos anulados, interno como deuda y fuga del precio de compra hacen fallar las pruebas de Fletes)');
})();

// ---------- T-027 vehicles ----------
function hojaCarros(G) {
  const T = base(G);
  T['Vehículos'] = [{ Placa: 'TRK202', 'Cambio de aceite cada (km)': 10000, 'Km del último cambio de aceite': 100000, 'SOAT vence': '2026-10-20', 'Seguro vence': '2026-12-31' },
    { Placa: 'TRK101' }];
  const m = (id, fecha, placa, clase, cat, total, extra = {}) => mov(G, Object.assign({ ID: id, Fecha: fecha + ' 09:00:00', Placa: placa, Clase: clase, 'Categoría': cat, Total: total, 'Pagó': 'Diego' }, extra));
  const acpm = (id, fecha, km, gal, total, lleno, extra = {}) => m(id, fecha, 'TRK202', 'Adelantado', 'ACPM', total, Object.assign({ Km: km, Galones: gal, 'Tanque lleno': lleno }, extra));
  T.Movimientos = [
    acpm('G0', '2026-09-28', 100000, 20, 80000, 'Sí'),                       // September full refuel starts efficiency segment, not October expense.
    acpm('G1', '2026-10-03', 100200, 10, 40000, 'No'),                       // Partial included in segment.
    acpm('G2', '2026-10-10', 100500, 20, 90000, 'Sí', { 'Pagó': 'Tarjeta Mario Ortiz' }), // Full refuel illustrative distance/gallons/cost.
    m('G3', '2026-10-11', 'TRK202', 'Adelantado', 'Peaje', 9000, { 'Pagó': 'Mario Ortiz' }), // Regardless payer.
    m('G4', '2026-10-12', 'TRK202', 'Ganado', 'Cargue', 30000), m('G5', '2026-10-13', 'TRK202', 'Ganado', 'Viaje', 150000),
    m('X1', '2026-10-14', 'TRK202', 'Adelantado', 'Peaje', 50000, { Estado: 'anulado' }),     // Voided excluded.
    m('X2', '2026-10-14', 'TRK202', 'Recibido', 'Consignación', 120000),                      // Plated Recibido excluded.
    m('X3', '2026-10-14', 'TRK202', 'Descuento', 'Seguro', 20000),                            // Descuento excluded.
    m('X4', '2026-10-14', '', 'Adelantado', 'Peaje', 7777),                                   // Unplated excluded.
    m('X5', '2026-10-14', 'TRK202', 'Ganado', 'Cargue', 33333, { Estado: 'anulado' }),        // Voided Diego pay excluded.
    m('H1', '2026-10-15', 'TRK101', 'Adelantado', 'Repuestos', 25000), m('H2', '2026-09-15', 'TRK101', 'Adelantado', 'Repuestos', 5000),
    m('H3', '2026-10-16', 'ZZZ000', 'Adelantado', 'Lavadero', 3000)];                         // Unknown schema plate retained.
  const cb = (id, fecha, placa, tipo, prod, total, estado, cli = 'Don Pedro') => fila(G, 'Cobros', { ID: id, Fecha: fecha + ' 08:00:00', Placa: placa, Cliente: cli, Tipo: tipo, Producto: prod,
    Cantidad: 10, Total: total, Estado: estado, 'Precio de compra': COMPRA });
  T.Cobros = [cb('C1', '2026-10-06', 'TRK202', 'flete', 'Ruedas', 100000, 'pendiente'), cb('C2', '2026-10-07', 'TRK202', 'flete', 'Ruedas', 160000, 'interno', 'Mario Ortiz'),
    cb('C3', '2026-10-08', 'TRK202', 'flete', 'Ruedas', 999000, 'anulado'), cb('C4', '2026-10-09', 'TRK202', 'abono', 'abono', 777000, 'pendiente'),
    cb('C5', '2026-09-09', 'TRK202', 'flete', 'Ruedas', 55000, 'pagado'), cb('C6', '2026-10-09', 'TRK101', 'flete', 'Ruedas', 0, 'sin precio'),
    cb('C7', '2026-10-09', 'TRK202', 'abono', 'abono', 888000, 'interno', 'Mario Ortiz')]; // Internal fertilizer not internal freight income.
  const iv = (id, fecha, mov_, cant, precio) => fila(G, 'Inventario abono', { ID: id, Fecha: fecha + ' 08:00:00', Placa: 'TRK202', Movimiento: mov_, Cantidad: cant, 'Precio unitario': precio, Total: precio ? cant * precio : '', Estado: 'activo' });
  T['Inventario abono'] = [iv('I1', '2026-10-01', 'compra', 100, 10000), iv('I2', '2026-10-05', 'venta', 40, 20000), iv('I3', '2026-10-06', 'venta', 10, 0)]; // Known profit plus one pending.
  return T;
}
function pruebasCarros({ G, e }) {
  const T = hojaCarros(G), ahora = new Date('2026-10-15T15:00:00Z'), antes = JSON.stringify(T);
  const k = J(G.vistaCarros(T, '', ahora)), c = p => k.carros.find(x => x.placa === p);
  assert.deepStrictEqual([k.mes, k.actual, k.carros.map(x => x.placa)], ['2026-10', '2026-10', ['TRK202', 'TRK101', 'ZZZ000']]);
  // 1. Customer+internal+known FIFO income; exclude void/fertilizer charge/other month.
  const a = c('TRK202');
  assert.deepStrictEqual(a.ingresos, { clientes: 100000, internos: 160000, abono: 400000, abonoPendientes: 1, fletesSinPrecio: 0, otros: 0, otrosDetalle: [], otrosSinPrecio: 0, total: 660000 });
  assert.deepStrictEqual([c('TRK101').ingresos.total, c('TRK101').ingresos.fletesSinPrecio], [0, 1]);
  // 2. Expenses by category regardless payer plus Diego earned; exclude void/received/discount/unplated.
  assert.deepStrictEqual(a.gastos.categorias.map(x => [x.categoria, x.total, x.n]), [['ACPM', 130000, 2], ['Peaje', 9000, 1]]);
  assert.deepStrictEqual([a.gastos.adelantado, a.gastos.diego, a.gastos.total], [139000, 180000, 319000]);
  // 3. Result=income−expense; month filtered, unknown vehicle retained.
  assert.strictEqual(a.resultado, 660000 - 319000);
  assert.deepStrictEqual([c('TRK101').gastos.total, c('TRK101').resultado, c('ZZZ000').gastos.total], [25000, -25000, 3000]);
  const sep = J(G.vistaCarros(T, '2026-09', ahora)), s = p => sep.carros.find(x => x.placa === p);
  assert.deepStrictEqual([sep.mes, s('TRK101').gastos.total, s('TRK202').gastos.categorias.map(x => x.total), s('TRK202').ingresos.clientes, s('TRK202').gastos.diego], ['2026-09', 5000, [80000], 55000, 0]);
  assert.strictEqual(J(G.vistaCarros(T, 'xx', ahora)).mes, '2026-10');
  // 4. Monthly segment median; valid5day segment, invalid7day gap excluded.
  assert.deepStrictEqual([a.rendimiento.n, a.rendimiento.kmGal, a.rendimiento.km, a.rendimiento.acpmKm], [1, 20, 500, 260]); // Monthly diesel cost divided by distance.
  assert.strictEqual(s('TRK202').rendimiento.n, 0); // September single refuel no segment.
  assert.deepStrictEqual([s('TRK202').rendimiento.kmGal, c('TRK101').rendimiento.kmGal], [null, null]);
  // Mistyped km creates implausible efficiency excluded from median.
  const T2 = hojaCarros(G);
  T2.Movimientos.push(mov(G, { ID: 'G9', Fecha: '2026-10-12 09:00:00', Placa: 'TRK202', Clase: 'Adelantado', 'Categoría': 'ACPM', Total: 70000, 'Pagó': 'Diego', Km: 110500, Galones: 20, 'Tanque lleno': 'Sí' }));
  const r2 = J(G.vistaCarros(T2, '', ahora)).carros.find(x => x.placa === 'TRK202').rendimiento;
  assert.deepStrictEqual([r2.n, r2.kmGal], [1, 20]);
  // Even segment count median averages middle two.
  const T3 = hojaCarros(G);
  T3.Movimientos.push(mov(G, { ID: 'G8', Fecha: '2026-10-06 09:00:00', Placa: 'TRK202', Clase: 'Adelantado', 'Categoría': 'ACPM', Total: 40000, 'Pagó': 'Diego', Km: 100350, Galones: 10, 'Tanque lleno': 'No' }));
  const r3 = J(G.vistaCarros(T3, '', ahora)).carros.find(x => x.placa === 'TRK202').rendimiento;
  assert.deepStrictEqual([r3.n, r3.kmGal], [2, 17.5]); // 20/15 segments median17.5.
  // 5. Oil matches Sunday helper; absent interval omits line.
  assert.deepStrictEqual([a.aceite.prox, a.aceite.km, a.aceite.falta, a.aceite.alerta], [110000, 100500, 9500, false]);
  const dom = G.textoAceite(T);
  assert.ok(dom.includes('próximo cambio a los ' + G.numTxt(a.aceite.prox, 0) + ' km') && dom.includes('faltan ' + G.numTxt(a.aceite.falta, 0) + ' km'), dom);
  assert.strictEqual(c('TRK101').aceite, null);
  assert.strictEqual(J(G.vistaFletes(T, '', ahora)).fletesInternos, 160000); // Internal fertilizer also excluded from freight.
  // Alert/missing-data calculations match helper.
  T['Vehículos'][0]['Km del último cambio de aceite'] = 91000;
  let ac = J(G.aceiteCarro(T, 'TRK202')), tx = G.textoAceite(T);
  assert.ok(ac.alerta && tx.includes('⚠️') && tx.includes('próximo cambio a los ' + G.numTxt(ac.prox, 0) + ' km') && tx.includes('faltan ' + G.numTxt(ac.falta, 0) + ' km'), tx);
  T['Vehículos'][0]['Km del último cambio de aceite'] = '';
  ac = J(G.aceiteCarro(T, 'TRK202')); tx = G.textoAceite(T);
  assert.ok(ac.sinDato && tx.includes('sin dato del último cambio'), tx);
  T['Vehículos'][0]['Km del último cambio de aceite'] = 100000;
  T['Vehículos'][0]['Km del último cambio de aceite'] = 91000; // Exactly500km remaining triggers alert like bot.
  assert.deepStrictEqual([J(G.aceiteCarro(T, 'TRK202')).falta, J(G.aceiteCarro(T, 'TRK202')).alerta], [500, true]);
  T['Vehículos'][0]['Km del último cambio de aceite'] = '';
  assert.deepStrictEqual(J(G.aceiteCarro(T, 'TRK202')), { sinDato: true });
  T['Vehículos'][0]['Km del último cambio de aceite'] = 100000;
  // 6. All plate expiries including distant/missing.
  assert.deepStrictEqual(a.vencimientos.map(d => [d.nombre, d.nivel, d.dias]), [['SOAT', 'pronto', 5], ['Técnico-mecánica', 'sindato', null], ['Seguro', 'normal', 77]]);
  // Home only<=15days/expired.
  const ini = J(G.vistaTablero(T, ADMIN, ahora)).inicio.vencimientos;
  assert.deepStrictEqual(ini.map(x => [x.placa, x.docs.map(d => d.nombre)]), [['TRK202', ['SOAT']]]);
  assert.strictEqual(J(G.vistaTablero(T, ADMIN, ahora)).carros.mes, '2026-10');
  // 7. Pure, no purchase cost; API admin/read-only.
  assert.strictEqual(JSON.stringify(T), antes);
  assert.ok(!JSON.stringify(k).includes(String(COMPRA)));
  e.ss = montarLectura(G, T, e); e.correo = ADMIN2.toUpperCase(); const g0 = JSON.stringify(e.grid);
  assert.strictEqual(J(G.api_carros('2026-09')).mes, '2026-09');
  e.correo = DIEGOMAIL; assert.throws(() => G.api_carros('2026-09'), /Acceso no autorizado/);
  assert.strictEqual(JSON.stringify(e.grid), g0);
}
(function carros() {
  pruebasCarros(crear());
  const html = fs.readFileSync(path.join(__dirname, 'Index.html'), 'utf8');
  assert.ok(html.includes('data-t="carros"') && html.includes('function vCarros') && html.includes("selMes('carros')") && html.includes('V.inicio.vencimientos'));
  console.log('OK: pestaña Carros (ingresos, gastos por categoría + Diego, resultado, rendimiento y aceite = bot, vencimientos, mes)');
})();
(function mutacionCarros() {
  const ACTIVO = "!activoMov(m) || !placa || (clase !== 'adelantado'", CLASE = "(clase !== 'adelantado' && clase !== 'ganado')";
  const fuente = fs.readFileSync(path.join(__dirname, 'Tablero.gs'), 'utf8');
  assert.ok(fuente.includes(ACTIVO) && fuente.includes(CLASE), 'el código de Carros cambió: actualice la mutación');
  assert.throws(() => pruebasCarros(crear({ 'Tablero.gs': s => s.replace(ACTIVO, "!placa || (clase !== 'adelantado'") })), 'contar un anulado como gasto debe fallar');
  assert.throws(() => pruebasCarros(crear({ 'Tablero.gs': s => s.replace(CLASE, 'false') })), 'contar una Consignación (Recibido) como gasto debe fallar');
  console.log('OK: mutación detectada (anulado o Consignación como gasto hacen fallar las pruebas de Carros)');
})();

// ---------- T-027 records ----------
function hojaRegistros(G) {
  const T = base(G);
  T.Movimientos = [
    mov(G, { ID: 'R1', Fecha: '2026-10-10 08:00:00', Registró: 'Diego', Placa: 'TRK202', Clase: 'Adelantado', 'Categoría': 'Peaje', Detalle: 'Vía al mar', Total: 9000, 'Pagó': 'Diego', Comprobante: 'https://drive.google.com/file/d/1/view' }),
    mov(G, { ID: 'R2', Fecha: '2026-10-11 08:00:00', Registró: 'Willi', Placa: 'TRK101', Clase: 'Adelantado', 'Categoría': 'Parqueadero', Total: 5000, 'Pagó': 'Mario Ortiz', Comprobante: 'javascript:alert(1)' }),
    mov(G, { ID: 'R3', Fecha: '2026-10-12 08:00:00', Registró: 'Diego', Placa: 'TRK202', Clase: 'Adelantado', 'Categoría': 'Peaje', Total: 7000, Estado: 'anulado' }),
    mov(G, { ID: 'R4', Fecha: '2026-09-01 08:00:00', Registró: 'Diego', Clase: 'Recibido', 'Categoría': 'Consignación', Total: 100000, Comprobante: 'HTTP://receipt.example.test/a' })];
  T.Cobros = [fila(G, 'Cobros', { ID: 'CB1', Fecha: '2026-10-09 08:00:00', Placa: 'TRK202', Cliente: 'Don Pedro', Tipo: 'flete', Producto: 'Ruedas', Cantidad: 10, 'Lugar de descargue': 'Pueblo Claro', Total: 100000,
    Estado: 'pendiente', 'Cobró': 'Diego', 'Precio de compra': COMPRA, Comprobante: 'ftp://x/y' })];
  T['Pagos clientes'] = [pago(G, { ID: 'PG1', Fecha: '2026-10-13 08:00:00', 'ID del cobro': 'CB1', Cliente: 'Don Pedro', Valor: 40000, Medio: 'Nequi', 'Recibió': 'Mario Ortiz' }),
    pago(G, { ID: 'PG2', Fecha: '2026-10-14 08:00:00', 'ID del cobro': 'CB1', Cliente: 'Don Pedro', Valor: 1, Estado: 'anulado' })];
  T['Inventario abono'] = [fila(G, 'Inventario abono', { ID: 'IV1', Fecha: '2026-10-08 08:00:00', Registró: 'Willi', Placa: 'TRK202', Movimiento: 'venta', Cantidad: 20, Lugar: 'Lomavista', Cliente: 'Doña Ana', Total: 300000, Estado: 'activo' })];
  return T;
}
function pruebasRegistros({ G, e }) {
  const T = hojaRegistros(G), antes = JSON.stringify(T);
  const ids = f => J(G.buscarRegistros(T, f)).filas.map(x => x.id);
  // Default newest-first, no voids, all ledgers; payment plate inherited from charge.
  assert.deepStrictEqual(ids({}), ['PG1', 'R2', 'R1', 'CB1', 'IV1', 'R4']);
  assert.deepStrictEqual(ids({ anulados: true }), ['PG2', 'PG1', 'R3', 'R2', 'R1', 'CB1', 'IV1', 'R4']);
  assert.deepStrictEqual(ids({ anulados: 'true' }), ids({})); // Only boolean true enables.
  assert.deepStrictEqual(ids({ desde: '2026-10-10', hasta: '2026-10-11' }), ['R2', 'R1']);
  assert.deepStrictEqual(ids({ placa: 'trk101' }), ['R2']);
  assert.deepStrictEqual(ids({ placa: 'TRK202' }), ['PG1', 'R1', 'CB1', 'IV1']); // Payment inherits plate.
  assert.deepStrictEqual(ids({ texto: 'parqueadero' }), ['R2']);
  assert.deepStrictEqual(ids({ texto: 'VIA AL MAR' }), ['R1']);       // Accent/case-insensitive detail.
  assert.deepStrictEqual(ids({ texto: 'dona ana' }), ['IV1']);        // Customer.
  assert.deepStrictEqual(ids({ texto: 'don pedro' }), ['PG1', 'CB1']); // Customer.
  assert.deepStrictEqual(ids({ texto: 'consignacion' }), ['R4']);     // Category.
  assert.deepStrictEqual(ids({ quien: 'mario' }), ['PG1', 'R2']);     // Recipient/payer.
  assert.deepStrictEqual(ids({ quien: 'willi' }), ['R2', 'IV1']);     // Author.
  assert.deepStrictEqual(ids({ quien: 'diego', texto: 'peaje' }), ['R1']); // Combined.
  // HTTP(S) links only.
  const u = Object.fromEntries(J(G.buscarRegistros(T, { anulados: true })).filas.map(x => [x.id, x.url]));
  assert.deepStrictEqual([u.R1, u.R2, u.R4, u.CB1, u.PG1], ['https://drive.google.com/file/d/1/view', '', 'HTTP://receipt.example.test/a', '', '']);
  assert.ok(!JSON.stringify(J(G.buscarRegistros(T, {}))).includes(String(COMPRA))); // Never purchase cost.
  // T-029: readable lifecycle; hide active movement status, payment received.
  const L = Object.fromEntries(J(G.buscarRegistros(T, { anulados: true })).filas.map(x => [x.id, [x.tipo, x.estadoTxt]]));
  assert.deepStrictEqual(L, { PG2: ['Pago de cliente', 'Anulado'], PG1: ['Pago de cliente', 'Recibido'], R3: ['Gasto', 'Anulado'], R2: ['Gasto', ''], R1: ['Gasto', ''],
    CB1: ['Flete', 'Por cobrar'], IV1: ['Venta de abono', ''], R4: ['Recibido por Diego', ''] });
  assert.ok(!JSON.stringify(J(G.buscarRegistros(T, { anulados: true })).filas.map(x => x.estadoTxt)).toLowerCase().includes('activo'), 'nunca «activo»');
  for (const [est, leg] of [['parcial', 'Pago parcial'], ['pagado', 'Pagado'], ['sin precio', 'Sin precio'], ['interno', 'Interno'], ['pendiente', 'Por cobrar']]) assert.strictEqual(G.estadoLegible('Cobros', est), leg);
  assert.deepStrictEqual([G.estadoLegible('Movimientos', 'activo'), G.estadoLegible('Movimientos', 'anulado')], ['', 'Anulado']);
  assert.deepStrictEqual(['Ganado', 'Descuento'].map(c => G.TIPO_MOV[c]), ['Ganado de Diego', 'Descuento']);
  // 200-row cap with notice.
  const grande = hojaRegistros(G);
  for (let i = 0; i < 205; i++) grande.Movimientos.push(mov(G, { ID: 'B' + i, Fecha: '2026-10-' + ('0' + (1 + i % 9)).slice(-2) + ' 10:' + ('0' + (i % 60)).slice(-2) + ':00', Placa: 'TRK202', Clase: 'Adelantado', 'Categoría': 'Lavadero', Total: 1 }));
  const r = J(G.buscarRegistros(grande, { texto: 'lavadero' }));
  assert.deepStrictEqual([r.filas.length, r.total, r.mas], [200, 205, true]);
  assert.ok(r.filas.every((x, i) => i === 0 || r.filas[i - 1].fecha >= x.fecha));
  assert.deepStrictEqual(J(G.buscarRegistros(T, {})).mas, false);
  // Invalid filter ignored safely.
  for (const malo of [undefined, null, 'x', 5, [], { desde: 'ayer', hasta: '2026-99', placa: { a: 1 }, texto: ['a'], quien: null, anulados: 1 }, { texto: 'a'.repeat(5000) }])
    assert.doesNotThrow(() => G.buscarRegistros(T, malo));
  assert.deepStrictEqual(ids({ desde: 'ayer', hasta: '2026-99', placa: { a: 1 }, texto: ['a'] }), ids({}));
  assert.strictEqual(JSON.stringify(T), antes);
  // API admin/read-only; malformed filter safe.
  e.ss = montarLectura(G, T, e); e.correo = ADMIN2.toUpperCase(); const g0 = JSON.stringify(e.grid);
  assert.deepStrictEqual(J(G.api_registros({ texto: 'peaje' })).filas.map(x => x.id), ['R1']);
  assert.doesNotThrow(() => G.api_registros(undefined));
  e.correo = DIEGOMAIL; assert.throws(() => G.api_registros({}), /Acceso no autorizado/);
  e.correo = ''; assert.throws(() => G.api_registros({}), /Acceso no autorizado/);
  assert.strictEqual(JSON.stringify(e.grid), g0);
}
(function registros() {
  pruebasRegistros(crear());
  const html = fs.readFileSync(path.join(__dirname, 'Index.html'), 'utf8');
  assert.ok(html.includes('data-t="registros"') && html.includes('function vRegistros') && html.includes('api_registros') && html.includes('urlOk') && html.includes('rel="noopener"'));
  console.log('OK: pestaña Registros (filtros, anulados ocultos, tope 200, enlace solo http(s), solo admin)');
})();
(function comprobanteEnCuenta() { // T-029: receipt URL except toll/market, HTTP(S) only; totals unchanged.
  const { G } = crear(), T = hojaLlena(G), antes = G.modeloEstado(T, '');
  const add = (id, cat, url, extra = {}) => T.Movimientos.push(mov(G, Object.assign({ ID: id, Fecha: '2026-10-13 09:00:00', Placa: 'TRK202', Clase: 'Adelantado', 'Categoría': cat, Total: 1000, 'Pagó': 'Diego', Comprobante: url }, extra)));
  add('U1', 'Lavadero', 'https://drive.google.com/file/d/9/view'); add('U2', 'Peaje', 'https://drive.google.com/file/d/8/view'); add('U3', 'Centroabastos', 'https://drive.google.com/file/d/7/view');
  add('U4', 'Parqueadero', 'javascript:alert(1)'); add('U5', 'Aceite', '');
  T['Pagos clientes'].push(pago(G, { ID: 'UP1', 'ID del cobro': 'X', Valor: 5000, Fecha: '2026-10-13 10:00:00', Comprobante: 'http://receipt.example.test/p' }));
  // T-030: linked payment description identifies freight/fertilizer charge.
  T.Cobros.push(fila(G, 'Cobros', { ID: 'UC1', Fecha: '2026-10-15 08:00:00', Placa: 'TRK101', Cliente: 'Andrés', Tipo: 'flete', Cantidad: 20, Producto: 'Ruedas', Total: 20000, Estado: 'pendiente' }),
    fila(G, 'Cobros', { ID: 'UC2', Fecha: '2026-10-13 08:00:00', Placa: 'TRK202', Cliente: 'Ana', Tipo: 'abono', Cantidad: 200, Producto: 'abono', Total: 200000, Estado: 'pendiente' }));
  T['Pagos clientes'].push(pago(G, { ID: 'UP2', 'ID del cobro': 'UC1', Cliente: 'Andrés', Valor: 1000, Fecha: '2026-10-15 11:00:00' }), pago(G, { ID: 'UP3', 'ID del cobro': 'UC2', Cliente: 'Ana', Valor: 2000, Fecha: '2026-10-15 12:00:00' }));
  const cp = Object.fromEntries(J(G.partidasDeCorte(T, '')).map(x => [x.id, x.concepto]));
  assert.strictEqual(cp.UP2, 'Pago de flete · Andrés · flete 15/10 TRK101 · 20 Ruedas');
  assert.strictEqual(cp.UP3, 'Pago de abono · Ana · 13/10 TRK202 · 200 bultos');
  assert.strictEqual(cp.UP1, 'Pago de cliente · Don Pedro'); // Missing charge generic fallback.
  const m = J(G.modeloEstado(T, '')), url = Object.fromEntries([].concat(...m.bloques.map(b => b.items)).map(i => [i.id, i.url]));
  assert.deepStrictEqual([url.U1, url.U2, url.U3, url.U4, url.U5, url.UP1], ['https://drive.google.com/file/d/9/view', '', '', '', '', 'http://receipt.example.test/p']);
  assert.strictEqual(m.cuadra, true);
  const ih = fs.readFileSync(path.join(__dirname, 'Index.html'), 'utf8'); // T-030: sign colors and burgundy vehicle presentation only.
  assert.ok(ih.includes("function cs(n){return n<0?'neg':n>0?'pos':'';}") && ih.includes("(neg?'neg':'pos')") && ih.includes("TRK202:'#9b2242'") && ih.includes("TRK202:'#c8506f'") && !ih.includes('Registros para revisar'));
  assert.strictEqual(m.saldo, antes.saldo - 3000, '5 gastos (5 x 1000) menos pagos de 5000 + 1000 + 2000');
})();
(function mutacionRegistros() {
  const ANUL = "if (!f.anulados && (e === 'anulado' || e === 'reemplazado')) return false;", URL = '/^https?:\\/\\/\\S+$/i.test(s) ? s : \'\'';
  const fuente = fs.readFileSync(path.join(__dirname, 'Tablero.gs'), 'utf8');
  assert.ok(fuente.includes(ANUL) && fuente.includes(URL), 'el código de Registros cambió: actualice la mutación');
  assert.throws(() => pruebasRegistros(crear({ 'Tablero.gs': s => s.replace(ANUL, '') })), 'mostrar anulados por defecto debe fallar');
  assert.throws(() => pruebasRegistros(crear({ 'Tablero.gs': s => s.replace(URL, 's') })), 'aceptar javascript: como enlace debe fallar');
  console.log('OK: mutación detectada (anulados visibles y enlaces no http hacen fallar las pruebas de Registros)');
})();

// ---------- T-020a historical+bot diesel efficiency ----------
function leerCsv(txt) { // Quoted CSV parser, doubled quotes, EXACT header names.
  const filas = []; let f = [], c = '', q = false;
  txt = txt.replace(/^﻿/, '');
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (q) { if (ch === '"' && txt[i + 1] === '"') { c += '"'; i++; } else if (ch === '"') q = false; else c += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { f.push(c); c = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && txt[i + 1] === '\n') i++; f.push(c); c = ''; if (f.length > 1 || f[0] !== '') filas.push(f); f = []; } else c += ch;
  }
  if (c !== '' || f.length) { f.push(c); filas.push(f); }
  const enc = filas[0];
  return { enc, filas: filas.slice(1).map(r => Object.fromEntries(enc.map((h, i) => [h, r[i] === undefined ? '' : r[i]]))) };
}
const CSV = leerCsv(fs.readFileSync(path.join(__dirname, 'fixtures', 'fuel-history.csv'), 'utf8'));
const medianaRef = a => { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
// Independent reference rule: consecutive plate/km, <=6days, efficiency8–30.
function medianasArtefacto(filas, placa) {
  const t = filas.filter(r => r.placa === placa && r.tipo === 'tanqueo' && parseFloat(r.galones) > 0).sort((a, b) => (a.fecha < b.fecha ? -1 : 1)), por = {}, valores = {};
  for (let i = 1; i < t.length; i++) {
    const a = t[i - 1], b = t[i];
    if (!a.km || !b.km) continue;
    const dias = (Date.parse(b.fecha.slice(0, 10)) - Date.parse(a.fecha.slice(0, 10))) / 86400000, kg = (b.km - a.km) / parseFloat(b.galones);
    if (dias > 6 || kg < 8 || kg > 30) continue;
    (por[b.fecha.slice(0, 7)] = por[b.fecha.slice(0, 7)] || []).push(kg); valores[b.fecha.slice(0, 10)] = kg;
  }
  const med = {}; Object.keys(por).forEach(m => { med[m] = medianaRef(por[m]); });
  return { med, valores };
}
function pruebasAcpm({ G, e }) {
  const ahora = new Date('2026-10-15T15:00:00Z');
  assert.deepStrictEqual(CSV.enc, ['fecha', 'placa', 'km', 'galones', 'total_cop', 'precio_gal', 'tipo', 'precio_atipico', 'nota', 'registrado_por']);
  assert.strictEqual(CSV.filas.length, 19);
  const T = base(G); T[G.HOJA_HIST] = CSV.filas.map(r => Object.assign({}, r));
  const antes = JSON.stringify(T);
  const U = J(G.unirTanqueos(T));
  const nTanq = CSV.filas.filter(r => r.tipo === 'tanqueo' && parseFloat(r.galones) > 0).length, nEv = CSV.filas.filter(r => r.tipo === 'evento').length;
  assert.deepStrictEqual([U.tanqueos.length, U.eventos.length, U.hayHist], [nTanq, nEv, true]);
  assert.ok(U.tanqueos.every(t => t.tipo === 'tanqueo') && nEv > 0);
  // 1. Four reference efficiency figures.
  const tr = J(G.tramosRendimiento(U.tanqueos)).filter(t => t.placa === 'TRK101');
  const v = f => tr.find(t => t.fecha.slice(0, 10) === f).kmGal;
  assert.deepStrictEqual([['2025-08-14', 11.1], ['2025-08-17', 16.9], ['2025-08-20', 26.5], ['2026-10-14', 13.3]].map(([f]) => +v(f).toFixed(1)), [11.1, 16.9, 26.5, 13.3]);
  assert.ok(Math.abs(v('2025-08-14') - (2222 - 2000) / 20) < 1e-9);
  // Monthly median equals independent CSV reference.
  const ref = medianasArtefacto(CSV.filas, 'TRK101'), va = J(G.vistaAcpm(T, { placa: 'TRK101' }, ahora)), idx = m => va.meses.indexOf(m);
  assert.ok(ref.med['2025-09'] > 0 && ref.med['2026-06'] > 0 && idx('2025-09') >= 0 && idx('2026-06') >= 0);
  assert.ok(Math.abs(va.series.TRK101.rend[idx('2025-09')] - ref.med['2025-09']) < 1e-9, '2025-09');
  assert.ok(Math.abs(va.series.TRK101.rend[idx('2026-06')] - ref.med['2026-06']) < 1e-9, '2026-06');
  va.meses.forEach((m, i) => { if (ref.med[m] === undefined) assert.strictEqual(va.series.TRK101.rend[i], null, m); else assert.ok(Math.abs(va.series.TRK101.rend[i] - ref.med[m]) < 1e-9, m); });
  assert.deepStrictEqual(Object.keys(ref.valores).filter(f => f.startsWith('2025-08')).map(f => +ref.valores[f].toFixed(1)).slice(0, 3), [11.1, 16.9, 26.5]);
  assert.deepStrictEqual([va.vehiculos.length, va.vehiculos[0].placa, va.vehiculos[0].n, va.meses[0], va.meses[va.meses.length - 1]], [1, 'TRK101', CSV.filas.filter(r => r.placa === 'TRK101' && r.tipo === 'tanqueo').length, '2025-04', '2026-10']);
  // Events excluded from charts/spending, still listed; historical outlier flagged.
  assert.ok(va.eventos.length > 0 && va.series.TRK101.puntos.length === va.vehiculos[0].n);
  assert.ok(va.todos.some(x => x.atipico && x.fecha.startsWith('2025-10-15')) && va.series.TRK101.atipicos.length > 0);
  assert.ok(!('revisar' in va), 'T-030: ya no existe «Registros para revisar»');
  // Weighted price excluding outliers; spending=sum total_cop.
  const ssz = CSV.filas.filter(r => r.placa === 'TRK101' && r.tipo === 'tanqueo' && r.precio_atipico === '' && r.total_cop && parseFloat(r.galones) > 0);
  assert.strictEqual(va.vehiculos[0].precioProm, Math.round(ssz.reduce((s, r) => s + +r.total_cop, 0) / ssz.reduce((s, r) => s + parseFloat(r.galones), 0)));
  assert.strictEqual(va.vehiculos[0].gasto, CSV.filas.filter(r => r.placa === 'TRK101' && r.tipo === 'tanqueo').reduce((s, r) => s + (+r.total_cop || 0), 0));
  // Table distance since prior refuel.
  assert.strictEqual(va.todos.find(x => x.fecha.startsWith('2025-08-14')).kmRec, 2222 - 2000);
  // Period relative to current Bogotá month.
  const v6 = J(G.vistaAcpm(T, { periodo: '6' }, ahora)), v12 = J(G.vistaAcpm(T, { periodo: '12' }, ahora));
  assert.deepStrictEqual([v6.meses[0], v12.meses[0], v6.todos.every(x => x.fecha.slice(0, 7) >= '2026-05'), v12.todos.every(x => x.fecha.slice(0, 7) >= '2025-11'), v6.vehiculos.length], ['2026-05', '2025-11', true, true, 2]);
  assert.deepStrictEqual(J(G.vistaAcpm(T, { placa: 'ZZZ', periodo: 'basura' }, ahora)).vehiculos.length, 2); // Ignore invalid filter.
  assert.doesNotThrow(() => { G.vistaAcpm(T, null, ahora); G.vistaAcpm(T, 'x', ahora); G.vistaAcpm(T, { placa: { a: 1 }, periodo: [] }, ahora); });

  // 2. Merge by plate/km, bot wins; voids/no-gallons excluded.
  const bot = (id, fecha, placa, km, gal, total, extra = {}) => mov(G, Object.assign({ ID: id, Fecha: fecha + ':00', Placa: placa, Clase: 'Adelantado', 'Categoría': 'ACPM', Km: km, Galones: gal, Total: total, 'Pagó': 'Diego', 'Registró': 'Diego' }, extra));
  T.Movimientos = [bot('B1', '2026-10-14 09:00', 'TRK101', 7266, 20, 211000),     // Duplicate latest historical refuel counted once.
    bot('B2', '2026-10-15 08:00', 'TRK101', 7500, 20, 230000),                       // New.
    bot('B3', '2026-10-15 09:00', 'TRK101', 7700, 10, 115000, { Estado: 'anulado' }), // Voided excluded.
    bot('B4', '2026-10-15 10:00', 'TRK101', 7800, '', 115000),                       // No gallons means not refuel.
    bot('B5', '2026-10-15 11:00', 'TRK101', 7900, 5, 60000, { 'Categoría': 'Peaje' })]; // Not diesel.
  const U2 = J(G.unirTanqueos(T)), ult = U2.tanqueos.filter(t => t.placa === 'TRK101').slice(-2);
  assert.strictEqual(U2.tanqueos.length, nTanq + 1);
  assert.deepStrictEqual(ult.map(t => [t.km, t.origen, t.gal]), [[7266, 'bot', 20], [7500, 'bot', 20]]);
  assert.strictEqual(U2.tanqueos.filter(t => t.placa === 'TRK101' && t.km === 7266).length, 1);
  const v2 = J(G.vistaAcpm(T, { placa: 'TRK101' }, ahora));
  assert.strictEqual(v2.vehiculos[0].n, va.vehiculos[0].n + 1);
  assert.strictEqual(v2.vehiculos[0].gasto, va.vehiculos[0].gasto - 200000 + 211000 + 230000);
  // Bot outlier differs>6% from ALL neighbors.
  const T4 = base(G); T4.Movimientos = [bot('P1', '2026-10-01 08:00', 'AAA111', 1000, 10, 100000), bot('P2', '2026-10-02 08:00', 'AAA111', 1100, 10, 100500),
    bot('P3', '2026-10-03 08:00', 'AAA111', 1200, 10, 120000), bot('P4', '2026-10-04 08:00', 'AAA111', 1300, 10, 101000),
    bot('P5', '2026-10-05 08:00', 'AAA111', 1400, 10, 101000), bot('P6', '2026-10-06 08:00', 'AAA111', 1500, 10, 111000), bot('P7', '2026-10-07 08:00', 'AAA111', 1600, 10, 111000)];
  assert.deepStrictEqual(J(G.unirTanqueos(T4)).tanqueos.map(t => t.atipico), [false, false, true, false, false, false, false]); // Sustained price step not outlier.
  const v4 = J(G.vistaAcpm(T4, {}, ahora));
  assert.deepStrictEqual([v4.hayHist, v4.vehiculos[0].n, v4.todos.some(x => x.atipico)], [false, 7, true]);

  // 3. Locale number/text/date normalization, including separator misread.
  const N = G.numHist;
  assert.deepStrictEqual([N('13.104', false), N('13,104', false), N(13.104, false), N('1.234,5', false), N('11.0', false), N('', false), N('abc', false), N(null, false)], [13.104, 13.104, 13.104, 1234.5, 11, null, null, null]);
  assert.deepStrictEqual([N('161.140', true), N('161140', true), N(161140, true), N('$ 399.962', true), N('12.0', true), N('', true)], [161140, 161140, 161140, 399962, 12, null]);
  const serial = (y, mo, d, h, mi) => Date.UTC(y, mo - 1, d, h, mi) / 86400000 + 25569;
  const T5 = base(G);
  T5[G.HOJA_HIST] = [
    { fecha: serial(2026, 10, 1, 8, 5), placa: 'TRK101', km: '400.000', galones: '10,5', total_cop: '115.000', precio_gal: '', tipo: 'tanqueo', precio_atipico: '', nota: '', registrado_por: 'Diego' },
    { fecha: '2026-10-03 09:30', placa: 'TRK101', km: 400130, galones: 13104, total_cop: 140000, precio_gal: '10684', tipo: 'tanqueo', precio_atipico: 'Sí', nota: '', registrado_por: 'Diego' },
    { fecha: 'rara', placa: 'TRK101', km: 1, galones: 5, total_cop: 1, precio_gal: 1, tipo: 'tanqueo', precio_atipico: '', nota: '', registrado_por: '' }, // Invalid date excluded.
    { fecha: '2026-10-04 10:00', placa: '', km: 1, galones: 5, total_cop: 1, precio_gal: 1, tipo: 'tanqueo', precio_atipico: '', nota: '', registrado_por: '' }]; // Missing plate excluded.
  const U5 = J(G.unirTanqueos(T5)).tanqueos;
  assert.deepStrictEqual(U5.map(t => [t.fecha, t.km, t.gal, t.total, t.precio, t.atipico]), [['2026-10-01 08:05', 400000, 10.5, 115000, 10952, false], ['2026-10-03 09:30', 400130, 13.104, 140000, 10684, true]]);
  assert.strictEqual(+J(G.tramosRendimiento(U5))[0].kmGal.toFixed(3), +(130 / 13.104).toFixed(3));

  // 4. Absent historical tab uses bot with notice; present included in SAME read.
  const T6 = base(G); T6.Movimientos = T.Movimientos.slice(0, 2);
  const v6b = J(G.vistaAcpm(T6, {}, ahora));
  assert.deepStrictEqual([v6b.hayHist, v6b.vehiculos.length, v6b.vehiculos[0].n, v6b.eventos.length], [false, 1, 2, 0]);
  e.ss = montarLectura(G, T6, e); e.correo = ADMIN2.toUpperCase(); let g0 = JSON.stringify(e.grid);
  const getDR = [];
  const orig = e.ss.getSheetByName; e.ss.getSheetByName = nm => { const s = orig(nm); if (!s) return s; const g = s.getDataRange; s.getDataRange = () => { getDR.push(nm); return g(); }; return s; };
  const a0 = J(G.api_acpm({}));
  assert.deepStrictEqual([a0.hayHist, a0.vehiculos[0].n, getDR.indexOf(G.HOJA_HIST)], [false, 2, -1]);
  assert.ok(G.validarEsquema(Object.fromEntries(Object.keys(G.ESQUEMA).map(p => [p, G.ESQUEMA[p]]))).ok); // Mandatory schema excludes optional tab.
  // Present tab uses exact headers/row1 as Sheets returns.
  e.ss = montarLectura(G, T6, e);
  e.grid[G.HOJA_HIST] = [CSV.enc.slice()].concat(CSV.filas.map(r => CSV.enc.map(c => r[c])));
  const leidas = []; const orig2 = e.ss.getSheetByName;
  e.ss.getSheetByName = nm => { const s = orig2(nm); if (!s) return s; const g = s.getDataRange; s.getDataRange = () => { leidas.push(nm); return g(); }; return s; };
  g0 = JSON.stringify(e.grid);
  const a1 = J(G.api_acpm({ placa: 'TRK101' }));
  assert.deepStrictEqual([a1.hayHist, a1.vehiculos[0].n, a1.eventos.length > 0, leidas.filter(x => x === G.HOJA_HIST).length, leidas.length === new Set(leidas).size], [true, va.vehiculos[0].n + 1, true, 1, true]); // One duplicate historical/bot refuel plus new row.
  assert.strictEqual(JSON.stringify(e.grid), g0); // Read-only.
  e.correo = DIEGOMAIL; assert.throws(() => G.api_acpm({}), /Acceso no autorizado/);
  e.correo = ''; assert.throws(() => G.api_acpm({}), /Acceso no autorizado/);
  // Bot/other dashboard paths never read optional tab.
  e.correo = ADMIN2.toUpperCase();
  const lectBot = G.leerTablas(e.ss, false);
  assert.ok(!(G.HOJA_HIST in lectBot.T) && !(G.HOJA_HIST in lectBot.encabezados));
  assert.ok(antes.length > 0 && JSON.stringify(T[G.HOJA_HIST]) === JSON.stringify(CSV.filas)); // Input data unchanged.
}
(function acpm() {
  pruebasAcpm(crear());
  const html = fs.readFileSync(path.join(__dirname, 'Index.html'), 'utf8');
  assert.ok(html.includes('data-t="acpm"') && html.includes('function vAcpm') && html.includes('api_acpm') && html.includes('Chart.js/4.4.1/chart.umd.min.js') && html.includes('Falta importar el histórico'));
  console.log('OK: pestaña Rendimiento ACPM (4 valores del artefacto, medianas 2025-09 y 2026-06, unión con el bot, anulados/eventos fuera, atípicos, sin pestaña, números y fechas de Sheets)');
})();
(function mutacionAcpm() {
  const DIAS = 'dias > TRAMO_MAX_DIAS ||', FORM = '(b.km - a.km) / b.gal', DUP = '!(h.km && visto[h.placa + \'|\' + h.km])';
  const fuente = fs.readFileSync(path.join(__dirname, 'Tablero.gs'), 'utf8');
  assert.ok(fuente.includes(DIAS) && fuente.includes(FORM) && fuente.includes(DUP), 'el código de ACPM cambió: actualice la mutación');
  assert.throws(() => pruebasAcpm(crear({ 'Tablero.gs': s => s.replace(DIAS, '') })), 'sin el máximo de 6 días debe fallar');
  assert.throws(() => pruebasAcpm(crear({ 'Tablero.gs': s => s.replace(FORM, '(b.km - a.km) / a.gal') })), 'dividir entre los galones del tanqueo anterior debe fallar');
  assert.throws(() => pruebasAcpm(crear({ 'Tablero.gs': s => s.replace(DUP, 'true') })), 'contar dos veces el duplicado debe fallar');
  console.log('OK: mutación detectada (sin tope de días, fórmula con galones anteriores y duplicados doble-contados hacen fallar las pruebas de ACPM)');
})();

// ---------- T-020b monthly profit/allocations/distance/consolidation ----------
function hojaGanancia(G, extra = []) {
  const T = base(G);
  T['Vehículos'] = [{ Placa: 'TRK202', 'Cambio de aceite cada (km)': 5000, 'Seguro vence': '2027-03-15' }, { Placa: 'TRK101', 'Seguro vence': '' }, { Placa: 'VAN303' }];
  const m = (id, fecha, placa, clase, cat, total, km) => mov(G, { ID: id, Fecha: fecha + ' 09:00:00', Placa: placa, Clase: clase, 'Categoría': cat, Total: total, Km: km === undefined ? '' : km });
  T.Movimientos = [
    m('S1', '2026-10-05', 'TRK202', 'Adelantado', 'SOAT', 888400),
    m('E1', '2026-10-06', 'TRK202', 'Adelantado', 'Seguro', 600000),            // Insurance expiry October–March six installments.
    m('E2', '2026-10-07', 'TRK202', 'Descuento', 'Seguro', 20000),              // Diego insurance discount neither expense nor allocation.
    m('E3', '2026-10-06', 'TRK101', 'Adelantado', 'Seguro', 600001),            // No expiry:12 installments with remainder.
    m('A1', '2026-10-10', 'TRK202', 'Adelantado', 'Cambio de aceite', 180000),  // Illustrative oil unit cost.
    m('A2', '2026-10-12', 'TRK202', 'Adelantado', 'Aceite', 15000),             // Loose oil normal monthly expense.
    m('K0', '2026-09-30', 'TRK202', 'Adelantado', 'Peaje', 10000, 100000), m('K1', '2026-10-31', 'TRK202', 'Adelantado', 'Peaje', 10000, 101000),
    m('K2', '2026-11-30', 'TRK202', 'Adelantado', 'Peaje', 10000, 104000), m('K3', '2026-12-10', 'TRK202', 'Adelantado', 'Peaje', 10000, 106000),
    m('G1', '2026-10-14', 'TRK202', 'Ganado', 'Cargue', 50000),
    m('Z1', '2026-10-31', 'TRK101', 'Adelantado', 'Peaje', 1000, 50000), m('Z2', '2026-11-30', 'TRK101', 'Adelantado', 'Peaje', 1000, 50500)].concat(extra);
  const cb = (id, fecha, placa, total) => fila(G, 'Cobros', { ID: id, Fecha: fecha + ' 08:00:00', Placa: placa, Cliente: 'Don Pedro', Tipo: 'flete', Producto: 'Ruedas', Cantidad: 10, Total: total, Estado: 'pendiente' });
  T.Cobros = [cb('C1', '2026-10-20', 'TRK202', 500000), cb('C2', '2026-11-20', 'TRK202', 600000)];
  return T;
}
function pruebasGanancia({ G, e }) {
  const T = hojaGanancia(G), ahora = new Date('2026-12-15T15:00:00Z'), antes = JSON.stringify(T);
  const cu = J(G.cuotasProrrateo(T, G.puntosKm(T, []))).cuotas;
  const de = (placa, rotulo) => cu.filter(c => c.placa === placa && c.rotulo.startsWith(rotulo));
  // 1. SOAT12months sum exactly, remainder last.
  const soat = de('TRK202', 'SOAT');
  assert.deepStrictEqual([soat.length, soat[0].mes, soat[11].mes, soat.reduce((s, c) => s + c.valor, 0), soat[0].valor, soat[11].valor, soat[0].rotulo], [12, '2026-10', '2027-09', 888400, 74033, 74037, 'SOAT (1/12)']);
  // 2. Insurance coverage months or12; discount excluded.
  const seg = de('TRK202', 'Seguro');
  assert.deepStrictEqual([seg.length, seg[5].mes, seg.reduce((s, c) => s + c.valor, 0), seg[0].rotulo], [6, '2027-03', 600000, 'Seguro (1/6)']);
  const sg2 = de('TRK101', 'Seguro');
  assert.deepStrictEqual([sg2.length, sg2.reduce((s, c) => s + c.valor, 0), sg2[11].valor, sg2[0].rotulo], [12, 600001, 50001, 'Seguro (1/12)']);
  // 3. Oil proportional km capped at total.
  const ace = de('TRK202', 'Cambio de aceite');
  assert.deepStrictEqual(ace.map(c => [c.mes, c.valor]), [['2026-10', 36000], ['2026-11', 108000], ['2026-12', 36000]]);
  assert.strictEqual(ace[0].rotulo, 'Cambio de aceite (por km)');
  // New change ends prior allocation and starts new km rate.
  const T2 = hojaGanancia(G, [mov(G, { ID: 'A9', Fecha: '2026-12-05 09:00:00', Placa: 'TRK202', Clase: 'Adelantado', 'Categoría': 'Cambio de aceite', Total: 100000 })]);
  const ace2 = J(G.cuotasProrrateo(T2, G.puntosKm(T2, []))).cuotas.filter(c => c.placa === 'TRK202' && c.rotulo.startsWith('Cambio'));
  // Prior remainder charged in final preceding month; installments sum Total.
  assert.deepStrictEqual(ace2.map(c => [c.mes, c.valor]), [['2026-10', 36000], ['2026-11', 108000], ['2026-11', 36000], ['2026-12', 40000]]);
  assert.strictEqual(ace2.slice(0, 3).reduce((s, c) => s + c.valor, 0), 180000);
  // Conservation by plate: model expenses equal active plated advanced+earned; unfinished oil km remains pending.
  const conserva = (TT) => {
    const M = G.modeloCarros(TT), esp = {}, got = {};
    TT.Movimientos.forEach(x => { const cl = x.Clase; if (x.Estado === 'activo' && x.Placa && (cl === 'Adelantado' || cl === 'Ganado')) esp[x.Placa] = (esp[x.Placa] || 0) + x.Total; });
    Object.keys(M.gas).forEach(p => { got[p] = Object.keys(M.gas[p]).reduce((s, mm) => s + G.sumaGasto(M.gas[p][mm]), 0); });
    return { esp, got };
  };
  let cv = conserva(T); assert.deepStrictEqual(cv.got, cv.esp);
  cv = conserva(T2); assert.deepStrictEqual([cv.esp.TRK202 - cv.got.TRK202, cv.got.TRK101 === cv.esp.TRK101], [60000, true]); // Illustrative unallocated future-distance cost.
  // Oil without km direct payment-month expense, no installments.
  const T4 = hojaGanancia(G, [mov(G, { ID: 'A8', Fecha: '2026-11-03 09:00:00', Placa: 'VAN303', Clase: 'Adelantado', 'Categoría': 'Cambio de aceite', Total: 90000 })]);
  assert.strictEqual(J(G.cuotasProrrateo(T4, G.puntosKm(T4, []))).cuotas.filter(c => c.placa === 'VAN303').length, 0);
  const g4 = J(G.vistaCarros(T4, '2026-11', ahora)).carros.find(x => x.placa === 'VAN303');
  assert.deepStrictEqual([g4.gastos.categorias.map(x => [x.categoria, x.total]), g4.gastos.total], [[['Cambio de aceite', 90000]], 90000]);
  cv = conserva(T4); assert.deepStrictEqual(cv.got, cv.esp);
  // Empty interval defaults5000km.
  delete T2['Vehículos'][0]['Cambio de aceite cada (km)'];
  assert.strictEqual(J(G.cuotasProrrateo(T2, G.puntosKm(T2, []))).cuotas.find(c => c.mes === '2026-10' && c.rotulo.startsWith('Cambio')).valor, 36000);
  // Prior insurance payment stops at next, not new-policy expiry.
  const T3 = hojaGanancia(G, [mov(G, { ID: 'E9', Fecha: '2026-12-20 09:00:00', Placa: 'TRK202', Clase: 'Adelantado', 'Categoría': 'Seguro', Total: 300000 })]);
  assert.deepStrictEqual(J(G.cuotasProrrateo(T3, G.puntosKm(T3, []))).cuotas.filter(c => c.placa === 'TRK202' && c.rotulo.startsWith('Seguro')).map(c => c.rotulo).filter((r, i, a) => a.indexOf(r) === i), ['Seguro (1/2)', 'Seguro (1/4)']);
  // 4. Last current minus last prior km; absent prior max−min, no km=null.
  const pts = G.puntosKm(T, [])['TRK202'];
  assert.deepStrictEqual(['2026-09', '2026-10', '2026-11', '2026-12', '2027-01'].map(mm => G.kmDelMes(pts, mm)), [null, 1000, 3000, 2000, null]);
  assert.strictEqual(G.kmDelMes([{ fecha: '2026-05-02 00:00', km: 10 }, { fecha: '2026-05-20 00:00', km: 90 }, { fecha: '2026-05-25 00:00', km: 70 }], '2026-05'), 80); // No prior: max−min.
  // 5. Vehicle card allocated lines, no duplicate direct SOAT; km/ratios.
  const k = J(G.vistaCarros(T, '2026-10', ahora)), a = k.carros.find(x => x.placa === 'TRK202');
  assert.deepStrictEqual(a.gastos.prorrateos.map(x => [x.rotulo, x.valor]), [['Seguro (1/6)', 100000], ['SOAT (1/12)', 74033], ['Cambio de aceite (por km)', 36000]]);
  assert.deepStrictEqual(a.gastos.categorias.map(x => [x.categoria, x.total]), [['Peaje', 10000], ['Aceite', 15000]].sort((p, q) => q[1] - p[1]));
  assert.deepStrictEqual([a.gastos.diego, a.gastos.prorrateo, a.gastos.total, a.ingresos.total, a.resultado], [50000, 210033, 285033, 500000, 214967]);
  assert.deepStrictEqual([a.km, a.sinIngresos, a.porKm], [1000, false, { ingKm: 500, costoKm: 285, ganKm: 215 }]);
  assert.strictEqual(J(G.vistaCarros(T, '2026-10', ahora)).carros.find(x => x.placa === 'TRK101').porKm.ganKm, null);
  // 6. Consolidated months; ratios=sum/sum for months with km.
  const C = J(G.vistaConsolidado(T, { placa: 'TRK202' }, ahora)), v = C.vehiculos[0];
  assert.deepStrictEqual([C.meses, C.placa, C.general, C.vehiculos.length, v.sinIngresos], [['2026-09', '2026-10', '2026-11', '2026-12'], 'TRK202', null, 1, false]);
  assert.deepStrictEqual(v.filas.map(f => [f.km, f.ingresos, f.gastos, f.ganancia]), [[null, 0, 10000, -10000], [1000, 500000, 285033, 214967], [3000, 600000, 292033, 307967], [2000, 0, 220033, -220033]]);
  assert.deepStrictEqual(v.filas[2], { mes: '2026-11', km: 3000, ingresos: 600000, otros: 0, gastos: 292033, ganancia: 307967, ingKm: 200, costoKm: 97, ganKm: 103 });
  assert.deepStrictEqual(v.total, { mes: 'Total', km: 6000, ingresos: 1100000, otros: 0, gastos: 807099, ganancia: 292901, ingKm: 183, costoKm: 133, ganKm: 50, mesesSinKm: 1 }); // Illustrative income/cost per distance, excluding no-km month.
  // Monthly card equals consolidated.
  ['2026-10', '2026-11', '2026-12'].forEach((mm, i) => {
    const c = J(G.vistaCarros(T, mm, ahora)).carros.find(x => x.placa === 'TRK202');
    assert.deepStrictEqual([c.gastos.total, c.ingresos.total, c.km], [v.filas[i + 1].gastos, v.filas[i + 1].ingresos, v.filas[i + 1].km], mm);
  });
  // 7. No-income vehicle only costs; all-vehicle sum, never average ratios.
  const D = J(G.vistaConsolidado(T, {}, ahora)), z = D.vehiculos.find(x => x.placa === 'TRK101');
  assert.deepStrictEqual(D.vehiculos.map(x => x.placa), ['TRK101', 'TRK202']); // Empty VAN303 omitted.
  assert.deepStrictEqual([z.sinIngresos, z.filas[2].ingresos, z.filas[2].ganancia, z.filas[2].ingKm, z.filas[2].ganKm, z.filas[2].costoKm], [true, null, null, null, null, 102]);
  assert.deepStrictEqual(z.total, { mes: 'Total', km: 500, ingresos: null, otros: 0, gastos: 152000, ganancia: null, ingKm: null, costoKm: 102, ganKm: null, mesesSinKm: 2 });
  assert.deepStrictEqual([D.general.sinIngresos, D.general.total.gastos, D.general.total.ingresos, D.general.total.km], [false, 959099, 1100000, 6500]);
  assert.strictEqual(D.general.total.costoKm, Math.round((797099 + 51000) / 6500)); // Sum amounts in both vehicles' km-months divided by total km.
  // 8. Bogotá-relative period filters; invalid ignored.
  const P6 = J(G.vistaConsolidado(T, { periodo: '6' }, new Date('2027-03-15T15:00:00Z')));
  assert.deepStrictEqual(P6.meses, ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03']);
  const PA = J(G.vistaConsolidado(T, { periodo: 'anio', placa: 'TRK202' }, new Date('2027-03-15T15:00:00Z')));
  assert.deepStrictEqual([PA.meses, PA.vehiculos[0].filas[0].gastos, PA.vehiculos[0].total.gastos], [['2027-01', '2027-02', '2027-03'], 174033, 3 * 174033]);
  assert.strictEqual(J(G.vistaConsolidado(T, { periodo: '12' }, ahora)).meses.length, 4); // 12month window limited by earliest sheet month.
  assert.deepStrictEqual([J(G.vistaConsolidado(T, { placa: 'XXX', periodo: '99' }, ahora)).placa, J(G.vistaConsolidado(T, 'basura', ahora)).periodo], ['', 'todo']);
  assert.deepStrictEqual(J(G.vistaConsolidado(base(G), {}, ahora)).meses, []); // No movements.
  // 9. Pure/admin-only/no writes.
  assert.strictEqual(JSON.stringify(T), antes);
  e.ss = montarLectura(G, T, e); e.correo = ADMIN2.toUpperCase(); const g0 = JSON.stringify(e.grid);
  assert.strictEqual(J(G.api_consolidado({ placa: 'TRK202' })).vehiculos[0].placa, 'TRK202');
  e.correo = DIEGOMAIL; assert.throws(() => G.api_consolidado({}), /Acceso no autorizado/);
  assert.strictEqual(JSON.stringify(e.grid), g0);
}
(function ganancia() {
  pruebasGanancia(crear());
  const html = fs.readFileSync(path.join(__dirname, 'Index.html'), 'utf8');
  assert.ok(!html.includes('data-t="consol"') && html.includes('function vConsol') && html.includes('+vConsol()') && html.includes('api_consolidado') && !html.includes('sin sueldo fijo ni prorrateos'));
  console.log('OK: ganancia por turbo (SOAT/seguro ÷ meses con residuo exacto, aceite por km con tope, km del mes, tarjeta y consolidado mes a mes, sin ingresos, filtros, solo admin)');
})();
(function mutacionGanancia() {
  const REEMPLAZA = 'reemplazados.add(m);', CLASE = "grupoDeClase(m.Clase) !== 'adelantado' || !(total > 0)", TOPE = 'Math.min(Math.round(p.total * km / cada), resta)';
  const fuente = fs.readFileSync(path.join(__dirname, 'Tablero.gs'), 'utf8');
  const SOBRANTE = 'if (sig && resta > 0) cuotas.push';
  assert.ok(fuente.includes(REEMPLAZA) && fuente.includes(CLASE) && fuente.includes(TOPE) && fuente.includes(SOBRANTE), 'el código de prorrateos cambió: actualice la mutación');
  assert.throws(() => pruebasGanancia(crear({ 'Tablero.gs': s => s.replace(SOBRANTE, 'if (false) cuotas.push') })), 'perder el sobrante del aceite cortado debe fallar');
  assert.throws(() => pruebasGanancia(crear({ 'Tablero.gs': s => s.replace(REEMPLAZA, '') })), 'contar el SOAT completo además de la cuota debe fallar');
  assert.throws(() => pruebasGanancia(crear({ 'Tablero.gs': s => s.replace(CLASE, '!(total > 0)') })), 'prorratear el Seguro de Descuento debe fallar');
  assert.throws(() => pruebasGanancia(crear({ 'Tablero.gs': s => s.replace(TOPE, 'Math.round(p.total * km / cada)') })), 'cargar más que el total del aceite debe fallar');
  console.log('OK: mutación detectada (SOAT doble, Seguro de Descuento prorrateado y aceite sin tope hacen fallar las pruebas de ganancia)');
})();

// ---------- T-031 other income by vehicle ----------
function hojaOtros(G, conUnidad = true) {
  const T = hojaCarros(G);
  const oi = (id, fecha, placa, cli, prod, unidad, cant, pu, total, estado) => fila(G, 'Cobros', Object.assign({ ID: id, Fecha: fecha + ' 08:00:00', Placa: placa, Cliente: cli, Tipo: 'Otro ingreso',
    Producto: prod, Cantidad: cant, 'Precio unitario': pu, Total: total, Estado: estado }, conUnidad ? { Unidad: unidad } : {})); // New Unidad column mocked.
  T.Cobros.push(
    oi('OI1', '2026-10-05', 'TRK202', 'Cliente Demo', 'Canastillas de piña', 'canastilla', 15, 2000, 30000, 'pagado'),
    oi('OI2', '2026-10-10', 'TRK202', 'Cliente Demo', 'Canastillas de piña', 'canastilla', 10, 2000, 20000, 'parcial'),
    oi('OI3', '2026-10-11', 'TRK202', 'Mario Ortiz', 'Tulas de cebolla', 'tula', 20, 1500, 30000, 'interno'),
    oi('OI4', '2026-10-12', 'TRK202', 'Mario Ortiz', 'Finca vacía', 'viaje', 1, '', '', 'interno'), // Bot internal state and empty Total.
    oi('OI5', '2026-10-12', 'TRK202', 'Cliente Demo', 'Canastillas de piña', 'canastilla', 50, 2000, 99999, 'anulado'),
    oi('OI6', '2026-09-30', 'TRK202', 'Cliente Demo', 'Canastillas de piña', 'canastilla', 5, 2000, 10000, 'pendiente'),
    oi('OI7', '2026-10-13', 'TRK101', 'Cliente Demo', 'Trasteo', 'viaje', 5, '', '', 'sin precio'));
  T['Pagos clientes'].push(pago(G, { ID: 'PGO1', 'ID del cobro': 'OI1', Cliente: 'Cliente Demo', Valor: 30000 }), pago(G, { ID: 'PGO2', 'ID del cobro': 'OI2', Cliente: 'Cliente Demo', Valor: 5000 }),
    pago(G, { ID: 'PGO7', 'ID del cobro': 'OI7', Cliente: 'Cliente Demo', Valor: 4000 }));
  return T;
}
function pruebasOtros(G) {
  const ahora = new Date('2026-10-15T15:00:00Z'), T = hojaOtros(G);
  const k = J(G.vistaCarros(T, '', ahora)), a = k.carros.find(x => x.placa === 'TRK202'), fl = J(G.vistaFletes(T, '', ahora));
  // 1. Other income separate with type detail; unpriced separate; void/other month excluded; total includes all income classes.
  assert.deepStrictEqual(a.ingresos, { clientes: 100000, internos: 160000, abono: 400000, abonoPendientes: 1, fletesSinPrecio: 0, otros: 80000,
    otrosDetalle: [{ producto: 'Canastillas de piña', total: 50000 }, { producto: 'Tulas de cebolla', total: 30000 }], otrosSinPrecio: 1, total: 740000 });
  // Freight totals unchanged.
  assert.deepStrictEqual([fl.fletesClientes, fl.fletesInternos, fl.ruedas, fl.carros.find(x => x.placa === 'TRK202').lista.length], [100000, 160000, 30, 2]); // Tire counts exclude crates.
  assert.deepStrictEqual(J(fl.otros.lista.map(o => [o.fecha, o.producto, o.unidad, o.cantidad, o.interno, o.total])), [
    ['2026-10-05', 'Canastillas de piña', 'canastilla', 15, false, 30000], ['2026-10-10', 'Canastillas de piña', 'canastilla', 10, false, 20000],
    ['2026-10-11', 'Tulas de cebolla', 'tula', 20, true, 30000], ['2026-10-12', 'Finca vacía', 'viaje', 1, true, null], ['2026-10-13', 'Trasteo', 'viaje', 5, false, null]]);
  assert.deepStrictEqual([fl.otros.clientes, fl.otros.internos, fl.otros.sinPrecio], [50000, 30000, 2]);
  // 2. Consolidation equals card, other-income separate; priced unpaid income counts.
  const C = J(G.vistaConsolidado(T, { placa: 'TRK202' }, ahora)).vehiculos[0], oct = C.filas.find(f => f.mes === '2026-10');
  assert.deepStrictEqual([oct.ingresos, oct.otros, C.filas.find(f => f.mes === '2026-09').otros, C.total.otros], [740000, 80000, 10000, 90000]);
  // 3. Pending prices include units/internal, admin sets price.
  const lp = J(G.listaPrecios(T)).filter(x => /^OI/.test(x.id));
  assert.deepStrictEqual(lp.map(x => [x.id, x.unidad, x.cantidad, x.cliente]), [['OI4', 'viaje', 1, 'Mario Ortiz'], ['OI7', 'viaje', 5, 'Cliente Demo']]);
  const e = (o) => Object.assign({ correo: ADMIN, clave: 'otro-ingreso-001', id: 'OI7', precio: 100000, precioVisto: 0 }, o);
  const r7 = G.guardarPrecio(T, e({ precio: 10000 }), ahora, 'E1'); // Illustrative new price minus existing payment gives partial.
  assert.deepStrictEqual(J(r7.escrituras.filter(w => w.op === 'actualizar')), [{ op: 'actualizar', hoja: 'Cobros', id: 'OI7', campos: { 'Precio unitario': 10000, Total: 50000, Estado: 'parcial' } }]);
  const r4 = G.guardarPrecio(T, e({ id: 'OI4', precio: 80000, clave: 'otro-ingreso-002' }), ahora, 'E1'); // Mario remains internal, never debt.
  assert.deepStrictEqual(J(r4.escrituras.filter(w => w.op === 'actualizar')), [{ op: 'actualizar', hoja: 'Cobros', id: 'OI4', campos: { 'Precio unitario': 80000, Total: 80000 } }]); // Already internal state unchanged.
  aplicar(G, T, r7.escrituras); aplicar(G, T, r4.escrituras);
  const dup = G.guardarPrecio(T, e({ precio: 10000 }), new Date(ahora.getTime() + 4000), 'E2'); // Same-key double tap.
  assert.deepStrictEqual(J([dup.ok, dup.duplicado, dup.escrituras]), [true, true, []]);
  assert.deepStrictEqual(J(G.listaPrecios(T)).filter(x => /^OI/.test(x.id)), []);
  assert.strictEqual(J(G.vistaFletes(T, '', ahora).otros).sinPrecio, 0);
  assert.strictEqual(J(G.vistaCarros(T, '', ahora)).carros.find(x => x.placa === 'TRK202').ingresos.otros, 160000); // Illustrative other+internal farm income.
  // 4. Customer debts aggregate active unpaid other income; paid excluded, Mario never debt.
  const cl = J(G.cobrosPorCliente(T, 'flete')).find(x => x.cliente === 'Cliente Demo');
  assert.deepStrictEqual([cl.debe, cl.desde, cl.items.map(i => [i.producto, i.saldo])], [71000, '2026-09-30', [['Canastillas de piña', 10000], ['Canastillas de piña', 15000], ['Trasteo', 46000]]]);
  assert.ok(!J(G.cobrosPorCliente(T, 'flete')).some(x => /Mario/.test(x.cliente)), 'el interno no es deuda de cliente');
  const ec = J(G.estadoCliente(T, 'Cliente Demo', ahora));
  assert.deepStrictEqual([ec.saldo, ec.total, ec.pagado, ec.cobros.map(c => [c.id, c.tipo, c.saldo]), ec.pagos.map(p => p.cobro)],
    [71000, 80000, 9000, [['OI6', 'Otro ingreso', 10000], ['OI2', 'Otro ingreso', 15000], ['OI7', 'Otro ingreso', 46000]], ['OI2', 'OI7']]);
  const v = J(G.vistaFletes(T, '2026-10', ahora));
  assert.deepStrictEqual(v.clientes.map(c => [c.cliente, c.debe]).filter(c => /Cliente Demo/.test(c[0])), [['Cliente Demo', 71000]]);
  assert.deepStrictEqual(v.pagos.find(p => p.cliente === 'Cliente Demo').pagos.map(p => p.valor).sort(), [30000, 4000, 5000]);
  // 5. Record labels.
  assert.strictEqual(J(G.buscarRegistros(T, { texto: 'cliente demo' })).filas.find(f => f.id === 'OI2').tipo, 'Otro ingreso');
  // 6. Legacy absent Unidad safe, empty unit.
  const V = hojaOtros(G, false), vv = J(G.vistaFletes(V, '', ahora));
  assert.ok(vv.otros.lista.every(o => o.unidad === '') && J(G.listaPrecios(V)).filter(x => /^OI/.test(x.id)).every(x => x.unidad === 'unidad'));
  assert.strictEqual(J(G.vistaCarros(V, '', ahora)).carros.find(x => x.placa === 'TRK202').ingresos.total, 740000);
  // 7. Daily supermarket Ganado still counts as Diego cost.
  const kv0 = a.gastos.diego;
  T.Movimientos.push(mov(G, { ID: 'MEX', Fecha: '2026-10-14 08:00:00', Placa: 'TRK202', Clase: 'Ganado', 'Categoría': 'Éxito', Total: 35000 }));
  assert.strictEqual(J(G.vistaCarros(T, '', ahora)).carros.find(x => x.placa === 'TRK202').gastos.diego - kv0, 35000);
}
(function otrosIngresos() {
  pruebasOtros(crear().G);
  const html = fs.readFileSync(path.join(__dirname, 'Index.html'), 'utf8');
  assert.ok(html.includes('function vOtros') && html.includes('+vOtros(f)') && html.includes('i.otrosDetalle') && html.includes('#Otros ingresos'));
  console.log('OK: otros ingresos (Carros y Consolidado aparte, fletes intactos, Precios con unidad y interno, Cliente Demo como cliente, anulados fuera, hoja sin Unidad)');
})();
(function mutacionOtros() {
  const TOT = 'ingresos.total = ingresos.clientes + ingresos.internos + ingresos.abono + ingresos.otros;', CLI = "(tipo === 'flete' && t === TIPO_OTRO)", INT = "if (internoCobro(it.cob)) estado = 'interno';", INC = "norm(c.Estado) === 'interno' && !(num(c.Total) > 0)";
  const f = fs.readFileSync(path.join(__dirname, 'Tablero.gs'), 'utf8');
  assert.ok(f.includes(TOT) && f.includes(CLI) && f.includes(INT) && f.includes(INC), 'el código de otros ingresos cambió: actualice la mutación');
  assert.throws(() => pruebasOtros(crear({ 'Tablero.gs': s => s.replace(TOT, 'ingresos.total = ingresos.clientes + ingresos.internos + ingresos.abono;') }).G), 'no sumar otros al total debe fallar');
  assert.throws(() => pruebasOtros(crear({ 'Tablero.gs': s => s.replace(CLI, 'false') }).G), 'Cliente Demo sin deuda debe fallar');
  assert.throws(() => pruebasOtros(crear({ 'Tablero.gs': s => s.replace(INT, '') }).G), 'el interno con precio como deuda debe fallar');
  assert.throws(() => pruebasOtros(crear({ 'Tablero.gs': s => s.replace(INC, 'false') }).G), 'sin listar el interno sin precio debe fallar');
  console.log('OK: mutación detectada (otros fuera del total, Cliente Demo sin deuda, interno convertido en deuda)');
})();

// ---------- T-031b unit plurals everywhere ----------
(function pluralOtros() {
  const { G } = crear(), ahora = new Date('2026-10-15T15:00:00Z');
  const cu = (c, u) => G.cantUnidad(c, u);
  assert.deepStrictEqual([cu(1, 'viaje'), cu(2, 'viaje'), cu(15, 'canastilla'), cu(5, 'tonelada'), cu(3, 'unidad'), cu(2.5, 'tonelada'), cu(10, 'kilo'), cu(20, 'tula'), cu(4, 'canastillas'), cu(7, ''), cu(3, 'kilogramo'), cu(2, 'bulto')],
    ['1 viaje', '2 viajes', '15 canastillas', '5 toneladas', '3 unidades', '2,5 toneladas', '10 kilos', '20 tulas', '4 canastillas', '7', '3 kilogramos', '2 bultos']);
  assert.strictEqual(cu(2, 'mol'), '2 moles'); // Consonant adds es.
  const T = hojaOtros(G), antes = J(G.vistaFletes(T, '', ahora).otros.lista.map(o => [o.cantidad, o.total, o.unidad]));
  const fl = J(G.vistaFletes(T, '', ahora));
  assert.deepStrictEqual(fl.otros.lista.map(o => o.cantTxt), ['15 canastillas', '10 canastillas', '20 tulas', '1 viaje', '5 viajes']);
  assert.deepStrictEqual(antes.map(x => x[0]), [15, 10, 20, 1, 5]); // Data stays numeric.
  assert.deepStrictEqual(J(G.listaPrecios(T)).filter(x => /^OI/.test(x.id)).map(x => [x.cantTxt, x.cantidad, x.unidad]), [['1 viaje', 1, 'viaje'], ['5 viajes', 5, 'viaje']]);
  assert.strictEqual(J(G.buscarRegistros(T, { texto: 'cliente demo' })).filas.find(f => f.id === 'OI2').concepto, 'Canastillas de piña · 10 canastillas');
  const ec = J(G.estadoCliente(T, 'Cliente Demo', ahora));
  assert.deepStrictEqual([ec.cobros.map(c => c.cantTxt), ec.sinPrecio.map(c => c.cantTxt)], [['5 canastillas', '10 canastillas'], ['5 viajes']]);
  assert.ok(G.htmlEstadoCliente(ec).includes('Canastillas de piña x 10 canastillas'));
  const d = J(G.detalleCliente(T, 'Cliente Demo', 'flete')).cobros.find(c => c.id === 'OI2');
  assert.deepStrictEqual([d.cantidad, d.cantTxt], [10, '10 canastillas']);
  // T-041: Home other-income breakdown has cantTxt; freight does not.
  const its = J(G.cobrosPorCliente(T, 'flete')).find(x => x.cliente === 'Cliente Demo').items;
  assert.ok(its.some(i => i.cantTxt === '5 canastillas' || i.cantTxt === '10 canastillas') && its.filter(i => i.cantTxt).every(i => /^\d+ \S+s$/.test(i.cantTxt)), JSON.stringify(its));
  assert.ok(!J(G.cobrosPorCliente(hojaCarros(G), 'flete')).some(x => x.items.some(i => 'cantTxt' in i)));
  // Legacy absent unit shows number only.
  assert.strictEqual(J(G.vistaFletes(hojaOtros(G, false), '', ahora)).otros.lista[0].cantTxt, '15');
  // Freight/fertilizer unchanged, no cantTxt.
  assert.ok(!('cantTxt' in J(G.detalleCliente(hojaCarros(G), 'Don Pedro')).cobros[0]));
  console.log('OK: plural de la unidad (1 viaje, 2 viajes, 15 canastillas, 2,5 toneladas, sin unidad) en Fletes, Precios, Registros, detalle y PDF; datos intactos');
})();

// ---------- T-034 diesel/km=price/gallon divided by efficiency ----------
function pruebasCostoAcpm(G) {
  const ahora = new Date('2026-10-15T15:00:00Z'), T = base(G);
  const h = (fecha, placa, km, gal, total) => ({ fecha, placa, km, galones: gal, total_cop: total, precio_gal: '', tipo: 'tanqueo', precio_atipico: '', nota: '', registrado_por: 'Diego' });
  T[G.HOJA_HIST] = [h('2026-03-10 08:00', 'XXX111', 500, 10, 50000), h('2026-09-20 08:00', 'XXX111', 900, 10, 100000),
    h('2026-10-01 08:00', 'XXX111', 1000, 10, 100000), h('2026-10-03 08:00', 'XXX111', 1153, 10, 100000), // Illustrative15.3km/gallon at sample price.
    h('2026-10-02 08:00', 'YYY222', 2000, 10, 100000)];                                                  // Single refuel no efficiency.
  const antes = JSON.stringify(T);
  const v6 = J(G.vistaAcpm(T, { periodo: '6' }, ahora)), x = v6.vehiculos.find(v => v.placa === 'XXX111'), y = v6.vehiculos.find(v => v.placa === 'YYY222');
  assert.deepStrictEqual([x.precioProm, +x.rendimiento.toFixed(1), x.costoKm], [10000, 15.3, 654]);   // Illustrative price/efficiency quotient.
  assert.deepStrictEqual([y.rendimiento, y.costoKm], [null, null]);                                   // No efficiency=null, never0.
  const s = v6.series.XXX111, mi = m => v6.meses.indexOf(m);
  assert.deepStrictEqual([s.costoKm[mi('2026-10')], s.costoKm[mi('2026-09')], s.costoKmPeriodo], [654, null, 654]); // September no segments=null.
  assert.ok(s.costoKm.length === v6.meses.length && v6.series.YYY222.costoKm.every(c => c === null) && v6.series.YYY222.costoKmPeriodo === null);
  // Plate/period filters change weighted price/cost with full history.
  assert.strictEqual(J(G.vistaAcpm(T, { placa: 'XXX111' }, ahora)).vehiculos[0].costoKm, 572);       // Illustrative lower-price quotient.
  assert.deepStrictEqual(J(G.vistaAcpm(T, { placa: 'YYY222', periodo: '6' }, ahora)).vehiculos.map(v => [v.placa, v.costoKm]), [['YYY222', null]]);
  assert.strictEqual(G.costoAcpmKm(10000, 15.3), 654);
  assert.deepStrictEqual([G.costoAcpmKm(null, 15), G.costoAcpmKm(10000, null), G.costoAcpmKm(0, 15), G.costoAcpmKm(10000, 0)], [null, null, null, null]);
  // Existing behavior unchanged.
  assert.deepStrictEqual([x.n, x.galones, x.gasto, x.tramos], [3, 30, 300000, 1]);
  assert.strictEqual(JSON.stringify(T), antes);
}
(function costoAcpm() {
  pruebasCostoAcpm(crear().G);
  const html = fs.readFileSync(path.join(__dirname, 'Index.html'), 'utf8');
  assert.ok(html.includes("'Costo ACPM por km'") && html.includes("gr('ac5'") && html.includes("mk('ac5'") && html.includes('Precio por galón ÷ km por galón del mes'));
  const fuente = fs.readFileSync(path.join(__dirname, 'Tablero.gs'), 'utf8'), DIV = 'Math.round(precio / kmGal)';
  assert.ok(fuente.includes(DIV));
  assert.throws(() => pruebasCostoAcpm(crear({ 'Tablero.gs': s => s.replace(DIV, 'Math.round(precio * kmGal)') }).G), 'multiplicar en vez de dividir debe fallar');
  assert.throws(() => pruebasCostoAcpm(crear({ 'Tablero.gs': s => s.replace('precio > 0 && kmGal > 0 ? ', 'true ? ') }).G), 'inventar costo sin rendimiento debe fallar');
  console.log('OK: costo ACPM por km (10.000 ÷ 15,3 = 654, null sin precio o rendimiento, mes sin tramos, filtros, datos intactos, 2 mutaciones)');
})();
