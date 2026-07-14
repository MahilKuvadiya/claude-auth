// App Home tab + refresh. Publishes the dashboard view for the opening user.

import { resolveIdentity } from "../lib/identity.js";
import { loadPoolsFor } from "../lib/data.js";
import { buildAppHome } from "../views/appHome.js";
import { config } from "../config.js";

export async function publishHome(client, userId) {
  const identity = await resolveIdentity(client, userId);
  const pools = identity.role === "none" ? [] : await loadPoolsFor(identity);
  await client.views.publish({
    user_id: userId,
    view: buildAppHome({ identity, pools, dashboardUrl: config.dashboardUrl }),
  });
}

export function registerAppHome(app) {
  app.event("app_home_opened", async ({ event, client, logger }) => {
    if (event.tab && event.tab !== "home") return;
    try {
      await publishHome(client, event.user);
    } catch (err) {
      logger.error(err);
      await client.views
        .publish({ user_id: event.user, view: buildAppHome({ error: err.message }) })
        .catch(() => {});
    }
  });

  app.action("refresh_home", async ({ ack, body, client, logger }) => {
    await ack();
    try {
      await publishHome(client, body.user.id);
    } catch (err) {
      logger.error(err);
    }
  });
}
