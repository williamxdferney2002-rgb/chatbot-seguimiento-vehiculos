# Agent methodology

## Roles and historical setup

The main session acted as **Architect**: read the plan and lessons, classify risk, define acceptance criteria and coordinate handoffs. **Sculptors** implemented only the bounded task. **Auditors** independently reviewed evidence and never edited the implementation under review.

The documented Claude Code role configuration used Sonnet 5.5 at medium effort for light implementers/reviewers and Opus 5.5 at medium effort for full implementers/reviewers. Earlier notes used other model assignments; these are historical choices rather than required dependencies. A later process used Claude for architecture and separate Codex execution and audit threads.

| Classification | Scope | Routing |
|---|---|---|
| TRIVIAL | Unambiguous, low-risk edit; delegation costs more than the work | Architect handles it with a small check |
| SIMPLE | Bounded change without money logic | Light Sculptor; light Auditor when risk or limited tests justify it |
| COMPLEX | Feature, n8n flow, Apps Script or debugging | Full Sculptor plus mandatory independent full Auditor |
| CRITICAL | Money rules, real data, production or destructive actions | Explicit plan and human go-ahead, full Sculptor and Auditor |

These repository files are a reusable example. Select models available in your own tool environment; do not silently substitute a model while claiming a historical role configuration.

## Routing and delegation

Begin a phase with `/grill-me`: challenge the assumptions, identify unknowns and agree on scope. Read [lessons](lessons-learned.md) before implementation. The original method used a fresh session per phase and a short brief to avoid carrying irrelevant conversation history. Only independent phases with separate files ran concurrently; otherwise work stayed sequential or used isolated worktrees.

Every delegation used the same compact protocol:

```text
TASK_ID:
OBJECTIVE:
SCOPE:
RELEVANT_FILES:
CONSTRAINTS:
ACCEPTANCE_CRITERIA:
VALIDATION_COMMANDS:
```

The implementer returns files changed, decisions/deviations, command outputs and untested behavior. Conflicts with the agreed plan go back to the Architect; implementers do not redesign requirements silently.

## Independent audit loop

1. Sculptor implements and runs the specified checks.
2. Auditor compares the actual diff to acceptance criteria, compatibility constraints and evidence.
3. Auditor returns approval or specific `REQUIRED_FIXES`, with file/function references.
4. Architect routes only those fixes back to the same implementer.
5. Repeat at most **two audit/fix cycles**; unresolved problems are reported to the human instead of endless automatic patching.

An implementer's self-check is useful but does not replace independent review. Record what ran and what did not; an offline mock is not evidence of a live Telegram, Meta or Google transaction.

## Skills and verification

- [.claude/skills/n8n-workflow-check/SKILL.md](../.claude/skills/n8n-workflow-check/SKILL.md): structural and compatibility inspection, Code syntax and fixture simulation.
- [.claude/skills/delivery-audit/SKILL.md](../.claude/skills/delivery-audit/SKILL.md): reconcile the delivered claims with actual files and test evidence.
- [.claude/rules/n8n-flujos.md](../.claude/rules/n8n-flujos.md): preserve workflow identity, schema and channel rules.

`/grill-me` is a phase-start practice described in the sources; no separate implementation of that skill is bundled. A channel-adapter skill informed the original WhatsApp work but is not included here.

```sh
python .claude/skills/n8n-workflow-check/scripts/check_workflow.py workflows/bot-v7.json --base /path/to/original-export.json
python .claude/skills/n8n-workflow-check/scripts/mapa_flujo.py workflows/bot-v7.json --rutas --code
node .claude/skills/n8n-workflow-check/scripts/simular_code.js workflows/bot-v7.json "Node name" /path/to/fixtures.json
```

Use valid, invalid and duplicate fixtures for changed executable paths. The five Apps Script Node suites cover the pure core and mocked adapters. Keep test fixtures fictitious.

## Human approval gates

Plans for risky changes, destructive cleanup, production data, deployment and publication require an explicit human go-ahead. A broad approval is not permission to deploy unrelated changes. Show proposed staging before an authorized commit; never push unless explicitly requested. This portfolio preparation was authorized as a local edit only: no network calls, commits or push.

## What worked and what did not

| Worked | Problems and response |
|---|---|
| One shared accounting core | Duplicated bot/dashboard calculations drifted in earlier projects; consolidate them or test equality explicitly. |
| Bounded handoffs and read-only auditors | Large session histories and overlapping edits increased confusion; use short briefs and separate ownership. |
| Executed evidence, not reassuring prose | Several historical fixes reached later versions without live tests; keep an explicit untested list. |
| Offline n8n inspection | Valid JSON alone missed dead branches, unsafe HTML and broken regex; combine structure, syntax and behavior checks. |
| Lessons read at phase start | Cached Sheets reads, import conversion and webhook ordering recurred until recorded as constraints. |
| Two audit cycles and human escalation | Unbounded fix loops obscure scope and spend context; report unresolved blockers. |

The sources contain evolving task state. This showcase documents the method and shipped code rather than claiming every historical deployment plan was completed. [Technical lessons](lessons-learned.md).
