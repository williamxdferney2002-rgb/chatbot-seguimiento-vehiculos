// Diego ledger sheet installation (T-002), before API/webapp.

const ESQUEMA = {
  'Usuarios': ['ID Telegram', 'Nombre', 'Rol', 'Carro actual', 'Activo', 'Paga como', 'Pregunta quién pagó'],
  'Vehículos': ['Placa', 'Apodos', 'Cambio de aceite cada (km)', 'Km del último cambio de aceite',
    'SOAT vence', 'SOAT archivo', 'Técnico-mecánica vence', 'Técnico-mecánica archivo', 'Seguro vence', 'Seguro archivo'],
  'Tarifas': ['ID', 'Concepto', 'Producto', 'Ruta', 'Valor', 'Vigente desde', 'Cliente'], // T-031: default other-income Cliente appended; empty=internal.
  'Movimientos': ['ID', 'Fecha', 'Registró', 'Cuenta', 'Placa', 'Clase', 'Categoría', 'Detalle', 'Cantidad',
    'Valor unitario', 'Total', 'Pagó', 'Km', 'Galones', 'Tanque lleno', 'Comprobante', 'ID mensaje bot',
    'Corte', 'Estado', 'Origen', 'Registró ID', 'Fecha comprobante', 'Número comprobante'],
  'Clientes': ['ID', 'Nombre', 'Teléfono', 'Lugar'],
  'Cobros': ['ID', 'Fecha', 'Placa', 'Cliente', 'Tipo', 'Cantidad', 'Lugar de cargue', 'Lugar de descargue',
    'Precio de compra', 'Precio unitario', 'Total', 'Cobró', 'Estado', 'Comprobante', 'ID mensaje', 'Registró ID', 'Producto', 'Unidad'], // T-021: tire Producto appended; T-031: Unidad for crate/sack/kg/tonne/trip.
  'Pagos clientes': ['ID', 'Fecha', 'ID del cobro', 'Cliente', 'Valor', 'Medio', 'Recibió', 'Comprobante', 'Corte', 'Estado',
    'ID mensaje', 'Registró ID', 'Fecha comprobante', 'Número comprobante'],
  'Cortes': ['ID', 'Fecha de cierre', 'Saldo anterior', 'Ganado', 'Adelantado', 'Recibido', 'Descuentos',
    'Saldo final', 'PDF', 'Enviado a'],
  'Parámetros': ['Clave', 'Valor', 'Nota'],
  'Por confirmar': ['ID', 'Fecha', 'Chat ID', 'Usuario', 'Operación', 'Mensaje original', 'ID mensaje bot',
    'Estado', 'Reservado por', 'Vence'],
  'Log': ['Fecha', 'Update ID', 'Usuario', 'Entrada', 'Acción', 'Resultado', 'Origen', 'Ejecución', 'Duración ms', 'Detalle ms'],
  'Cambios': ['Fecha', 'Quién', 'Origen', 'Pestaña', 'ID registro', 'Campo', 'Antes', 'Después', 'Motivo'],
  'Inventario abono': ['ID', 'Fecha', 'Registró', 'Registró ID', 'Placa', 'Movimiento', 'Cantidad', 'Lugar', 'Cliente',
    'Precio unitario', 'Total', 'Precio dado por', 'ID cobro', 'ID mensaje bot', 'Corte', 'Estado', 'Origen', 'Comprobante']
};

// Pure. Extra columns allowed, order irrelevant; renamed column means missing.
function validarEsquema(encabezadosPorPestana) {
  const faltanPestanas = [], faltanColumnas = {};
  Object.keys(ESQUEMA).forEach(function (p) {
    const have = encabezadosPorPestana && encabezadosPorPestana[p];
    if (!have) { faltanPestanas.push(p); return; }
    const falta = ESQUEMA[p].filter(function (c) { return have.indexOf(c) === -1; });
    if (falta.length) faltanColumnas[p] = falta;
  });
  return { faltanPestanas: faltanPestanas, faltanColumnas: faltanColumnas,
    ok: !faltanPestanas.length && !Object.keys(faltanColumnas).length };
}

