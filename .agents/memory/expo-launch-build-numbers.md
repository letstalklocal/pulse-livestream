---
name: Expo Launch build numbers
description: Resolve duplicate iOS build-number submissions from Expo Launch.
---

When App Store Connect rejects an Expo Launch upload because the bundle version is duplicated, use the `previousBundleVersion` in the submission error as the authority and set the next iOS build number above it. Do not infer the next valid number from the local config or Launch's displayed build number when these disagree. Keep the marketing version and Android version code independent.

**Why:** A Launch submission reported build 27 while App Store Connect reported its previous accepted bundle version as 29; the app's static iOS build number was lower still. Replit's managed counter and Apple's accepted-upload history can diverge.

**How to apply:** Read the `previousBundleVersion` in Expo Launch failure logs, set `expo.ios.buildNumber` to at least that value plus one, then have the user retry through Replit's Publish flow. Do not treat `easConfigurationBackup` stored inside Expo `extra` as active build configuration.