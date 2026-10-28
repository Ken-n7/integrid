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

## Remaining work

- QA-02: protect completed attempts and pending hint costs across tabs.
- QA-04/05: validate game uploads and isolate malformed teacher records.
- QA-06: warn about storage failure during unfinished gameplay.
- QA-08/09: accessible Research control labels and positional survey validation.
- QA-03/07: prior release addressed these; preserve regression coverage.
- QA-10/11/12: current code addresses them; retest Battle cancellation, tab changes and rapid activation.
- QA-13: removed Puzzle Maker is not reachable in the shipped interface.
