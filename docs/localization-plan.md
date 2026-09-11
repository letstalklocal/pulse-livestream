# App localization plan

## Required scope and terminology — user decision, September 11, 2026

This is a language-only update. Preserve existing functionality, payment and gift identifiers, navigation, camera/media behavior, chat preferences, gestures, and approved layouts. Add interface localization without redesigning screens or changing how features work.

The following must remain in English in every app language:
- All gift names, including names coming from the gift catalog or future admin-managed gifts.
- `LIVE`, `Live`, and `live` (all capitalization variants, including inside phrases)
- `VS`
- `Party`
- `Pulse`
- `Premium` (including the uppercase `PREMIUM` label)
- `Gamer` (the displayed name replacing Gaming)

Translate `Moments`, `My Vault`, and other interface text. Preserve the protected English terms when they occur within translated sentences. Do not translate user names, messages, biographies, captions, custom stream titles, or other user-created content through interface localization. The existing opt-in message translation feature remains separate and keeps its own preferences and consent rules.

## Initial app languages

English, Spanish, Brazilian Portuguese, Arabic, German, French, Simplified Chinese, Hindi, Indonesian, and Japanese. Follow the phone language when supported, with English fallback and an independent App language setting. The earlier Preferred language control belongs to chat translation and must not be repurposed.

## Implementation approach

Use bundled translation dictionaries and explicit display-time lookups. Keep English source text as fallback. Preserve route names, enum values, gift names/IDs, transaction amounts, API payloads, and branching comparisons. Language changes must update rendered labels without remounting the app, losing drafts, ending calls, or interrupting a live stream.

Translation catalogs may be prepared using the project's existing Google translation service, using only app-owned interface copy, with protected placeholders/terms retained. Bundle the resulting files; interface rendering must work offline and must not call a translation service. Review terminology, placeholders and English baseline automatically; non-English copy needs native-speaker review before release.

Arabic requires correct text direction while keeping the approved media layout, fixed party window, camera mirroring and gesture directions. Do not globally flip these layouts or restart an active session as a language-setting side effect. Any additional layout work must preserve these requirements.

## Verification

Check all ten catalogs for coverage and placeholder integrity; verify protected English terms, unknown-language fallback, persistence, failed saves, and app/chat preference independence. Run mobile type checks and relevant existing regression tests. Distinguish automated checks from actual phone checks. Device checks must cover keyboard focus/drafts, chat indicators, party interactions, active broadcast continuity, Arabic text, long labels and language changes. Preserve the English wording and behavior recorded in `docs/chat-message-preferences.md`; translated equivalents apply only to other app languages.

## Work state

Initial explicit interface-string migration and language-store scaffolding began before the latest terminology clarification. The rules above were recorded before continuing implementation; reconcile the in-progress changes and generated catalogs against these rules. No backend behavior changes are planned.

## Future admin editing

User requested that language text and terminology be easy to change in the separate admin web app later. Keep catalogs centralized and editable as JSON, including English values, with a versioned manifest and validation. Treat catalog source keys as stable message identifiers: edit their translated/display values rather than changing keys or screen logic. Keep protected terminology in one policy file. The future admin can edit each locale, validate placeholders/terminology and publish a catalog version; bundled catalogs remain the fallback. Do not add admin screens, admin roles, runtime network translation, or a new backend endpoint in this task.

## Translation completion checkpoint — 2026-09-11

The user explicitly approved sending `artifacts/mobile/i18n/source-strings.json` to the project's existing Google Cloud Translation service. That approval resolved the earlier automatic-review block. The approved static interface catalog was translated; no user messages, account data, credentials or source code were included in the translation payload.

All ten bundled catalogs now contain the same 738 interface keys: English plus Spanish, Brazilian Portuguese, Arabic, German, French, Simplified Chinese, Hindi, Indonesian and Japanese. The nine non-English catalogs were machine-generated, with context corrections for short controls such as Type, Close, Report, Following and account actions. All placeholders, protected English terms and boundary whitespace are retained. Gift names continue to bypass interface translation. Moments and My Vault use localized values (French Moments naturally has the same spelling).

The independent persisted App language setting follows the phone by default and supports manual selection. The existing chat translation setting remains separate. Explicit display-time lookups, language-bound functions, number/date formatting and Arabic text direction update wording without globally mirroring layouts or remounting the app. Catalogs are bundled for offline use, and their stable keys, editable English values, terminology policy and manifest support the future separate admin app. No admin screens or runtime translation endpoints were added.

Verification: mobile TypeScript and whitespace checks pass. Localization tests use the real bundled catalogs and require all 738 keys in all ten languages, exact placeholders and protected terms. Tests pass for locale resolution, literal interpolation, English fallback, app/chat preference isolation, failed/ordered saves, changing language-bound function references, Arabic direction/relative time, and unchanged payment/media/input/navigation identifiers. Previously run party-window/audio, Moment recorder/proof/player, heartbeat, beauty, account balance, notifications, premium-switch, gift-presentation and translation-queue regressions also passed (native behavior mocked where applicable). No API or database behavior was changed.

Remaining release checks: native-speaker review of the machine-generated wording and actual phone checks for long labels, Arabic text, keyboard focus/drafts, chat indicators, party interactions and active broadcast continuity. Automated catalog/type checks do not establish visual or device behavior.

Terminology update: the user added Premium to the protected English names. All nine non-English catalogs now retain Premium/PREMIUM in labels and sentences, and the shared validator enforces this rule for future edits.

Category wording update: display Gamer in every language for both Gaming and GAMING catalog keys. Keep the existing Gaming category value, filter comparisons, colors, and stored stream data unchanged; only the catalog display values change. Gamer is a protected English term.

Category grammar update: the user requested that All agree with categories in each language. The filter now uses the contextual All categories key with a short display label: English All, Spanish/Portuguese Todas, French Toutes, German Alle, and appropriate equivalents in the other languages. Preserve the existing All filter identifier and approved layout. Use context-specific keys when grammatical gender or meaning differs; do not reuse a generic translation across unrelated nouns. All ten catalogs now contain 739 keys.

Live terminology correction: the initial policy protected only uppercase LIVE. The user confirmed that Live must remain English too. Protect LIVE, Live and live throughout interface labels and sentences; translate only the surrounding wording. Regenerate affected phrases with the approved interface-translation service while retaining unrelated catalog edits, including Premium, Gamer and category-specific Todas/Toutes.

Signup onboarding: the new signup method screen uses the existing detected/saved app language, with Sign up with Google, Sign up with Email, and Coming soon translated in all ten catalogs. There are now 742 interface keys. See `docs/onboarding.md` for routing, verification and the approved confirm-password behavior.

Password confirmation: the user approved adding Confirm password to email signup. Its label, mismatch feedback and show/hide controls are translated in all ten languages. The complete catalog now contains 746 keys per language. Confirmation is checked locally and does not alter the Clerk request payload or email verification flow.

Phone signup placeholder: the user requested a disabled Sign up with Phone option matching Google’s Coming soon presentation. The phone label is translated in all ten catalogs, bringing coverage to 747 keys; no phone authentication or SMS integration is enabled.
