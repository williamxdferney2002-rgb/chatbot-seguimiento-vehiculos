# Data model

The native Google Sheet is the operational contract. The exact base columns below come from `ESQUEMA` in `apps-script/dashboard/Codigo.gs`. Labels remain Spanish. Never rename or reorder existing tabs/headers; append missing columns with `instalarHoja`. Existing extra columns are permitted.

## Usuarios

Authorized identities, roles, vehicle context and payer defaults.

`ID Telegram` · `Nombre` · `Rol` · `Carro actual` · `Activo` · `Paga como` · `Pregunta quién pagó`

## Vehículos

Vehicle aliases, service intervals and document expiries.

`Placa` · `Apodos` · `Cambio de aceite cada (km)` · `Km del último cambio de aceite` · `SOAT vence` · `SOAT archivo` · `Técnico-mecánica vence` · `Técnico-mecánica archivo` · `Seguro vence` · `Seguro archivo`

## Tarifas

Effective prices and default customers by concept/product/route.

`ID` · `Concepto` · `Producto` · `Ruta` · `Valor` · `Vigente desde` · `Cliente`

## Movimientos

Driver-account movements and vehicle expenses.

`ID` · `Fecha` · `Registró` · `Cuenta` · `Placa` · `Clase` · `Categoría` · `Detalle` · `Cantidad` · `Valor unitario` · `Total` · `Pagó` · `Km` · `Galones` · `Tanque lleno` · `Comprobante` · `ID mensaje bot` · `Corte` · `Estado` · `Origen` · `Registró ID` · `Fecha comprobante` · `Número comprobante`

## Clientes

Customer catalog.

`ID` · `Nombre` · `Teléfono` · `Lugar`

## Cobros

Freight and sales charges, including unpriced/internal entries.

`ID` · `Fecha` · `Placa` · `Cliente` · `Tipo` · `Cantidad` · `Lugar de cargue` · `Lugar de descargue` · `Precio de compra` · `Precio unitario` · `Total` · `Cobró` · `Estado` · `Comprobante` · `ID mensaje` · `Registró ID` · `Producto` · `Unidad`

## Pagos clientes

Payments linked to charges and their receiver.

`ID` · `Fecha` · `ID del cobro` · `Cliente` · `Valor` · `Medio` · `Recibió` · `Comprobante` · `Corte` · `Estado` · `ID mensaje` · `Registró ID` · `Fecha comprobante` · `Número comprobante`

## Cortes

Closed settlement summaries and PDF/delivery references.

`ID` · `Fecha de cierre` · `Saldo anterior` · `Ganado` · `Adelantado` · `Recibido` · `Descuentos` · `Saldo final` · `PDF` · `Enviado a`

## Parámetros

Deployment and business configuration; never publish private values.

`Clave` · `Valor` · `Nota`

## Por confirmar

Persisted questions, operation context and confirmation state.

`ID` · `Fecha` · `Chat ID` · `Usuario` · `Operación` · `Mensaje original` · `ID mensaje bot` · `Estado` · `Reservado por` · `Vence`

## Log

Input, action, result, source and timing.

`Fecha` · `Update ID` · `Usuario` · `Entrada` · `Acción` · `Resultado` · `Origen` · `Ejecución` · `Duración ms` · `Detalle ms`

## Cambios

Before/after audit trail.

`Fecha` · `Quién` · `Origen` · `Pestaña` · `ID registro` · `Campo` · `Antes` · `Después` · `Motivo`

## Inventario abono

Fertilizer purchases/sales and charge linkage.

`ID` · `Fecha` · `Registró` · `Registró ID` · `Placa` · `Movimiento` · `Cantidad` · `Lugar` · `Cliente` · `Precio unitario` · `Total` · `Precio dado por` · `ID cobro` · `ID mensaje bot` · `Corte` · `Estado` · `Origen` · `Comprobante`

## Appended and optional data

`Usuarios.WhatsApp` is an optional appended text column used to match private sender numbers. It is intentionally not part of the base ESQUEMA; add it before enabling WhatsApp. A number must map to one active user.

`Combustible histórico` is an optional read-only tab, requested only for fuel views. Its headers are: `fecha`, `placa`, `km`, `galones`, `total_cop`, `precio_gal`, `tipo`, `precio_atipico`, `nota`, `registrado_por`. No operating historical CSV is bundled; offline tests use the invented data in `apps-script/dashboard/fixtures/fuel-history.csv`. Import as text, with automatic number/date/formula conversion disabled.

## Relationships and types

- `Usuarios.Carro actual` and transaction `Placa` identify a `Vehículos.Placa`. Names and aliases are user input, not a substitute for identity checks.
- `Cobros.ID` links to `Pagos clientes.ID del cobro` and `Inventario abono.ID cobro`. Customer identity must resolve against the catalog/business rules rather than guessed conversation context.
- `Cortes.ID` groups active movements, payments and applicable inventory events into an immutable settlement. `C-000`, where present, is an opening fixture, not an ordinary closure.
- Business record `ID` is stable identity. `ID mensaje bot` / `ID mensaje` support reply-based correction and receipt association. `Registró ID` preserves actor identity separately from display name.
- `Estado` meanings are table-specific: active/void for records, paid/partial/pending/unpriced/internal for charges, and pending/resolved/cancelled for questions. Do not equate them across tables.
- Money, quantity and odometer values are normalized by shared helpers. Dates use Bogotá business time. Human input may use Colombian separators; do not rely on host locale.
- `Comprobante` and `PDF` contain Drive references configured privately. `Fecha comprobante` and `Número comprobante` support receipt identity, separate from entry date.

## Technical state outside Sheets

The four n8n Data Tables `wa_contexto`, `wa_candados`, `wa_ultimo` and `wa_pendientes` hold channel context and delivery state, not a second accounting ledger. Their exact columns are documented in [WhatsApp integration](whatsapp-integration.md).

Script Properties hold API secrets and deployment configuration. Credentials stay in n8n credential storage. Catalog examples, identifiers and amounts in this public copy are fictitious; configure deployment data privately.
