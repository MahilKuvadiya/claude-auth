// Pure Block Kit helpers — no Slack SDK import, so they're unit-testable.

export const SEV = { ok: "🟢", warn: "🟡", crit: "🔴", idle: "⚪️" };

export function severity(pct) {
  if (pct == null) return "idle";
  if (pct >= 80) return "crit";
  if (pct >= 50) return "warn";
  return "ok";
}

export function bar(pct, width = 10) {
  if (pct == null) return "░".repeat(width);
  const clamped = Math.min(100, Math.max(0, pct));
  const filled = Math.round((clamped / 100) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

export function fmtPct(p) {
  return p == null ? "—" : `${Math.round(p)}%`;
}

export const divider = () => ({ type: "divider" });

export function header(text) {
  return { type: "header", text: { type: "plain_text", text, emoji: true } };
}

export function section(text, accessory) {
  const b = { type: "section", text: { type: "mrkdwn", text } };
  if (accessory) b.accessory = accessory;
  return b;
}

export function context(text) {
  return { type: "context", elements: [{ type: "mrkdwn", text }] };
}

export function button(text, actionId, { value, style, confirm } = {}) {
  const b = { type: "button", text: { type: "plain_text", text, emoji: true }, action_id: actionId };
  if (value != null) b.value = String(value);
  if (style) b.style = style;
  if (confirm) b.confirm = confirm;
  return b;
}

export function actions(elements, blockId) {
  const b = { type: "actions", elements };
  if (blockId) b.block_id = blockId;
  return b;
}
