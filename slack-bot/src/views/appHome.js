// The App Home dashboard view. A pure function of (identity, pools) → Block Kit,
// so it's fully unit-testable. Role-gating: admins see action buttons; everyone
// else sees the same read-only usage. See research/slack-bot/PLAN.md §4.

import * as b from "./blocks.js";
import { isAdmin } from "../lib/identity.js";

function memberLine(m) {
  const sess = m?.rateLimit?.fiveHourPct;
  const week = m?.rateLimit?.weeklyPct;
  const tier = m.tier || m.subscriptionType || "—";
  const dot = b.SEV[b.severity(sess)];
  const status =
    m.status === "resting" ? " · _resting_" :
    m.status === "revoked" ? " · _revoked_" : "";
  return `${dot} *${m.email}* · ${tier} · 5h ${b.fmtPct(sess)} · wk ${b.fmtPct(week)}${status}`;
}

function poolAvg(members) {
  const vals = members.map((m) => m?.rateLimit?.fiveHourPct).filter((v) => v != null);
  if (!vals.length) return null;
  return vals.reduce((a, c) => a + c, 0) / vals.length;
}

export function buildAppHome({ identity, pools = [], dashboardUrl, error } = {}) {
  const admin = isAdmin(identity);
  const blocks = [b.header("claudex")];

  if (identity?.email) {
    blocks.push(b.context(`Signed in as *${identity.email}* · role: *${identity.role}*`));
  }

  if (error) {
    blocks.push(b.section(`:warning: Couldn't load your pools: ${error}`));
    return { type: "home", blocks };
  }
  if (!identity?.email) {
    blocks.push(b.section(
      "I couldn't read your email from Slack, so I can't match you to a claudex account. " +
      "Ask an admin to check the bot's `users:read.email` scope.",
    ));
    return { type: "home", blocks };
  }
  if (identity.role === "none" || pools.length === 0) {
    blocks.push(b.section(
      ":wave: You're not in a claudex pool yet. Ask your workspace admin to invite you.",
    ));
    return { type: "home", blocks };
  }

  for (const pool of pools) {
    const members = pool.members || [];
    const withRoom = members.filter((m) => (m?.rateLimit?.fiveHourPct ?? 0) < 50).length;
    blocks.push(b.divider());
    blocks.push(b.section(
      `*${pool.name}*  \`${pool.id}\` · ${pool.mode}\n` +
      `${b.bar(poolAvg(members))}  ${withRoom}/${members.length} seats <50%`,
    ));
    for (const m of members) {
      const accessory = admin
        ? b.button("Revoke", "revoke_member", {
            value: `${pool.id}:${m.id}`,
            style: "danger",
            confirm: {
              title: { type: "plain_text", text: "Revoke member?" },
              text: { type: "mrkdwn", text: `Remove *${m.email}* from *${pool.name}*? Their token is dropped immediately.` },
              confirm: { type: "plain_text", text: "Revoke" },
              deny: { type: "plain_text", text: "Cancel" },
            },
          })
        : undefined;
      blocks.push(b.section(memberLine(m), accessory));
    }
    if (admin) {
      blocks.push(b.actions([
        b.button("➕ Invite", "invite_open", { value: pool.id, style: "primary" }),
      ]));
    }
  }

  blocks.push(b.divider());
  const footer = [];
  if (admin) footer.push(b.button("🔀 Create pool", "create_pool_open"));
  footer.push(b.button("↻ Refresh", "refresh_home"));
  blocks.push(b.actions(footer));
  if (dashboardUrl) blocks.push(b.context(`<${dashboardUrl}|Open the full dashboard>`));

  return { type: "home", blocks };
}
