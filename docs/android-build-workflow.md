# Android testing build workflow

User-confirmed requirement: 2026-09-15.

Use the already-installed EAS CLI and the existing development profile:

```bash
cd /home/runner/workspace/artifacts/mobile
eas build --platform android --profile development
```

This produces the development client used with the running Replit Metro server. Verify that the installed client loads the current Android bundle; see [bundle verification](../.agents/memory/android-dev-client-bundle-verification.md).

## Preserve the working environment

- Read this workflow before giving Android build commands.
- Do not substitute `npx eas-cli@latest`, install/reinstall EAS, or update the CLI as part of a routine build request. Use the installed `eas` executable.
- Do not switch to `preview` or change EAS profiles, environment variables, dependency versions, or package-manager configuration just to provide the build command.
- A request for a build or build command does not authorize a tooling upgrade or environment change. If the installed CLI cannot perform the build, inspect the actual error and explain the necessary change before requesting explicit authorization for that change.
- Do not advise accepting optional CLI update prompts. If an update is required, handle it separately under the preceding rule.

## Reason for this requirement

The assistant incorrectly suggested a standalone preview build and then substituted `npx eas-cli@latest` for the installed CLI. The user accepted its install/update prompt and received npm dependency-deprecation warnings. The user explicitly warned that unnecessary tooling changes could disrupt the working environment and required this note. The temporary preview-profile edits were reverted. The warnings alone did not establish that the environment was broken; no such damage has been verified.
