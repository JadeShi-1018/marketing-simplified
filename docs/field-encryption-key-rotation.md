# Field Encryption — Key Rotation Playbook

**Relates to:** MED-331  
**Owner:** Backend team  
**Last updated:** 2026-06

---

## Background

OAuth tokens and API keys for third-party integrations (Facebook, Zoom, Linear,
Google Docs, Google Calendar, Slack) are stored encrypted in the database using
[Fernet symmetric encryption](https://cryptography.io/en/latest/fernet/).

Each encrypted value is stored as:

```
{key_id}:{fernet_ciphertext}

Example:  v1:gAAAAABh3k7xP...
```

The `key_id` tells the system which key was used to encrypt the value, enabling
zero-downtime key rotation: multiple keys can be active simultaneously, old
ciphertext remains readable while new writes use the latest key.

---

## When to rotate keys

| Trigger | Action |
|---------|--------|
| Routine rotation (every 6–12 months) | Follow this playbook |
| Key suspected compromised / leaked | Follow this playbook immediately |
| Engineer with key access leaves the team | Follow this playbook |

---

## Step 1 — Generate a new Fernet key

Run this command **locally or in a secure shell** (never commit the output):

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

You will get a string like:

```
YzBhMmZkNjItOTQ4Ny00ZGFlLThhMGItZGE4MjkxYTA2ZDQ=
```

Choose a new key ID (increment the number, e.g. if current is `v1` use `v2`).

---

## Step 2 — Update FIELD_ENCRYPTION_KEYS

`FIELD_ENCRYPTION_KEYS` is a comma-separated list of `key_id:fernet_key` pairs
stored in the environment (never in git).

**Rule: the FIRST entry is always the active key (used for new encryptions).
All other entries are kept for decrypting old ciphertext.**

### Before rotation

```
FIELD_ENCRYPTION_KEYS=v1:gAAAAABh_old_key_here...
```

### After adding the new key

```
FIELD_ENCRYPTION_KEYS=v2:YzBhMmZkNjIt...,v1:gAAAAABh_old_key_here...
                       ^^^ new key first    ^^^ old key kept as fallback
```

Update this value in:
- The production secrets manager (e.g. AWS Secrets Manager / GCP Secret Manager)
- The preview/staging environment
- Your local `.env` file (use a **dev-only** key, not the production key)

---

## Step 3 — Deploy

Deploy the updated environment variables. **No code change is needed.**

- New writes will use `v2` immediately after deploy.
- All existing `v1` ciphertext remains readable (the system tries all keys).
- Zero downtime.

---

## Step 4 — Run the re-encryption task

After deploying, trigger the Celery task to migrate all existing rows to `v2`:

### Option A — via Django shell (quick, for staging)

```bash
# Inside the running backend container
docker compose -f docker-compose.dev.yml exec backend python manage.py shell

# In the shell:
from core.tasks import reencrypt_secret_fields
result = reencrypt_secret_fields()   # runs synchronously in the shell
print(result)
```

### Option B — via Celery (recommended for production)

```python
from core.tasks import reencrypt_secret_fields
reencrypt_secret_fields.delay()      # sends to Celery worker queue
```

### Expected output

```json
{
  "FacebookConnection":        {"reencrypted": 42, "skipped": 0, "errors": 0},
  "ZoomCredential":            {"reencrypted": 18, "skipped": 0, "errors": 0},
  "LinearCredential":          {"reencrypted": 7,  "skipped": 0, "errors": 0},
  "GoogleDocsConnection":      {"reencrypted": 23, "skipped": 0, "errors": 0},
  "GoogleCalendarConnection":  {"reencrypted": 15, "skipped": 0, "errors": 0},
  "SlackWorkspaceConnection":  {"reencrypted": 31, "skipped": 0, "errors": 0},
  "total": {"reencrypted": 136, "skipped": 0, "errors": 0}
}
```

**The rotation is complete when `errors == 0` and `skipped == 0` for all models.**

> If `errors > 0`: rows exist that cannot be decrypted with any available key.  
> These are likely corrupted. Do NOT remove the old key yet. Investigate each  
> affected row (the task logs the `pk` of every failed row).

---

## Step 5 — Verify

Run the task a second time to confirm idempotency (all rows should be `skipped`
on the second run, because they are already on the new key):

```python
result = reencrypt_secret_fields()
# Expected: all "reencrypted" counts are 0, all "skipped" counts match row counts
```

---

## Step 6 — Remove the old key

Once the second run shows `reencrypted == 0` everywhere, the old key is no
longer needed:

```
# Before
FIELD_ENCRYPTION_KEYS=v2:YzBhMmZkNjIt...,v1:gAAAAABh_old_key...

# After
FIELD_ENCRYPTION_KEYS=v2:YzBhMmZkNjIt...
```

Update the secrets manager and deploy.

---

## Rollback plan

> Only applies if something goes wrong **before** completing Step 6.
> Once the old key is removed, rollback is not possible without data loss.

1. **If the task is still running:** let it finish before deciding.
2. **If errors appeared:** do NOT remove the old key. Both `v1` and `v2` remain
   in `FIELD_ENCRYPTION_KEYS`. Rows that failed stay on `v1` and are still
   readable. Fix the root cause, then re-run the task.
3. **If you need to fully revert** (e.g. bad key was used):
   - Remove the new key from the front of `FIELD_ENCRYPTION_KEYS`
   - Deploy (old key `v1` becomes active again for new writes)
   - Any rows already re-encrypted to `v2` are still readable as long as `v2`
     remains in the list — so keep both until you can do a forward fix

---

## Quick reference

```bash
# Generate a new key
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# Check current key ID in use (look at any encrypted row)
docker compose -f docker-compose.dev.yml exec backend python manage.py shell -c \
  "from facebook_integration.models import FacebookConnection; \
   c = FacebookConnection.objects.first(); \
   print(c.encrypted_access_token[:5] if c else 'no rows')"

# Run re-encryption task (sync, in shell)
docker compose -f docker-compose.dev.yml exec backend python manage.py shell -c \
  "from core.tasks import reencrypt_secret_fields; print(reencrypt_secret_fields())"
```

---

## Models covered by this rotation

| App | Model | Encrypted fields |
|-----|-------|-----------------|
| `facebook_integration` | `FacebookConnection` | `encrypted_access_token` |
| `zoom_integration` | `ZoomCredential` | `encrypted_access_token`, `encrypted_refresh_token` |
| `linear_integration` | `LinearCredential` | `encrypted_access_token` |
| `google_docs_integration` | `GoogleDocsConnection` | `encrypted_access_token`, `encrypted_refresh_token` |
| `google_calendar_integration` | `GoogleCalendarConnection` | `encrypted_access_token`, `encrypted_refresh_token` |
| `slack_integration` | `SlackWorkspaceConnection` | `encrypted_access_token` |
