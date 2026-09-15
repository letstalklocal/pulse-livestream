// The existing production profile also creates Pulse's TestFlight builds.
// This explicit opt-in marks testing intent; it cannot detect or prevent a
// TestFlight binary later being selected for public App Store release.
module.exports = ({ config }) => {
  const testFlightBuild = process.env.PULSE_TESTFLIGHT_BUILD === 'true'
    && (!process.env.EAS_BUILD_PLATFORM || process.env.EAS_BUILD_PLATFORM === 'ios');
  if (process.env.EAS_BUILD_PROFILE === 'production'
    && process.env.EXPO_PUBLIC_REVENUECAT_MODE === 'test'
    && !testFlightBuild) {
    throw new Error('Production builds cannot use RevenueCat Test Store without an explicit iOS TestFlight opt-in. Use platform-specific public SDK keys for public release.');
  }
  return config;
};
