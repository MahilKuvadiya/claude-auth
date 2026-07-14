import { test } from "node:test";
import assert from "node:assert/strict";
import { bar, severity } from "../src/views/blocks.js";
import { buildAppHome } from "../src/views/appHome.js";
import { usageBlocks } from "../src/listeners/commands.js";

test("severity thresholds", () => {
  assert.equal(severity(10), "ok");
  assert.equal(severity(60), "warn");
  assert.equal(severity(90), "crit");
  assert.equal(severity(null), "idle");
});

test("bar clamps and fills to width", () => {
  assert.equal(bar(0, 10), "░".repeat(10));
  assert.equal(bar(100, 10), "█".repeat(10));
  assert.equal(bar(150, 10), "█".repeat(10)); // clamps >100
  assert.equal(bar(null, 10), "░".repeat(10));
  assert.equal(bar(50, 10).length, 10);
});

test("app home: unmapped user gets an invite hint, no pools", () => {
  const v = buildAppHome({ identity: { email: "x@y.com", role: "none" }, pools: [] });
  assert.equal(v.type, "home");
  assert.match(JSON.stringify(v.blocks), /not in a claudex pool/i);
});

test("app home: missing email is handled", () => {
  const v = buildAppHome({ identity: { email: null, role: "none" } });
  assert.match(JSON.stringify(v.blocks), /couldn't read your email/i);
});

test("app home: admin sees revoke + invite + create", () => {
  const v = buildAppHome({
    identity: { email: "a@y.com", role: "admin" },
    pools: [{
      id: "pl_1", name: "Platform", mode: "failover",
      members: [{ memberId: "m1", email: "a@y.com", tier: "Max 5x", status: "active", rateLimit: { fiveHourPct: 12, weeklyPct: 30 } }],
    }],
  });
  const txt = JSON.stringify(v.blocks);
  assert.match(txt, /revoke_member/);
  assert.match(txt, /invite_open/);
  assert.match(txt, /create_pool_open/);
  assert.match(txt, /Platform/);
});

test("app home: member does NOT see admin controls", () => {
  const v = buildAppHome({
    identity: { email: "m@y.com", role: "member" },
    pools: [{
      id: "pl_1", name: "Platform", mode: "failover",
      members: [{ memberId: "m1", email: "m@y.com", tier: "Team", status: "active", rateLimit: { fiveHourPct: 5, weeklyPct: 9 } }],
    }],
  });
  const txt = JSON.stringify(v.blocks);
  assert.doesNotMatch(txt, /revoke_member|invite_open|create_pool_open/);
  assert.match(txt, /Refresh/); // everyone still gets refresh
});

test("app home: error state renders the message", () => {
  const v = buildAppHome({ identity: { email: "a@y.com", role: "member" }, error: "backend down" });
  assert.match(JSON.stringify(v.blocks), /backend down/);
});

test("usageBlocks summarizes members with severity dots", () => {
  const blocks = usageBlocks([{
    id: "pl_1", name: "Platform",
    members: [{ email: "a@y.com", rateLimit: { fiveHourPct: 90, weeklyPct: 20 } }],
  }]);
  const txt = JSON.stringify(blocks);
  assert.match(txt, /Platform/);
  assert.match(txt, /a@y.com/);
  assert.match(txt, /🔴/); // 90% → crit
});

test("usageBlocks handles no pools", () => {
  assert.match(JSON.stringify(usageBlocks([])), /no pools/i);
});
