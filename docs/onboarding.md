# Signup onboarding

## User decisions — September 11, 2026

Show a signup method screen before the email account-creation form. Offer Sign up with Google, Sign up with Phone and Sign up with Email. Google and Phone display Coming soon and are disabled; no OAuth or phone/SMS flow is enabled. Email opens the existing registration form.

Use the existing app language selection for every label, including Coming soon. First-time users follow the detected phone language with English fallback; a saved manual app-language selection takes precedence. The signup option and password-confirmation strings are bundled in all ten catalogs, so signup wording works offline. Preserve Pulse as English and retain Arabic text direction without globally mirroring navigation or layouts.

The user approved adding Confirm password. Email signup now requires email, password and a matching confirmation before requesting account creation. Compare passwords exactly, including case and whitespace. Show localized mismatch feedback when a nonempty confirmation differs, and clear it once they match. The confirmation is hidden by default with its own show/hide control; it is local form state and is not included in the Clerk request. Preserve the existing email verification step.

## Routes and behavior

- `/(auth)/sign-up`: new method screen, reached through the existing signup links from sign-in, profile and go-live.
- `/(auth)/sign-up-email`: existing email/password and verification form, moved without changing Clerk account-creation, email-code or session-finalization behavior.
- Email pushes the form onto the native navigation stack, so Back returns to the method screen.
- The method screen retains the sign-in link and signed-in redirect. A direct entry with no back history returns to sign-in.

## Verification

Mobile TypeScript passes. The signup flow test exercises detected Spanish on first use, Arabic text direction, disabled Google, email route navigation, sign-in link, back fallback, missing/mismatched confirmations, blocked submission attempts, exact matching, password edits, independent visibility controls, language changes preserving confirmation, rejected password requests, email-code verification and successful finalization with React/native/Clerk mocks. It creates no real account and sends no email. Localization checks pass for all 747 strings in all ten catalogs and continue checking the moved email form against the original behavioral attributes, excluding the explicitly approved new confirmation control, which the signup flow tests exercise.

Actual phone layout, native keyboard/back navigation and real Clerk email delivery still need a device check. No backend behavior or endpoints changed.
