# Validation and change report

## Scope

Prepared entirely offline. No network calls, deployment, live data access, billing changes, staging, commits or push were performed. The supplied copy initially had no tracked files, so a Git diff could not serve as a meaningful baseline. Pre-edit local snapshots and executable-token comparisons were used instead.

The repository now has a full English README section followed by a full Spanish section, eight requested English domain guides, this evidence report, reusable agent instructions, English code comments and workflow annotations, MIT licensing and ignore rules. The 13 consumed Spanish source files were removed with a workspace-boundary check.

## Requested Node commands

Run from `apps-script/dashboard`. All five commands were also independently rerun by the read-only auditor, with exit code 0 and empty stderr.

| Command | Result | Observed output |
|---|---|---|
| `node test.js` | PASS — exit 0 | 16 printed OK summaries; many assertions per summary |
| `node test-tablero.js` | PASS — exit 0 | 21 printed OK summaries, including fuel and mutation coverage |
| `node test-pdf.js` | PASS — exit 0 | Eight encrypted PDF variants; six mutations detected, plus crypto/string checks |
| `node test-copia.js` | PASS — exit 0 | Five cases plus the missing-tab check |
| `node test-pdf-lib.js` | Exit 0 | Silent helper module; no standalone assertions, so not an independent test suite |

Printed summaries are not assertion counts. These are offline VM/mocked-adapter results, not live Google, chat-provider or AI tests.

### Fixture repairs

- `auditoriaV2`: anonymization made the second customer stop matching the short query. Two explicitly fictional candidates now share the queried first name, so the original ambiguity/selection assertions remain meaningful. A later ambiguity block had the same issue.
- List reconciliation: canonical names, spelling/accent variants, expected summaries and search regex now use consistent invented people. The parser itself was not changed.
- WhatsApp: three test identities had collapsed to the same anonymized number. Distinct demo numbers and a separate unknown sender restore the authorization/identity checks.
- `test-tablero.js` `t028`: the API used the real current month while its expected model used a fixed month. A controlled VM clock makes the fixture deterministic.
- The known `test.js` `t031` mutation failure **was not reproduced**. The initial baseline stopped earlier at `auditoriaV2`; the existing mutation block now passes. Its mutation targets were not rewritten.
- The supplied historical-fuel CSV was absent. Tests now use [19 invented rows](../apps-script/dashboard/fixtures/fuel-history.csv), described in the [fixture guide](../apps-script/dashboard/fixtures/README.md). Fixture-specific constants/counts changed; four independent efficiency checks, monthly medians, event/seven-day exclusions, filters, bot/history dedupe, price outliers and mutation checks remain.

## Workflow and tooling checks

| Check | Observed result |
|---|---|
| `check_workflow.py` for all six exports | 6/6 exit 0; 0 errors, 3 warnings |
| Workflow JSON/inactive state/unique node IDs/no pinned input | 6/6 pass |
| Executable workflow comparison | 6/6 identical except translated annotations and the ten metadata substitutions listed below |
| Code-node syntax | 38/38 pass |
| Graph inventories via `mapa_flujo.py` | 6/6 exit 0 |
| JavaScript helper syntax | 2/2 pass |
| Python helper AST syntax and non-prose token comparison | 2/2 pass each |
| Agent/skill description scalar checks | 6/6 quoted strings valid; full YAML parser unavailable locally |
| Direct VM callback-lock smoke cases | 3/3: valid owner, invalid input and duplicate/non-owner |
| Standard `simular_code.js` invocation | FAILED TO START — exit 2: local Luxon dependency missing; no installation attempted |

The three static warnings are pre-existing: one missing `settings.errorWorkflow` on the health workflow and two odd-button-count warnings for the shared sender's supported native three-button layouts. Review the health workflow's monitoring policy on installation. Error-workflow references already present were preserved.

Baseline checks used copies normalized **only** for the explicitly declared metadata repairs below. Comparing against the raw originals correctly reports those deliberate ID changes; it must not be described as unchanged identity. Standalone checks on the final exports also return zero errors. Workflow executable Code fields, node names, credential references and existing error-workflow assignments are unchanged.

### Explicit workflow metadata exceptions

Node and condition IDs that the anonymizer had turned into placeholders were regenerated as fresh random UUIDs (n8n links nodes by name, so connections are unaffected).

Four opaque webhook IDs were replaced under the privacy requirement:

| Export / node | Explicitly fictitious webhook ID |
|---|---|
| Bot / `Mensaje de Telegram` | `00000000-0000-4000-8000-000000000101` |
| Bot / `Esperar candado WA` | `00000000-0000-4000-8000-000000000102` |
| WhatsApp inbound / `WhatsApp Trigger` | `00000000-0000-4000-8000-000000000103` |
| WhatsApp inbound / `Esperar reserva pendiente` | `00000000-0000-4000-8000-000000000104` |

## Comment and runtime preservation

A total of **1,597 original comment spans** were translated: 618 in production Apps Script/HTML/CSS/client JavaScript and 979 in tests. Comment spans were located with syntax-aware parsing where applicable.

Executable raw-token comparisons preserve all tokens in `Bot.gs` (64,635), `Pdf.gs` (6,897), `Tablero.gs` (23,746), and the client JavaScript. Full reconstruction outside comments also confirms unchanged HTML/CSS/client content. `Codigo.gs` retains its 4,718-token structure, with 25 data-token substitutions for anonymization and illustrative seed data; accounting functions were not changed. The three smaller test files also retain their exact executable token streams.

