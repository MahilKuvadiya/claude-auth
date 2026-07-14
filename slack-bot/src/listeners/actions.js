// Admin actions: invite (modal → join link), revoke, create pool.
// Every mutation re-checks the acting user is a claudex admin (defense in depth;
// the buttons only render for admins, but never trust the client).

import { resolveIdentity, requireAdmin } from "../lib/identity.js";
import { backend } from "../lib/backend.js";
import { inviteModal, createPoolModal } from "../views/modals.js";
import { publishHome } from "./appHome.js";

async function dm(client, userId, text) {
  try {
    await client.chat.postMessage({ channel: userId, text });
  } catch {
    /* best effort */
  }
}

export function registerActions(app) {
  // ── Invite ──────────────────────────────────────────────────────────────
  app.action("invite_open", async ({ ack, body, client, action, logger }) => {
    await ack();
    try {
      const identity = await resolveIdentity(client, body.user.id);
      requireAdmin(identity);
      await client.views.open({ trigger_id: body.trigger_id, view: inviteModal(action.value) });
    } catch (err) {
      if (err.userFacing) return dm(client, body.user.id, `:no_entry: ${err.message}`);
      logger.error(err);
    }
  });

  app.view("invite_submit", async ({ ack, body, view, client, logger }) => {
    const poolId = view.private_metadata;
    const email = view.state.values.email?.value?.value?.trim();
    if (!email || !email.includes("@")) {
      return ack({ response_action: "errors", errors: { email: "Enter a valid email." } });
    }
    await ack();
    try {
      const identity = await resolveIdentity(client, body.user.id);
      requireAdmin(identity);
      const res = await backend.createJoinLink(poolId, email, identity.email);
      const cmd = res?.command || `claudex pool join ${res?.token || "<token>"}`;
      await dm(
        client,
        body.user.id,
        `:white_check_mark: Invite for *${email}* created.\n\`\`\`${cmd}\`\`\`\nSend it to them — works once, only for that email.`,
      );
    } catch (err) {
      logger.error(err);
      await dm(client, body.user.id, `:warning: Invite failed: ${err.message}`);
    }
  });

  // ── Revoke (button carries "poolId:memberId"; confirm dialog is in the view) ─
  app.action("revoke_member", async ({ ack, body, client, action, logger }) => {
    await ack();
    const [poolId, memberId] = String(action.value).split(":");
    try {
      const identity = await resolveIdentity(client, body.user.id);
      requireAdmin(identity);
      await backend.revokeMember(poolId, memberId, identity.email);
      await publishHome(client, body.user.id);
      await dm(client, body.user.id, ":white_check_mark: Member revoked.");
    } catch (err) {
      if (err.userFacing) return dm(client, body.user.id, `:no_entry: ${err.message}`);
      logger.error(err);
      await dm(client, body.user.id, `:warning: Revoke failed: ${err.message}`);
    }
  });

  // ── Create pool ─────────────────────────────────────────────────────────
  app.action("create_pool_open", async ({ ack, body, client, logger }) => {
    await ack();
    try {
      const identity = await resolveIdentity(client, body.user.id);
      requireAdmin(identity);
      await client.views.open({ trigger_id: body.trigger_id, view: createPoolModal() });
    } catch (err) {
      if (err.userFacing) return dm(client, body.user.id, `:no_entry: ${err.message}`);
      logger.error(err);
    }
  });

  app.view("create_pool_submit", async ({ ack, body, view, client, logger }) => {
    const name = view.state.values.name?.value?.value?.trim();
    const mode = view.state.values.mode?.value?.selected_option?.value || "failover";
    if (!name) {
      return ack({ response_action: "errors", errors: { name: "Give the pool a name." } });
    }
    await ack();
    try {
      const identity = await resolveIdentity(client, body.user.id);
      requireAdmin(identity);
      await backend.createPool(name, mode, identity.email);
      await publishHome(client, body.user.id);
      await dm(client, body.user.id, `:white_check_mark: Pool *${name}* created (${mode}).`);
    } catch (err) {
      logger.error(err);
      await dm(client, body.user.id, `:warning: Create failed: ${err.message}`);
    }
  });
}