function instalarHoja() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const creadas = [], agregadas = [];
  Object.keys(ESQUEMA).forEach(function (nombre) {
    const cols = ESQUEMA[nombre];
    let sh = ss.getSheetByName(nombre);
    if (!sh) { sh = ss.insertSheet(nombre); creadas.push(nombre); }
    const ancho = sh.getLastColumn();
    const fila1 = ancho ? sh.getRange(1, 1, 1, ancho).getValues()[0].map(String) : [];
    const existentes = fila1.filter(function (v) { return v !== ''; });
    if (!existentes.length) {
      sh.getRange(1, 1, 1, cols.length).setValues([cols]);
    } else {
      // Never rename/reorder: append missing columns only.
      const faltan = cols.filter(function (c) { return fila1.indexOf(c) === -1; });
      if (faltan.length) {
        sh.getRange(1, fila1.length + 1, 1, faltan.length).setValues([faltan]);
        agregadas.push(nombre + ': ' + faltan.join(', '));
      }
    }
    sh.setFrozenRows(1);
  });
  const nuevosParams = asegurarParametros(ss.getSheetByName('Parámetros'));
  const nuevasTarifas = asegurarTarifas(ss.getSheetByName('Tarifas'));
  const msg = 'Pestañas creadas: ' + (creadas.join(', ') || 'ninguna') +
    '\nColumnas agregadas: ' + (agregadas.join(' | ') || 'ninguna') +
    '\nParámetros agregados: ' + (nuevosParams.join(', ') || 'ninguno') +
    '\nTarifas agregadas: ' + (nuevasTarifas.join(', ') || 'ninguna');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* No UI. */ }
  return msg;
}

// Append only missing Parámetros keys; preserve existing/order. Idempotent, returns added keys.
function asegurarParametros(sh) {
  const ancho = sh.getLastColumn(), enc = sh.getRange(1, 1, 1, ancho).getValues()[0].map(function (x) { return String(x).trim(); });
  const ci = enc.indexOf('Clave'), vi = enc.indexOf('Valor'), ni = enc.indexOf('Nota');
  if (ci < 0) throw new Error('Parámetros no tiene la columna Clave.');
  const ult = sh.getLastRow();
  const claves = ult >= 2 ? sh.getRange(2, ci + 1, ult - 1, 1).getValues().map(function (f) { return f[0]; }) : [];
  const faltan = parametrosFaltantes(claves);
  if (faltan.length) {
    const filas = faltan.map(function (p) { const f = enc.map(function () { return ''; }); f[ci] = p[0]; if (vi >= 0) f[vi] = p[1]; if (ni >= 0) f[ni] = p[2]; return f; });
    sh.getRange(ult + 1, 1, filas.length, ancho).setValues(filas);
  }
  return faltan.map(function (p) { return p[0]; });
}

// T-031: other-income [Concepto,Producto,Valor,Cliente]; zero means unpriced until admin sets it.
const TARIFAS_OTROS = [['canastilla', 'piña', 2000, 'Cliente Demo'], ['tula', 'cebolla', 1500, ''], ['finca', 'vacía', 0, ''], ['finca', 'con carga', 0, ''],
  ['Diego · Éxito diario', 'Éxito', 30000, ''], ['Diego · ida a la finca', 'Finca', 0, '']];
// Pure: missing rates by case/accent-insensitive Concepto+Producto.
function tarifasFaltantes(existentes) {
  const k = function (c, p) { return norm(c) + '|' + norm(p); };
  const hay = (existentes || []).map(function (t) { return k(t.Concepto, t.Producto); });
  return TARIFAS_OTROS.filter(function (t) { return hay.indexOf(k(t[0], t[1])) < 0; });
}
// Append missing Tarifas rows only; idempotent, returns added Concepto/Producto.
function asegurarTarifas(sh) {
  const ancho = sh.getLastColumn(), enc = sh.getRange(1, 1, 1, ancho).getValues()[0].map(function (x) { return String(x).trim(); });
  const col = function (n) { const i = enc.indexOf(n); if (i < 0) throw new Error('Tarifas no tiene la columna ' + n + '; ejecute instalarHoja.'); return i; };
  const ii = col('ID'), ci = col('Concepto'), pi = col('Producto'), vi = col('Valor'), di = col('Vigente desde'), cli = col('Cliente');
  const ult = sh.getLastRow(), datos = ult >= 2 ? sh.getRange(2, 1, ult - 1, ancho).getValues() : [];
  if (!datos.length) return []; // New empty sheet: seed base rates first, then rerun.
  const faltan = tarifasFaltantes(datos.map(function (f) { return { Concepto: f[ci], Producto: f[pi] }; }));
  if (!faltan.length) return [];
  let n = datos.reduce(function (m, f) { const x = /^T-(\d+)$/.exec(String(f[ii]).trim()); return x ? Math.max(m, Number(x[1])) : m; }, 0);
  const filas = faltan.map(function (t) {
    const f = enc.map(function () { return ''; });
    n++; f[ii] = 'T-' + ('00' + n).slice(-3); f[ci] = t[0]; f[pi] = t[1]; f[vi] = t[2]; f[di] = '2026-01-01'; f[cli] = t[3];
    return f;
  });
  sh.getRange(ult + 1, 1, filas.length, ancho).setValues(filas);
  return faltan.map(function (t) { return t[0] + '/' + t[1]; });
}