The pure accounting logic and product parser regex were not changed. Test data, test search/expectation regex and the fixture clock were repaired separately. Documentation explains the one-read design target and actual probe/reread exceptions, the deferred driver web view, and the exported Gemini voice path rather than presenting earlier plans as shipped features.

## Privacy changes and retained Spanish

Additional plausible identifying data was replaced consistently. Original suspected private values are deliberately not reproduced here.

| Category | Public replacement |
|---|---|
| Seed customer / search examples | `Cliente Demo` |
| Route locality | `Pueblo Claro` |
| Legacy example vehicle | `OLD303` / lowercase variant |
| Distinctive supplier aliases | Explicit demo supplier labels and controlled accent/spelling variants |
| Additional customer ambiguity examples | Fictional `Luis Rojas` and `Luis Torres` alongside `Luis Herrera` |
| Fixture links / email domains | Reserved `receipt.example.test` / `example.test` |
| Monthly insurance seed | Illustrative 10,000 units; private deployment must configure its own value |
| Legacy cleanup selectors | 17 distinct `M/IA/CB/PC-DEMO-nnn` IDs, preserving repeated references |
| WhatsApp fixture users | Distinct invalid/demo `570000000001`, `570000000002`, `570000000003`; separate unknown sender |
| Workflow annotations | Removed redundant opaque credential/destination literals; actual credential references remain placeholders |
| Webhooks | Four explicit fictitious UUIDs above |

The requested pseudonyms Diego, Admin, Mario Ortiz and Luis Herrera remain. Generic fixture first names are fictional examples. Internal graph node IDs retain local identity where no repair was needed; they are not deployment account credentials. Public Google/Meta/CDN service URLs remain; private deployment endpoints use placeholders or reserved example hosts.

Spanish is retained intentionally in runtime chat messages, dashboard text, parser regex, identifiers, node names, existing filenames, sheet contracts, and test inputs/expected product output. Test progress strings also retain Spanish under the comments-only application translation scope. The README's full Spanish section and bilingual examples are intentional.

No suspected service secrets or private deployment contacts remain from the completed local scan. This is an inspection result, not a guarantee that every plausible-looking fixture string can be proved fictitious automatically. Original source material and translation scratch files are absent from the deliverable.

Final delivery hygiene: **47 unignored public files**, zero broken local Markdown file links, zero disallowed control-byte files, zero recognized service-secret pattern matches, and no source or translation scratch folder. The pre-existing ignored dependency lockfile was left untouched.

## What was not executed

- Live n8n import/publication, webhook registration, Data Table operations or provider deliveries.
- Telegram, WhatsApp/Meta, Gemini, Groq, Sheets, Drive or email requests.
- Google authorization/deployment, actual LockService concurrency or native PDF conversion.
- Browser layout/end-to-end UI testing: layout and executable UI content were preserved outside comment translation.
- Full YAML parser validation and the Luxon-dependent standard simulator.
- Git staging, commit or push.

To install, follow [README](../README.md), [dashboard setup](../apps-script/dashboard/README.md) and [WhatsApp dependencies](whatsapp-integration.md). Review all placeholders, credentials, table/workflow references, timezone and error handling before activating anything. Unpublish the old Telegram workflow before publishing a replacement.

Suggested manual acceptance cases in a separate test deployment: a valid parking expense, an invalid negative/zero refuel, a repeated confirmation tap, a busy lock, reply-based correction/void, dashboard/chat balance agreement, and close/retry of statement delivery. Use invented values throughout.

## File manifest

Added (14 files):

```text
.gitignore
LICENSE
README.md
docs/architecture.md
docs/agent-methodology.md
docs/business-rules.md
docs/data-model.md
docs/whatsapp-integration.md
docs/daily-operations.md
docs/lessons-learned.md
docs/glossary.md
docs/validation-report.md
apps-script/dashboard/fixtures/README.md
apps-script/dashboard/fixtures/fuel-history.csv
```

Modified (29 files):

```text
AGENTS.md
CLAUDE.md
.claude/agents/auditor.md
.claude/agents/auditor-ligero.md
.claude/agents/escultor.md
.claude/agents/escultor-ligero.md
.claude/rules/n8n-flujos.md
.claude/skills/delivery-audit/SKILL.md
.claude/skills/n8n-workflow-check/SKILL.md
.claude/skills/n8n-workflow-check/package.json
.claude/skills/n8n-workflow-check/scripts/check_workflow.py
.claude/skills/n8n-workflow-check/scripts/mapa_flujo.py
.claude/skills/n8n-workflow-check/scripts/simular_code.js
.claude/skills/n8n-workflow-check/scripts/sintaxis_code.js
apps-script/dashboard/README.md
apps-script/dashboard/Codigo.gs
apps-script/dashboard/Bot.gs
apps-script/dashboard/Pdf.gs
apps-script/dashboard/Tablero.gs
apps-script/dashboard/Index.html
apps-script/dashboard/test.js
apps-script/dashboard/test-tablero.js
apps-script/dashboard/test-pdf.js
apps-script/dashboard/test-copia.js
apps-script/dashboard/test-pdf-lib.js
workflows/bot-v7.json
workflows/send-v1.json
workflows/weekly-report-v2.json
workflows/whatsapp-inbound-v1.json
```

Deleted: `_source/` and its 13 files. Unchanged functional/configuration files include `appsscript.json`, the error/health exports and the checker-local ignore patterns.
