# Apps Script ledger API and dashboard

The financial rules live here. Telegram and WhatsApp share the same `procesar` core, balance calculation and locked batch writer. n8n handles channel adapters, media, AI calls and delivery. AI proposes records; deterministic JavaScript validates amounts, people, permissions and ledger effects.

The runtime remains Spanish: sheet tabs/headers, identifiers, bot messages, dashboard labels, prompts and parsing expressions are compatibility contracts. Comments and documentation are English. All sample people, vehicles, identifiers and contact details are fictitious; monetary fixtures are illustrative.

## Files

| File | Responsibility |
|---|---|
| `Codigo.gs` | Sheet schema, additive installer and guarded demo/cleanup helpers |
| `Bot.gs` | Pure business core, bot API, balance, confirmations, shared Google/Drive adapters |
| `Tablero.gs` | Administrator access, dashboard models, adjustments, prices, period closing and statements |
| `Pdf.gs` | Local unlocking of supported plate-password PDFs |
| `Index.html` | Spanish administrator interface, charts and browser PNG export |
| `appsscript.json` | V8 runtime, America/Bogota, Sheets v4 advanced service and scopes |
| `test*.js` | Offline Node tests; never paste these into Apps Script |
| `fixtures/` | Small invented fuel-history CSV for reproducible offline tests |

The dashboard includes Home, Diego's account, pending prices, fertilizer inventory/profit, freight and collections, vehicle costs, records and historical fuel efficiency. Consolidated monthly vehicle results appear on Home. Access requires an allowlisted administrator Google account. The proposed keyed driver web view is deferred: `?k=...` currently returns a coming-soon page. The driver can query the bot and receive statements.

## Install in a test environment

1. Create a native Google Sheet whose name contains `PRUEBA`. Open its bound Apps Script project.
2. Add `Codigo.gs`, `Bot.gs`, `Pdf.gs`, `Tablero.gs` and `Index.html`. Show the manifest in project settings and copy `appsscript.json`.
3. Enable the Sheets v4 advanced service in the editor. Keep the script and spreadsheet timezone at `America/Bogota`.
4. Run `instalarHoja` and authorize the declared Google services. The installer creates missing tabs and appends missing headers/parameters/rates without renaming existing ones. Dismiss any completion dialog in the spreadsheet.
5. Optionally run `sembrarDatosPrueba` in that test sheet only. Its rates and insurance amount are examples. Configure users, vehicles, effective rates and parameters for your own deployment before real use.
6. Run `crearClaveApi` once. Store its generated `CLAVE_API` in Script Properties and the matching n8n credential. Keep it out of workflow exports, source files and chat.
7. Deploy the bot API as a web app executing as the owner, accessible to anyone; `doPost` requires the API key. Configure its `/exec` URL and authentication in n8n credentials, with redirects enabled.
8. Configure `correos_administradores` and `correo_diego` in Parámetros. Create a shared period-PDF Drive folder, give both administrators editor access and set `carpeta_cortes_id`. Share the spreadsheet with those administrators as editors.
9. Create a separate dashboard web-app deployment executing as the accessing user, restricted to users with a Google account. Share that deployment URL with administrators. The application additionally checks the allowlist using the active user, never the effective owner.
10. Import the inactive workflows, reassign credentials/subworkflow references, and perform test-chat checks. When replacing a bot workflow, unpublish the old one before publishing the new one.

For later changes, update these files and create a new version of both relevant existing deployments. Existing deployment URLs can remain stable. Authorize again if scopes change. This repository's preparation did not deploy or authorize anything.

Do not run cleanup helpers as installation steps. `ajustarPrueba20261014` contains fictitious legacy record selectors for an old test-only migration; `limpiarCopiaReal` clears transactional rows in a copy and requires deliberate confirmation. Neither is required to inspect the showcase or run tests.

## Configuration

