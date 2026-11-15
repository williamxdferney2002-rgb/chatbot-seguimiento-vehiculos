# Lessons learned

Merged from the reference-project lessons and this project's diagnostics. Identifying examples, infrastructure addresses, personal data and operating balances have been removed. These are design lessons, not claims that the public template has been deployed or exercised against live services.

## Channels and orchestration

| Symptom | Cause | Preventive rule |
|---|---|---|
| Telegram rejected a reply | Default Markdown interpreted punctuation in user text | Use HTML mode and escape `& < >` in all user content, including error alerts. |
| New bot stopped receiving updates | Unpublishing the old version removed the shared bot webhook | Unpublish old, then publish new; re-publish new if order was reversed. |
| Edited export lost credentials or webhook identity | Workflow was rebuilt instead of edited | Start from the current export and compare against a baseline. |
| Button failed or did nothing | Callback payload exceeded provider limits | Use short persisted IDs; Telegram callback data must fit 64 bytes. |
| Reply lost the original operation | Callback did not include original reply context | Persist full operation and message identity before asking. |
| Bot replied to itself | Bot/group filtering was missing | Ignore bot-originated messages and unauthorized chats/users. |
| Buttons were absent | Dynamic inline-keyboard expression was incompatible with the node | Use the fixed native keyboard variants supported by the export. |
| Manual report test followed the wrong trigger | Multiple triggers and manual/test execution modes differ | Inspect graph routes and test the intended trigger/mode explicitly. |
| External failures disappeared silently | No retries or connected error handling | Configure bounded retries, error outputs and an error workflow. |
| Old branches pointed to the same destination | Leftovers from previous versions | Inspect the graph for redundant branches, disconnected outputs and dead nodes. |
| Fixed test data leaked into exports | pinData retained captured messages | Clear pinData and use fictitious fixtures. |
| Chart output ignored formatting | Provider defaulted to a different Chart.js major version | Specify the expected version; test rendering separately. |

## Duplicates, locks and Sheets

| Symptom | Cause | Preventive rule |
|---|---|---|
| Duplicate records from webhook retry or repeated tap | No idempotency or confirmation ownership | Dedupe update IDs, persist confirmation state and serialize writes. |
| Concurrency throttling multiplied executions | Provider retries arrived while executions waited in a queue | Do not use production concurrency throttling as a dedupe mechanism. |
| Two records received the same ID | Timestamp alone was insufficient | Include execution identity in the stamp. |
| A write hit the wrong record after deletion | Row position was treated as identity | Address by record ID; void business records instead of deleting. |
| Dashboard and bot raced | Their locks protected separate paths | Route both through one writer and shared script lock. |
| Repeated callbacks all saw “pending” | SpreadsheetApp cached reads in one execution | Take the lock before the decisive single read; model caching in mocks. |
| Sheets quota exhausted | Read each tab separately for every message | Use one batchGet per processing call and batch writes. |
| n8n could not write an uploaded workbook | Drive contained an Excel file, not a native Sheet | Convert to native Google Sheets before integration. |
| A renamed tab stopped all processing | Tab/header names are the schema contract | Validate names, append columns only, report the missing field. |
| Text became a formula or date | Sheets auto-conversion | Sanitize formula-like input and fractions outside date columns. |
| CSV gallons became spreadsheet dates | Locale converted decimal text during import | Disable conversion on import and compare resulting totals. |
| Daily history grew duplicate snapshots | Every manual run appended | Update the existing daily snapshot when that is the intended unit. |
| Amount/date formats were misread | Locale and serial-date assumptions varied | Share deterministic number/date/currency normalization utilities. |
| Apps Script read latency was high | Advanced Sheets service was disabled | Enable Sheets v4 and inspect read-path timing diagnostics. |
| Setup seemed to time out after completing writes | A spreadsheet UI alert was awaiting acknowledgment | Keep the sheet open during setup and acknowledge the dialog. |
| Bot message association was missing | Telegram nested the returned message ID | Read result.message_id with the appropriate fallback. |

