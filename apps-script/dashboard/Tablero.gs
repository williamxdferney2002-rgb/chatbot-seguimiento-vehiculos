// T-013: dashboard/period closing, phase a.
// Pure core below; thin Google adapter at end.
// Reuses Bot.gs saldoDiego single balance source and conCandado,
// leerTablas/aplicarEscrituras single writer; Origen=Tablero.

const GRUPOS = ['ganado', 'adelantado', 'recibido', 'descuentos'];
const GRUPO_ROTULO = { ganado: 'Ganado', adelantado: 'Adelantado por Diego', recibido: 'Recibido', descuentos: 'Descuentos' };
const SIGNO = { ganado: 1, adelantado: 1, recibido: -1, descuentos: -1 };
const CLASE_GRUPO = { 'Ganado': 'ganado', 'Adelantado': 'adelantado', 'Recibido': 'recibido', 'Descuento': 'descuentos' };
function grupoDeClase(c) { return typeof c === 'string' && Object.prototype.hasOwnProperty.call(CLASE_GRUPO, c) ? CLASE_GRUPO[c] : null; }
const PARAMS_TABLERO = [
  ['correos_administradores', '', 'Gmail de los administradores del tablero, separados por coma'],
  ['correo_diego', '', 'Correo de Diego: recibe el estado de cuenta al cerrar el corte'],
  ['carpeta_cortes_id', '', 'Carpeta de Drive de los PDF de cortes (si está vacío se crea sola)']];
const NOMBRE_CARPETA_CORTES = 'Cortes - Registro Diego';
const RE_CLAVE = /^[A-Za-z0-9_-]{8,64}$/;

// ---------- access ----------
function listaCorreos(v) {
  return String(v === null || v === undefined ? '' : v).split(/[,;\n]/).map(function (c) { return c.trim().toLowerCase(); }).filter(function (c) { return c; });
}
function esAdministrador(T, correo) {
  const c = String(correo === null || correo === undefined ? '' : correo).trim().toLowerCase();
  return c !== '' && listaCorreos(param(T, 'correos_administradores')).indexOf(c) >= 0;
}

// ---------- new installer parameters ----------
// Pure missing key/value/note rows; preserve existing/order.
function parametrosFaltantes(clavesExistentes) {
  const have = clavesExistentes.map(function (c) { return String(c).trim(); });
  return PARAMS_TABLERO.filter(function (p) { return have.indexOf(p[0]) < 0; });
}

