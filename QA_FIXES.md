# QA follow-up

Work happens in `.worktrees/sound-design`; `QA_REPORT.md` in the original checkout describes
an older working copy. Each applicable finding gets its own tested commit. Nothing in this
follow-up is deployed automatically.

## QA-01 — authenticated Battle messages

Implemented a credential-checked database relay instead of public Realtime broadcasts.
The owning authenticated teacher publishes room state. Students must supply their code/PIN
and join a group before submitting a numeric answer for a valid box. The SQL verifies the
answer, assigns wrong-answer counts, restricts groups, and deduplicates event IDs. A room
instance prevents messages from a previous use of its four-digit code. Raw room/event tables
are in a private schema with RLS and no frontend table grants.

Pending answers retry with the same ID after transient failures. Room controls require a
confirmed server response. Missing SQL/permission errors fail closed; there is no fallback to
public online broadcasts. Offline demo mode continues to use local-only browser channels.

Validation: repeatable Postgres SQL permission/ownership/answer/group/retry tests and relay
unit checks run with `npm run check`. An isolated browser teacher/student Battle against
that real disposable SQL database passed joining, start, wrong answers, complete-grid
scoring and final results, with zero public Realtime connections or browser/RPC errors.
Authentication API responses in that browser test were fixtures; no school data was written.

**Live verification pending:** the project owner must run `supabase/secure-battle.sql`
before this client is deployed. The canonical `supabase/schema.sql` includes the same setup.
After installation, verify a real teacher/student Battle and classroom-sized load before
calling this finding fully closed. This transport uses HTTP polling every 500 ms, replacing
Realtime; real-classroom latency/throughput is not established by the local checks.

## Remaining verification and rollout

- Project owner: run `supabase/qa-hardening.sql` (both helpers combined), then verify against the live INTEGRID database.
- Verify classroom-sized load and old-PWA-to-new-release recovery on actual phones.
- Review infrastructure rate limiting; no sustained PIN-guessing test was performed.
- Deployment is a separate step; these commits have not been pushed or deployed.
- QA-13's removed Puzzle Maker is not part of the shipped interface.

## QA-02 — one student writer per device

`DeviceWriter` obtains an exclusive Web Lock before mounting the student app. Competing
student tabs show a waiting screen and cannot initialize/persist a stale game store. After
the owner closes or leaves the student app, a waiting tab obtains ownership and reads the
latest device save. This covers all cached profiles on the device, including unfinished runs.
Unsupported/insecure browser contexts fail closed with an actionable HTTPS/browser notice.
Teacher tabs and their separate history storage are unaffected.

Validation: build/lint/type checks passed. A real same-browser, offline/demo three-tab test
preserved an unsynced first win exactly once, blocked a stale tab's retry, transferred ownership,
and preserved the next level's hinted cell and −60 charge across another ownership transfer.
The naturally advancing timer was checked separately from the immutable saved fields. No
browser errors. This deliberately prevents simultaneous student play in tabs of one browser.

## QA-04 — game upload policy and first-win rewards

`secure-game-sync.sql` validates known puzzle fingerprints, level progression, integer/bounded
counters, mistake-bank pairs and timestamps before inserting a batch. It rejects arbitrary
coin claims, derives rewards and hint charges, and serializes each student's writes with a
row lock so separate first-win claims earn one reward. Repeated IDs remain immutable and
idempotent. The SQL catalogue is checked against all 12 shipped CSV files; reward boundary
checks use the client's rules. Ordinary out-of-order offline batches are sorted by start time.
An invalid item rolls back the batch. Existing data is preserved.

The client records at least one elapsed second for a non-Battle win, avoiding a legitimate
sub-second UI completion producing the zero-second ranked result rejected by the policy.
Teacher exports explain that gameplay remains device-reported activity. Format/rule validation
cannot prove that an offline learner actually played or measured time honestly; it is not a
substitute for the separate approved research instrument. Overlapping offline hint spending
is recorded as charged rather than inventing refunds or dropping honest game activity.

Validation: SQL reruns, all report examples, malformed mistakes, predecessor requirements,
immutable IDs, first-win submissions, hint charges, atomic batch rejection, catalogue parity
and Relax/Expert reward boundaries passed in disposable Postgres. Build/lint/type checks pass.
**Live installation/verification pending:** run `supabase/secure-game-sync.sql` before deployment.

## QA-05 — resilient teacher records

Teacher game rows are validated at the API boundary before any aggregation. Malformed
records are isolated with their IDs and a visible notice that totals/downloads exclude them.
Usable students, records, Overview and exports remain available; nothing is deleted. Stable
ID ordering also makes timestamp-tied pagination deterministic. The QA-04 RPC rejects new
malformed mistakes on write; this reader protects against pre-existing or otherwise bad rows.

Validation: shape/boundary regression tests pass. A browser API fixture with four malformed
mistake variants and one valid record retained the valid student record/export and displayed
all four affected IDs, with no crash or page error. Type/lint checks passed.

## QA-06 — local storage warnings during unfinished play

Storage failure now warns inside solo/Battle grids and assessment screens, as well as Modes
and Settings. It no longer depends on a completed result being unsynced. Retry save actually
writes the latest local store, then attempts cloud sync; warnings clear after a successful
local write. No cloud acknowledgement is treated as saving an unfinished run locally.