## AI and business logic

| Symptom | Cause | Preventive rule |
|---|---|---|
| Money was assigned to another person | Model reused conversation context | Current-message evidence outranks extraction; ask when a person is ambiguous. |
| A resolved question returned again | The answered doubt remained in pending state | Remove the resolved uncertainty; do not reconfirm it. |
| Slow or unusable AI responses | Model settings, reasoning output and fallback choices varied | Keep prompts compact, discard thought parts and measure actual response behavior. |
| Free quota exhausted | Model was selected without quota review | Check current limits privately at deployment; use deterministic shortcuts and bounded fallbacks. |
| Model JSON was malformed | Extra prose surrounded the proposal | Parse cautiously, validate schema and ask instead of inventing data. |
| Receipt text attempted to direct the agent | Untrusted input reached a prompt | Treat customer/file content as data, never instructions. |
| A debt was reported missing | Different debt representations were queried separately | Model all forms of a concept behind one user intent. |
| Undo left linked effects behind | Only the visible movement was reverted | Store and reverse the complete operation. |
| Correction double-counted the old amount | Replacement calculation included replaced rows | Calculate excluding the operation being replaced. |
| Unknown person appeared to owe nothing | Missing identity was conflated with zero balance | Normalize arguments and distinguish unknown from zero. |
| Debt-only event asked where cash came from | Every action assumed cash had moved | Model debt without inventing a cash movement. |
| Bot and dashboard disagreed | Financial logic was duplicated | Prefer one core; otherwise list duplicates and compare outputs. |
| Statement match failed on split purchases | Comparison was line-by-line | Match by operation totals when the source groups an operation. |
| Reference values drifted across views | Several stale manual sources existed | Use one explicit source per shared datum. |
| Receipt text and code regex diverged | Shell escaping removed backslashes or inserted control bytes | Use structured file edits; scan controls and test regex-dependent behavior. |

## Infrastructure and delivery process

| Symptom | Cause | Preventive rule |
|---|---|---|
| Small server hung during upgrade | Insufficient memory with services running | Plan maintenance with adequate resources; avoid resource-heavy upgrades under load. |
| Reverse proxy briefly returned errors after restart | Background runner startup lagged | Diagnose readiness before changing application logic. |
| Endpoint moved unexpectedly | Host used an ephemeral address | Plan stable addressing and recovery. |
| Emergency command was unavailable | Operator permissions had not been checked | Verify maintenance access during setup. |
| Fixes accumulated without live testing | Work continued before closing the preceding version | Keep an explicit untested list and complete agreed acceptance tests. |
| “Tested” meant only a mock | Evidence scope was overstated | Report command, result and live systems not exercised. |
| Work happened in an obsolete copy | Multiple folders appeared authoritative | Keep one repository as the working source of truth. |
| Branch work remained unfinished | Phase closeout was omitted | Leave an explicit handoff; commits/merges require the owner's authorization. |
| Windows skills broke after copying | Installation relied on symbolic links | Store real copied skill directories. |
| Test fixtures contained private operations | Real exports were reused as examples | Use invented fixtures; keep private scratch data out of the repo. |
| Unexpected scope expansion | Large changes began without an agreed plan | Challenge assumptions, define acceptance and obtain the required human go-ahead. |
| Prompt grew beyond the intended budget | New rules were added without measurement | Measure prompt size and report the real result. |
| WhatsApp stopped after a day | A temporary token was still configured | Configure the intended system-user credential and verify actual permissions. |
| PNG arrived as a sticker | Client treated transparent media differently | Test the actual client path; use a supported photo format where appropriate. |

## Lessons from preparing the public copy

Anonymization must preserve test relationships, not just replace names: an ambiguity test needs two candidates matching the same query. Placeholder replacement must also preserve structural uniqueness: duplicated node IDs make an otherwise valid JSON export unsuitable for import. Calendar-dependent fixtures should control their clock.

See [validation report](validation-report.md) for the exact fixes, checks and limitations of this preparation.
