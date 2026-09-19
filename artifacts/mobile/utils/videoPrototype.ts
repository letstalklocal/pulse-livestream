// Explicit opt-in for release/TestFlight builds; development builds expose the lab.
export const VIDEO_PROTOTYPE_ENABLED = __DEV__ || process.env.EXPO_PUBLIC_VIDEO_PROTOTYPE === 'true';
export const VIDEO_PROTOTYPE_SAMPLE = 'https://raw.githubusercontent.com/vibeappspro/dummy-data/ab8818629d31995c4de5b10460609b5c8d7baa94/videos/sample-video-portrait-720p.mp4';
