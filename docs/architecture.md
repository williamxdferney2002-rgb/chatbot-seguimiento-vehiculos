# Architecture

## Components in this snapshot

| File | Nodes | Responsibility |
|---|---:|---|
| `workflows/bot-v7.json` | 74 | Telegram input and normalized WhatsApp input; Apps Script calls; AI and receipt orchestration |
| `workflows/whatsapp-inbound-v1.json` | 27 | Meta payload adaptation, sender filtering, inbound dedupe/locks and Telegram visibility |
| `workflows/send-v1.json` | 45 | Shared Telegram/WhatsApp output, context persistence and cleanup |
| `workflows/weekly-report-v2.json` | 17 | Sunday report; WhatsApp window check and deferred notice |
| `workflows/health-v1.json` | 2 | Scheduled health notification |
| `workflows/errors-v1.json` | 3 | n8n error notification |
| `apps-script/dashboard/` | — | Accounting core, authorization, one writer, admin dashboard and PDF handling |

All workflow exports have `active: false`. Names, credentials and cross-workflow references require private configuration. Node names remain Spanish because expressions refer to them.

`Codigo.gs` installs the schema. `Bot.gs` contains the pure business core and Google adapters. `Tablero.gs` builds dashboard models and exposes admin operations through the same core. `Pdf.gs` handles supported encrypted PDF formats; `Index.html` is the Spanish admin interface. Drive stores linked receipts and statements; Sheets stores catalogs, records and audit history.

## Message data flow

1. Telegram delivers an update, or the WhatsApp adapter produces the equivalent input with `canal`, `wa` and `update_id: wa_<message-id>`.
2. The workflow routes the message to Apps Script. The server checks user permissions from `Usuarios`, rather than trusting a channel adapter's identity alone.
3. Known commands and structured lists use deterministic shortcuts. Other inputs request a structured AI proposal. n8n invokes text, voice, image or PDF extraction and returns the result to the same core.
4. The core validates the action, vehicle, payer, amounts and period. Missing or ambiguous information becomes a persisted `Por confirmar` question with buttons.
5. A write transaction takes the script lock, reads one coherent snapshot, checks dedupe, resolves records by ID and applies a batch of operations. Pure functions return operations; Google adapters persist them.
6. The sender delivers escaped HTML to Telegram, or converts the response for WhatsApp and copies it to Telegram. Bot message IDs/context are retained for replies, corrections and confirmations.
7. Logs and change records preserve input, origin and effects. Corrections/voids go through the same write path.

## Golden rules and their implementation

| Rule | Reason / implementation |
|---|---|
| One `values:batchGet` per run (design target) | Read required tabs together rather than one API call per tab. The current implementation reads once for read-only/AI requests and once inside a known write/callback path. A text shortcut or Drive operation discovered in an unlocked probe can reread under the lock: two snapshots in that call. An AI round-trip also spans multiple Apps Script calls. |
| Batch writes, addressed by ID | Resolve IDs against the snapshot before writing ranges; do not persist row positions as business identity. |
| Single writer | Chat and dashboard share Apps Script operations guarded by `LockService`; n8n orchestrates instead of maintaining another ledger. |
| `sello = yyMMddHHmmss + '-' + executionId` | Use Bogotá time plus execution identity to distinguish concurrent records. Record classes add their own prefixes/suffixes. |
| Dedupe by `update_id` | Telegram retries and WhatsApp message-derived update IDs must not create another operation. Dashboard forms also use unique request keys. |
| Telegram `parse_mode: HTML` | Escape user content in order: `&`, `<`, `>`; do not interpolate unescaped text. |
| Reserve → wait 3 s → verify ownership | Reusable confirmation-lock pattern when the store offers no atomic lock. This project replaced the Sheets confirmation wait with Apps Script `LockService`. The WA callback adapter additionally reserves a Data Table entry, waits **2 seconds in the supplied export**, and selects the owner. Do not describe either as a distributed atomic transaction. |
| Keep sheet tabs and headers | Add columns only; validate missing names and fail visibly. Spanish labels are an API contract. |
| Void instead of delete | Use record state plus `Cambios`; keep closed periods immutable. Technical queue cleanup and explicitly confirmed test-copy cleanup are separate operations. |
| AI proposes; code decides | Never accept model arithmetic or inferred people as authority; explicit current-message facts and business rules prevail. |

The advanced Sheets v4 service must be enabled for the batch API path. A compatibility fallback uses SpreadsheetApp and is slower; repeated reads can return cached values, so confirmation decisions must not rely on rereading within one execution.

## Boundaries

Admin access is checked server-side against configured Google accounts. API secrets belong in Script Properties and n8n credentials. Driver queries and shared statements are read-only; the proposed keyed driver web view is not implemented here. The shipped audio nodes use Gemini; Whisper is a reference-design alternative.

The free-tier model selection is historical configuration. No network availability, quota or deployment performance is asserted by the offline tests. [WhatsApp](whatsapp-integration.md) describes channel state; [validation](validation-report.md) records local evidence.