Validation: injected QuotaExceededError during a paid hint showed the warning while retaining
the live cell/charge. After storage recovered, Retry save persisted the hint and −60 charge;
reload retained it. Warning layout passed 390px and 320px widths without horizontal overflow.
No browser errors; type/lint/build checks passed.

## QA-08 — Research label-in-name

Pre/post edit buttons now include their exact visible fraction/percentage in their accessible
names; survey buttons include their visible mean. Student and assessment context remains
available. Empty buttons include the visible word Enter. No instrument content changed.

Validation: all 30 entry controls included their visible text, and axe-core 4.14.0 reported
zero `label-content-name-mismatch` violations on the populated demo Research screen.
Type/lint/build checks passed.

## QA-09 — positional survey quick entry

Quick entry retains the teacher's raw input. Only explicit whitespace/comma/semicolon
separators are ignored; invalid answer characters keep their item slot and show positional
errors. Extra items are reported rather than truncated. Save is disabled until all 20
positions are valid/answered. Choosing an individual scale value explicitly repairs that
position without discarding other invalid or excess input. Zero placeholders keep gaps.
No research questions or scales changed.

Validation: parser regressions cover the reported bad paste, invalid digits/text, extra items,
separators, gaps and explicit corrections. The browser retained the bad paste, blocked Save,
kept an extra item after a manual edit, and sent exactly the intended 20 answers only after
correction. One fixture write, zero browser errors. Type/lint/build checks passed.

## QA-03/07 — prior fixes retested

The busy-upload browser regression on this updated build recorded a win during a held initial
request and then uploaded it automatically with no extra online event (two calls, one saved
attempt). All six configured current music URLs returned audio content and decoded in Chrome.
The deleted Swinging Sweet path from the old report is no longer configured.

## QA-10/11/12 — Battle lifecycle

Pre-start cancellation already supplied a valid terminal timestamp. The host already remained
mounted across teacher section/history changes, and Start/End already had separate confirmation
flows. Those current-release corrections were retested rather than reimplemented.

This pass also fixed automatic completion: the host now waits for confirmed final-state
publication before archiving/showing New battle, and retries failed final publication while
keeping the room active. This closes a teardown window in which students could miss the end.

Validation: actual teacher/student UI with disposable Postgres and fixture Auth passed lobby
cancellation notice, tab-switch room retention, rapid double-click Start/confirmation without
accidental termination, and complete-grid results. Holding the final publication confirmed
that New battle was unavailable until acknowledgement. Zero browser/RPC errors and no school
writes. Type/lint checks pass. Live room and classroom-load checks await SQL installation.

## QA-13 — not reachable

`AdminMaker.tsx` is absent and the teacher interface exposes the locked researcher puzzles,
not the old Puzzle Maker/sample-save controls. The conditional editor finding is not marked
fixed in a restored editor; that feature remains removed.

## Development dependency advisories

Pinned the transitive fast-uri dependency to 3.1.9 using an override, matching the patched
3.x version in [GHSA-w74x-v6f9-j3xg](https://github.com/advisories/GHSA-w74x-v6f9-j3xg).
The encoded-scheme regression and Vite/PWA production build pass. This affects development
build tooling; no live application exploit was demonstrated by the report.

Pinned serialize-javascript to 7.1.3 for
[GHSA-m5mm-p8h7-m29v](https://github.com/advisories/GHSA-m5mm-p8h7-m29v). The function-boundary
closing-script regression and complete production/PWA build pass.

The refreshed npm audit has no Moderate/High/Critical findings, but reports four Low entries
from the single deepmerge build-tool dependency chain. The newly reviewed
[deepmerge advisory](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) lists no patched version.
No framework downgrade or local replacement of that upstream library was performed. This
remaining development-only advisory is explicitly not marked resolved.

## Commit index

| Finding | Commit | Status |
| --- | --- | --- |
| QA-01 | fd32184 | Implemented/tested locally; SQL and live-class verification pending |
| QA-02 | b3a8919 | Cross-tab browser regression passed |
| QA-03 | be4b416 (prior release) | Overlapping-upload regression passed again |
| QA-04 | 3472419 | Policy/reward SQL tests passed; live SQL verification pending |
| QA-05 | 4dff548 | Poisoned teacher-row fixture and runtime checks passed |
| QA-06 | 96efe83 | Storage quota/recovery/reload browser regression passed |
| QA-07 | prior music release | All six current audio files fetched/decoded |
| QA-08 | 7075da4 | 30 control names and axe label-in-name check passed |
| QA-09 | 3dfda40 | Positional parser and exact browser submission checks passed |
| QA-10 | 08f5c2c | Cancellation and confirmed terminal-publication checks passed locally |
| QA-11/12 | prior lifecycle fixes; retested with 08f5c2c | Tab retention and rapid activation passed locally |
| QA-13 | prior removal | Old editor is absent; conditional branch is not shipped |
| fast-uri | ac40e40 | Encoded-scheme regression/build passed |
| serialize-javascript | 5bfa464 | Function-boundary regression/full build passed |

The owner upgrade file is checked against the exact helper contents and executed twice on an
existing disposable database in `check-schema.ts`. Existing school data was not modified by
this follow-up. All browser tests used local previews, fixtures or disposable Postgres.
