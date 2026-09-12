# Stream background crop

Recorded: 2026-09-12

The user requires the iPhone stream-background crop to match Android's 9:16 portrait crop. Expo ImagePicker ignores its aspect setting on iOS and offers only a square editor, so iOS now selects the original photo and opens an app crop screen with a fixed 9:16 viewport. Native scrolling/pinch zoom positions the image. Continue crops source pixels to an exact 9:16 JPEG, capped at 1080×1920, then uses the existing upload/save path. Cancel preserves the saved background; upload failure keeps the crop open for retry. Android keeps its existing native editor.

The crop uses the Expo SDK-matched `expo-image-manipulator` module. A new native/TestFlight build is needed. The broadcast screen-awake fix remains intact.

Validation: mobile TypeScript, five crop-geometry tests (center framing, exact portrait input, zoom/pan, boundaries across image shapes and sizes, invalid input), localization checks, and the production iOS JavaScript export passed. This Linux environment cannot verify native iPhone rendering or compile an Xcode archive.

Device checks still needed: square/landscape/portrait/HEIC photos; drag/pinch and confirm framing; Cancel at picker/crop; failed upload and retry; reopen/reload saved preview; verify Android's existing 9:16 editor. Also host a live past Auto-Lock and verify normal locking after ending the broadcast.

## Android native-module correction

The user reported `Native module ExpoImageManipulator` failing on Android after the crop change. The original shared component imported the module at startup even though Android never opened that crop UI. The implementation now lives in `StreamBackgroundCropper.ios.tsx`; the default Android/web component has no runtime imports and renders nothing. Both variants share a type-only props definition. Android continues using ImagePicker's existing 9:16 crop, and iOS retains the custom crop.

This fixes the Android JavaScript dependency path without requiring the installed Android binary to contain the unused image-manipulator module. The corrected JavaScript must still reach the device (reload a connected development build, or distribute the updated app). iOS still requires a native build containing the module.

Validation for this correction: mobile TypeScript and Android/iOS production JavaScript exports passed. Exported source maps select the platform-appropriate cropper; Android contains zero image-manipulator sources or `ExpoImageManipulator` runtime references, while iOS retains the module. No physical Android or iPhone device check was performed.
