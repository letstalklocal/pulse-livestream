# Pulse public website

Built September 12, 2026. The existing API serves the public website without requiring Clerk sign-in. The development host routes the mobile app at `/` and the API at `/api`, so the public website is mounted at `/api/site/`. A direct API deployment also serves the same site at `/`.

- Home: `/api/site/`
- Verification instructions: `/api/site/verify`
- Privacy notice: `/api/site/privacy`
- Support: `/api/site/support`
- Terms: `/api/site/terms`
- Personal verification handoff/callback remains `/api/verification/` so its existing cookie path and CSRF checks remain intact.

The public verification page explains how to start from Account → Age verification. It does not create an anonymous provider session or accept uploaded identity documents. A user who opens the personal verification endpoint without a valid session receives instructions to start in the app.

The site uses responsive HTML/CSS with an original inline SVG pulse illustration, keyboard focus styles, a skip link, semantic navigation and no external assets or JavaScript. Public pages do not set cookies. A nonce-based CSP prevents arbitrary scripts/styles; framing is disabled. Pages are marked noindex during preparation.

## Content pending from the owner

- `PULSE_LEGAL_NAME`: the business operating Pulse.
- `PULSE_SUPPORT_EMAIL`: public contact email (not inferred from the Didit account owner).
- Full app data inventory, legal grounds, retention/deletion settings, transfer arrangements and final terms. The privacy and terms pages explicitly remain drafts until these are finalized; adding name/email alone does not make them final.

Privacy information checklist reference: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/

Do not activate real-user Didit verification using the draft privacy notice. The privacy page can become the configured `PULSE_PRIVACY_URL` after completion. `VERIFICATION_PUBLIC_ORIGIN` must remain the HTTPS origin without `/api/site` or another path.

## Validation

API typecheck and build passed. Existing verification integration tests passed with mocked Didit responses. Restarted the development API preserving its environment. Verified all five public website pages through the actual public HTTPS proxy: 200 HTML, Pulse content, working prefixed navigation, CSP, and no Set-Cookie. Confirmed the existing verification endpoint remains reachable. Browser rendering and physical-device deep links have not been visually tested.

Development website:
https://254cd483-13a8-46a7-aec3-b50e106f5db3-00-29qgy6snub3n8.kirk.replit.dev/api/site/

This is a development-host website; an always-on production deployment/custom domain remains a release step.
