export class MailgunError extends Error {
  constructor(kind) {
    super(`Mailgun request failed (${kind}).`);
    this.kind = kind;
  }
}

// Tests set behaviour on globalThis.__mailgun: { sent: [], mode: "accept"|"reject"|"timeout", delay }.
export async function sendOrderConfirmation(order) {
  const state = globalThis.__mailgun;
  state.sent.push(order);
  if (state.delay) await new Promise((resolve) => setTimeout(resolve, state.delay));
  if (state.mode === "reject") throw new MailgunError("rejected");
  if (state.mode === "timeout") throw new MailgunError("unknown");
  return { messageId: `<test-${state.sent.length}@mailgun.test>` };
}
