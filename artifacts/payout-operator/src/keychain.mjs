import { spawn } from "node:child_process";
import { OperatorError } from "./runtime.mjs";
const SERVICE = "com.pulse.payout-operator";
const account = (name) => {
  if (!/^[-a-zA-Z0-9_]{1,60}$/.test(name))
    throw new OperatorError("invalid_profile_name");
  return `profile:${name}`;
};
function command(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin" },
    });
    let output = "";
    let exceeded = false;
    const timer = setTimeout(() => {
      exceeded = true;
      child.kill("SIGTERM");
    }, 20000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.length > 10000) {
        exceeded = true;
        child.kill("SIGTERM");
      }
    });
    child.stderr.resume();
    child.once("error", () => {
      clearTimeout(timer);
      reject(new OperatorError("keychain_unavailable"));
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 || exceeded)
        reject(new OperatorError("keychain_unavailable"));
      else resolve(output);
    });
  });
}
export function credentialInstructions(profile) {
  return {
    service: SERVICE,
    account: account(profile.name),
    storage: "macOS Keychain Access password item",
    tokenEntry:
      "Paste into the Password field in Keychain Access, never a command or file.",
  };
}
export async function readCredential(profile) {
  if (process.platform !== "darwin")
    throw new OperatorError("mac_keychain_required");
  const token = (
    await command("/usr/bin/security", [
      "find-generic-password",
      "-s",
      SERVICE,
      "-a",
      account(profile.name),
      "-w",
    ])
  ).trim();
  if (!/^pulse_op_[a-f0-9]{64}$/.test(token))
    throw new OperatorError("invalid_credential");
  return token;
}
export async function deleteCredential(_home, profile) {
  if (process.platform !== "darwin")
    throw new OperatorError("mac_keychain_required");
  await command("/usr/bin/security", [
    "delete-generic-password",
    "-s",
    SERVICE,
    "-a",
    account(profile.name),
  ]);
}
