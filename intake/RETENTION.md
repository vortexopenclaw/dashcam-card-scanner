# Private retention, repair and legacy migration

This is source-only remediation. No deployment, live credentials, owner record access, secret provisioning or reclamation has been performed. Node regressions and the optional local workerd harness use synthetic fixtures only. Provider-authenticated remote-preview connectivity is an operator acceptance gate, not something the offline suite certifies.

## Invariants and policy

- Accepted DO records are authoritative and immutable. Schema and exact-byte ID/rawJSON/report integrity remain verifiable by `review.js`. A semantic retry returns its own request's raw SHA-256 receipt but retains ONLY the original record. Receipt IDs are acknowledgements, not promised lookup IDs. Semantic equality is conservative, includes all settings/cohorts/private contributor data, preserves ordered paired samples and compares exact source decimals without rounding through IEEE-754.
- Retention is indefinite until a maintainer explicitly reviews and archives selected exact record IDs. There is no age-based expiry, automatic rejection cleanup, quota-pressure deletion, bulk delete-all or public delete/admin route. Local decisions/proposals do not delete remote data.
- Capacity recovery is a deliberate maintenance action: verify an encrypted independent archive of EACH selected record, its original exact rawJSON hash, review/coverage disposition and applicable owner/privacy obligations before signing the reclamation plan. `archiveConfirmed:true` is a maintainer attestation, not remote proof that a backup exists. Do not treat it as a backup service. Archive retention/disposal is separately controlled by the maintainer.
- `admin-reclaim` deletes ONLY an explicit list of 1..20 unique lowercase raw-hash IDs, requires nonblank bounded reason, archive attestation and exact `confirm:"permanently-delete-reviewed-records"`. It commits record deletion, counters, durable KV-delete jobs, a bounded last-action audit marker and a mandatory reconciliation cursor transactionally. Repeat exact IDs safely after interruption. Keep a separate private maintenance journal/plan and readback; `admin-last` is only the latest action, not an unlimited audit archive.
- No provider API credential is bound to the public Worker. `ADMIN_CONTROL_KEY` is a separate high-entropy internal maintenance capability, not the read-only review token, IP salt or Cloudflare API token. Public handlers never forward arbitrary operations or authorization headers to the DO. Every `admin-*` operation independently requires this capability inside the DO. Do not use a contributor client or private reviewer GUI as an administration bridge.

## Bounded migration and reconciliation

The first operation on pre-v2 control state clears old semantic index keys in batches of 50, then scans authoritative `record/` keys in ordered pages of 50. Each page transaction commits its index updates, durable mirror jobs and next cursor together. New record admission pauses with 503 `migration_in_progress` until completion; explicit retry continues the cursor. No timer or hourly reset deletes data. Even more records than the current configured quota are retained: duplicates remain recoverable, new records stay `storage_capacity` until explicit maintenance frees capacity.

Every original raw variant and ID survives. The index selects earliest `receivedAt`, breaking ties by ID, as the first semantic record; an exact retry of another existing legacy ID still preserves that record's own mirror. Final counters are recomputed from ALL retained raw envelopes, not unique semantic groups. This deliberately does not reclaim old duplicates without approval. Reconciliation clears/rebuilds derived indices rather than changing original records or guessing count from KV's eventually consistent listing.

Private operations:

- `{"op":"admin-status"}`: current totals and `reconciliationRequired`; status does not advance an in-progress cursor. Totals can be stale while that flag is true.
- `{"op":"admin-reconcile"}`: begin/restart a bounded derived-index/counter rebuild. If already in progress, continue it. Do not repeatedly call after completion unless starting another rebuild is intended.
- `{"op":"admin-step"}`: advance one bounded rebuild page; repeat 503 `migration_in_progress` until 200.
- `{"op":"admin-repair-mirrors"}`: process up to 50 durable jobs; repeat until `repaired:0`. Reconciliation queues all retained records, allowing stale/missing KV repair without waiting for contributor retry. This also drains pending deletes after restart. Failure leaves the job durable.
- `admin-reclaim`: explicit approved archival/deletion plan described above, then step/repair/status readback.

A malformed/tampered legacy record fails migration closed with `record_integrity_failure`, without advancing that page or dropping data. Investigate and independently archive it through authorized provider operations. Explicit exact-ID reclamation remains possible even while a damaged record blocks rebuild; no automatic quarantine/deletion is performed. A damaged/missing derived semantic reference fails new admission with `counter_repair_required`; run reconciliation, not counter-zeroing.

