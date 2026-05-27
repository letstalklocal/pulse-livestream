module.exports = function withAndroidBuildFix(config) {
  if (!config.mods) config.mods = {};
  if (!config.mods.android) config.mods.android = {};

  const prevMod = config.mods.android.appBuildGradle;

  config.mods.android.appBuildGradle = async (props) => {
    if (prevMod) props = await prevMod(props);

    let contents = props.modResults.contents;
    if (!contents.includes("META-INF/versions/9/OSGI-INF/MANIFEST.MF")) {
      const packagingBlock =
        "\n    packaging {\n        resources {\n            excludes += ['META-INF/versions/9/OSGI-INF/MANIFEST.MF']\n            pickFirsts += ['**/*.so']\n        }\n    }";
      contents = contents.replace(/android\s*\{/, `android {${packagingBlock}`);
      props.modResults.contents = contents;
    }

    return props;
  };

  return config;
};
