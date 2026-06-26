# Django Migrations — read before touching migration files

> Context: SMP-561. A migration consolidation (commit `3553cae57`) deleted historical
> migration files that production had already applied, breaking startup with
> `NodeNotFoundError`. The recovery restored those files **as no-ops**. The rules below
> exist so that incident does not recur.

## What the restored files are

- Many `backend/*/migrations/*.py` files have `operations = []` (no-ops). They were deleted
  by the consolidation and restored with **empty operations but intact dependencies**.
- On existing databases (incl. production) these are already recorded as applied → never
  re-run. On a fresh database the schema is created entirely by the consolidated
  `0001_initial`, and these apply as no-ops.
- A few post-consolidation `_slug`/audit migrations had their **dependencies re-pointed** to
  the restored leaf nodes (not `0001_initial`) to resolve split heads.

**Do NOT:**
- Re-add `operations` to a no-op file (re-introduces a fresh-DB schema collision → CI red).
- Revert a re-pointed `dependencies` back to `0001_initial`.
- Delete or rename a migration production has already applied (CI `migration_guard` blocks this).

Editing migration **content** is otherwise safe — Django does not hash migrations, and
already-applied ones never re-run.

## How to work with migrations

**A. New migration (normal — new model / field / index)**
- `python manage.py makemigrations`, commit the new numbered file. No friction: the guard only
  blocks deletes/renames, not additions. The no-op files don't affect `makemigrations`.

**B. Applying a schema change to production — the deploy does NOT run `migrate`**
- The prod entrypoint runs `collectstatic` + daphne only. A new schema migration ships in the
  image but is **not auto-applied**. After deploy, apply it manually (preview first):
  ```bash
  docker compose -f docker-compose.pro.single.yml exec backend python manage.py migrate --plan
  docker compose -f docker-compose.pro.single.yml exec backend python manage.py migrate
  ```

**C. Deleting / renaming / re-squashing (rare, needs care)**
- `migration_guard` blocks it. For an intentional, reviewed cleanup, add the `migration-override`
  label to the PR to bypass.
- Prefer adding a merge/squash migration over deleting old files. If you must squash, use Django's
  `squashmigrations` (it writes a `replaces` list and keeps the old files), and **only delete the
  old files once every environment — including production — has migrated past them.**

**Rule of thumb:** never delete/rename a migration production has applied; editing content is safe;
to clean up, stack on top or squash-with-`replaces`, and remove old files only once all DBs are past them.

See the full incident write-up: [SMP-561 Confluence](https://mediajirav.atlassian.net/wiki/spaces/MJCP/pages/336592897/SMP-561+Main+server+is+down+2)
