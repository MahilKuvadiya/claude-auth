// Pure modal (view) builders for admin actions.

function opt(v) {
  return { text: { type: "plain_text", text: v }, value: v };
}

export function inviteModal(poolId) {
  return {
    type: "modal",
    callback_id: "invite_submit",
    private_metadata: poolId,
    title: { type: "plain_text", text: "Invite to pool" },
    submit: { type: "plain_text", text: "Create link" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "input",
        block_id: "email",
        label: { type: "plain_text", text: "Invitee email" },
        element: {
          type: "plain_text_input",
          action_id: "value",
          placeholder: { type: "plain_text", text: "name@company.com" },
        },
      },
      { type: "context", elements: [{ type: "mrkdwn", text: "A single-use join link, bound to this exact email." }] },
    ],
  };
}

export function createPoolModal() {
  return {
    type: "modal",
    callback_id: "create_pool_submit",
    title: { type: "plain_text", text: "Create pool" },
    submit: { type: "plain_text", text: "Create" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "input",
        block_id: "name",
        label: { type: "plain_text", text: "Pool name" },
        element: { type: "plain_text_input", action_id: "value" },
      },
      {
        type: "input",
        block_id: "mode",
        label: { type: "plain_text", text: "Mode" },
        element: {
          type: "static_select",
          action_id: "value",
          initial_option: opt("failover"),
          options: [opt("failover"), opt("balance")],
        },
      },
    ],
  };
}
