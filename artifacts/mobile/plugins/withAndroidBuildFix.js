const { withAppBuildGradle } = require("@expo/config-plugins");

module.exports = function withAndroidBuildFix(config) {
  return withAppBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;

    if (!contents.includes("META-INF/versions/9/OSGI-INF/MANIFEST.MF")) {
      const packagingBlock = `
    packaging {
        resources {
            excludes += ['META-INF/versions/9/OSGI-INF/MANIFEST.MF']
            pickFirsts += ['**/*.so']
        }
    }
`;
      contents = contents.replace(
        /android\s*\{/,
        `android {${packagingBlock}`
      );
      cfg.modResults.contents = contents;
    }

    return cfg;
  });
};
