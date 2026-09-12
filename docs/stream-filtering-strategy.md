# Stream filtering and audience permissions — supplied proposal

Received: September 11, 2026.

Status: source proposal saved for review; not an approved implementation specification or a verified statement of current platform policy. The supplied text is preserved below. No app behavior changes are authorized by saving this document.

Planning context: review this proposal before deciding the unverified feed experience. The choice between a limited preview with a cutoff and continued public-feed browsing with restricted participation remains open. The proposal's Level 1 requires verified viewers, so how unverified users can try the app must be reconciled explicitly. State names, content classifications, AI decisions, recovery timing, private access, and enforcement need review before adoption; they do not silently replace previously approved behavior.

Related records: [Go-live checklist](go-live-checklist.md), [Onboarding requirements](onboarding.md), [Policy compliance checklist](policy-compliance-checklist.md).

## Later discussion — live trial requirement

The user confirmed that **live is essential** to the unverified first-use experience. Reviewed clips cannot replace that experience. The proposal below is preserved as supplied, but its Level 1 verified-only audience must be adapted to permit qualifying public livestreams in the unverified trial after the 18+ birthday gate and terms acceptance.

This is not approval of the proposed Mature/Private/Restricted ladder. Live eligibility, continuous moderation, delivery/enforcement latency, removal of existing ineligible viewers, and moderation-outage behavior require a defined and tested design before launch. Whether browsing has a cutoff and the precise verification restrictions on participation, media, and Premium remain open.

## Later decision — website verification and mature preference

The user approved **Verify now → Pulse website → external ID/18+ verification → separate optional Show mature content preference → return to the app**. Both `isVerified` and `matureContentEnabled` default to false. Only backend-confirmed verification sets verified status; opting in is a separate website action and never automatic. Payment, following, room permissions, and content eligibility remain separate checks. See [onboarding requirements](onboarding.md#approved-website-verification-and-mature-content-opt-in).

The website opt-in is the intended iOS design, not a claim of store approval. Whether the service and content qualify for Apple's incidental mature UGC allowance remains a submission-review item. The source proposal below remains unchanged.

## Supplied text

My friend, based on your answers, I would not build this around bans at all. I’d build it around a dynamic audience-permission system.
The important policy reality first: verified age, payment, following the creator, and opting in do not make explicit sexual content acceptable inside a native iOS/Android app. Apple allows incidental mature NSFW UGC under restrictions, but apps primarily used for pornographic content can be removed. Google is even more explicit that pornography/sexually gratifying content is prohibited and warns against paid features that encourage objectionable sexual UGC.
So I think the innovation should be:
The stream changes audience — not status
Every live stream has a real-time Safety Level.
Level 1 — Public Live
Bikinis, dancing, normal revealing clothing, normal conversation, etc.
Appears in For You
Searchable
Followers notified
Any verified 18+ account can watch
Gifts/tips available
Level 2 — Mature Live
Suggestive dancing, lingerie, prolonged sexualized framing, etc., but no nudity or sexual acts.
Instead of suspending the streamer, AI instantly changes distribution:
Public → Verified Adult Restricted
The streamer sees:
“Your stream has been moved to Mature Audience mode. Adjust your camera/content to return to Public.”
No punishment.
Existing verified viewers stay.
New viewers must:
be verified 18+
have Mature Content enabled
pass an interstitial
preferably already follow the creator
And critically:
The stream disappears from For You, trending and general discovery.
That aligns particularly well with Google's requirement that incidental sexual content not be actively promoted/recommended and be hidden by default.
Level 3 — Private Circle
This is where I think you can differentiate from Tango/TikTok/etc.
Don't call it Premium.
Call it something like:
Circle Live
Followers Live
Verified Room
Private Live
The creator can intentionally start here.
To enter:
18+ verified → follows creator → Mature enabled → creator allows private viewers
Optionally require subscription/membership, but payment should never be what proves adulthood.
And I would avoid marketing it as:
“Pay to see hotter content.”
That gets dangerously close to exactly what Google's policy warns about.
Instead, membership gives access to private creator communities, of which live streaming is one feature.
Level 4 — Explicit / Store-Prohibited
This is where I would draw a hard technical boundary.
If AI detects:
exposed genitals
sexual acts
masturbation
explicit sexual activity
the native video feed stops being deliverable, but I would not necessarily terminate the creator's whole session.
That's a major UX distinction.
The backend Live Session could remain alive:
video restricted → chat remains → viewers remain in room → creator can correct → AI reassesses
For example:
🔴 Video temporarily hidden
Explicit content detected.
Adjust your camera to restore video.
After perhaps 15–30 seconds of compliant frames:
Level 4 → Level 3 → video automatically resumes.
That's dramatically less frustrating than:
“Account suspended for 24 hours.”
Only deliberate/repeated violations become account penalties.
The part I especially like
Your AI shouldn't answer:
BAN / DON'T BAN
It should answer:
WHO IS CURRENTLY ALLOWED TO SEE THIS?
That becomes your moderation engine.
Something like:
PUBLIC
↓
18+ MATURE
↓
FOLLOWERS + 18+ MATURE
↓
VIDEO RESTRICTED
↓
TERMINATE
And AI can move both directions.
A streamer who gets too suggestive moves down.
If she changes the camera/clothing/behavior, she automatically moves back up after a clean period.
That removes a huge amount of the resentment creators have toward moderation.
I would also change discovery
I wouldn't make the entire platform OnlyFans-style private.
That kills creator growth.
Instead:
Public-safe lives: TikTok-style discovery.
Mature lives: never algorithmically recommended.
Private Circle lives: followers/direct profile only.
Explicit: never displayed in native apps.
This gives you discovery + privacy, rather than choosing one or the other.
And Apple specifically requires UGC apps to have filtering, reporting, blocking, moderation, and age restriction mechanisms for creator content exceeding the general age rating.
I think we're getting to something fairly distinctive:
Don't moderate creators. Moderate distribution.
The next thing I would design is the actual AI state machine, including exactly what causes Public → Mature → Private → Restricted, how long each state lasts, warnings, appeals, and how a creator earns a higher Trust Score so reliable creators experience fewer interruptions. That trust component could make this substantially better than what existing live apps do.
