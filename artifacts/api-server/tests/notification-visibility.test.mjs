import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
const { code } = transformSync(
  readFileSync(
    new URL("../../mobile/utils/inAppNotifications.ts", import.meta.url),
    "utf8",
  ),
  { loader: "ts", format: "cjs" },
);
const module = { exports: {} };
new Function("module", "exports", code)(module, module.exports);
const { canShowNotification, collectNotifications } = module.exports;
const preferences = {
  enabled: true,
  previews: true,
  messages: true,
  privateInvitations: true,
  gifts: true,
  followers: true,
  posts: true,
  live: true,
};
const event = (category) => ({
  id: category,
  category,
  title: "Notification",
  body: "Body",
  route: "/dm/123",
  createdAt: 100,
});
test("all DM-related banners are hidden throughout Messages and chats", () => {
  for (const category of ["messages", "privateInvitations", "gifts"]) {
    for (const route of [
      "/chat",
      "/chat/",
      "/(tabs)/chat",
      "/dm/123",
      "/dm/456",
      "/new-chat",
    ]) {
      assert.equal(
        canShowNotification(event(category), preferences, route),
        false,
        `${category} at ${route}`,
      );
    }
  }
});
test("DM banners still show elsewhere when enabled", () => {
  for (const category of ["messages", "privateInvitations", "gifts"]) {
    assert.equal(
      canShowNotification(event(category), preferences, "/profile"),
      true,
    );
    assert.equal(
      canShowNotification(
        event(category),
        { ...preferences, [category]: false },
        "/profile",
      ),
      false,
    );
  }
});
test("Messages does not silence unrelated notification categories", () => {
  for (const category of ["followers", "posts", "live"])
    assert.equal(
      canShowNotification(event(category), preferences, "/chat"),
      true,
    );
});
test("leaving Messages does not replay suppressed banners", () => {
  const seen = new Set();
  assert.equal(
    collectNotifications([event("messages")], seen, 0, preferences, "/chat")
      .length,
    0,
  );
  assert.equal(
    collectNotifications([event("messages")], seen, 0, preferences, "/profile")
      .length,
    0,
  );
  assert.equal(
    collectNotifications(
      [{ ...event("messages"), id: "next" }],
      seen,
      0,
      preferences,
      "/profile",
    ).length,
    1,
  );
});