function sembrarDatosPrueba() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getName().indexOf('PRUEBA') === -1) {
    throw new Error('Solo se siembra en un archivo cuyo nombre contenga "PRUEBA". Nombre actual: ' + ss.getName());
  }
  const datos = {
    'Usuarios': [
      [1000001, 'Diego', 'conductor', 'TRK202', true, 'Diego', 'si impersonal'],
      [1000002, 'Admin', 'administrador', '', true, 'Diego', 'si impersonal'], // PRUEBA: treat as Diego.
      [1000003, 'Mario Ortiz', 'administrador', 'VAN303', true, 'Mario Ortiz', 'nunca'],
      [1000004, 'Registrador Prueba', 'registrador', '', true, '', 'si impersonal']],
    'Vehículos': [
      ['TRK202', 'turbo roja, turbo pequeña', 5000, 0, '', '', '', '', '', ''],
      ['TRK101', 'turbo grande, turbo gris', 5000, 0, '', '', '', '', '', ''],
      ['VAN303', 'camioneta', 5000, 0, '', '', '', '', '', '']],
    'Tarifas': [
      ['T-001', 'éxito', 'Éxito', '', 100000, '2026-01-01'],
      ['T-002', 'cargue', 'Material', '', 20000, '2026-01-01'],
      ['T-003', 'descargue', 'Material', '', 20000, '2026-01-01'],
      ['T-004', 'flete', 'Material', 'Ciudad Base - Pueblo Claro', 150000, '2026-01-01']],
    'Parámetros': [
      ['chat_id_grupo', '', 'ID del grupo de Telegram'],
      ['saldo_inicial_diego', 0, 'Lo da Admin'],
      ['porcentaje_seguro_diego', '', ''],
      ['seguro_mensual_diego', 10000, 'Seguro que asume Diego; se descuenta el día 1'], // T-054: seed only.
      ['aviso_aceite_km', 500, 'Avisar cuando falten estos km'],
      ['clave_vista_diego', '', 'Clave de la vista de Diego']],
    'Cortes': [['C-000', '2026-01-01', 0, 0, 0, 0, 0, 0, '', '']]
  };
  const sembradas = [], omitidas = [];
  Object.keys(datos).forEach(function (n) {
    const sh = ss.getSheetByName(n);
    if (!sh) throw new Error('Falta la pestaña ' + n + '; ejecute instalarHoja primero.');
    let filas = datos[n];
    if (n === 'Parámetros' && sh.getLastRow() > 1) { // instalarHoja added dashboard keys; seed missing only.
      const have = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(function (f) { return String(f[0]).trim(); });
      filas = filas.filter(function (f) { return have.indexOf(f[0]) < 0; });
      if (!filas.length) { omitidas.push(n); return; }
      sh.getRange(sh.getLastRow() + 1, 1, filas.length, filas[0].length).setValues(filas);
      sembradas.push(n);
      return;
    }
    if (sh.getLastRow() > 1) { omitidas.push(n); return; }
    const fila1 = sh.getRange(1, 1, 1, filas[0].length).getValues()[0].join('|');
    if (fila1 !== ESQUEMA[n].slice(0, filas[0].length).join('|')) throw new Error('Encabezados de ' + n + ' fuera del orden del ESQUEMA; no se siembra.');
    sh.getRange(2, 1, filas.length, filas[0].length).setValues(filas);
    if (n === 'Tarifas') asegurarTarifas(sh); // T-031: other-income rates after four base rates.
    sembradas.push(n);
  });
  const msg = 'Sembradas: ' + (sembradas.join(', ') || 'ninguna') + '\nOmitidas (ya tenían datos): ' + (omitidas.join(', ') || 'ninguna');
  Logger.log(msg);
  return msg;
}

