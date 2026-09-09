import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { transformSync } from "esbuild";

const require = createRequire(import.meta.url);
const { code } = transformSync(readFileSync(new URL("../src/routes/users.ts", import.meta.url), "utf8"), { loader: "ts", format: "cjs" });
const usersTable = Object.fromEntries(["uid", "name", "bio", "avatarImagePath"].map(key => [key, `users.${key}`]));
const followsTable = { followerId: "follows.followerId", followedId: "follows.followedId" };
const people = [
  { uid: 1, name: "Alex", bio: "", avatarImagePath: null },
  { uid: 2, name: "Blair", bio: "Music", avatarImagePath: "/objects/blair" },
  { uid: 3, name: "Casey", bio: "Art", avatarImagePath: null },
];
const edges = [{ followerId: 1, followedId: 2 }, { followerId: 3, followedId: 1 }];

function fixture() {
  let queries = 0;
  const db = { select(fields) {
    queries++;
    let join, predicate;
    const chain = {
      from: () => chain,
      innerJoin: (_, condition) => { join = condition; return chain; },
      where: condition => { predicate = condition; return chain; },
      orderBy: async () => edges
        .filter(edge => edge[predicate.left.split(".")[1]] === predicate.right)
        .map(edge => {
          const person = people.find(person => person.uid === edge[join.right.split(".")[1]]);
          return { ...person, ...(fields.postIds ? { postIds: person.uid === 2 ? [12, 8] : [] } : {}) };
        }),
    };
    return chain;
  } };
  const module = { exports: {} };
  new Function("require", "module", "exports", code)((id) => {
    if (id === "@workspace/db") return { db, usersTable, followsTable, streamHistoryTable: {} };
    if (id === "drizzle-orm") return { eq: (left, right) => ({ left, right }), sql: () => ({}) };
    if (id === "../lib/objectStorage") return { createPrivateGetUrl: async path => `signed:${path}` };
    return require(id);
  }, module, module.exports);
  return {
    queries: () => queries,
    async get(direction, uid) {
      const handler = module.exports.default.stack.find(layer => layer.route?.path === `/users/:uid/${direction}`).route.stack[0].handle;
      const res = { statusCode: 200, body: null, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; } };
      await handler({ params: { uid } }, res);
      return res;
    },
  };
}

test("following returns outgoing connections with signed avatars", async () => {
  const result = await fixture().get("following", "1");
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body.users, [{ uid: 2, name: "Blair", bio: "Music", postIds: [12, 8], avatarImageUrl: "signed:/objects/blair" }]);
});
test("followers returns incoming connections, not outgoing ones", async () => {
  const result = await fixture().get("followers", "1");
  assert.deepEqual(result.body.users, [{ uid: 3, name: "Casey", bio: "Art", avatarImageUrl: null }]);
});
test("a user with no connections gets an empty list", async () => {
  assert.deepEqual((await fixture().get("following", "2")).body, { users: [] });
});
test("invalid profile IDs are rejected before querying", async () => {
  for (const uid of ["abc", "1junk", "0", "-1", "1.5"]) {
    const f = fixture();
    assert.equal((await f.get("followers", uid)).statusCode, 400);
    assert.equal(f.queries(), 0);
  }
});
