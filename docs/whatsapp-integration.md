# WhatsApp integration

## One brain, two channel adapters

WhatsApp Cloud API was added around the existing Apps Script core. The adapter converts a Meta message into the Telegram-shaped input the core already understands, with `canal: 'whatsapp'`, `wa` metadata and `update_id: 'wa_' + wamid`. The same authorization, accounting, AI orchestration and pending-confirmation logic runs for both channels.

`Usuarios.WhatsApp` is an optional, appended column. Match a normalized sender number to exactly one active user; use that user's established identity and permissions. Adapter allowlisting does not replace the server-side user check.

The inbound workflow filters by `phone_number_id`, ignores delivery-status events, supports text/audio/image/PDF and maps supported interactive replies. Unauthorized senders are copied to the administrative Telegram group without receiving an automated answer. This is administrative visibility, not a Telegram-to-WhatsApp conversation bridge.

## Workflows

| Workflow | Responsibility |
|---|---|
| `whatsapp-inbound-v1.json` | Normalize input, apply channel filters, track last contact, release eligible pending notices and invoke the shared bot |
| `bot-v7.json` | Shared core orchestration; validate WA reply context and media before calling Apps Script |
| `send-v1.json` | Route by channel, convert HTML for WhatsApp, send supported button/list layouts, split messages and mirror responses to Telegram |
| `weekly-report-v2.json` | Generate the same reminder and either send to Diego or defer it |

The sender returns `{ok, canal, messageId, wamid, copiaOk}`. Primary delivery and Telegram mirror delivery have separate success flags. A failed mirror must not masquerade as failed primary delivery. A network retry can still duplicate a provider-side send if the provider accepted it but the response was lost; accounting dedupe and message delivery are separate guarantees.

## State tables

Create these once in n8n and reuse the same table IDs across workflows. Columns below are strings; system columns such as `id`, `createdAt`, `updatedAt` belong to n8n.

| Table | User columns | Purpose |
|---|---|---|
| `wa_contexto` | `wamid`, `datos` | Outgoing context, offered callbacks and associated Telegram copy ID |
| `wa_candados` | `clave`, `ejecucion` | Inbound/pending/callback reservations |
| `wa_ultimo` | `remitente`, `fecha` | Last incoming contact, ISO UTC |
| `wa_pendientes` | `destino`, `texto`, `origen` | Deferred notices |

Reply restoration validates recipient, age, message identity and offered callback values. The bot rejects stale or substituted menus. The callback reservation in this export waits two seconds before owner verification; Apps Script still owns the final accounting lock. Sender cleanup expires old context and lock rows.

## Media and security

The WA media path retrieves metadata, validates HTTPS host, MIME type and a 10 MB limit, then downloads without redirects. Audio, photos and PDF use the same extraction/validation path as Telegram. Secrets stay in channel credentials, not node JSON.

Use a dedicated app/number or strict number-ID isolation so another bot's webhook is not affected. Validate provider credentials and webhook configuration in a separate environment before activation.

## Weekly notices

The design uses the customer-service window without introducing template messages. This export uses a conservative **23-hour** eligibility threshold within the nominal 24-hour window. Missing, invalid or future timestamps defer delivery. Store the latest Sunday notice and release it when Diego next writes. Telegram's group summary and health notifications keep their own routing.

Do not run two manual Sunday executions concurrently: delete-and-insert of the deferred notice is not atomic. Real provider policy and delivery must be checked when deploying; no live API call was made to prepare this showcase.

## Configuration order

1. Deploy/configure the Apps Script API; append `WhatsApp` to `Usuarios` and populate private user mappings.
2. Import the error workflow and configure its destination; map credentials and `settings.errorWorkflow` references where present.
3. Create the four tables above. Import the sender and replace its table, channel and account placeholders.
4. Import bot v7 and configure its shared-sender reference, Apps Script authentication, AI and media credentials.
5. Import the inbound adapter and set its number-ID filter, allowed senders, group destination, table IDs and bot reference. Confirm subworkflow call settings.
6. Configure Sunday v2 with the same tables, sender and Diego destination; configure health separately.
7. Keep all exports inactive during review. In a test deployment, enable dependencies before their callers. When replacing Telegram or Sunday versions, unpublish the old versions first.
8. Test authorized/unauthorized senders, delivery statuses, duplicate messages, stale buttons, reply context, media, mirror failure and open/closed notice windows.

Historical source notes report basic WhatsApp messages and account queries working, followed by selected button/list tests. They also record an expiring-token issue resolved by configuring a permanent system-user token. Those notes do not prove every media or weekly path works in a new deployment.