| Location | Values to supply privately |
|---|---|
| Usuarios | Channel identity, role, current vehicle, activity, `Paga como`, payer-question policy; optional `WhatsApp` number column |
| Vehículos | Your plates/aliases, oil interval and last change, document expiry/file links |
| Tarifas | Effective rates and optional default customer; zero may mean unpriced |
| Parámetros | Group chat, opening balance, dashboard allowlist, statement recipient and Drive folders |
| Script Properties | `CLAVE_API` and service-managed configuration |
| n8n credentials | API URL/key, channel credentials and AI credentials |

The sample `seguro_mensual_diego` is illustrative. If configured with a positive amount, `instalarDisparadorSeguro` installs the monthly insurance deduction trigger; the monthly ID prevents repeats even after a void. Configure it intentionally in your environment.

Never rename Spanish tabs or headers. See [data model](../../docs/data-model.md) and [business rules](../../docs/business-rules.md).

## API boundary

Send JSON to the bot deployment's `/exec` endpoint. Common fields are `clave` and `accion`; the key may also arrive through the credential's `clave` query parameter. Invalid/missing authentication returns `{tipo:'error', codigo:401}`; callers must inspect the JSON response.

| Action | Purpose |
|---|---|
| `procesar` | Validate a normalized update; request AI, ask for confirmation, answer a query or produce writes |
| `vincular` | Attach returned bot-message IDs to stored records/questions |
| `recordatorio` | Build the weekly debt, oil-change and expiry notice |

The pure core receives tables, input and time, and returns a response plus write intentions. The Google adapter enforces authentication, locking, deduplication and writes. The preferred read is one Sheets `values:batchGet`; writes use the already-read rows and stable record IDs. SpreadsheetApp is a compatibility fallback; callbacks take the lock before reading to avoid cached-read races.

Forms have independent idempotency keys. Closing a period recalculates the displayed balance under the shared lock, refuses stale data, seals records and carries the balance forward. PDF/email delivery happens outside the financial lock. A failure leaves the period closed; retry completes missing artifacts without closing again. Email is sent by the administrator who closes the period in the accessing-user deployment.

## Media and fuel

Receipts are stored in Drive with idempotent file identities, categorized folders and links on records. Photos/PDFs may be read by AI; ambiguous or image-derived financial data requires confirmation. Supported encrypted PDFs use Standard R2/R3/R4 (RC4 or AES-128), trying an empty password then vehicle plates. AES-256, xref streams, object streams and other passwords are unsupported.

The dashboard's optional `Combustible histórico` tab is read-only and uses the exact CSV headers shown in the [data model](../../docs/data-model.md). Import your own history as text, with automatic number/date conversion disabled. The dashboard merges bot/history refuels by plate and odometer; bot data wins. Efficiency uses the median of plausible consecutive-refuel segments. This differs from the bot's full-tank query calculation; see the business rules.

## Offline validation

Run from this directory with Node; no npm install or network is required:

```sh
node test.js
node test-tablero.js
node test-pdf.js
node test-copia.js
node test-pdf-lib.js
```

The first four scripts exercise the bot, dashboard, PDF cryptography and copy-cleanup behavior using mocks, including invalid input, duplicate updates/taps, concurrent callbacks, closed periods and mutation detection. `test-pdf-lib.js` is a fixture-generation helper: invoking it exits successfully but runs no standalone assertions.

The public fuel tests use 19 invented CSV rows, not a missing operational-history export. The VM clock is fixed for dated dashboard fixtures. Customer ambiguity and WhatsApp-identity fixtures retain distinct fictitious candidates after anonymization.

These checks do not exercise Google authorization, live LockService contention, Sheets coercion/quotas, Drive sharing, HTML-to-PDF conversion, email delivery, n8n execution, channel webhooks or live AI responses. Before deployment, test valid/invalid messages, a repeated update, a double tap, unauthorized access, receipt linking and a period close/retry in your own PRUEBA environment.
