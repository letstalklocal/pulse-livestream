// Fail closed if a store submission accidentally selects RevenueCat Test Store.
module.exports = ({ config }) => {
  if (process.env.EAS_BUILD_PROFILE === 'production' && process.env.EXPO_PUBLIC_REVENUECAT_MODE === 'test') {
    throw new Error('Production builds cannot use RevenueCat Test Store. Use platform-specific public SDK keys.');
  }
  return config;
};
