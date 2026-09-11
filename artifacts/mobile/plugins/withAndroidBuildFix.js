const fs = require("node:fs");
const path = require("node:path");

module.exports = function withAndroidBuildFix(config) {
  if (!config.mods) config.mods = {};
  if (!config.mods.android) config.mods.android = {};

  const prevMod = config.mods.android.appBuildGradle;

  config.mods.android.appBuildGradle = async (props) => {
    if (prevMod) props = await prevMod(props);

    let contents = props.modResults.contents;

    if (!contents.includes("META-INF/versions/9/OSGI-INF/MANIFEST.MF")) {
      const packagingBlock =
        "\n    packaging {\n" +
        "        resources {\n" +
        "            excludes += ['META-INF/versions/9/OSGI-INF/MANIFEST.MF']\n" +
        "            pickFirsts += ['**/*.so']\n" +
        "        }\n" +
        "        jniLibs {\n" +
        "            pickFirsts += ['**/*.so']\n" +
        "        }\n" +
        "    }";
      contents = contents.replace(/android\s*\{/, `android {${packagingBlock}`);
      props.modResults.contents = contents;
    }

    return props;
  };

  if (!config.mods.ios) config.mods.ios = {};
  const prevIosDangerousMod = config.mods.ios.dangerous;

  config.mods.ios.dangerous = async (props) => {
    if (prevIosDangerousMod) props = await prevIosDangerousMod(props);

    const iosRoot = props.modRequest.platformProjectRoot;
    const podfilePropertiesPath = path.join(iosRoot, "Podfile.properties.json");
    const podfilePath = path.join(iosRoot, "Podfile");

    const podfileProperties = JSON.parse(
      fs.readFileSync(podfilePropertiesPath, "utf8"),
    );
    podfileProperties["ios.deploymentTarget"] = "17.0";
    fs.writeFileSync(
      podfilePropertiesPath,
      `${JSON.stringify(podfileProperties, null, 2)}\n`,
    );

    let podfile = fs.readFileSync(podfilePath, "utf8");
    if (!podfile.includes("use_modular_headers!")) {
      const platformDeclaration = /^platform :ios,.*$/m;
      if (platformDeclaration.test(podfile)) {
        podfile = podfile.replace(
          platformDeclaration,
          (line) => `${line}\nuse_modular_headers!`,
        );
      } else {
        podfile = `use_modular_headers!\n${podfile}`;
      }
      fs.writeFileSync(podfilePath, podfile);
    }

    return props;
  };

  const prevIosXcodeprojMod = config.mods.ios.xcodeproj;

  config.mods.ios.xcodeproj = async (props) => {
    if (prevIosXcodeprojMod) props = await prevIosXcodeprojMod(props);

    const configurations =
      props.modResults.pbxXCBuildConfigurationSection();
    for (const configuration of Object.values(configurations)) {
      if (configuration && typeof configuration === "object" && configuration.buildSettings) {
        configuration.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = "17.0";
      }
    }

    return props;
  };

  return config;
};
