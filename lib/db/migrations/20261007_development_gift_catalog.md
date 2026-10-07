# One-time development → production gift catalog migration

Approved October 7: production's active gift catalog must match development, not merge competing production edits. This checked-in snapshot contains **3 collections, 12 gifts, 23 revisions and 26 files (22,588,433 bytes)**. Halloween is published in this snapshot. Later development edits are not included automatically.

## Run order

1. Apply the existing SQL migrations `20261007_gift_catalog.sql`, `20261007_gift_purchase_snapshots.sql`, `20261007_gift_types.sql`, and `20261007_gift_asset_filenames.sql`. The enabled production owner must already exist in `admin_staff` (the previously approved `user_3JJ7roIjFeLukMbmmU9YWqKRvoZ`). No owner privileges are granted by this migration.
2. From the workspace root **in the production API environment**, with its existing `DATABASE_URL`, `PRIVATE_OBJECT_DIR`, Replit storage credentials and installed dependencies, run:

   ```sh
   node lib/db/migrations/20261007_development_gift_catalog.mjs --check
   node lib/db/migrations/20261007_development_gift_catalog.mjs --apply
   ```

3. Deploy the catalog-capable API if not already deployed. Verify production admin collection counts, prices, status, artwork and platform files; check `/api/gift-catalog?platform=android&capabilities=svga,webm-alpha` and the iOS equivalent with `svga,packed-alpha-mp4`. Confirm returned artwork/animation asset endpoints load and old DM receipts remain readable. Device playback needs Android/iPhone checks separately.

This is a **Node data/storage migration, not SQL to paste into the database console**. Deployment alone does not execute it, and it intentionally does not run on every API boot. Do not pass production secrets on the command line or commit them. `--check` stages and rolls back database changes and verifies files without uploading. A missing source file, integrity error or unavailable source bucket stops the migration: production must be able to read the source project's private gift files. The snapshot contains storage identifiers, never storage credentials or expiring signed URLs.

## Safety and exact scope

- Collections/gifts in the snapshot replace current names, ordering, status, revision pointers, prices/artwork/animation/sound/framing through their imported immutable revisions. Production-only gifts/collections are archived, not deleted.
- Imported assets/nonlegacy revisions get deterministic migration-specific IDs and new create-only object paths. This keeps production assets/history untouched and gives the approved production owner access to edit the imported gift files. Original seed revision IDs remain compatible with legacy clients.
- Every file is downloaded and SHA-256/size verified. Separate production storage receives verified copies; shared storage receives migration-specific copies too. Audio dependencies are inserted first. Existing destination files are verified, never overwritten.
- Database replacement, catalog-version bump, audit entry and completion marker are atomic. File copying cannot share a database transaction: failed runs may leave only immutable migration-owned file copies; retries verify/reuse them. Do not delete them or original historical files as a rollback shortcut.
- No users, wallets, ledger records, messages, receipts or purchase-time prices are migrated or updated. All prior revision/asset/publication rows stay intact. The migration records previous collection/gift rows in `gift_catalog_data_migrations.previous_catalog` for deliberate recovery; it never automatically restores them.
- A completed rerun is a no-op, including after subsequent production admin edits. Changing the checked-in snapshot after application fails rather than silently overwriting production again. Prepare a new migration for later transfers.

## Verification

`node lib/db/tests/gift-catalog-migration.integration.mjs` exercises a disposable PostgreSQL schema and mocked storage. `node lib/db/migrations/20261007_development_gift_catalog.mjs --verify-source` verifies actual development source bytes without touching any database or writing files. Neither command is production execution or native playback verification.

Both checks passed October 7: all 26 actual source files passed SHA-256/size verification. The storage SDK emitted listener warnings but completed successfully. Production execution, production storage permissions and actual production asset endpoints remain unverified. No application API code/configuration was changed by this migration; no development API restart or native build is required to prepare it.