// Create CLAVE_API once, never overwrite, show for n8n credential setup.
function crearClaveApi() {
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty('CLAVE_API')) p.setProperty('CLAVE_API', Utilities.getUuid() + Utilities.getUuid());
  SpreadsheetApp.getUi().alert('Clave para la credencial de n8n (no la comparta):\n\n' + p.getProperty('CLAVE_API'));
}

// Speed diagnostic from editor; inspect execution log, no writes.
function diagnosticoVelocidad() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), r = [];
  const medir = function (nombre, fn) { const t = Date.now(); let res = ''; try { res = fn(); } catch (e) { res = 'ERROR ' + e.message; } r.push(nombre + ': ' + (Date.now() - t) + ' ms ' + (res || '')); };
  r.push('Servicio Sheets activo: ' + (typeof Sheets !== 'undefined'));
  medir('Zona horaria', function () { return ss.getSpreadsheetTimeZone(); });
  medir('Caché', function () { const c = CacheService.getScriptCache(); c.put('diag', '1', 60); return c.get('diag'); });
  medir('Lectura API (batchGet)', function () { const x = leerConSheets(ss, true); return x ? 'ok' : 'NO DISPONIBLE (usa la lenta)'; });
  medir('Lectura por pestaña (lenta)', function () { leerConSpreadsheetApp(ss, true); return 'ok'; });
  medir('Candado', function () { const l = LockService.getScriptLock(); l.tryLock(5000); l.releaseLock(); return 'ok'; });
  medir('Lectura API sin cola', function () { return leerConSheets(ss, false) ? 'ok' : 'no'; });
  Logger.log(r.join('\n'));
  try { SpreadsheetApp.getUi().alert(r.join('\n')); } catch (e) { /* No UI. */ }
  return r.join('\n');
}