// ---------- statement items/daily blocks ----------
// Period items, empty=open; same saldoDiego filters, modeloEstado checks totals.
function partidasDeCorte(T, corte) {
  const c = String(corte || ''), out = [];
  tab(T, 'Movimientos').forEach(function (r) {
    if (!activoMov(r) || String(r.Corte).trim() !== c || norm(r.Cuenta) !== 'diego') return;
    let g = grupoDeClase(r.Clase);
    if (g === 'adelantado' && norm(r['Pagó']) !== 'diego') g = null;
    if (!g) return;
    out.push({ id: String(r.ID), fecha: String(r.Fecha).slice(0, 10), placa: String(r.Placa || '').trim(),
      concepto: [r['Categoría'], r.Detalle].map(function (x) { return String(x === undefined || x === null ? '' : x).trim(); }).filter(Boolean).join(' · '),
      valor: num(r.Total) || 0, grupo: g, url: SIN_ENLACE.indexOf(norm(r['Categoría'])) >= 0 ? '' : urlComprobante(r.Comprobante) }); // T-029: toll/market entries omit receipt links.
  });
  tab(T, 'Pagos clientes').forEach(function (p) {
    if (!activoMov(p) || String(p.Corte).trim() !== c || norm(p['Recibió']) !== 'diego') return;
    const cb = tab(T, 'Cobros').find(function (x) { return String(x.ID) === String(p['ID del cobro']); });
    out.push({ id: String(p.ID), fecha: String(p.Fecha).slice(0, 10), placa: cb ? String(cb.Placa || '').trim() : '',
      concepto: conceptoPago(p, cb),
      valor: num(p.Valor) || 0, grupo: 'recibido', url: urlComprobante(p.Comprobante) });
  });
  return out;
}
// T-030: payment description identifies linked freight/fertilizer customer/date/vehicle/quantity; no link retains prior text.
function conceptoPago(p, cb) {
  const t = function (x) { return String(x === undefined || x === null ? '' : x).trim(); }, cli = t(p.Cliente) || (cb ? t(cb.Cliente) : '');
  if (!cb) return ['Pago de cliente', cli, t(p.Medio)].filter(Boolean).join(' · ');
  const f = t(cb.Fecha).slice(8, 10) + '/' + t(cb.Fecha).slice(5, 7), abono = norm(cb.Tipo) === 'abono', cant = num(cb.Cantidad) || 0;
  const que = abono ? (cant ? cant + ' bultos' : '') : [cant || '', t(cb.Producto)].filter(function (x) { return x !== ''; }).join(' ');
  return [abono ? 'Pago de abono' : 'Pago de flete', cli, (abono ? '' : 'flete ') + [f, t(cb.Placa)].filter(Boolean).join(' '), que].filter(Boolean).join(' · ');
}
const SIN_ENLACE =['peaje', 'centroabastos']; // T-029: normalized categories omitting receipt links in Diego account.
// Statement model: open uses saldoDiego, closed uses Cortes; cuadra verifies blocks sum exactly.
function modeloEstado(T, corteId) {
  const id = String(corteId || '');
  let r;
  if (!id) {
    const s = saldoDiego(T), uc = ultimoCorte(T);
    r = { saldoAnterior: s.saldoAnterior, ganado: s.ganado, adelantado: s.adelantado, recibido: s.recibido + s.pagosClientes,
      descuentos: s.descuentos, saldo: s.saldo, desde: uc ? String(uc['Fecha de cierre']).slice(0, 10) : '', cierre: '' };
  } else {
    const c = tab(T, 'Cortes').find(function (x) { return String(x.ID) === id; });
    if (!c) return null;
    r = { saldoAnterior: num(c['Saldo anterior']) || 0, ganado: num(c.Ganado) || 0, adelantado: num(c.Adelantado) || 0,
      recibido: num(c.Recibido) || 0, descuentos: num(c.Descuentos) || 0, saldo: num(c['Saldo final']) || 0, desde: '', cierre: String(c['Fecha de cierre']) };
  }
  const P = partidasDeCorte(T, id), sumas = { ganado: 0, adelantado: 0, recibido: 0, descuentos: 0 };
  P.forEach(function (p) { sumas[p.grupo] += p.valor; });
  const neto = r.saldoAnterior + sumas.ganado + sumas.adelantado - sumas.recibido - sumas.descuentos;
  const cuadra = GRUPOS.every(function (k) { return Math.abs(sumas[k] - r[k]) < 0.005; }) && Math.abs(neto - r.saldo) < 0.005;
  const dias = {};
  P.forEach(function (p) { (dias[p.fecha] = dias[p.fecha] || []).push(p); });
  const bloques = Object.keys(dias).sort().map(function (f) {
    const items = dias[f].slice().sort(function (a, b) {
      return GRUPOS.indexOf(a.grupo) - GRUPOS.indexOf(b.grupo) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });
    const placas = [];
    items.forEach(function (i) { if (i.placa && placas.indexOf(i.placa) < 0) placas.push(i.placa); });
    return { fecha: f, placas: placas, items: items, total: items.reduce(function (s, i) { return s + SIGNO[i.grupo] * i.valor; }, 0) };
  });
  r.corte = id; r.abierto = !id; r.cuadra = cuadra; r.bloques = bloques;
  r.estado = r.saldo > 0 ? 'La empresa le debe a Diego' : r.saldo < 0 ? 'Diego le debe a la empresa' : 'Cuentas en cero';
  return r;
}
function contadoresPendientes(T) {
  return {
    porConfirmar: tab(T, 'Por confirmar').filter(function (p) { return norm(p.Estado) === 'pendiente'; }).length,
    ventasSinPrecio: tab(T, 'Inventario abono').filter(function (i) {
      return norm(i.Movimiento) === 'venta' && activoMov(i) && !(num(i['Precio unitario']) > 0);
    }).length,
    cobrosConSaldo: tab(T, 'Cobros').filter(function (c) { return ['pendiente', 'parcial'].indexOf(norm(c.Estado)) >= 0; }).length
  };
}
// Latest closed period missing PDF/email; C-000 seed excluded. Empty if none.
function corteSinEntregar(T) {
  const uc = ultimoCorte(T);
  if (!uc || String(uc.ID) === 'C-000') return '';
  return String(uc.PDF || '').trim() === '' || String(uc['Enviado a'] || '').trim() === '' ? String(uc.ID) : '';
}
// T-017: expiry card, no links; normal/pronto<=15days/vencido/sindato.
function vencimientosTablero(T, ahora) {
  return listaVencimientos(T, fechaBogota(ahora || new Date()).slice(0, 10)).map(function (x) {
    return { placa: x.placa, docs: x.docs.map(function (d) { return { nombre: d.nombre, vence: d.vence, dias: d.dias, nivel: d.nivel }; }) };
  });
}
// T-024: customer debts match Sunday criteria; sum balances, oldest charge date.
// T-028: optional freight/fertilizer filter; item breakdown oldest first.
// T-031: other income joins freight for customer debts/payments, excluded from freight totals.
const TIPO_OTRO = 'otro ingreso';
function tipoCobroOk(c, tipo) { const t = norm(c.Tipo); return !tipo || t === tipo || (tipo === 'flete' && t === TIPO_OTRO); }
// T-031b: Spanish plurals: final s unchanged; vowel+s, consonant+es. Text only.
function pluralUnidad(u, cant) {
  u = String(u === null || u === undefined ? '' : u).trim();
  if (!u || cant === 1 || /s$/i.test(u)) return u;
  return u + (/[aeiouáéíóú]$/i.test(u) ? 's' : 'es');
}
function cantUnidad(cant, u) { const p = pluralUnidad(u, cant); return numTxt(cant, 4) + (p ? ' ' + p : ''); }
function internoCobro(c) { return norm(c.Estado) === 'interno' || norm(c.Cliente) === norm(DUENO_TURBO); }
function cobrosPorCliente(T, tipo) {
  const por = {};
  tab(T, 'Cobros').forEach(function (c) {
    if (['pendiente', 'parcial'].indexOf(norm(c.Estado)) < 0) return;
    if (!tipoCobroOk(c, tipo)) return;
    const debe = saldoCobro(T, c);
    if (!(debe > 0.005)) return;
    const k = norm(c.Cliente), d = String(c.Fecha).slice(0, 10);
    const x = por[k] = por[k] || { cliente: String(c.Cliente).trim(), debe: 0, desde: '', items: [] };
    x.debe += debe;
    if (!x.desde || d < x.desde) x.desde = d;
    const it = { fecha: d, placa: String(c.Placa || '').trim(), producto: String(c.Producto || '').trim(), cantidad: num(c.Cantidad) || 0, saldo: debe };
    if (norm(c.Tipo) === TIPO_OTRO) it.cantTxt = cantUnidad(it.cantidad, c.Unidad); // T-041: quantity/unit/product as freight/prices.
    x.items.push(it);
  });
  Object.keys(por).forEach(function (k) { por[k].items.sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; }); });
  return Object.keys(por).map(function (k) { return por[k]; }).sort(function (a, b) { return a.desde < b.desde ? -1 : a.desde > b.desde ? 1 : 0; });
}
// T-024: all unpriced purchases/sales/customer freight plus editable Diego prices; exclude internal/voided.
// Internal refs for guardarPrecio, removed by listaPrecios.
function itemsPrecio(T) {
  const out = [], ligados = {};
  const conPrecio = function (r) { return num(r['Precio unitario']) > 0; };
  tab(T, 'Inventario abono').forEach(function (i) {
    const mov = norm(i.Movimiento);
    if (!activoMov(i) || (mov !== 'compra' && mov !== 'venta')) return;
    if (mov === 'venta' && String(i['ID cobro']).trim()) ligados[String(i['ID cobro'])] = true;
    const diego = conPrecio(i) && norm(i['Precio dado por']) === 'diego';
    if (conPrecio(i) && !diego) return;
    let cob = null;
    if (mov === 'venta') {
      cob = tab(T, 'Cobros').find(function (c) { return String(c.ID) === String(i['ID cobro']); }) || null;
      if (!cob || ['anulado', 'interno'].indexOf(norm(cob.Estado)) >= 0) return;
    }
    out.push({ tipo: mov, id: String(i.ID), inv: i, cob: cob, fecha: String(i.Fecha).slice(0, 10), placa: String(i.Placa || '').trim(),
      cliente: cob ? String(cob.Cliente || i.Cliente || '').trim() : '', lugar: String(i.Lugar || '').trim(), cantidad: num(i.Cantidad) || 0,
      producto: 'abono', unidad: 'bulto', precio: conPrecio(i) ? num(i['Precio unitario']) : 0, deDiego: diego });
  });
  tab(T, 'Cobros').forEach(function (c) {
    const sinP = norm(c.Estado) === 'sin precio' || (norm(c.Tipo) === TIPO_OTRO && norm(c.Estado) === 'interno' && !(num(c.Total) > 0)); // T-031: unpriced internal other income has interno state, empty Total.
    if (!sinP || ligados[String(c.ID)]) return;
    const prod = String(c.Producto || '').trim();
    out.push({ tipo: 'flete', id: String(c.ID), inv: null, cob: c, fecha: String(c.Fecha).slice(0, 10), placa: String(c.Placa || '').trim(),
      cliente: String(c.Cliente || '').trim(), lugar: String(c['Lugar de descargue'] || '').trim(), cantidad: num(c.Cantidad) || 0,
      producto: prod || (norm(c.Tipo) === 'abono' ? 'abono' : 'flete'), unidad: norm(c.Tipo) === TIPO_OTRO ? String(c.Unidad || '').trim() || 'unidad' : califRueda(prod) ? 'rueda' : 'bulto', precio: 0, deDiego: false });
    if (norm(c.Tipo) === TIPO_OTRO) out[out.length - 1].cantTxt = cantUnidad(num(c.Cantidad) || 0, String(c.Unidad || '').trim() || 'unidad');
  });
  return out.sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; });
}
function listaPrecios(T) {
  return itemsPrecio(T).map(function (x) {
    const o = Object.assign({}, x); delete o.inv; delete o.cob;
    o.pagado = x.cob ? pagadoDe(tab(T, 'Pagos clientes'), x.cob.ID) : 0;
    return o;
  });
}
// T-025: FIFO profit with one queue/plate, ALL active history; read-only.
// Movement rows -> sale-ID map of cost/profit/reason.
// Null profit=pending unpriced sale/consumed purchase/missing sacks, never zero. Shortage does not break subsequent queue.
function calcularPeps(movs) {
  const orden = movs.map(function (m, i) { return { m: m, i: i }; }).sort(function (a, b) {
    return a.m.fecha < b.m.fecha ? -1 : a.m.fecha > b.m.fecha ? 1 : a.i - b.i;
  });
  const colas = {}, out = {};
  orden.forEach(function (o) {
    const m = o.m, cola = colas[m.placa] = colas[m.placa] || [];
    if (m.mov === 'compra') { cola.push({ resta: m.cant, precio: m.precio, fecha: m.fecha }); return; }
    let falta = m.cant, costo = 0;
    const motivos = [];
    if (!(m.precio > 0) && !(m.total > 0)) motivos.push('venta sin precio');
    while (falta > 0.000001 && cola.length) {
      const l = cola[0], t = Math.min(l.resta, falta);
      if (l.precio > 0) costo += t * l.precio;
      else { const d = l.fecha.slice(8, 10) + '/' + l.fecha.slice(5, 7); if (motivos.indexOf('compra sin precio del ' + d) < 0) motivos.push('compra sin precio del ' + d); }
      l.resta -= t; falta -= t;
      if (l.resta <= 0.000001) cola.shift();
    }
    if (falta > 0.000001) motivos.push('faltan ' + numTxt(falta, 4) + ' bultos comprados');
    costo = Math.round(costo);
    out[m.id] = { costo: costo, ganancia: motivos.length ? null : Math.round(m.total) - costo, motivo: motivos.join('; ') };
  });
  return out;
}
// Calendar-month fertilizer view, default Bogotá month: current inventory, movements, profit and vehicle summary.
function movsAbono(T) {
  const movs = [];
  tab(T, 'Inventario abono').forEach(function (f) {
    const mov = norm(f.Movimiento);
    if (!activoMov(f) || (mov !== 'compra' && mov !== 'venta')) return;
    const cant = num(f.Cantidad) || 0, precio = num(f['Precio unitario']) > 0 ? num(f['Precio unitario']) : 0;
    const total = num(f.Total) > 0 ? num(f.Total) : Math.round(precio * cant);
    movs.push({ id: String(f.ID), fecha: String(f.Fecha), placa: String(f.Placa || '').trim(), mov: mov, cant: cant, precio: precio, total: total,
      lugar: String(f.Lugar || '').trim(), cliente: String(f.Cliente || '').trim() });
  });
  return movs;
}
function vistaAbono(T, mes, ahora) {
  const actual = fechaBogota(ahora || new Date()).slice(0, 7);
  mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(mes || '')) ? String(mes) : actual;
  const movs = movsAbono(T);
  const peps = calcularPeps(movs), inv = inventarioPorPlaca(T), por = {};
  const lista = movs.filter(function (m) { return m.fecha.slice(0, 7) === mes; }).map(function (m) {
    const p = peps[m.id], r = { id: m.id, fecha: m.fecha.slice(0, 10), placa: m.placa, mov: m.mov, cantidad: m.cant, lugar: m.lugar, cliente: m.cliente,
      precio: m.precio, total: m.total, sinPrecio: !(m.precio > 0) && !(m.total > 0), costo: p ? p.costo : null, ganancia: p ? p.ganancia : null, motivo: p ? p.motivo : '' };
    const c = por[m.placa] = por[m.placa] || { placa: m.placa, comprados: 0, vendidos: 0, valorVendido: 0, costo: 0, ganancia: 0, pendientes: 0 };
    if (m.mov === 'compra') c.comprados += m.cant;
    else {
      c.vendidos += m.cant; c.valorVendido += m.total;
      if (p.ganancia === null) c.pendientes++; else { c.costo += p.costo; c.ganancia += p.ganancia; }
    }
    return r;
  }).sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; });
  const resumen = Object.keys(por).sort().map(function (k) { return por[k]; });
  // T-028: month-independent fertilizer debts; unpriced separately without amounts.
  const clientes = cobrosPorCliente(T, 'abono');
  const sinPrecioAbono = tab(T, 'Cobros').filter(function (c) { return norm(c.Tipo) === 'abono' && norm(c.Estado) === 'sin precio'; }).map(function (c) {
    return { fecha: String(c.Fecha).slice(0, 10), placa: String(c.Placa || '').trim(), cliente: String(c.Cliente || '').trim(), cantidad: num(c.Cantidad) || 0 };
  }).sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; });
  return { mes: mes, actual: actual, clientes: clientes, totalClientes: clientes.reduce(function (s, x) { return s + x.debe; }, 0), sinPrecioClientes: sinPrecioAbono,
    inventario: Object.keys(inv).filter(function (p) { return Math.abs(inv[p]) > 0.005; }).sort().map(function (p) { return { placa: p, bultos: inv[p] }; }),
    movimientos: lista, resumen: resumen,
    gananciaMes: resumen.reduce(function (s, c) { return s + c.ganancia; }, 0), pendientesMes: resumen.reduce(function (s, c) { return s + c.pendientes; }, 0) };
}
// T-026: one customer, normalized name; exclude voided/internal charges since internal income is not debt.
// Never read purchase price; unpriced no amounts. Debt=pending/partial and balance>0.
// T-028: freight/fertilizer filter; freight tab/PDF only freight.
function detalleCliente(T, nombre, tipo) {
  const k = norm(nombre), P = tab(T, 'Pagos clientes'), ids = {};
  const cobros = tab(T, 'Cobros').filter(function (c) { return norm(c.Cliente) === k && ['anulado', 'interno'].indexOf(norm(c.Estado)) < 0 && tipoCobroOk(c, tipo); }).map(function (c) {
    const total = num(c.Total) || 0, sin = !(total > 0), pag = pagadoDe(P, c.ID), saldo = total - pag;
    ids[String(c.ID)] = true;
    const o = { id: String(c.ID), fecha: String(c.Fecha).slice(0, 10), placa: String(c.Placa || '').trim(), tipo: norm(c.Tipo) === 'abono' ? 'Abono' : norm(c.Tipo) === TIPO_OTRO ? 'Otro ingreso' : 'Flete',
      producto: String(c.Producto || '').trim(), cantidad: num(c.Cantidad) || 0, lugar: String(c['Lugar de descargue'] || c['Lugar de cargue'] || '').trim(), cargue: String(c['Lugar de cargue'] || '').trim(),
      sinPrecio: sin, precio: sin ? null : num(c['Precio unitario']) || 0, total: sin ? null : total, pagado: sin ? null : pag, saldo: sin ? null : saldo,
      estado: estadoCobro(total, pag), deuda: !sin && ['pendiente', 'parcial'].indexOf(norm(c.Estado)) >= 0 && saldo > 0.005, cliente: String(c.Cliente).trim() };
    if (norm(c.Tipo) === TIPO_OTRO) o.cantTxt = cantUnidad(o.cantidad, c.Unidad);
    return o;
  }).sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; });
  const pagos = P.filter(function (p) { return activoMov(p) && ids[String(p['ID del cobro'])]; }).map(function (p) {
    return { cobro: String(p['ID del cobro']), fecha: String(p.Fecha).slice(0, 10), valor: num(p.Valor) || 0, medio: String(p.Medio || '').trim(), recibio: String(p['Recibió'] || '').trim() };
  }).sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; });
  return { cliente: cobros.length ? cobros[0].cliente : String(nombre).trim(), cobros: cobros, pagos: pagos };
}
// T-026: customer statement=current debts+their payments+unpriced items; null unknown customer.
function estadoCliente(T, nombre, ahora) {
  const d = detalleCliente(T, nombre, 'flete');
  if (!d.cobros.length) return null;
  const deudas = d.cobros.filter(function (c) { return c.deuda; }), ids = {};
  deudas.forEach(function (c) { ids[c.id] = true; });
  const suma = function (campo) { return deudas.reduce(function (s, c) { return s + c[campo]; }, 0); };
  return { cliente: d.cliente, fecha: fechaBogota(ahora || new Date()).slice(0, 10), cobros: deudas, pagos: d.pagos.filter(function (p) { return ids[p.cobro]; }),
    sinPrecio: d.cobros.filter(function (c) { return c.sinPrecio; }).map(function (c) { const o = { fecha: c.fecha, placa: c.placa, producto: c.producto, cantidad: c.cantidad }; if (c.cantTxt) o.cantTxt = c.cantTxt; return o; }),
    total: suma('total'), pagado: suma('pagado'), saldo: suma('saldo') };
}
// T-031: normalize active other income; internal via Mario customer/state; null total=unpriced.
function otrosIngresos(T) {
  return tab(T, 'Cobros').filter(function (c) { return norm(c.Tipo) === TIPO_OTRO && norm(c.Estado) !== 'anulado'; }).map(function (c) {
    const total = num(c.Total) || 0, interno = internoCobro(c);
    return { mes: mesDe(c.Fecha), fecha: String(c.Fecha).slice(0, 10), placa: String(c.Placa || '').trim(), producto: String(c.Producto || '').trim() || 'Otro ingreso',
      unidad: String(c.Unidad || '').trim(), cantidad: num(c.Cantidad) || 0, cantTxt: cantUnidad(num(c.Cantidad) || 0, c.Unidad), interno: interno, cliente: interno ? DUENO_TURBO : String(c.Cliente || '').trim(),
      total: total > 0 ? total : null, estado: norm(c.Estado) };
  });
}
// T-026: month-independent debts/details and monthly freight by vehicle, default Bogotá month.
function vistaFletes(T, mes, ahora) {
  const actual = fechaBogota(ahora || new Date()).slice(0, 7);
  mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(mes || '')) ? String(mes) : actual;
  const clientes = cobrosPorCliente(T, 'flete'), detalles = clientes.map(function (x) { return detalleCliente(T, x.cliente, 'flete'); });
  clientes.forEach(function (x, i) { x.n = detalles[i].cobros.filter(function (c) { return c.deuda; }).length; });
  const por = {}, diasMap = {};
  tab(T, 'Cobros').forEach(function (c) {
    const est = norm(c.Estado), interno = est === 'interno';
    if (est === 'anulado' || norm(c.Tipo) !== 'flete' || String(c.Fecha).slice(0, 7) !== mes) return;
    const placa = String(c.Placa || '').trim(), x = por[placa] = por[placa] || { placa: placa, ruedas: 0, clientes: 0, internos: 0, sinPrecio: 0, lista: [] };
    const cant = num(c.Cantidad) || 0, total = num(c.Total) || 0;
    if (/^ruedas/.test(norm(c.Producto))) x.ruedas += cant;
    if (!(total > 0)) x.sinPrecio++; else if (interno) x.internos += total; else x.clientes += total;
    x.lista.push({ fecha: String(c.Fecha).slice(0, 10), producto: String(c.Producto || '').trim(), cantidad: cant, lugar: String(c['Lugar de cargue'] || '').trim(),
      cliente: interno ? DUENO_TURBO : String(c.Cliente).trim(), interno: interno, total: total > 0 ? total : null });
    // T-028: plate/day blocks, monthly subtotal criteria.
    const fecha = String(c.Fecha).slice(0, 10), dk = fecha + '|' + placa;
    const dd = diasMap[dk] = diasMap[dk] || { fecha: fecha, placa: placa, ruedas: 0, clientes: 0, internos: 0, sinPrecio: 0, lineas: [] };
    if (/^ruedas/.test(norm(c.Producto))) dd.ruedas += cant;
    if (!(total > 0)) dd.sinPrecio++; else if (interno) dd.internos += total; else dd.clientes += total;
    dd.lineas.push({ cantidad: cant, producto: String(c.Producto || '').trim(), lugar: String(c['Lugar de descargue'] || c['Lugar de cargue'] || '').trim(),
      cliente: interno ? DUENO_TURBO : String(c.Cliente).trim(), interno: interno, total: total > 0 ? total : null });
  });
  const dias = Object.keys(diasMap).map(function (k) { return diasMap[k]; }).sort(function (a, b) {
    return a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : a.placa < b.placa ? -1 : a.placa > b.placa ? 1 : 0;
  });
  const carros = Object.keys(por).sort().map(function (k) {
    por[k].lista.sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; });
    return por[k];
  });
  const sum = function (campo) { return carros.reduce(function (s, c) { return s + c[campo]; }, 0); };
  // T-029: monthly customer freight payments by customer/charge; exclude fertilizer/internal/voided.
  const P = tab(T, 'Pagos clientes'), fl = {}, pcli = {};
  tab(T, 'Cobros').forEach(function (c) { if (tipoCobroOk(c, 'flete') && ['anulado', 'interno'].indexOf(norm(c.Estado)) < 0) fl[String(c.ID)] = c; });
  P.forEach(function (p) {
    const c = fl[String(p['ID del cobro'])];
    if (!c || !activoMov(p) || String(p.Fecha).slice(0, 7) !== mes) return;
    const total = num(c.Total) || 0, k = norm(c.Cliente), x = pcli[k] = pcli[k] || { cliente: String(c.Cliente).trim(), total: 0, pagos: [] };
    const valor = num(p.Valor) || 0;
    x.total += valor;
    x.pagos.push({ id: String(p.ID), fecha: String(p.Fecha).slice(0, 10), valor: valor, medio: String(p.Medio || '').trim(), recibio: String(p['Recibió'] || '').trim(), url: urlComprobante(p.Comprobante),
      flete: { fecha: String(c.Fecha).slice(0, 10), placa: String(c.Placa || '').trim(), cantidad: num(c.Cantidad) || 0, producto: String(c.Producto || '').trim(),
        pagado: estadoCobro(total, pagadoDe(P, c.ID)) === 'pagado' } });
  });
  const pagos = Object.keys(pcli).sort().map(function (k) {
    pcli[k].pagos.sort(function (a, b) { return a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0; });
    return pcli[k];
  });
  const ol = otrosIngresos(T).filter(function (o) { return o.mes === mes; }).sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; }), op = {};
  ol.forEach(function (o) {
    const x = op[o.placa] = op[o.placa] || { placa: o.placa, clientes: 0, internos: 0, sinPrecio: 0, tipos: {} };
    if (o.total === null) x.sinPrecio++; else { x[o.interno ? 'internos' : 'clientes'] += o.total; x.tipos[o.producto] = (x.tipos[o.producto] || 0) + o.total; }
  });
  const otrosCarros = Object.keys(op).sort().map(function (k) {
    const x = op[k]; x.tipos = Object.keys(x.tipos).sort().map(function (t) { return { producto: t, total: x.tipos[t] }; }); return x;
  });
  const otros = { lista: ol, porCarro: otrosCarros, clientes: otrosCarros.reduce(function (s, x) { return s + x.clientes; }, 0),
    internos: otrosCarros.reduce(function (s, x) { return s + x.internos; }, 0), sinPrecio: otrosCarros.reduce(function (s, x) { return s + x.sinPrecio; }, 0) };
  return { mes: mes, actual: actual, otros: otros, clientes: clientes, detalles: detalles, totalClientes: clientes.reduce(function (s, x) { return s + x.debe; }, 0),
    pagos: pagos, totalPagos: pagos.reduce(function (s, x) { return s + x.total; }, 0), carros: carros, dias: dias, ruedas: sum('ruedas'), fletesClientes: sum('clientes'), fletesInternos: sum('internos') };
}
// ---------- T-020a: historical+bot fuel, pure/read-only ----------
const TRAMO_MAX_DIAS = 6, KMGAL_MIN = 8, KMGAL_MAX = 30, ATIPICO_PCT = 0.06;
function diaDe(f) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f)); return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000) : null; }
// Historical number/text with locale dot/comma decimals; integer mode km/money treats separators as thousands.
function numHist(v, entero) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let s = String(v === null || v === undefined ? '' : v).replace(/[$\s]/g, '');
  if (!/^-?[\d.,]+$/.test(s)) return null;
  if (entero) { s = s.replace(/[.,]0{1,2}$/, '').replace(/[.,]/g, ''); return /^-?\d+$/.test(s) ? +s : null; }
  if (s.indexOf(',') >= 0) s = s.indexOf('.') >= 0 ? s.replace(/\./g, '').replace(',', '.') : s.replace(',', '.');
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}
function fechaHist(v) {
  const s = typeof v === 'number' ? serialAFecha(v) : String(v === null || v === undefined ? '' : v).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? (s + ' 00:00').slice(0, 16) : '';
}
function filasHist(T) {
  return tab(T, HOJA_HIST).map(function (r) {
    const fecha = fechaHist(r.fecha), placa = String(r.placa === undefined ? '' : r.placa).trim();
    if (!fecha || !placa) return null;
    let gal = numHist(r.galones, false);
    if (gal > 200) gal = gal / 1000; // Locale may read13.104 as13104; no refuel exceeds200 gallons.
    const km = numHist(r.km, true), total = numHist(r.total_cop, true);
    let precio = numHist(r.precio_gal, true);
    if (!(precio > 0) && total > 0 && gal > 0) precio = Math.round(total / gal);
    return { fecha: fecha, dia: diaDe(fecha), placa: placa, km: km > 0 ? km : null, gal: gal > 0 ? gal : null, total: total > 0 ? total : null, precio: precio > 0 ? precio : null,
      tipo: norm(r.tipo) === 'evento' ? 'evento' : 'tanqueo', atipico: norm(r.precio_atipico) === 'si', nota: String(r.nota === undefined ? '' : r.nota).trim(),
      quien: String(r.registrado_por === undefined ? '' : r.registrado_por).trim(), origen: 'hist' };
  }).filter(Boolean);
}
function filasBot(T) {
  return tab(T, 'Movimientos').filter(function (m) { return activoMov(m) && m['Categoría'] === 'ACPM' && num(m.Galones) > 0; }).map(function (m) {
    const gal = num(m.Galones), total = num(m.Total) > 0 ? num(m.Total) : null, fecha = String(m.Fecha).slice(0, 16);
    return { fecha: fecha, dia: diaDe(fecha), placa: String(m.Placa || '').trim(), km: num(m.Km) > 0 ? num(m.Km) : null, gal: gal, total: total, precio: total ? Math.round(total / gal) : null,
      tipo: 'tanqueo', atipico: false, nota: '', quien: String(m['Registró'] || '').trim(), origen: 'bot' };
  });
}
// Merge historical refuels and bot; same plate/km dedupes, bot wins. Events separate.
function unirTanqueos(T) {
  const hist = filasHist(T), bot = filasBot(T), visto = {};
  bot.forEach(function (b) { if (b.km) visto[b.placa + '|' + b.km] = true; });
  const tanq = hist.filter(function (h) { return h.tipo === 'tanqueo' && h.gal && !(h.km && visto[h.placa + '|' + h.km]); }).concat(bot)
    .map(function (t, i) { t.i = i; return t; }).sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.i - b.i; });
  // Bot outlier price differs>6% from neighboring same-plate prices, excluding historical outliers.
  const por = {};
  tanq.forEach(function (t) { (por[t.placa] = por[t.placa] || []).push(t); });
  Object.keys(por).forEach(function (p) {
    const L = por[p];
    L.forEach(function (t, i) {
      if (t.origen !== 'bot' || !t.precio) return;
      const vec = [L[i - 1], L[i + 1]].filter(function (x) { return x && x.precio && !x.atipico; });
      if (!vec.length) return;
      t.atipico = vec.every(function (x) { return Math.abs(t.precio - x.precio) / x.precio > ATIPICO_PCT; }); // Must differ from ALL neighbors; sustained rate change not outlier.
    });
  });
  return { tanqueos: tanq, eventos: hist.filter(function (h) { return h.tipo === 'evento'; }), hayHist: !!(T && T[HOJA_HIST]) };
}
function mediana(a) {
  if (!a.length) return null;
  const s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
// Efficiency segment=consecutive same-plate refuels, <=6days,8–30km/gallon,
// (current km−prior km)/current gallons; tanqueos date-sorted.
function tramosRendimiento(tanqueos) {
  const por = {}, out = [];
  tanqueos.forEach(function (t) { (por[t.placa] = por[t.placa] || []).push(t); });
  Object.keys(por).forEach(function (placa) {
    const L = por[placa];
    for (let i = 1; i < L.length; i++) {
      const a = L[i - 1], b = L[i];
      if (!a.km || !b.km || b.km <= a.km || !(b.gal > 0)) continue;
      const dias = b.dia - a.dia, kg = (b.km - a.km) / b.gal;
      if (dias < 0 || dias > TRAMO_MAX_DIAS || kg < KMGAL_MIN || kg > KMGAL_MAX) continue;
      out.push({ placa: placa, fecha: b.fecha, mes: b.fecha.slice(0, 7), km: b.km - a.km, gal: b.gal, kmGal: kg });
    }
  });
  return out;
}
// T-027/T-020a: monthly median segment efficiency; diesel/km=monthly spending/monthly km.
// Monthly km=last current−last prior month, otherwise current max−min.
function rendimientoMes(T, placa, mes) {
  const U = unirTanqueos(T).tanqueos.filter(function (t) { return t.placa === placa; });
  const tr = tramosRendimiento(U).filter(function (t) { return t.mes === mes; });
  const delMes = U.filter(function (t) { return t.fecha.slice(0, 7) === mes; });
  const km = kmDelMes(puntosKm(T, U)[placa] || [], mes) || 0; // T-020b: same km as vehicles/consolidation.
  const valor = delMes.reduce(function (s, t) { return s + (t.total || 0); }, 0), gal = delMes.reduce(function (s, t) { return s + t.gal; }, 0);
  return { n: tr.length, km: km > 0 ? km : 0, gal: gal, valor: valor, kmGal: tr.length ? mediana(tr.map(function (t) { return t.kmGal; })) : null, acpmKm: km > 0 && valor > 0 ? Math.round(valor / km) : null };
}
function mesMasSrv(m, d) { let y = +m.slice(0, 4), n = +m.slice(5, 7) - 1 + d; y += Math.floor(n / 12); n = ((n % 12) + 12) % 12; return y + '-' + ('0' + (n + 1)).slice(-2); }
// T-034: diesel/km=price/gallon divided by efficiency; whole pesos, null if missing.
function costoAcpmKm(precio, kmGal) { return precio > 0 && kmGal > 0 ? Math.round(precio / kmGal) : null; }
// T-020a: validated plate/todo|12|6 filter; Bogotá-relative current month.
function vistaAcpm(T, filtro, ahora) {
  const f = filtro && typeof filtro === 'object' ? filtro : {};
  const actual = fechaBogota(ahora || new Date()).slice(0, 7), periodo = ['6', '12'].indexOf(String(f.periodo)) >= 0 ? String(f.periodo) : 'todo';
  const U = unirTanqueos(T), todos = U.tanqueos, placas = [];
  todos.forEach(function (t) { if (placas.indexOf(t.placa) < 0) placas.push(t.placa); });
  placas.sort();
  const placa = placas.indexOf(String(f.placa)) >= 0 ? String(f.placa) : '', desde = periodo === 'todo' ? '' : mesMasSrv(actual, -(+periodo - 1));
  const ok = function (t) { return (!placa || t.placa === placa) && (!desde || t.fecha.slice(0, 7) >= desde); };
  // Km since previous same-plate refuel across all history, before filter.
  const ultKm = {};
  todos.forEach(function (t) { t.kmRec = t.km && ultKm[t.placa] && t.km > ultKm[t.placa] ? t.km - ultKm[t.placa] : null; if (t.km) ultKm[t.placa] = t.km; });
  const L = todos.filter(ok), tr = tramosRendimiento(todos).filter(ok);
  const sum = function (a, c) { return a.reduce(function (s, x) { return s + (x[c] || 0); }, 0); };
  const pond = function (a) { const b = a.filter(function (t) { return !t.atipico && t.total && t.gal; }); return b.length ? Math.round(sum(b, 'total') / sum(b, 'gal')) : null; };
  const pls = placa ? [placa] : placas.filter(function (p) { return L.some(function (t) { return t.placa === p; }); });
  const vehiculos = pls.map(function (p) {
    const a = L.filter(function (t) { return t.placa === p; }), kms = a.filter(function (t) { return t.km; }).map(function (t) { return t.km; }), r = tr.filter(function (t) { return t.placa === p; });
    return { placa: p, n: a.length, primero: a.length ? a[0].fecha.slice(0, 10) : '', ultimo: a.length ? a[a.length - 1].fecha.slice(0, 10) : '', galones: Math.round(sum(a, 'gal') * 1000) / 1000,
      gasto: Math.round(sum(a, 'total')), precioProm: pond(a), kmMin: kms.length ? Math.min.apply(null, kms) : null, kmMax: kms.length ? Math.max.apply(null, kms) : null,
      rendimiento: r.length ? mediana(r.map(function (t) { return t.kmGal; })) : null, tramos: r.length };
  });
  vehiculos.forEach(function (v) { v.costoKm = costoAcpmKm(v.precioProm, v.rendimiento); });
  const meses = [];
  if (L.length) for (let m = L[0].fecha.slice(0, 7); m <= L[L.length - 1].fecha.slice(0, 7); m = mesMasSrv(m, 1)) meses.push(m);
  const series = {};
  pls.forEach(function (p) {
    const a = L.filter(function (t) { return t.placa === p; }), r = tr.filter(function (t) { return t.placa === p; });
    series[p] = { precio: meses.map(function (m) { return pond(a.filter(function (t) { return t.fecha.slice(0, 7) === m; })); }),
      atipicos: a.filter(function (t) { return t.atipico && t.precio; }).map(function (t) { return { mes: t.fecha.slice(0, 7), precio: t.precio }; }),
      gasto: meses.map(function (m) { return Math.round(sum(a.filter(function (t) { return t.fecha.slice(0, 7) === m; }), 'total')); }),
      puntos: a.map(function (t) { return { dia: t.dia, fecha: t.fecha.slice(0, 10), gal: Math.round(t.gal * 1000) / 1000 }; }),
      rend: meses.map(function (m) { const z = r.filter(function (t) { return t.mes === m; }); return z.length ? mediana(z.map(function (t) { return t.kmGal; })) : null; }),
      rendN: meses.map(function (m) { return r.filter(function (t) { return t.mes === m; }).length; }),
      rendPeriodo: r.length ? mediana(r.map(function (t) { return t.kmGal; })) : null };
    const sp = series[p];
    sp.costoKm = meses.map(function (m, i) { return costoAcpmKm(sp.precio[i], sp.rend[i]); });
    sp.costoKmPeriodo = costoAcpmKm(vehiculos.find(function (v) { return v.placa === p; }).precioProm, sp.rendPeriodo);
  });
  // T-030: removed review section; outliers remain table/chart.
  const fila = function (t) { return { fecha: t.fecha, placa: t.placa, km: t.km, kmRec: t.kmRec, gal: Math.round(t.gal * 1000) / 1000, total: t.total, precio: t.precio, atipico: t.atipico, nota: t.nota, origen: t.origen }; };
  return { hayHist: U.hayHist, actual: actual, periodo: periodo, placa: placa, placas: placas, meses: meses, vehiculos: vehiculos, series: series,
    todos: L.slice().reverse().map(fila), tramos: tr.length,
    eventos: U.eventos.filter(ok).map(function (e) { return { fecha: e.fecha, placa: e.placa, km: e.km, nota: e.nota, quien: e.quien }; }).sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; }) };
}
// T-027: oil due=last+interval versus highest active km, same textoAceite; null without interval.
function aceiteCarro(T, placa) {
  const v = tab(T, 'Vehículos').find(function (x) { return String(x.Placa).trim() === placa; });
  const cada = v ? num(v['Cambio de aceite cada (km)']) : 0, ult = v ? num(v['Km del último cambio de aceite']) || 0 : 0;
  if (!(cada > 0)) return null;
  if (!(ult > 0)) return { sinDato: true };
  const umbral = num(param(T, 'aviso_aceite_km')) > 0 ? num(param(T, 'aviso_aceite_km')) : 500;
  const km = tab(T, 'Movimientos').reduce(function (a, m) { return activoMov(m) && String(m.Placa).trim() === placa ? Math.max(a, num(m.Km) || 0) : a; }, 0);
  const prox = ult + cada;
  return { sinDato: false, prox: prox, km: km || null, falta: km > 0 ? prox - km : null, alerta: km > 0 && prox - km <= umbral };
}
// ---------- T-020b: monthly profit/allocations/per-km, pure/read-only, whole pesos ----------
const RUBROS_12 = ['SOAT', 'Técnico-mecánica'], ACEITE_KM_DEFECTO = 5000;
function mesDe(f) { return String(f).slice(0, 7); }
function difMeses(a, b) { return (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7)); }
// n whole installments sum EXACT total; remainder last.
function partirTotal(total, n) { const c = Math.floor(total / n), out = []; for (let i = 0; i < n - 1; i++) out.push(c); out.push(total - c * (n - 1)); return out; }
// Plate/date odometer points: merged refuels plus other active Km movements.
function puntosKm(T, tanqueos) {
  const L = [], por = {};
  tanqueos.forEach(function (t) { if (t.km) L.push({ placa: t.placa, fecha: t.fecha, km: t.km }); });
  tab(T, 'Movimientos').forEach(function (m) {
    const km = num(m.Km), placa = String(m.Placa || '').trim();
    if (!activoMov(m) || !placa || !(km > 0) || (m['Categoría'] === 'ACPM' && num(m.Galones) > 0)) return; // Bot refuels already in tanqueos.
    L.push({ placa: placa, fecha: String(m.Fecha).slice(0, 16), km: km });
  });
  L.map(function (p, i) { p.i = i; return p; }).sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.i - b.i; })
    .forEach(function (p) { (por[p.placa] = por[p.placa] || []).push(p); });
  return por;
}
// Monthly km=last current−last earlier; absent earlier uses max−min; absent/no advance=null.
function kmDelMes(pts, mes) {
  const del = pts.filter(function (p) { return mesDe(p.fecha) === mes; });
  if (!del.length) return null;
  const ant = pts.filter(function (p) { return mesDe(p.fecha) < mes; }).pop(), ks = del.map(function (p) { return p.km; });
  const km = ant ? del[del.length - 1].km - ant.km : Math.max.apply(null, ks) - Math.min.apply(null, ks);
  return km > 0 ? km : null;
}
// Allocate active plated Adelantado only, never Descuento insurance: SOAT/inspection12months, insurance coverage months;
// oil by km. Return replaced direct rows and plate/month/label/value installments.
function cuotasProrrateo(T, ptsPor) {
  const reemplazados = new Set(), cuotas = [], veh = {}, grupos = {};
  tab(T, 'Vehículos').forEach(function (v) { veh[String(v.Placa).trim()] = v; });
  tab(T, 'Movimientos').forEach(function (m) {
    const placa = String(m.Placa || '').trim(), cat = String(m['Categoría'] || '').trim(), total = Math.round(num(m.Total) || 0);
    if (!activoMov(m) || !placa || grupoDeClase(m.Clase) !== 'adelantado' || !(total > 0) || !/^\d{4}-\d{2}-\d{2}/.test(String(m.Fecha))) return;
    if (RUBROS_12.indexOf(cat) < 0 && cat !== 'Seguro' && cat !== 'Cambio de aceite') return;
    reemplazados.add(m);
    const k = placa + '|' + cat;
    (grupos[k] = grupos[k] || []).push({ mov: m, placa: placa, cat: cat, total: total, fecha: String(m.Fecha).slice(0, 10), mes: mesDe(m.Fecha) });
  });
  Object.keys(grupos).forEach(function (k) {
    const L = grupos[k].sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; });
    L.forEach(function (p, i) {
      const v = veh[p.placa] || {};
      const poner = function (rotulo, partes) { partes.forEach(function (valor, j) { if (valor) cuotas.push({ placa: p.placa, mes: mesMasSrv(p.mes, j), rotulo: rotulo, valor: valor }); }); };
      if (p.cat === 'Cambio de aceite') {
        const sig = L[i + 1] || null, pts = ptsPor[p.placa] || [], cada = num(v['Cambio de aceite cada (km)']) > 0 ? num(v['Cambio de aceite cada (km)']) : ACEITE_KM_DEFECTO;
        if (sig && sig.mes === p.mes) { reemplazados.delete(p.mov); return; } // Two changes same month: first remains direct, km cannot separate.
        if (!pts.length) { reemplazados.delete(p.mov); return; } // No plate km: full payment-month direct cost.
        const fin = sig ? mesMasSrv(sig.mes, -1) : mesDe(pts[pts.length - 1].fecha); // Until next change or last known km.
        let resta = p.total;
        for (let m = p.mes; m <= fin && resta > 0; m = mesMasSrv(m, 1)) {
          const km = kmDelMes(pts, m);
          if (!km) continue;
          const c = Math.min(Math.round(p.total * km / cada), resta); // Rate=total/interval, capped total.
          if (c > 0) cuotas.push({ placa: p.placa, mes: m, rotulo: 'Cambio de aceite (por km)', valor: c });
          resta -= c;
        }
        // Later change ends allocation; remainder in last preceding month ensures installments sum Total.
        if (sig && resta > 0) cuotas.push({ placa: p.placa, mes: fin, rotulo: 'Cambio de aceite (por km)', valor: resta });
        return;
      }
      let n = 12;
      if (p.cat === 'Seguro') {
        const vd = String(v['Seguro vence'] === undefined || v['Seguro vence'] === null ? '' : v['Seguro vence']).slice(0, 10), sig = L.slice(i + 1).find(function (x) { return x.mes > p.mes; });
        if (sig) n = Math.max(1, difMeses(p.mes, sig.mes)); // Current insurance expiry applies only current policy; earlier payment allocates until next payment.
        else if (/^\d{4}-\d{2}-\d{2}$/.test(vd) && vd > p.fecha) n = difMeses(p.mes, mesDe(vd)) + 1;
      }
      poner(p.cat + ' (1/' + n + ')', partirTotal(p.total, n));
    });
  });
  return { reemplazados: reemplazados, cuotas: cuotas };
}
function nuevoGasto() { return { cats: {}, adelantado: 0, diego: 0, pr: {} }; }
function sumaGasto(g) { return Object.keys(g.pr).reduce(function (s, k) { return s + g.pr[k]; }, g.adelantado + g.diego); }
// Plate/month expense categories+Diego+allocations and km points.
function modeloCarros(T) {
  const pts = puntosKm(T, unirTanqueos(T).tanqueos), pr = cuotasProrrateo(T, pts), gas = {}, placasVeh = [];
  tab(T, 'Vehículos').forEach(function (v) { const p = String(v.Placa).trim(); if (p && placasVeh.indexOf(p) < 0) placasVeh.push(p); });
  const cel = function (placa, mes) { const P = gas[placa] = gas[placa] || {}; return P[mes] = P[mes] || nuevoGasto(); };
  tab(T, 'Movimientos').forEach(function (m) {
    const placa = String(m.Placa || '').trim(), clase = grupoDeClase(m.Clase);
    if (!activoMov(m) || !placa || (clase !== 'adelantado' && clase !== 'ganado') || pr.reemplazados.has(m)) return;
    const g = cel(placa, mesDe(m.Fecha)), valor = num(m.Total) || 0;
    if (clase === 'ganado') { g.diego += valor; return; }
    const c = String(m['Categoría'] || '').trim() || 'Sin categoría', x = g.cats[c] = g.cats[c] || { categoria: c, total: 0, n: 0 };
    x.total += valor; x.n++; g.adelantado += valor;
  });
  pr.cuotas.forEach(function (c) { const g = cel(c.placa, c.mes); g.pr[c.rotulo] = (g.pr[c.rotulo] || 0) + c.valor; });
  return { gas: gas, placasVeh: placasVeh, pts: pts };
}
// Whole-peso per-km uses months WITH km; no km=null, no income omits income/profit per km.
function cifrasKm(ik, gk, km, sinIng) {
  if (!(km > 0)) return { ingKm: null, costoKm: null, ganKm: null };
  return { ingKm: sinIng ? null : Math.round(ik / km), costoKm: Math.round(gk / km), ganKm: sinIng ? null : Math.round((ik - gk) / km) };
}
// Known income uses same priced freight/internal and FIFO rules.
function ingresosMensuales(T) {
  const out = {}, cel = function (placa, mes) { const P = out[placa] = out[placa] || {}; return P[mes] = P[mes] || { clientes: 0, internos: 0, abono: 0, otros: 0 }; };
  tab(T, 'Cobros').forEach(function (c) {
    const est = norm(c.Estado), total = num(c.Total) || 0;
    if (est === 'anulado' || norm(c.Tipo) !== 'flete' || !(total > 0)) return;
    cel(String(c.Placa || '').trim(), mesDe(c.Fecha))[est === 'interno' ? 'internos' : 'clientes'] += total;
  });
  otrosIngresos(T).forEach(function (o) { if (o.total !== null) cel(o.placa, o.mes).otros += o.total; });
  const movs = movsAbono(T), peps = calcularPeps(movs);
  movs.forEach(function (m) { const p = peps[m.id]; if (m.mov === 'venta' && p && p.ganancia !== null) cel(m.placa, mesDe(m.fecha)).abono += p.ganancia; });
  return out;
}
function sumaS(L) {
  return L.reduce(function (a, s) { return { km: a.km + s.km, ingresos: a.ingresos + s.ingresos, otros: a.otros + s.otros, gastos: a.gastos + s.gastos, ik: a.ik + s.ik, gk: a.gk + s.gk }; }, { km: 0, ingresos: 0, otros: 0, gastos: 0, ik: 0, gk: 0 });
}
function filaConsol(mes, s, sinIng) {
  const c = cifrasKm(s.ik, s.gk, s.km, sinIng);
  return { mes: mes, km: s.km > 0 ? s.km : null, ingresos: sinIng ? null : s.ingresos, otros: s.otros, gastos: s.gastos, ganancia: sinIng ? null : s.ingresos - s.gastos, ingKm: c.ingKm, costoKm: c.costoKm, ganKm: c.ganKm };
}
// Sum monthly totals; per-km=sum amounts in months WITH km/sum km, never average ratios; report excluded months.
function totalConsol(S, sinIng) {
  const t = filaConsol('Total', sumaS(S), sinIng);
  t.mesesSinKm = S.filter(function (s) { return !s.km && (s.gastos || s.ingresos); }).length;
  return t;
}
// T-020b: plate/month consolidation plus total; todo|12|6|anio validated, earliest active through current Bogotá month.
function vistaConsolidado(T, filtro, ahora) {
  const f = filtro && typeof filtro === 'object' ? filtro : {};
  const actual = fechaBogota(ahora || new Date()).slice(0, 7), periodo = ['12', '6', 'anio'].indexOf(String(f.periodo)) >= 0 ? String(f.periodo) : 'todo';
  const M = modeloCarros(T), ing = ingresosMensuales(T), placas = M.placasVeh.slice();
  Object.keys(M.gas).concat(Object.keys(ing)).forEach(function (p) { if (p && placas.indexOf(p) < 0) placas.push(p); });
  placas.sort();
  const placa = placas.indexOf(String(f.placa)) >= 0 ? String(f.placa) : '';
  let primero = '';
  tab(T, 'Movimientos').forEach(function (m) { const d = mesDe(m.Fecha); if (activoMov(m) && /^\d{4}-\d{2}$/.test(d) && (!primero || d < primero)) primero = d; });
  let desde = primero;
  if (periodo === '12') desde = mesMasSrv(actual, -11); else if (periodo === '6') desde = mesMasSrv(actual, -5); else if (periodo === 'anio') desde = actual.slice(0, 4) + '-01';
  if (primero && desde < primero) desde = primero;
  const meses = [];
  if (primero) for (let m = desde; m <= actual; m = mesMasSrv(m, 1)) meses.push(m);
  const raw = {}, vehiculos = [];
  (placa ? [placa] : placas).forEach(function (p) {
    const S = meses.map(function (m) {
      const g = (M.gas[p] || {})[m], i = (ing[p] || {})[m], km = kmDelMes(M.pts[p] || [], m) || 0, ingr = i ? i.clientes + i.internos + i.abono + i.otros : 0, gas = g ? sumaGasto(g) : 0;
      return { km: km, ingresos: ingr, otros: i ? i.otros : 0, gastos: gas, ik: km ? ingr : 0, gk: km ? gas : 0 };
    });
    if (!S.some(function (s) { return s.km || s.ingresos || s.gastos; })) return;
    const sinIng = !S.some(function (s) { return s.ingresos > 0; });
    raw[p] = S;
    vehiculos.push({ placa: p, sinIngresos: sinIng, filas: S.map(function (s, i) { return filaConsol(meses[i], s, sinIng); }), total: totalConsol(S, sinIng) });
  });
  let general = null;
  if (vehiculos.length > 1) {
    const Sg = meses.map(function (m, i) { return sumaS(vehiculos.map(function (v) { return raw[v.placa][i]; })); }), sinIng = !Sg.some(function (s) { return s.ingresos > 0; });
    general = { sinIngresos: sinIng, filas: Sg.map(function (s, i) { return filaConsol(meses[i], s, sinIng); }), total: totalConsol(Sg, sinIng) };
  }
  return { actual: actual, periodo: periodo, placa: placa, placas: placas, meses: meses, vehiculos: vehiculos, general: general };
}
// T-027: read-only monthly vehicle known income and expenses
// (Adelantado regardless payer + plated Ganado Diego), preliminary result, efficiency, oil/expiry.
// pre computed fl/ab/venc avoids repeat; otherwise compute here.
function vistaCarros(T, mes, ahora, pre) {
  pre = pre || {};
  const fl = pre.fl || vistaFletes(T, mes, ahora), ab = pre.ab || vistaAbono(T, fl.mes, ahora), venc = pre.venc || vencimientosTablero(T, ahora);
  mes = fl.mes;
  const M = modeloCarros(T), placas = M.placasVeh.slice();
  Object.keys(M.gas).forEach(function (p) { if (M.gas[p][mes] && placas.indexOf(p) < 0) placas.push(p); });
  const carros = placas.map(function (placa) {
    const f = fl.carros.find(function (c) { return c.placa === placa; }) || { clientes: 0, internos: 0, sinPrecio: 0 };
    const a = ab.resumen.find(function (c) { return c.placa === placa; }) || { ganancia: 0, pendientes: 0 };
    const g = (M.gas[placa] || {})[mes] || nuevoGasto();
    const o = fl.otros.porCarro.find(function (c) { return c.placa === placa; }) || { clientes: 0, internos: 0, sinPrecio: 0, tipos: [] };
    const ingresos = { clientes: f.clientes, internos: f.internos, abono: a.ganancia, abonoPendientes: a.pendientes, fletesSinPrecio: f.sinPrecio,
      otros: o.clientes + o.internos, otrosDetalle: o.tipos, otrosSinPrecio: o.sinPrecio };
    ingresos.total = ingresos.clientes + ingresos.internos + ingresos.abono + ingresos.otros;
    const pr = Object.keys(g.pr).map(function (k) { return { rotulo: k, valor: g.pr[k] }; }).sort(function (x, y) { return y.valor - x.valor || (x.rotulo < y.rotulo ? -1 : 1); });
    const gastos = { categorias: Object.keys(g.cats).map(function (k) { return g.cats[k]; }).sort(function (x, y) { return y.total - x.total || (x.categoria < y.categoria ? -1 : 1); }),
      adelantado: g.adelantado, prorrateos: pr, prorrateo: sumaGasto(g) - g.adelantado - g.diego, diego: g.diego, total: sumaGasto(g) };
    const vc = venc.find(function (x) { return x.placa === placa; });
    const km = kmDelMes(M.pts[placa] || [], mes), sinIng = !(ingresos.total > 0);
    return { placa: placa, ingresos: ingresos, gastos: gastos, resultado: ingresos.total - gastos.total, rendimiento: rendimientoMes(T, placa, mes),
      km: km, sinIngresos: sinIng, porKm: cifrasKm(ingresos.total, gastos.total, km, sinIng),
      aceite: aceiteCarro(T, placa), vencimientos: vc ? vc.docs : [] };
  });
  return { mes: mes, actual: fl.actual, carros: carros };
}
// T-027: read-only server record search across four ledgers, at most200 newest.
// Never read purchase price; ignore invalid filter safely.
const MAX_REGISTROS = 200;
function filtroRegistros(f) {
  f = f && typeof f === 'object' ? f : {};
  const fecha = function (v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : ''; };
  const txt = function (v, n) { return String(v === null || v === undefined || typeof v === 'object' ? '' : v).trim().slice(0, n); };
  return { desde: fecha(f.desde), hasta: fecha(f.hasta), placa: txt(f.placa, 20), texto: norm(txt(f.texto, 100)), quien: norm(txt(f.quien, 60)), anulados: f.anulados === true };
}
const TIPO_MOV = { Adelantado: 'Gasto', Ganado: 'Ganado de Diego', Recibido: 'Recibido por Diego', Descuento: 'Descuento' };
const ESTADO_COBRO_LEG = { pendiente: 'Por cobrar', parcial: 'Pago parcial', pagado: 'Pagado', 'sin precio': 'Sin precio', interno: 'Interno' };
function estadoLegible(hoja, estado) {
  const e = norm(estado);
  if (e === 'anulado') return 'Anulado';
  if (e === 'reemplazado') return 'Reemplazado';
  if (hoja === 'Cobros') return ESTADO_COBRO_LEG[e] || '';
  return hoja === 'Pagos clientes' ? 'Recibido' : '';
}
function urlComprobante(v) { const s = String(v === null || v === undefined ? '' : v).trim(); return /^https?:\/\/\S+$/i.test(s) ? s : ''; }
function buscarRegistros(T, filtro) {
  const f = filtroRegistros(filtro), todos = [];
  const cobPlaca = {};
  tab(T, 'Cobros').forEach(function (c) { cobPlaca[String(c.ID)] = String(c.Placa || '').trim(); });
  const j = function (a) { return a.map(function (x) { return String(x === null || x === undefined ? '' : x).trim(); }).filter(Boolean).join(' · '); };
  // T-029: readable type/status: hide active movement label; charge lifecycle and payment Recibido.
  const agregar = function (hoja, r, o) {
    todos.push({ fecha: String(r.Fecha).slice(0, 10), orden: String(r.Fecha), hoja: hoja, id: String(r.ID), placa: o.placa, concepto: o.concepto, valor: num(o.valor) || 0, tipo: o.tipo,
      con: String(o.con || '').trim(), estado: String(r.Estado || '').trim(), estadoTxt: estadoLegible(hoja, r.Estado), url: urlComprobante(r.Comprobante), quien: norm(o.quien),
      texto: norm(o.concepto + ' ' + o.texto + ' ' + o.con + ' ' + o.tipo) });
  };
  tab(T, 'Movimientos').forEach(function (r) {
    const gasto = r.Clase === 'Adelantado';
    agregar('Movimientos', r, { placa: String(r.Placa || '').trim(), concepto: j([r['Categoría'], r.Detalle]), valor: r.Total, con: gasto ? r['Pagó'] : r['Registró'],
      quien: r['Registró'] + ' ' + r['Pagó'], texto: r.Clase, tipo: TIPO_MOV[r.Clase] || String(r.Clase || 'Movimiento') });
  });
  tab(T, 'Cobros').forEach(function (r) {
    agregar('Cobros', r, { placa: String(r.Placa || '').trim(), concepto: j([r.Producto, norm(r.Tipo) === TIPO_OTRO ? cantUnidad(num(r.Cantidad) || 0, r.Unidad) : r.Cantidad, r['Lugar de descargue']]), valor: r.Total, con: r.Cliente, quien: r['Cobró'], texto: r.Cliente,
      tipo: norm(r.Tipo) === 'abono' ? 'Abono' : norm(r.Tipo) === TIPO_OTRO ? 'Otro ingreso' : 'Flete' });
  });
  tab(T, 'Pagos clientes').forEach(function (r) {
    agregar('Pagos clientes', r, { placa: cobPlaca[String(r['ID del cobro'])] || '', concepto: j([r.Medio, r['Recibió'] ? 'recibió ' + r['Recibió'] : '']), valor: r.Valor, con: r.Cliente, quien: r['Recibió'], texto: r.Cliente, tipo: 'Pago de cliente' });
  });
  tab(T, 'Inventario abono').forEach(function (r) {
    agregar('Inventario abono', r, { placa: String(r.Placa || '').trim(), concepto: j([r.Cantidad ? r.Cantidad + ' bultos' : '', r.Lugar]), valor: r.Total, con: r.Cliente, quien: r['Registró'], texto: r.Cliente,
      tipo: norm(r.Movimiento) === 'venta' ? 'Venta de abono' : 'Compra de abono' });
  });
  const ok = todos.filter(function (x) {
    const e = norm(x.estado);
    if (!f.anulados && (e === 'anulado' || e === 'reemplazado')) return false;
    if ((f.desde && x.fecha < f.desde) || (f.hasta && x.fecha > f.hasta)) return false;
    if (f.placa && norm(x.placa) !== norm(f.placa)) return false;
    if (f.texto && x.texto.indexOf(f.texto) < 0) return false;
    if (f.quien && x.quien.indexOf(f.quien) < 0) return false;
    return true;
  });
  ok.sort(function (a, b) { return a.orden < b.orden ? 1 : a.orden > b.orden ? -1 : 0; }); // Stable sort preserves sheet order on date tie.
  const filas = ok.slice(0, MAX_REGISTROS).map(function (x) {
    return { fecha: x.fecha, hoja: x.hoja, id: x.id, tipo: x.tipo, placa: x.placa, concepto: x.concepto, valor: x.valor, con: x.con, estado: x.estado, estadoTxt: x.estadoTxt, url: x.url };
  });
  return { filtro: { desde: f.desde, hasta: f.hasta, placa: f.placa, anulados: f.anulados }, total: ok.length, mas: ok.length > MAX_REGISTROS, filas: filas };
}
// T-028: earliest-to-current months, max60; views EXACTLY match
// single-month functions; no server on arrows. Limitation: one full-month batch; paginate yearly if large.
function mesesTablero(T, ahora) {
  const actual = fechaBogota(ahora || new Date()).slice(0, 7);
  let primero = actual, ultimo = actual;
  const ver = function (f) { const m = String(f).slice(0, 7); if (/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) { if (m < primero) primero = m; if (m > ultimo) ultimo = m; } };
  tab(T, 'Cobros').forEach(function (c) { if (norm(c.Estado) !== 'anulado') ver(c.Fecha); });
  tab(T, 'Inventario abono').forEach(function (i) { if (activoMov(i)) ver(i.Fecha); });
  tab(T, 'Movimientos').forEach(function (m) { if (activoMov(m) && String(m.Placa || '').trim()) ver(m.Fecha); });
  const out = [];
  for (let m = primero; m <= ultimo && out.length < 60; m = mesMasSrv(m, 1)) out.push(m);
  return out;
}
function vistaMeses(T, ahora) {
  const meses = mesesTablero(T, ahora), venc = vencimientosTablero(T, ahora), r = { meses: meses, abono: {}, fletes: {}, carros: {} };
  meses.forEach(function (m) {
    const fl = vistaFletes(T, m, ahora), ab = vistaAbono(T, m, ahora);
    r.fletes[m] = fl; r.abono[m] = ab; r.carros[m] = vistaCarros(T, m, ahora, { fl: fl, ab: ab, venc: venc });
  });
  return r;
}
function vistaTablero(T, correo, ahora) {
  const hoy = modeloEstado(T, ''), precios = listaPrecios(T), cobros = cobrosPorCliente(T, 'flete'), venc = vencimientosTablero(T, ahora);
  const abono = vistaAbono(T, '', ahora), fletes = vistaFletes(T, '', ahora);
  return { usuario: correo, hoy: hoy, pendientes: contadoresPendientes(T), reintento: corteSinEntregar(T), vencimientos: venc, precios: precios, abono: abono, fletes: fletes,
    carros: vistaCarros(T, '', ahora, { fl: fletes, ab: abono, venc: venc }),
    inicio: { saldo: hoy.saldo, estado: hoy.estado, sinPrecio: precios.filter(function (p) { return !p.deDiego; }).length, cobros: cobros,
      totalCobros: cobros.reduce(function (s, x) { return s + x.debe; }, 0),
      vencimientos: venc.map(function (x) { return { placa: x.placa, docs: x.docs.filter(function (d) { return d.nivel === 'pronto' || d.nivel === 'vencido'; }) }; })
        .filter(function (x) { return x.docs.length; }) },
    placas: tab(T, 'Vehículos').map(function (v) { return String(v.Placa).trim(); }).filter(Boolean) };
}

