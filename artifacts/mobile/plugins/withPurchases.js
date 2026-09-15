const { withAndroidManifest } = require('expo/config-plugins');
module.exports = function withPurchases(config) {
  return withAndroidManifest(config, props => {
    const activities = props.modResults.manifest.application?.[0]?.activity ?? [];
    const main = activities.find(activity => activity.$?.['android:name'] === '.MainActivity');
    if (main) main.$['android:launchMode'] = 'singleTop';
    return props;
  });
};
