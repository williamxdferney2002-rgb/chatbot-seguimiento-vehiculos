# Collaboration example: chat-based fleet accounting

This public repository demonstrates a reusable Architect / Sculptor / Auditor workflow. Read [business rules](docs/business-rules.md), [architecture](docs/architecture.md) and [lessons learned](docs/lessons-learned.md) before changing accounting or workflows.

## Start a phase

Challenge assumptions (`/grill-me` in the original process), classify risk and write a bounded plan. Resolve material unknowns before implementing dependent behavior. Existing user authorization applies; request a specific human go-ahead before risky production, money-rule or destructive actions.

| Class | Routing |
|---|---|
| TRIVIAL | Direct edit and proportionate verification |
| SIMPLE | Light implementer; independent review when risk warrants |
| COMPLEX | Full implementer plus independent auditor |
| CRITICAL | Explicit approved plan plus full implementer and auditor |

The historical light/full roles used Sonnet/Opus. Choose available models explicitly; see [methodology](docs/agent-methodology.md). Fresh phase sessions receive a short brief, not an entire unrelated history. Parallel work requires separate files or isolated worktrees.

## Delegation contract

`TASK_ID · OBJECTIVE · SCOPE · RELEVANT_FILES · CONSTRAINTS · ACCEPTANCE_CRITERIA · VALIDATION_COMMANDS`

The Architect coordinates scope and decisions. Sculptors implement within scope. Auditors do not edit the implementation under review. Route `REQUIRED_FIXES` back to the implementer; allow at most two audit/fix cycles, then report unresolved issues to the human.

## Compatibility rules

1. AI proposes; deterministic code validates money, identity, balances and writes.
2. One batchGet per processing call; batch writes resolved by ID; one shared Apps Script writer and lock.
3. Stamp: `yyMMddHHmmss-executionId`. Dedupe by `update_id`; protect confirmation callbacks and form submissions.
4. Telegram uses HTML with escaped user text. Persist pending operation context before showing buttons.
5. Preserve node names, IDs, webhook IDs, credential references and error-workflow references. Export workflows with `active: false`. Any necessary repair to damaged fictitious placeholders must be explicit and verified.
6. Keep Spanish runtime messages, parser regex, identifiers, sheet tabs and headers. Translate documentation and comments, not the runtime contract.
7. Add columns only; void business records rather than delete. Closed periods receive later adjustments, not silent edits.
8. Do not use production concurrency throttling as duplicate protection. Never add secrets to source, logs, exports or chat. Do not enable billing.
9. When replacing a Telegram workflow, unpublish the old version before publishing the new one.

## Verification and delivery

Use [n8n-workflow-check](.claude/skills/n8n-workflow-check/SKILL.md) for workflow changes and [delivery audit](.claude/skills/delivery-audit/SKILL.md) before delivery. Test changed behavior with valid, invalid and duplicate cases; include busy locks and undo when relevant. Run applicable Node suites in `apps-script/dashboard`.

Report: what changed; installation order; import/configuration review; suggested acceptance tests; exact executed results; what was not executed. Offline mocks are not live provider evidence.

This showcase uses fictitious names, vehicles, IDs, numbers and test amounts. Keep deployment data private. Do not make network calls, deploy, commit or push unless the current task explicitly authorizes those actions. Show staged files and wait for approval before an authorized commit; never add Co-Authored-By metadata automatically.
