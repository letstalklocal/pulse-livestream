const { withPodfile } = require('expo/config-plugins');

// The archived 1.2.2 release is pinned to its exact source revision.
const POD = "pod 'BDAlphaPlayer', :git => 'https://github.com/bytedance/AlphaPlayer.git', :commit => '81718c140b4503733a96f9ebc6072ad81894cc01'";
function addAlphaPlayerPod(contents) {
  if (contents.includes(POD)) return contents;
  if (!/^\s*use_expo_modules!\s*$/m.test(contents)) throw new Error('AlphaPlayer: Expo Podfile target not found');
  return contents.replace(/^(\s*)use_expo_modules!\s*$/m, (_, indent) => `${indent}${POD}\n${indent}use_expo_modules!`);
}
module.exports = config => withPodfile(config, props => {
  props.modResults.contents = addAlphaPlayerPod(props.modResults.contents);
  return props;
});
module.exports.addAlphaPlayerPod = addAlphaPlayerPod;
