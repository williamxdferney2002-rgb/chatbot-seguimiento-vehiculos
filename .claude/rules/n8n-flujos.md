---
paths:
  - "workflows/**/*.json"
---
# Editing n8n workflow exports

- Start with the current export. Preserve node `id`, `webhookId`, credential references, and `settings.errorWorkflow`. Set `settings.timezone = "America/Bogota"`; deliver `active: false` with empty `pinData`.
- Keep node names, identifiers, sheet tabs/headers, parsing regex, and Spanish user messages unchanged. Translate only comments, node notes, and sticky-note prose when documenting.
- Use shared `num()`, `fecha()`, and `pesos()` helpers for localized amounts/dates; include `$execution.id` in `sello`.
- Read the ledger once per execution with `values:batchGet` (`UNFORMATTED_VALUE`, `FORMATTED_STRING`). Pass rows with `row_number` and headers in `_h`.
- Route all mutations through the single Apps Script writer under `LockService`. Build batch operations by record ID. Escape formula-like cell text with `limpio()`. Do not duplicate the business logic in channel adapters.
- Telegram: `additionalFields: {appendAttribution: false, parse_mode: "HTML"}`. Escape dynamic `& < >`. Keep callback data at most 64 bytes; offer a cancel action and use supported fixed keyboards.
- External HTTP, Sheets, and AI nodes need retries (three attempts, two seconds) and an explicit error path where safe. Retries do not guarantee delivery idempotency.
- Before handoff, run `check_workflow.py NEW.json --base PREVIOUS.json`, syntax checks, and valid/invalid/duplicate simulations for changed Code logic. Explain every warning and any pre-existing checker limitation.