// Targeted PRUEBA cleanup: void duplicates/tests and set fictitious vehicles/aliases/rates.
// Find first-column ID, log Cambios; repeatable without further changes.
const AJUSTES_PRUEBA_20261014 = [
  ['Movimientos', 'M-DEMO-001', 'Estado', 'anulado', 'Duplicado por toque repetido (mensaje 75)'],
  ['Movimientos', 'M-DEMO-002', 'Estado', 'anulado', 'Duplicado por toque repetido (mensaje 75)'],
  ['Movimientos', 'M-DEMO-003', 'Estado', 'anulado', 'Duplicado por toque repetido (mensaje 75)'],
  ['Movimientos', 'M-DEMO-004', 'Estado', 'anulado', 'Duplicado por toque repetido (mensaje 75)'],
  ['Movimientos', 'M-DEMO-005', 'Estado', 'anulado', 'Prueba con pagador equivocado (mensaje 148)'],
  ['Movimientos', 'M-DEMO-006', 'Estado', 'anulado', 'Prueba con pagador equivocado (mensaje 148)'],
  ['Movimientos', 'M-DEMO-007', 'Estado', 'anulado', 'Prueba con pagador equivocado (mensaje 148)'],
  ['Movimientos', 'M-DEMO-008', 'Estado', 'anulado', 'Prueba con pagador equivocado (mensaje 148)'],
  ['Movimientos', 'M-DEMO-009', 'Estado', 'anulado', 'Placa OLD303 de prueba (la real es VAN303)'],
  ['Movimientos', 'M-DEMO-010', 'Estado', 'anulado', 'Tanqueo inventado de prueba'],
  ['Movimientos', 'M-DEMO-011', 'Estado', 'anulado', 'Tanqueo inventado de prueba'],
  ['Movimientos', 'M-DEMO-012', 'Estado', 'anulado', 'Tanqueo inventado de prueba'],
  ['Inventario abono', 'IA-DEMO-001', 'Estado', 'anulado', 'Venta de 200 bultos repetida'],
  ['Cobros', 'CB-DEMO-001', 'Estado', 'anulado', 'Venta de 200 bultos repetida'],
  ['Por confirmar', 'PC-DEMO-001', 'Estado', 'cancelado', 'Pregunta vieja sin responder'],
  ['Tarifas', 'T-002', 'Valor', 850, 'Tarifa de cargue por rueda (Admin)'],
  ['Tarifas', 'T-003', 'Valor', 850, 'Tarifa de descargue por rueda (Admin)'],
  ['Movimientos', 'M-DEMO-013', 'Cantidad', 57.06, 'Liquidación del 12/10 con la tarifa de 850'],
  ['Movimientos', 'M-DEMO-013', 'Valor unitario', 850, 'Liquidación del 12/10 con la tarifa de 850'],
  ['Movimientos', 'M-DEMO-014', 'Cantidad', 51, 'Liquidación del 12/10 con la tarifa de 850'],
  ['Movimientos', 'M-DEMO-014', 'Valor unitario', 850, 'Liquidación del 12/10 con la tarifa de 850'],
  ['Vehículos', 'TRK202', 'Apodos', 'turbo roja, turbo pequeña', 'Apodos (Admin)'],
  ['Vehículos', 'TRK101', 'Apodos', 'turbo grande, turbo gris', 'Apodos (Admin)'],
  ['Vehículos', 'OLD303', 'Apodos', 'camioneta', 'Tercer carro: camioneta de Mario (Admin)'],
  ['Vehículos', 'OLD303', 'Placa', 'VAN303', 'Tercer carro: camioneta de Mario (Admin)'],
  ['Usuarios', '1000003', 'Carro actual', 'VAN303', 'Mario maneja la camioneta (Admin)'],
  ['Usuarios', '1000003', 'Pregunta quién pagó', 'nunca', 'Corrige «nuca»: a Mario nunca se le pregunta']
];
function ajustarPrueba20261014() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getName().indexOf('PRUEBA') === -1) throw new Error('Solo para la hoja PRUEBA. Nombre actual: ' + ss.getName());
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('El bot está ocupado; intente de nuevo en un momento.');
  const hechos = [], omitidos = [], log = [], ahora = new Date();
  try {
    AJUSTES_PRUEBA_20261014.forEach(function (a) {
      const sh = ss.getSheetByName(a[0]);
      const datos = sh.getDataRange().getValues(), enc = datos[0].map(String), col = enc.indexOf(a[2]);
      const fila = datos.findIndex(function (r, i) { return i > 0 && String(r[0]).trim() === a[1]; });
      if (fila < 0 || col < 0) { omitidos.push(a[0] + ' ' + a[1] + ' (no está o ya cambió)'); return; }
      const antes = datos[fila][col];
      if (String(antes) === String(a[3])) { omitidos.push(a[0] + ' ' + a[1] + ' ' + a[2] + ' (ya estaba)'); return; }
      sh.getRange(fila + 1, col + 1).setValue(a[3]);
      log.push([ahora, Session.getActiveUser().getEmail() || 'Admin', 'Limpieza PRUEBA', a[0], a[1], a[2], antes, a[3], a[4]]);
      hechos.push(a[0] + ' ' + a[1] + ' ' + a[2] + ': ' + antes + ' → ' + a[3]);
    });
    if (log.length) { const c = ss.getSheetByName('Cambios'); c.getRange(c.getLastRow() + 1, 1, log.length, log[0].length).setValues(log); }
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
  const msg = 'Cambios hechos: ' + hechos.length + '\n' + hechos.join('\n') + (omitidos.length ? '\n\nSin cambio: ' + omitidos.length + '\n' + omitidos.join('\n') : '');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* No UI. */ }
  return msg;
}

