# One-time development → production gift catalog migration

Approved October 7: production's active gift catalog must match development, not merge competing production edits. This checked-in snapshot contains **3 collections, 12 gifts, 23 revisions and 26 files (22,588,433 bytes)**. Halloween is published in this snapshot. Later development edits are not included automatically.

## Normal deployment — automatic once

Deploy the API normally. Production startup (`NODE_ENV=production` or `REPLIT_DEPLOYMENT=1`) runs the four additive gift schema migrations and this catalog/file transfer in one database transaction before accepting requests. The build includes the migration script, snapshot and prerequisite SQL beside the server bundle. No temporary secrets, SQL-console steps or manual commands are needed.

Development startup creates only the empty completion-table schema and skips the data import and storage transfer. Simultaneous production instances coordinate through a database lock; only one imports the catalog. A completion marker makes all later starts skip the import, retaining subsequent production admin edits. A migration failure rolls back the database and prevents that new instance from serving; inspect deployment logs rather than deleting historical files or forcing publication. The existing enabled production owner and access to the source object storage are still required.

Automated startup tests cover missing gift schema, simultaneous starts, schema/data rollback on storage failure, development skipping and later admin edits surviving a restart. Actual production execution/permissions and device playback remain separate checks.

## Live development schema correction — October 8

The October 7 schema registration was incomplete for Replit publication: [Replit compares the live development and production databases](https://replit.com/blog/production-databases-automated-migrations), rather than relying on the source schema definition. A read-only check confirmed that the actual development database lacked `gift_catalog_data_migrations`, while its six managed gift catalog tables existed. This explains why publishing continued proposing the drop after the code-only fix.

The shared additive SQL `20261008_gift_catalog_migration_marker.sql` now creates the same marker table at development startup. It is packaged with the API and reused by the production import inside its existing transaction. Development does not insert a completion row or import any catalog data/files. The Drizzle registration remains in place. Do not seed a fake completion row or approve the proposed marker drop.

The development API was rebuilt and restarted with its existing environment and arguments. Its live marker now has the four expected columns and zero rows; counts and checksums of all six catalog tables are unchanged. Health and the Android-capability catalog endpoint return 200. Isolated schema/startup regressions, API type checks and the API build passed. Schema tests cover the missing live development table, repeated additive creation, matching development/production column definitions and retention of production completion/recovery records. The next publication needs a fresh deployment preview; the actual production preview remains unverified. This schema fix requires no native build.

The user confirms approving the DROP statements in the latest publication and reports no visible adverse effect. Production data, marker recreation and possible import replay have not been inspected from this workspace. Dropping the marker can permit the startup import to run again; an unchanged-looking app does not prove the marker or later admin edits survived.

## Earlier deployment schema correction — October 7

The user reports this import has already completed in production, but each publication proposes disabling RLS and dropping `gift_catalog_data_migrations`. The startup migration created that table outside the registered Drizzle schema. The table was exported from `lib/db/src/schema/index.ts` with the exact existing column types, nullability, primary key and timestamp default. This protects Drizzle synchronization, but the October 8 correction above is also required for Replit's live-database comparison. Keep the completed marker and `previous_catalog` recovery snapshot: deleting them can replay the import and replace later production catalog edits.

Rebuild the deployment plan after aligning the actual development schema as described above. Neither a data reimport nor approving the table drop is required. If a previous deployment already dropped the marker, inspect the actual production migration/audit state before deciding recovery.

The isolated PostgreSQL schema regression reproduces the drop with an unregistered table, then verifies repeated Drizzle synchronization produces no SQL and preserves the populated marker and recovery snapshot with the corrected export. Run it from the workspace root with `pnpm --filter @workspace/scripts exec tsx ../lib/db/tests/gift-catalog-schema.integration.ts`. Production plan verification remains a publication check.

## Optional operator diagnostics (not required for normal deployment)

1. Apply the existing SQL migrations `20261007_gift_catalog.sql`, `20261007_gift_purchase_snapshots.sql`, `20261007_gift_types.sql`, and `20261007_gift_asset_filenames.sql`. The enabled production owner must already exist in `admin_staff` (the previously approved `user_3JJ7roIjFeLukMbmmU9YWqKRvoZ`). No owner privileges are granted by this migration.
2. From the workspace root **in the production API environment**, with its existing `DATABASE_URL`, `PRIVATE_OBJECT_DIR`, Replit storage credentials and installed dependencies, run:

   ```sh
   node lib/db/migrations/20261007_development_gift_catalog.mjs --check
   node lib/db/migrations/20261007_development_gift_catalog.mjs --apply
   ```

3. Deploy the catalog-capable API if not already deployed. Verify production admin collection counts, prices, status, artwork and platform files; check `/api/gift-catalog?platform=android&capabilities=svga,webm-alpha` and the iOS equivalent with `svga,packed-alpha-mp4`. Confirm returned artwork/animation asset endpoints load and old DM receipts remain readable. Device playback needs Android/iPhone checks separately.

The manual CLI is a **Node data/storage migration, not SQL to paste into the database console**; it remains available for operator diagnostics. Do not pass production secrets on the command line or commit them. `--check` stages and rolls back database changes and verifies files without uploading. A missing source file, integrity error or unavailable source bucket stops the migration: production must be able to read the source project's private gift files. The snapshot contains storage identifiers, never storage credentials or expiring signed URLs.

## Safety and exact scope

- Collections/gifts in the snapshot replace current names, ordering, status, revision pointers, prices/artwork/animation/sound/framing through their imported immutable revisions. Production-only gifts/collections are archived, not deleted.
- Imported assets/nonlegacy revisions get deterministic migration-specific IDs and new create-only object paths. This keeps production assets/history untouched and gives the approved production owner access to edit the imported gift files. Original seed revision IDs remain compatible with legacy clients.
- Every file is downloaded and SHA-256/size verified. Separate production storage receives verified copies; shared storage receives migration-specific copies too. Audio dependencies are inserted first. Existing destination files are verified, never overwritten.
- Database replacement, catalog-version bump, audit entry and completion marker are atomic. File copying cannot share a database transaction: failed runs may leave only immutable migration-owned file copies; retries verify/reuse them. Do not delete them or original historical files as a rollback shortcut.
- No users, wallets, ledger records, messages, receipts or purchase-time prices are migrated or updated. All prior revision/asset/publication rows stay intact. The migration records previous collection/gift rows in `gift_catalog_data_migrations.previous_catalog` for deliberate recovery; it never automatically restores them.
- A completed rerun is a no-op, including after subsequent production admin edits. Changing the checked-in snapshot after application fails rather than silently overwriting production again. Prepare a new migration for later transfers.

## Verification

`node lib/db/tests/gift-catalog-migration.integration.mjs` exercises a disposable PostgreSQL schema and mocked storage. `node lib/db/migrations/20261007_development_gift_catalog.mjs --verify-source` verifies actual development source bytes without touching any database or writing files. Neither command is production execution or native playback verification.

Both checks passed October 7: all 26 actual source files passed SHA-256/size verification. The storage SDK emitted listener warnings but completed successfully. Automatic startup integration subsequently changed the API entry point and build packaging; it requires an API deployment, not a native app rebuild. Production execution, production storage permissions and actual production asset endpoints remain unverified.
