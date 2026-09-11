# Interface catalogs

`manifest.json` defines the format/version and the ten app languages. Each `locales/<language>.json` maps a stable source key to its displayed wording. English is editable too. To change wording, edit the value; do not rename the key. Keys are used only for display, never as payment IDs, route names or business state.

`terminology.json` records protected English terms, including LIVE/Live/live in all phrases, Premium, its uppercase PREMIUM label, and Gamer. The stable Gaming/GAMING keys display Gamer; category identifiers remain unchanged. Gift names always come from the original gift catalog and bypass interface lookup. Preserve placeholders such as `{v0}` exactly, including repeated placeholders. User-generated data is inserted literally, without translation or markup processing.

`validateCatalog` checks types, missing/unknown keys, placeholders and protected terms. A future separate admin app can edit these same JSON resources, run these checks and publish a catalog version. A remote publishing/refresh endpoint is not implemented here; current catalogs are bundled, work offline and require no runtime translation API.

To collect new app-owned keys locally, run `node scripts/collect-interface-strings.cjs` from the mobile workspace. This preserves existing English values. Review `source-strings.json` before sending any copy to an external service. Do not send source code, credentials, messages, profiles or other user data for interface translation.

Run `node artifacts/api-server/tests/localization.test.mjs` from the repository root for the language-store and preservation checks. The checks require complete coverage in every declared language and exercise language switching against the real bundled catalogs.

Arabic uses text direction and start alignment for translated labels while retaining existing explicit alignments, physical media placement, camera mirroring and gesture directions. The app is not remounted or globally flipped on language selection. Chat translation preferences are stored separately.

Current work state (2026-09-11): all ten catalogs contain 738 keys. The user approved translating the static interface catalog with the existing Google Cloud Translation service. Nine non-English catalogs are generated and validated, with context corrections for short interface controls. Native-speaker review and device/visual checks remain pending before release.

`python3 scripts/translate-interface-catalog.py` generates missing non-English keys using `GOOGLE_TRANSLATE_API_KEY`, preserving protected terms and placeholders. It retains existing translations, including manual corrections. Run it only after approval for the specific reviewed static catalog and destination; collecting new keys does not itself authorize sending them externally. English values can be edited independently; this generation script translates the approved source strings, so changed English wording needs a reviewed translation update rather than renaming keys.

Context-specific wording: `All categories` is the compact category-filter label, displayed as All in English. Translate it with reference to categories, not people or streams: Spanish/Portuguese Todas, French Toutes, German Alle. Keep this contextual key separate from any future generic All label. Category selection still uses the existing All identifier. The current catalog contains 739 keys per language.

For an approved terminology correction, the generator supports repeatable `--refresh-term` arguments, such as `--refresh-term Live --refresh-term live`. It regenerates matching phrases while retaining unrelated existing translations. Review short action labels for context after generation.