The DO serializes external KV operations with storage operations. A post-commit crash leaves an idempotent put/delete job. A crash after a successful KV write but before acknowledgement repeats the same operation. Deletion cannot race an older put in the same DO instance. KV reads/listings can still return stale values during provider propagation; retain eventual readback as an operational gate. Outbox jobs and index/control overhead are bounded per retained record plus explicit pending deletions, but are not included in the payload byte quota. Drain deletion jobs before further large maintenance batches.

## Private control access, no public administration endpoint

`admin-bridge.js` is a **preview-only** maintainer bridge. Its example config has `workers_dev=false`, `preview_urls=false`, no public routes and no new DO migration. Never deploy it as a public Worker or add a route. It binds to the exact existing production script/class and existing object name `scanner-intake-v1`, never a fresh namespace. Authentication has two independent layers:

1. A maintainer starts Cloudflare's authenticated Wrangler remote development preview using an explicitly reviewed account and cross-script production DO binding. Provider authentication authorizes creation/access of this temporary preview; it is not an anonymous workers.dev endpoint. Keep preview access tokens private, stop the process after maintenance, and verify no public route/version-preview URL was created.
2. Requests from the loopback CLI to that private preview require the dedicated `ADMIN_CONTROL_KEY`; the bridge forwards the same key to the DO, which checks it again. Provision/rotate that secret separately with approval in the existing intake DO's environment and temporary bridge environment. Use a secret manager/private development secret file, never checked-in vars, command-line key values, output/logging or public client configuration. The example contains no secrets.

Operational preparation, requiring separate explicit authorization:

- Quiesce intake (`ENABLED=false`, and wait for older in-flight submissions to finish) before first deployment/migration. Old deployed handlers wrote KV outside the DO and must be fully drained before reclamation. Preserve existing DO/KV binding IDs, class, object name and migration history. Never recreate the DO or apply its creation migration again.
- Review and deploy the intake source through the normal approval path, preserving legacy challenge secrets. Prepare a private copy of `wrangler.admin.example.toml` outside the repo, with explicit approved `account_id`, existing intake `script_name` and absolute reviewed `main` path. Secret installation and deployment are NOT part of this code task.
- Start approved `wrangler dev --remote --config <private-config> --ip 127.0.0.1 --port 8791`, using the maintainer's separately authorized Cloudflare authentication. Confirm the cross-script DO binding points to the intended production script, not a preview/local namespace. If the provider/account does not permit cross-script preview access, stop: do not fall back to exposing a route or resetting storage. Arrange an approved service-only binding/temporary authenticated provider control path instead.
- Select the capability through an explicit environment-variable NAME, `INTAKE_ADMIN_KEY_ENV`, and the loopback port via `INTAKE_ADMIN_LOCAL_PORT`. The selected variable's value is resolved only in the current process. `admin-cli.js` accepts only `http://127.0.0.1:<explicit-port>/`, no arbitrary/public URL, redirects or credentials in arguments. Supply a private JSON plan path: `node intake/admin-cli.js <private-plan.json>`.
- First run status, then reconcile/step as needed and repair mirrors. For reclamation use explicit reviewed IDs, archive attestation, reason and confirmation. The CLI completes bounded cursor/repair loops and reads status back after changes; interruptions are resumable. Confirm each reclaimed exact record is absent through authorized DO/KV readback and that archived originals still hash correctly. Provider KV propagation may require a later recheck. No record body is returned by the maintenance API.
- Restore intake only after counter/mirror checks, final route/auth-denial checks and separately approved native exact-byte receipt acceptance. Stop the private preview and remove temporary capability copies. Do not use existing read-only review credentials for this operation.

## Verification

`npm run test:intake` exercises semantic variants, exact decimal pairs/settings/cohorts, concurrent claims, hourly reset without reclamation, separate malformed/admission budgets, record/byte quotas, 105-record bounded migration, transaction rollback/restart, corrupt provenance, counter/index rebuild, private auth/route denial, explicit archive-gated idempotent reclamation, durable mirror retry and put/delete races. All fixtures are synthetic.

Optional real local SQLite-backed workerd execution (Miniflare is installed separately in scratch, not a project/runtime dependency):

```sh
INTAKE_MINIFLARE_MODULE=<absolute-local-miniflare-module-path> node intake/test/runtime-smoke.mjs
```

`runtime-worker.mjs` is a TEST-ONLY synthetic storage harness, never a deployment entrypoint. Local workerd verifies actual storage transaction/list/delete behavior, migrated semantic receipts, quota rejection, private auth, explicit reclamation and KV repair. It does not certify live Cloudflare provider authorization, production migration latency, pricing, eventual consistency timing, or packaged native submission. Anonymous availability against a determined distributed attacker is still not guaranteed: both admission and bounded raw-work budgets can be exhausted, and semantic distinctions intentionally remain admissible.
