// Slash-command shortcut: `/claudex usage` (and `status`) — an ephemeral summary.
// The App Home tab is the primary UI; this is the quick in-channel check.

import { resolveIdentity } from "../lib/identity.js";
import { loadPoolsFor } from "../lib/data.js";
import * as b from "../views/blocks.js";

export function usageBlocks(pools) {
  const blocks = [b.section("*claudex usage*")];
  if (!pools.length) {
    blocks.push(b.section("_no pools_"));
    return blocks;
  }
  for (const p of pools) {
    const lines = (p.members || []).map((m) => {
      const s = m?.rateLimit?.fiveHourPct;
      const w = m?.rateLimit?.weeklyPct;
      return `${b.SEV[b.severity(s)]} ${m.email} · 5h ${b.fmtPct(s)} · wk ${b.fmtPct(w)}`;
    });
    blocks.push(b.section(`*${p.name}* \`${p.id}\`\n${lines.join("\n") || "_no members_"}`));
  }
  return blocks;
}

export function registerCommands(app) {
  app.command("/claudex", async ({ ack, command, client, respond, logger }) => {
    await ack();
    const sub = (command.text || "").trim().split(/\s+/)[0].toLowerCase() || "usage";
    try {
      const identity = await resolveIdentity(client, command.user_id);
      if (identity.role === "none") {
        return respond({ response_type: "ephemeral", text: "You're not in a claudex pool yet — ask an admin to invite you." });
      }
      if (sub === "usage" || sub === "status" || sub === "") {
        const pools = await loadPoolsFor(identity);
        return respond({ response_type: "ephemeral", blocks: usageBlocks(pools), text: "claudex usage" });
      }
      return respond({
        response_type: "ephemeral",
        text: `Unknown subcommand \`${sub}\`. Try \`/claudex usage\` — or open the bot's Home tab for the full dashboard.`,
      });
    } catch (err) {
      logger.error(err);
      return respond({ response_type: "ephemeral", text: `:warning: ${err.message}` });
    }
  });
}
