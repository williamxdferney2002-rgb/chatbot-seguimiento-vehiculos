---
name: delivery-audit
description: "Audit the actual diff, workflow exports, dashboard checks, documentation, and sensitive data before handing off repository changes. Require evidence and disclose unexecuted checks."
---
# Delivery audit

Review the work adversarially: compare the proposed report with what actually changed and ran. The user's scope and authorization override generic checklist steps.

## 1. Inspect the local changes

Run offline commands from the repository root:

```bash
git status --short
git diff --stat
git diff --check
git diff
```

Use an available local base or a pre-edit copy; do not fetch merely to audit. Explain every changed file. Exclude scratch files, backups, dependencies, pinned personal data, and real-data fixtures. Do not stage, commit, push, deploy, or call remote services as part of this skill.

## 2. Check workflow exports

For each changed export:

```bash
python .claude/skills/n8n-workflow-check/scripts/check_workflow.py workflows/NEW.json --base /tmp/PREVIOUS.json
```

Require valid JSON, `active:false`, preserved IDs/webhookIds/credential references/error workflow, no secrets, and syntax-valid Code nodes. Investigate every error and explain every warning. If a heuristic checker rejects an unchanged, externally escaped value, show the producer and consumer and report the checker failure; do not claim zero errors or change behavior solely to silence it.

Simulate changed Code behavior with valid, invalid, and duplicate cases. Notes-only changes can instead use a deep comparison proving that executable workflow fields did not change. Record the exact checks run.

## 3. Check Apps Script changes

Run the relevant offline suites in `apps-script/dashboard`:

```bash
node test.js
node test-tablero.js
node test-pdf.js
node test-copia.js
node test-pdf-lib.js
```

Check syntax where appropriate. For behavior changes, cover invalid amounts/dates/authorization, duplicate keys, busy locks, corrections, and undo. Compare shared balance/debt logic and keep it consistent across bot and dashboard.

For UI behavior/layout changes, use browser checks at narrow and desktop widths, including a double tap. Comments-only changes require evidence that runtime tokens are preserved, rather than a fabricated UI test. Use fictitious fixtures only. New Google services may require authorization during installation; disclose this without invoking them.

## 4. Verify the handoff

The final report must say:
1. What changed, with affected files/functions.
2. How to install, in exact order when deployment is relevant. Unpublish the old Telegram workflow before publishing its replacement; exports remain inactive.
3. What to review on import: credentials, URLs, placeholder IDs, timezone, error workflow, and dependencies.
4. Suggested manual tests, including an invalid message and repeated confirmation.
5. What was not executed inside n8n, Google, Telegram, WhatsApp/Meta, or real AI services.

For documentation-only work, say that no deployment is required. Every claim of passing tests needs a command and observed result. Report unmet targets and pre-existing failures explicitly.

## 5. Documentation and privacy

Verify local Markdown links, workflow/node counts, glossary terminology, installation instructions, and known limitations. Add a lesson for a newly diagnosed general failure. Scan changes for tokens, private keys, personal names/contact details, real IDs, domains, and private fixtures. Keep anonymized placeholders and fixture values clearly identified. Do not display potential secrets in the report.

## Result

Before the final handoff, provide a short audit result:

```text
Delivery audit
PASS: checks supported by evidence
OBSERVATIONS: warnings and unexecuted integration checks
BLOCKERS: unresolved failures or none
```

Do not say the work is ready while a material blocker remains. Explain the issue or route required fixes back to the implementer. The auditor does not implement fixes.