// ---------- shared write helpers ----------
function filaCambioTab(ahora, quien, hoja, id, campo, antes, despues, motivo) {
  return { op: 'agregar', hoja: 'Cambios', fila: { 'Fecha': fechaBogota(ahora), 'Quién': quien, 'Origen': 'Tablero', 'Pestaña': hoja,
    'ID registro': id, 'Campo': campo, 'Antes': antes, 'Después': despues, 'Motivo': motivo } };
}
function filaLogTab(ahora, quien, clave, ej, accion, resultado) {
  return { op: 'agregar', hoja: 'Log', fila: { 'Fecha': fechaBogota(ahora), 'Update ID': 'tab:' + clave, 'Usuario': quien, 'Entrada': accion,
    'Acción': accion, 'Resultado': String(resultado).slice(0, 300), 'Origen': 'Tablero', 'Ejecución': ej } };
}
// Form dedupe key in Cambios.Motivo clave:<key>, fully read each run.
function cambioConClave(T, clave, hoja) {
  return tab(T, 'Cambios').find(function (c) {
    return String(c['Pestaña']) === hoja && String(c.Motivo).split(' · ').indexOf('clave:' + clave) >= 0;
  }) || null;
}
function fechaValida(f) {
  if (typeof f !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(f)) return false;
  const d = new Date(f + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f && f >= '2020-01-01' && f <= '2100-12-31';
}

// ---------- manual adjustment ----------
// Input email/key/class/date/plate/detail/value -> error, duplicate or ID+writes.
function registrarAjuste(T, entrada, ahora, ej) {
  const e = entrada || {};
  if (!esAdministrador(T, e.correo)) return { ok: false, error: 'Acceso no autorizado.' };
  const clave = String(e.clave === undefined || e.clave === null ? '' : e.clave);
  if (!RE_CLAVE.test(clave)) return { ok: false, error: 'Falta la clave anti-duplicados.' };
  const previo = cambioConClave(T, clave, 'Movimientos');
  if (previo) return { ok: true, duplicado: true, id: String(previo['ID registro']), escrituras: [] };
  if (!grupoDeClase(e.clase)) return { ok: false, error: 'Elija la clase: Ganado, Adelantado, Recibido o Descuento.' };
  if (!fechaValida(e.fecha)) return { ok: false, error: 'La fecha no es válida.' };
  const detalle = String(e.detalle === undefined || e.detalle === null ? '' : e.detalle).trim();
  if (!detalle) return { ok: false, error: 'El detalle es obligatorio.' };
  if (detalle.length > 200) return { ok: false, error: 'El detalle es muy largo (máximo 200 caracteres).' };
  const valor = typeof e.valor === 'number' || typeof e.valor === 'string' ? num(e.valor) : null;
  if (valor === null || !(valor > 0) || valor > 1e11) return { ok: false, error: 'El valor debe ser un número mayor que 0.' };
  let placa = '';
  if (String(e.placa === undefined || e.placa === null ? '' : e.placa).trim() !== '') {
    const v = tab(T, 'Vehículos').find(function (x) { return norm(x.Placa) === norm(e.placa); });
    if (!v) return { ok: false, error: 'La placa no existe en Vehículos.' };
    placa = String(v.Placa).trim();
  }
  const id = 'M' + sello(ahora, ej);
  const fila = { 'ID': id, 'Fecha': e.fecha + ' ' + fechaBogota(ahora).slice(11), 'Registró': e.correo, 'Cuenta': 'Diego', 'Placa': placa,
    'Clase': e.clase, 'Categoría': 'Ajuste', 'Detalle': detalle, 'Cantidad': '', 'Valor unitario': '', 'Total': valor,
    'Pagó': e.clase === 'Adelantado' ? 'Diego' : '', 'Km': '', 'Galones': '', 'Tanque lleno': '', 'Comprobante': '', 'ID mensaje bot': '',
    'Corte': '', 'Estado': 'activo', 'Origen': 'Tablero', 'Registró ID': '', 'Fecha comprobante': '', 'Número comprobante': '' };
  return { ok: true, id: id, escrituras: [
    { op: 'agregar', hoja: 'Movimientos', fila: fila },
    filaCambioTab(ahora, e.correo, 'Movimientos', id, 'Alta', '', valor, 'Ajuste manual · clave:' + clave),
    filaLogTab(ahora, e.correo, clave, ej, 'ajuste manual', e.clase + ' ' + valor + ' ' + detalle)] };
}

// ---------- T-024: pending price changes ----------
// Input email/key/id/price/seen-price; only active itemsPrecio unpriced or Diego-priced.
// Integer total=quantity×price; recompute state using active payments; return error/duplicate/id,total,writes.
function guardarPrecio(T, entrada, ahora, ej) {
  const e = entrada || {};
  if (!esAdministrador(T, e.correo)) return { ok: false, error: 'Acceso no autorizado.' };
  const clave = String(e.clave === undefined || e.clave === null ? '' : e.clave);
  if (!RE_CLAVE.test(clave)) return { ok: false, error: 'Falta la clave anti-duplicados.' };
  const previo = cambioConClave(T, clave, 'Inventario abono') || cambioConClave(T, clave, 'Cobros');
  if (previo) return { ok: true, duplicado: true, id: String(previo['ID registro']), escrituras: [] };
  const precio = typeof e.precio === 'number' || typeof e.precio === 'string' ? num(e.precio) : null;
  if (precio === null || !(precio > 0) || precio > 1e8 || Math.floor(precio) !== precio) return { ok: false, error: 'El precio debe ser un número entero en pesos mayor que 0.' };
  const it = itemsPrecio(T).find(function (x) { return x.id === String(e.id); });
  if (!it) return { ok: false, error: 'Ese registro ya cambió (anulado o con otro precio); recargue.' };
  if (Math.abs((num(e.precioVisto) || 0) - it.precio) > 0.005) return { ok: false, error: 'El precio cambió mientras tenía la pantalla abierta; recargue.' };
  if (precio === it.precio) return { ok: false, error: 'Ya tiene ese precio.' };
  if (!(it.cantidad > 0)) return { ok: false, error: 'El registro no tiene cantidad; corríjalo en Telegram primero.' };
  if (it.inv && it.cob && Math.abs((num(it.cob.Cantidad) || 0) - it.cantidad) > 0.005) return { ok: false, error: 'La venta y su cobro tienen cantidades distintas; corríjalo en Telegram primero.' };
  const total = Math.round(it.cantidad * precio);
  let estado = '';
  if (it.cob) {
    const P = tab(T, 'Pagos clientes'), pagado = pagadoDe(P, it.cob.ID);
    if (P.some(function (p) { return String(p.ID) === 'PG' + String(it.cob.ID).slice(2) && activoMov(p); })) return { ok: false, error: 'Este cobro se pagó de contado: anúlelo y regístrelo de nuevo.' };
    if (total < pagado - 0.005) return { ok: false, error: 'El total (' + pesos(total) + ') quedaría por debajo de lo ya pagado (' + pesos(pagado) + ').' };
    estado = estadoCobro(total, pagado);
    if (internoCobro(it.cob)) estado = 'interno'; // T-031: Mario income remains internal after pricing.
  }
  const w = [], motivo = 'Precio desde el tablero · clave:' + clave;
  const poner = function (hoja, rec, nuevos) {
    const campos = {};
    Object.keys(nuevos).forEach(function (k) { if (String(rec[k]) !== String(nuevos[k])) campos[k] = nuevos[k]; });
    if (!Object.keys(campos).length) return;
    w.push({ op: 'actualizar', hoja: hoja, id: String(rec.ID), campos: campos });
    Object.keys(campos).forEach(function (k) { w.push(filaCambioTab(ahora, e.correo, hoja, String(rec.ID), k, rec[k], campos[k], motivo)); });
  };
  if (it.inv) poner('Inventario abono', it.inv, { 'Precio unitario': precio, 'Total': total, 'Precio dado por': e.correo });
  if (it.cob) poner('Cobros', it.cob, { 'Precio unitario': precio, 'Total': total, 'Estado': estado });
  w.push(filaLogTab(ahora, e.correo, clave, ej, 'precio', it.id + ' ' + precio));
  return { ok: true, id: it.id, total: total, escrituras: w };
}

// ---------- period closing ----------
function siguienteIdCorte(T) {
  let max = 0;
  tab(T, 'Cortes').forEach(function (c) { const m = /^C-(\d+)$/.exec(String(c.ID).trim()); if (m) max = Math.max(max, parseInt(m[1], 10)); });
  return 'C-' + ('000' + (max + 1)).slice(-Math.max(3, String(max + 1).length));
}
// Input email/key/seen-balance; ONE locked T read, reject changed balance without writes.
function cerrarCorte(T, entrada, ahora, ej) {
  const e = entrada || {};
  if (!esAdministrador(T, e.correo)) return { ok: false, error: 'Acceso no autorizado.' };
  const clave = String(e.clave === undefined || e.clave === null ? '' : e.clave);
  if (!RE_CLAVE.test(clave)) return { ok: false, error: 'Falta la clave anti-duplicados.' };
  const previo = cambioConClave(T, clave, 'Cortes');
  if (previo) return { ok: true, duplicado: true, id: String(previo['ID registro']), escrituras: [] };
  const visto = typeof e.saldoVisto === 'number' || typeof e.saldoVisto === 'string' ? num(e.saldoVisto) : null;
  const m = modeloEstado(T, '');
  if (visto === null || Math.abs(visto - m.saldo) > 0.005) return { ok: false, error: 'Los datos cambiaron; recargue.' };
  if (!m.cuadra) return { ok: false, error: 'Los bloques no cuadran con el saldo; no se cierra. Avise a Admin.' };
  if (!m.bloques.length) return { ok: false, error: 'No hay movimientos abiertos para cerrar.' };
  const id = siguienteIdCorte(T);
  const abiertas = function (hoja) { // Unsealed rows, active and voided.
    return tab(T, hoja).filter(function (r) { return String(r.Corte).trim() === ''; });
  };
  const mov = abiertas('Movimientos'), pag = abiertas('Pagos clientes');
  if (mov.concat(pag).some(function (r) { return String(r.ID).trim() === ''; })) return { ok: false, error: 'Hay registros sin ID en Movimientos o Pagos clientes; revise la hoja.' };
  const w = [{ op: 'agregar', hoja: 'Cortes', fila: { 'ID': id, 'Fecha de cierre': fechaBogota(ahora), 'Saldo anterior': m.saldoAnterior,
    'Ganado': m.ganado, 'Adelantado': m.adelantado, 'Recibido': m.recibido, 'Descuentos': m.descuentos, 'Saldo final': m.saldo, 'PDF': '', 'Enviado a': '' } }];
  mov.forEach(function (r) { w.push({ op: 'actualizar', hoja: 'Movimientos', id: String(r.ID), campos: { 'Corte': id } }); });
  pag.forEach(function (r) { w.push({ op: 'actualizar', hoja: 'Pagos clientes', id: String(r.ID), campos: { 'Corte': id } }); });
  w.push(filaCambioTab(ahora, e.correo, 'Cortes', id, 'Cierre', m.saldoAnterior, m.saldo,
    'Cierre de corte · clave:' + clave + ' · ' + (mov.length + pag.length) + ' filas selladas'));
  w.push(filaLogTab(ahora, e.correo, clave, ej, 'cerrar corte', id + ' saldo ' + m.saldo));
  return { ok: true, id: id, escrituras: w, modelo: m, filas: mov.length + pag.length };
}

// ---------- pure PDF/email HTML/text ----------
function fechaCorta(f) { const s = String(f).slice(0, 10).split('-'); return s.length === 3 ? s[2] + '/' + s[1] + '/' + s[0] : String(f); }
function escrituraEntrega(ahora, quien, corteId, pdf, enviado) {
  const campos = {};
  if (pdf) campos.PDF = pdf;
  if (enviado) campos['Enviado a'] = enviado;
  return [{ op: 'actualizar', hoja: 'Cortes', id: corteId, campos: campos },
    filaCambioTab(ahora, quien, 'Cortes', corteId, 'Entrega', '', (pdf ? 'PDF ' : '') + (enviado ? 'correo a ' + enviado : ''), 'PDF y correo del corte')];
}
function asuntoCorte(m, corteId) { return 'Hoy se cuadraron cuentas, saldo ' + pesos(m.saldo) + (corteId ? ' (' + corteId + ')' : ''); }
function cuerpoCorte(m, corteId) {
  return asuntoCorte(m, corteId) + '\n' + m.estado + '.\n\nSaldo anterior: ' + pesos(m.saldoAnterior) + '\nGanado: ' + pesos(m.ganado) +
    '\nAdelantado por Diego: ' + pesos(m.adelantado) + '\nRecibido: ' + pesos(m.recibido) + '\nDescuentos: ' + pesos(m.descuentos) +
    '\nSaldo final: ' + pesos(m.saldo) + '\n\nEl estado de cuenta va adjunto en PDF.';
}
// PDF uses cell bgcolor for Google converter; escape all sheet text.
function td(txt, o) {
  o = o || {};
  return '<td' + (o.bg ? ' bgcolor="' + o.bg + '"' : '') + ' align="' + (o.al || 'left') + '"' + (o.span ? ' colspan="' + o.span + '"' : '') +
    ' style="padding:5px 8px;font-size:' + (o.fs || 11) + 'px;' + (o.b ? 'font-weight:bold;' : '') + 'border-bottom:1px solid #e4e4de;">' + txt + '</td>';
}
function tr(cells) { return '<tr>' + cells.join('') + '</tr>'; }
function htmlEstadoCuenta(m, corteId) {
  let h = '<html><body style="font-family:Arial,Helvetica,sans-serif;color:#333333;">' +
    '<div style="font-size:20px;font-weight:bold;">Estado de cuenta de Diego</div>' +
    '<div style="font-size:11px;color:#6c6c6c;margin-bottom:10px;">' + esc(corteId ? 'Corte ' + corteId + ' · cierre ' + fechaCorta(m.cierre) : 'Corte abierto' + (m.desde ? ' · desde ' + fechaCorta(m.desde) : '')) + '</div>' +
    '<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">';
  h += tr([td('Saldo anterior', { b: 1, bg: '#f0f0eb', span: 3 }), td(esc(pesos(m.saldoAnterior)), { al: 'right', b: 1, bg: '#f0f0eb' })]);
  m.bloques.forEach(function (b) {
    h += tr([td(esc(fechaCorta(b.fecha)), { b: 1, bg: '#f8f8f6' }), td(esc(b.placas.join(', ') || '—'), { bg: '#f8f8f6' }), td('', { bg: '#f8f8f6' }), td('', { bg: '#f8f8f6' })]);
    b.items.forEach(function (i) {
      h += tr([td('', {}), td(esc(i.placa || '—'), {}), td(esc(i.concepto) + ' <span style="color:#6c6c6c;">(' + esc(GRUPO_ROTULO[i.grupo]) + ')</span>', {}),
        td(esc((SIGNO[i.grupo] < 0 ? '-' : '') + pesos(i.valor)), { al: 'right' })]);
    });
    h += tr([td('Total del día', { b: 1, span: 3, al: 'right' }), td(esc(pesos(b.total)), { al: 'right', b: 1 })]);
  });
  h += '</table><br/><table width="60%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">';
  [['Saldo anterior', m.saldoAnterior], [GRUPO_ROTULO.ganado, m.ganado], [GRUPO_ROTULO.adelantado, m.adelantado],
    [GRUPO_ROTULO.recibido, -m.recibido], [GRUPO_ROTULO.descuentos, -m.descuentos]].forEach(function (f) {
    h += tr([td(esc(f[0]), {}), td(esc(pesos(f[1])), { al: 'right' })]);
  });
  h += tr([td('Saldo final', { b: 1, bg: '#d7eb80', fs: 14 }), td(esc(pesos(m.saldo)), { al: 'right', b: 1, bg: '#d7eb80', fs: 14 })]);
  return h + '</table><div style="font-size:12px;margin-top:8px;font-weight:bold;">' + esc(m.estado) + '</div></body></html>';
}

// T-026: customer PDF only debts/payments, no purchase cost/profit in model; escape all text.
function htmlEstadoCliente(m) {
  let h = '<html><body style="font-family:Arial,Helvetica,sans-serif;color:#333333;">' +
    '<div style="font-size:20px;font-weight:bold;">Estado de cuenta · ' + esc(m.cliente) + '</div>' +
    '<div style="font-size:11px;color:#6c6c6c;margin-bottom:10px;">' + esc('Al ' + fechaCorta(m.fecha)) + '</div>' +
    '<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">';
  h += tr([td('Fecha', { b: 1, bg: '#f0f0eb' }), td('Detalle', { b: 1, bg: '#f0f0eb' }), td('Total', { b: 1, bg: '#f0f0eb', al: 'right' }),
    td('Pagado', { b: 1, bg: '#f0f0eb', al: 'right' }), td('Saldo', { b: 1, bg: '#f0f0eb', al: 'right' })]);
  m.cobros.forEach(function (c) {
    h += tr([td(esc(fechaCorta(c.fecha)), {}), td(esc([c.tipo, c.placa, (c.producto || '') + (c.cantidad ? ' x ' + (c.cantTxt || c.cantidad) : ''), c.lugar].filter(Boolean).join(' · ')), {}),
      td(esc(pesos(c.total)), { al: 'right' }), td(esc(pesos(c.pagado)), { al: 'right' }), td(esc(pesos(c.saldo)), { al: 'right', b: 1 })]);
  });
  if (m.pagos.length) {
    h += tr([td('Pagos recibidos', { b: 1, bg: '#f8f8f6', span: 5 })]);
    m.pagos.forEach(function (p) {
      h += tr([td(esc(fechaCorta(p.fecha)), {}), td(esc([p.medio, p.recibio && 'recibió ' + p.recibio].filter(Boolean).join(' · ') || '—'), { span: 3 }), td(esc(pesos(p.valor)), { al: 'right' })]);
    });
  }
  if (m.sinPrecio.length) {
    h += tr([td('Pendientes de precio (aún no suman al saldo)', { b: 1, bg: '#f8f8f6', span: 5 })]);
    m.sinPrecio.forEach(function (s) {
      h += tr([td(esc(fechaCorta(s.fecha)), {}), td(esc([s.placa, (s.producto || '') + (s.cantidad ? ' x ' + (s.cantTxt || s.cantidad) : '')].filter(Boolean).join(' · ')), { span: 4 })]);
    });
  }
  h += tr([td('Saldo total', { b: 1, bg: '#d7eb80', fs: 14, span: 4 }), td(esc(pesos(m.saldo)), { al: 'right', b: 1, bg: '#d7eb80', fs: 14 })]);
  return h + '</table></body></html>';
}

// ---------- in-memory update avoids reread, same writer semantics ----------
function aplicarEnMemoria(T, escrituras) {
  escrituras.forEach(function (w) {
    const clave = CLAVES[w.hoja];
    T[w.hoja] = T[w.hoja] || [];
    if (w.op === 'agregar') {
      if (clave && w.fila[clave] !== undefined && T[w.hoja].some(function (r) { return String(r[clave]) === String(w.fila[clave]); })) return;
      const f = {};
      ESQUEMA[w.hoja].forEach(function (c) { f[c] = ''; });
      Object.keys(w.fila).forEach(function (c) { f[c] = w.fila[c]; });
      T[w.hoja].push(f);
    } else {
      const f = T[w.hoja].find(function (r) { return String(r[clave]) === String(w.id); });
      if (!f) throw new Error('No existe ' + w.id + ' en ' + w.hoja);
      Object.keys(w.campos).forEach(function (c) { f[c] = w.campos[c]; });
    }
  });
}

// =====================================================================================================
// Thin Google adapter, no money logic.
// =====================================================================================================
function correoActivo() {
  try { return String(Session.getActiveUser().getEmail() || '').trim().toLowerCase(); } catch (x) { return ''; } // NEVER authorize via getEffectiveUser.
}
function exigirAdmin(T) {
  const c = correoActivo();
  if (!esAdministrador(T, c)) throw new Error('Acceso no autorizado.');
  return c;
}
function paginaSimple(titulo, texto) {
  return HtmlService.createHtmlOutput('<div style="font-family:Arial,sans-serif;padding:32px;color:#333"><h2>' + esc(titulo) + '</h2><p>' + esc(texto) + '</p></div>')
    .setTitle(titulo).addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
function doGet(e) {
  if (e && e.parameter && e.parameter.k !== undefined) return paginaSimple('Próximamente', 'La vista de Diego llega en una fase posterior.');
  let T;
  try { T = leerTablas(SpreadsheetApp.getActiveSpreadsheet(), false).T; } catch (x) { return paginaSimple('No disponible', 'No se pudo leer la hoja. Intente de nuevo.'); }
  const correo = correoActivo();
  if (!esAdministrador(T, correo)) return paginaSimple('Sin acceso', correo ? 'La cuenta ' + correo + ' no está autorizada para este tablero.' : 'No se pudo identificar su correo de Google.');
  const t = HtmlService.createTemplateFromFile('Index');
  t.inicial = JSON.stringify(vistaTablero(T, correo)).replace(/</g, '\\u003c');
  return t.evaluate().setTitle('Cuentas Vehículos Mario Ortiz').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Single writer: lock, ONE read, pure core, batch writes, updated in-memory screen.
function correrTablero(pura, entrada) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ej = 'T' + Utilities.getUuid().replace(/[^A-Za-z0-9]/g, '').slice(0, 8);
  const r = conCandado(function () {
    const lect = leerTablas(ss, false);
    const correo = exigirAdmin(lect.T);
    const x = pura(lect.T, Object.assign({}, entrada, { correo: correo }), new Date(), ej);
    if (!x.ok) return { ok: false, error: x.error };
    if (x.escrituras.length) { aplicarEscrituras(ss, x.escrituras, lect); aplicarEnMemoria(lect.T, x.escrituras); }
    return { ok: true, duplicado: !!x.duplicado, id: x.id, modelo: x.modelo, _T: lect.T, _correo: correo, vista: vistaTablero(lect.T, correo) };
  });
  return r.tipo === 'error' ? { ok: false, error: r.texto } : r;
}
function limpiarSalida(r) { const o = Object.assign({}, r); delete o._T; delete o._correo; delete o.modelo; return o; }

function api_cuenta() {
  const lect = leerTablas(SpreadsheetApp.getActiveSpreadsheet(), false);
  return vistaTablero(lect.T, exigirAdmin(lect.T));
}
// T-025: fertilizer month, one read; server FIFO uses full history without sending all to client.
function api_abono(mes) {
  const lect = leerTablas(SpreadsheetApp.getActiveSpreadsheet(), false);
  exigirAdmin(lect.T);
  return vistaAbono(lect.T, mes, new Date());
}
// T-026: freight month, one read, read-only.
function api_fletes(mes) {
  const lect = leerTablas(SpreadsheetApp.getActiveSpreadsheet(), false);
  exigirAdmin(lect.T);
  return vistaFletes(lect.T, mes, new Date());
}
// T-027: vehicle month, one read, read-only.
function api_carros(mes) {
  const lect = leerTablas(SpreadsheetApp.getActiveSpreadsheet(), false);
  exigirAdmin(lect.T);
  return vistaCarros(lect.T, mes, new Date());
}
// T-028: all months one read-only call; background client load for instant switching.
function api_meses() {
  const lect = leerTablas(SpreadsheetApp.getActiveSpreadsheet(), false);
  exigirAdmin(lect.T);
  return vistaMeses(lect.T, new Date());
}
// T-020b: monthly consolidation, one read, validated filter.
function api_consolidado(filtro) {
  const lect = leerTablas(SpreadsheetApp.getActiveSpreadsheet(), false);
  exigirAdmin(lect.T);
  return vistaConsolidado(lect.T, filtro, new Date());
}
// T-020a: fuel requested on tab/filter, not initial view; one read, read-only.
// Optional historical tab in same read if present; otherwise bot fuel plus missing-history notice.
function api_acpm(filtro) {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), hojas = Object.keys(ESQUEMA);
  if (ss.getSheetByName(HOJA_HIST)) hojas.push(HOJA_HIST);
  const lect = leerTablas(ss, false, null, hojas);
  exigirAdmin(lect.T);
  return vistaAcpm(lect.T, filtro, new Date());
}
// T-027: record search server returns<=200, not full sheet initially; one read.
function api_registros(filtro) {
  const lect = leerTablas(SpreadsheetApp.getActiveSpreadsheet(), false);
  exigirAdmin(lect.T);
  return buscarRegistros(lect.T, filtro);
}
// T-026: customer PDF/image model, one read; must exist in charges.
function api_pdfCliente(cliente) {
  const lect = leerTablas(SpreadsheetApp.getActiveSpreadsheet(), false);
  exigirAdmin(lect.T);
  const m = estadoCliente(lect.T, String(cliente || ''), new Date());
  if (!m) throw new Error('Ese cliente no existe.');
  const blob = Utilities.newBlob(htmlEstadoCliente(m), 'text/html', 'estado.html').getAs('application/pdf');
  return { nombre: 'Estado de cuenta ' + m.cliente.replace(/[\\\/:*?"<>|]/g, '').trim() + ' ' + m.fecha + '.pdf', base64: Utilities.base64Encode(blob.getBytes()), modelo: m };
}
function api_ajuste(form) { return limpiarSalida(correrTablero(registrarAjuste, form || {})); }
function api_precio(form) { return limpiarSalida(correrTablero(guardarPrecio, form || {})); }

function api_pdfEstado() {
  const lect = leerTablas(SpreadsheetApp.getActiveSpreadsheet(), false);
  exigirAdmin(lect.T);
  const m = modeloEstado(lect.T, '');
  const blob = Utilities.newBlob(htmlEstadoCuenta(m, ''), 'text/html', 'estado.html').getAs('application/pdf');
  const nombre = 'Estado de cuenta Diego ' + fechaBogota(new Date()).slice(0, 10) + '.pdf';
  return { nombre: nombre, base64: Utilities.base64Encode(blob.getBytes()) };
}

function api_cerrar(form) {
  const r = correrTablero(cerrarCorte, form || {});
  if (!r.ok || r.duplicado) return limpiarSalida(r);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ent = entregarCorte(ss, r._T, r.modelo, r.id, r._correo, null, false); // OUTSIDE lock; failure leaves period closed.
  r.entrega = ent;
  r.vista = vistaTablero(r._T, r._correo);
  return limpiarSalida(r);
}
// Idempotent retry for missing PDF/email only, under lock.
function api_reintentar(corteId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // Lock read/reserve ent: marker; artifacts outside; entregarCorte owns write lock.
  const r = conCandado(function () {
    const lect = leerTablas(ss, false);
    const correo = exigirAdmin(lect.T);
    const c = tab(lect.T, 'Cortes').find(function (x) { return String(x.ID) === String(corteId); });
    if (!c || String(c.ID) === 'C-000') return { ok: false, error: 'No existe ese corte.' };
    const cache = cacheScript();
    try {
      if (cache && cache.get('ent:' + c.ID)) return { ok: false, error: 'Se está enviando ese corte; espere un momento.' };
      if (cache) cache.put('ent:' + c.ID, '1', 120);
    } catch (x) { /* No cache. */ }
    return { ok: true, _T: lect.T, _correo: correo, _c: c };
  });
  if (r.tipo === 'error') return { ok: false, error: r.texto };
  if (!r.ok) return r;
  const ent = entregarCorte(ss, r._T, modeloEstado(r._T, r._c.ID), String(r._c.ID), r._correo, r._c, false);
  return { ok: true, id: String(r._c.ID), entrega: ent, vista: vistaTablero(r._T, r._correo) };
}

function carpetaCortes(T) {
  const props = PropertiesService.getScriptProperties();
  const ids = [String(param(T, 'carpeta_cortes_id')).trim(), props.getProperty('CARPETA_CORTES_ID') || ''];
  for (let i = 0; i < ids.length; i++) { if (ids[i]) { try { return DriveApp.getFolderById(ids[i]); } catch (x) { /* Stale ID or no permission. */ } } }
  const f = DriveApp.createFolder(NOMBRE_CARPETA_CORTES);
  props.setProperty('CARPETA_CORTES_ID', f.getId());
  return f;
}
// Deliver only missing period PDF/email fields.
// T already contains period; write PDF/Enviado a by ID and reflect in memory; return artifacts/errors.
function entregarCorte(ss, T, modelo, corteId, quien, fila, yaTieneCandado) {
  const cache = cacheScript();
  try { if (cache) cache.put('ent:' + corteId, '1', 120); } catch (x) { /* No cache. */ }
  const c = fila || tab(T, 'Cortes').find(function (x) { return String(x.ID) === corteId; }) || {};
  const out = { pdf: String(c.PDF || '').trim(), enviadoA: String(c['Enviado a'] || '').trim(), errores: [] };
  let blob = null, pdfNuevo = '', enviadoNuevo = '';
  try {
    blob = Utilities.newBlob(htmlEstadoCuenta(modelo, corteId), 'text/html', 'estado.html').getAs('application/pdf').setName('Estado de cuenta ' + corteId + '.pdf');
    if (!out.pdf) {
      const carpeta = carpetaCortes(T), ya = carpeta.getFilesByName(blob.getName());
      pdfNuevo = (ya.hasNext() ? ya.next() : carpeta.createFile(blob)).getUrl();
    }
  } catch (x) { out.errores.push('PDF: ' + String(x && x.message).slice(0, 120)); }
  if (blob && !out.enviadoA) {
    try {
      const para = listaCorreos(param(T, 'correo_diego')), admins = listaCorreos(param(T, 'correos_administradores'));
      const to = (para.length ? para : admins).join(','), cc = para.length ? admins.join(',') : '';
      if (!to) throw new Error('Falta correo_diego en Parámetros');
      MailApp.sendEmail({ to: to, cc: cc, subject: asuntoCorte(modelo, corteId), body: cuerpoCorte(modelo, corteId), attachments: [blob], name: 'Registro de cuentas de Diego' });
      enviadoNuevo = to + (cc ? ' (cc ' + cc + ')' : '');
    } catch (x) { out.errores.push('Correo: ' + String(x && x.message).slice(0, 120)); }
  }
  if (pdfNuevo || enviadoNuevo) {
    const w = escrituraEntrega(new Date(), quien, corteId, pdfNuevo, enviadoNuevo);
    try {
      if (yaTieneCandado) aplicarEscrituras(ss, w, null);
      else { const r = conCandado(function () { aplicarEscrituras(ss, w, null); return { ok: true }; }); if (r && r.tipo === 'error') throw new Error(r.texto); }
      aplicarEnMemoria(T, w);
      out.pdf = pdfNuevo || out.pdf; out.enviadoA = enviadoNuevo || out.enviadoA;
    } catch (x) { out.errores.push('Hoja: ' + String(x && x.message).slice(0, 120)); }
  }
  try { if (cache) cache.remove('ent:' + corteId); } catch (x) { /* No cache. */ }
  return out;
}