// T-038: clean COPY of PRUEBA for working use; manually run in copy, never PRUEBA; repeatable.
const LIMPIAR_COMBUSTIBLE_HISTORICO = false; // true also clears imported Combustible histórico.
const PESTANAS_A_VACIAR = ['Movimientos', 'Cobros', 'Pagos clientes', 'Inventario abono', 'Por confirmar', 'Log', 'Cambios', 'Cortes'];
// Empty Cortes uses saldo_inicial_diego; first period C-001.
function limpiarCopiaReal(confirmado) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getName().indexOf('PRUEBA') !== -1) throw new Error('Esto NO se corre en PRUEBA; hágalo en la copia real. Nombre actual: ' + ss.getName());
  const vaciar = PESTANAS_A_VACIAR.slice();
  if (LIMPIAR_COMBUSTIBLE_HISTORICO && ss.getSheetByName(HOJA_HIST)) vaciar.push(HOJA_HIST);
  // Validate all before any write.
  const hoja = function (n) { const sh = ss.getSheetByName(n); if (!sh) throw new Error('Falta la pestaña ' + n + '; ejecute instalarHoja primero.'); return sh; };
  const enc = function (sh) { return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String); };
  const col = function (e, n, p) { const i = e.indexOf(n); if (i < 0) throw new Error(p + ' no tiene la columna ' + n + '; ejecute instalarHoja.'); return i; };
  const hojas = {};
  vaciar.concat(['Usuarios', 'Parámetros']).forEach(function (n) { hojas[n] = hoja(n); });
  const conteo = vaciar.map(function (n) { return n + ': ' + Math.max(hojas[n].getLastRow() - 1, 0); });
  const ke = enc(hojas['Cambios']), cambio = ke.map(function () { return ''; });
  const kc = ['Fecha', 'Quién', 'Origen', 'Motivo'].map(function (n) { return col(ke, n, 'Cambios'); });
  const us = hojas['Usuarios'], ue = enc(us), uNom = col(ue, 'Nombre', 'Usuarios'), uAct = col(ue, 'Activo', 'Usuarios');
  const uDatos = us.getLastRow() > 1 ? us.getRange(2, 1, us.getLastRow() - 1, ue.length).getValues() : [];
  const uFila = uDatos.findIndex(function (f) { return String(f[uNom]).trim() === 'Registrador Prueba'; });
  const ps = hojas['Parámetros'], pe = enc(ps), pCla = col(pe, 'Clave', 'Parámetros'), pVal = col(pe, 'Valor', 'Parámetros');
  const pDatos = ps.getLastRow() > 1 ? ps.getRange(2, 1, ps.getLastRow() - 1, pe.length).getValues() : [];
  const pVaciar = ['clave_vista_diego', 'saldo_inicial_diego'];
  const pFilas = []; // Only two key cells; do not rewrite column, preserving formulas.
  pDatos.forEach(function (f, i) { if (pVaciar.indexOf(String(f[pCla]).trim()) >= 0 && f[pVal] !== '') pFilas.push(i + 2); });
  const pregunta = 'Archivo: ' + ss.getName() + '\n\nSe vaciarán (filas):\n' + conteo.join('\n') + '\n(Cortes se vacía; el primer corte arranca con saldo_inicial_diego)' +
    '\nUsuarios: «Registrador Prueba» → Activo = false\nParámetros: se vacían ' + pVaciar.join(', ') + '\n\n¿Continuar?';
  let ui = null;
  if (confirmado !== true) { // No editor UI; use limpiarCopiaRealConfirmado.
    ui = SpreadsheetApp.getUi();
    if (ui.alert('Limpiar copia real', pregunta, ui.ButtonSet.YES_NO) !== ui.Button.YES) return 'Cancelado; no se tocó nada.';
  } else Logger.log(pregunta);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('El bot está ocupado; intente de nuevo en un momento.');
  const resumen = 'Vaciadas ' + conteo.join(', ') + '; Cortes vacío (arranca con saldo_inicial_diego); Registrador Prueba ' + (uFila >= 0 ? 'desactivado' : 'no encontrado') + '; vacíos ' + pVaciar.join(', ');
  try {
    vaciar.forEach(function (n) { const sh = hojas[n]; if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent(); });
    if (uFila >= 0) us.getRange(uFila + 2, uAct + 1).setValue(false);
    pFilas.forEach(function (r) { ps.getRange(r, pVal + 1).setValue(''); });
    [fechaBogota(new Date()), Session.getActiveUser().getEmail() || 'Admin', 'Limpieza copia real', resumen].forEach(function (v, i) { cambio[kc[i]] = v; });
    hojas['Cambios'].getRange(2, 1, 1, cambio.length).setValues([cambio]);
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
  const msg = 'Listo. ' + resumen + (LIMPIAR_COMBUSTIBLE_HISTORICO ? '' : '\n«' + HOJA_HIST + '» se conservó.') +
    '\n\nPASOS DESPUÉS:\n(a) Propiedades del script de la copia: CLAVE_API (crearClaveApi; la misma clave en la credencial n8n «Apps Script VehicleLedger») y CARPETA_CORTES_ID si se usaba.' +
    '\n(b) Ejecutar instalarHoja.\n(c) Nueva implementación web (bot y tablero) → URLs nuevas.' +
    '\n(d) En n8n cambiar la URL de Apps Script del bot (v7 con active:false; despublicar el viejo antes de publicar el nuevo).' +
    '\n(e) Cargar los datos de §2 de docs/paso-a-real.md (saldo_inicial_diego, IDs de Telegram, etc.).';
  Logger.log(msg);
  try { if (ui) ui.alert(msg); } catch (e) { /* No UI. */ }
  return msg;
}
// Editor entry point: selecting and running IS confirmation.
function limpiarCopiaRealConfirmado() { return limpiarCopiaReal(true); }
