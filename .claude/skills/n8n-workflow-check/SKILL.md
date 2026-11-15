---
name: n8n-workflow-check
description: "Offline static checks and Code-node simulations for n8n JSON exports. Verify inactive exports, structure, IDs, webhookIds, credential references, HTML escaping, deduplication conventions, secrets, and syntax."
---
# n8n workflow checks

These tools run outside n8n. They do not test actual Telegram, Sheets, Drive, Gemini, Groq, WhatsApp, or non-Code node behavior. Always disclose those limits.

Paths below are relative to the repository root. Script filenames, CLI flags, and fixture keys retain their original identifiers for compatibility; descriptions and output are English.

## 1. Static checks

```bash
python .claude/skills/n8n-workflow-check/scripts/check_workflow.py workflows/NEW.json --base /tmp/PREVIOUS.json
```

- Use the supplied previous export or a pre-edit copy as `--base`. Without it, preservation of IDs, webhookIds, credentials, and errorWorkflow cannot be established.
- `--modo produccion` reports active/timezone settings without enforcing delivery values; the default `entrega` mode enforces them.
- `--json` produces machine-readable output. Multiple exports are accepted without `--base`.
- Exit code 1 means errors. Investigate them; never silently claim a clean check. A pre-existing heuristic false positive needs producer/consumer evidence and explicit disclosure.
- Configure `VERSIONES` in the checker for the target instance. Its reference versions may differ from imported exports.

| Area | Errors | Warnings |
|---|---|---|
| Structure | Invalid JSON, duplicate name/ID, missing connection target | Disconnected or disabled node |
| Delivery | Active export, wrong timezone | Missing error workflow, pinned data |
| Baseline | Changed IDs, trigger webhookId, credential reference, errorWorkflow | Removed node or changed non-trigger webhookId |
| Versions | — | Different reference node version |
| Telegram | Missing HTML mode/escaping, callback data over 64 bytes | Attribution, odd button count, missing cancel |
| Sheets | — | Multiple batchGet reads or individual reads |
| Security | Embedded tokens, API keys, literal authorization, private keys | — |
| Code | Syntax errors | Stamp without execution ID, blocked env usage, locale formatting |

The Telegram escape check is heuristic and may not trace HTML across HTTP or subworkflow boundaries. Validate those paths manually; do not weaken runtime safety.

## 2. Simulate changed Code logic

The simulator requires Luxon from this skill's local `node_modules`. Install dependencies only when network access is authorized; existing local dependencies are sufficient for offline use.

```bash
node .claude/skills/n8n-workflow-check/scripts/simular_code.js workflows/FILE.json "Node name" --plantilla
node .claude/skills/n8n-workflow-check/scripts/simular_code.js workflows/FILE.json "Node name" cases.json --ver
```

Create at least one valid, one invalid, and one duplicate case per changed behavior. Use fictitious Spanish messages and realistic locale formats. Cases execute in order and share `$getWorkflowStaticData`; repeat an input to test deduplication. `ahora` fixes Bogotá time for date boundaries.

Fixture keys remain: `nombre`, `tipo` (`valido/invalido/duplicado`), `entrada`, `nodos`, `ejecucion`, `ahora`, `espera` (`error/cantidad/salida/contiene/no_contiene`). Use `@file.json` to load input or referenced node data. Assertions use partial output matching. Rows can include `row_number` and `_h` with the original sheet headers.

Measure generated prompts from actual simulator output; character/token approximations are estimates. Save reusable cases with invented data only.

Limitations: `$('Node').item` selects the same index, without full pairedItem semantics; HTTP helpers deliberately fail; no live credentials or binary downloads are used. Notes-only changes do not require new behavioral fixtures if executable fields are proven unchanged.

## 3. Inspect the graph

```bash
python .claude/skills/n8n-workflow-check/scripts/mapa_flujo.py workflows/FILE.json --rutas --code
```

Inspect triggers, Switch/IF outputs, model references, reads/writes, retries, error branches, and disconnected nodes. If a calculation is repeated across bot and dashboard, test both paths or consolidate before changing financial behavior.

## Report

State command, exit code, error/warning counts, simulation pass/total, and every unexecuted live integration. Never equate an offline simulation with a production test.
