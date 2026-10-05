import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
const root = new URL("..", import.meta.url).pathname;
const output = `${root}/tests/.emails-${randomUUID()}.cjs`;
let calls = [];
globalThis.__emailFixture = async (params) => {
  calls.push(params);
  return {
    data: [
      {
        id: "user_a",
        primaryEmailAddressId: "primary",
        emailAddresses: [
          { id: "secondary", emailAddress: "wrong@example.test" },
          { id: "primary", emailAddress: "primary@example.test" },
        ],
      },
      { id: "user_b", primaryEmailAddressId: null, emailAddresses: [] },
      {
        id: "not_requested",
        primaryEmailAddressId: "secret",
        emailAddresses: [
          { id: "secret", emailAddress: "private@example.test" },
        ],
      },
    ],
  };
};
try {
  await build({
    entryPoints: [`${root}/src/lib/adminUserEmails.ts`],
    outfile: output,
    bundle: true,
    platform: "node",
    format: "cjs",
    plugins: [
      {
        name: "clerk-fixture",
        setup(b) {
          b.onResolve({ filter: /^@clerk\/express$/ }, () => ({
            path: "clerk",
            namespace: "emails",
          }));
          b.onLoad({ filter: /.*/, namespace: "emails" }, () => ({
            contents:
              "export const clerkClient={users:{getUserList:p=>globalThis.__emailFixture(p)}}",
            loader: "js",
          }));
        },
      },
    ],
  });
  const { readAdminUserEmails } = createRequire(import.meta.url)(output);
  const result = await readAdminUserEmails([
    "user_a",
    "user_b",
    "user_a",
    null,
  ]);
  assert.deepEqual(calls, [{ userId: ["user_a", "user_b"], limit: 2 }]);
  assert.deepEqual(result.get("user_a"), {
    email: "primary@example.test",
    emailUnavailable: false,
  });
  assert.deepEqual(result.get("user_b"), {
    email: null,
    emailUnavailable: false,
  });
  assert.equal(result.has("not_requested"), false);
  await readAdminUserEmails([null]);
  assert.equal(calls.length, 1);
  globalThis.__emailFixture = async () => {
    throw Error("private provider error");
  };
  assert.deepEqual((await readAdminUserEmails(["user_a"])).get("user_a"), {
    email: null,
    emailUnavailable: true,
  });
  console.log(
    "PASS: one bounded primary-email lookup, duplicate/null IDs, unrequested identity exclusion and provider failure distinction.",
  );
} finally {
  delete globalThis.__emailFixture;
  unlinkSync(output);
}
