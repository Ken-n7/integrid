# Practice recording rollout

The five-question in-game practice check is separate from the formal Research pretest,
posttest and survey. This change does not replace or change that instrument.

1. In the **INTEGRID** project (`pzyqpcwatnvckgnoomym`), run the entire
   `enable-practice-results.sql` file in Supabase's SQL Editor using the project owner account.
   It is safe to run again and does not delete existing data. New projects can use `schema.sql`.
2. Deploy the app after the SQL succeeds. The new login restores practice completion from
   this endpoint, so the database must be ready first.
3. Complete onboarding with a fresh test student. Verify the latest **Practice / 5** score in
   Students, open the student record for answers/timestamps, and download `practice-results.csv`.
   CSV choices are numbered 1–4; correctness uses 1/0. Scores are derived again on the server.
4. Delete the temporary student from the last table column and confirm. Its practice and
   game records are removed; shared Battle History stays saved.

Practice results save on the device before the score screen appears. Upload failures retry
with a delay, and retries reuse the result ID to prevent duplicates. Modes and Settings show
pending saves and a retry action. Shared devices also upload other cached students' pending
results. Old practice scores were never recorded and cannot be reconstructed from game data;
those students show a dash rather than a guessed or zero score.

Verification performed before rollout: application checks/build/lint; browser upload-overlap,
refresh, transient failure, new-device restore and teacher export/layout checks; local Postgres
SQL validation with anonymous/teacher RLS and deletion cleanup; live temporary-student game
save/retry/read/delete.

Live practice verification passed on 2026-10-28 (Asia/Manila) using the updated local
production-config preview against the real INTEGRID database: completed quiz answers and
score saved, server scoring and retry deduplication, wrong-PIN and anonymous isolation,
teacher column/answer details/CSV, restoration on a new device, unchanged Research records,
and cascading removal of the temporary test student. No browser errors. The app changes
were verified in the local preview before the production release.
