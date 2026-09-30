// In-memory stand-in for the privileged Supabase client. It mirrors the behaviour of the
// SQL functions tested in tests/database (finalize, claim, complete); it is not a SQL test.
export function createAdminClient() {
  const orders = globalThis.__orders;

  return {
    from(table) {
      if (table !== "orders") throw new Error(`Unexpected table ${table}`);
      const filters = [];
      const query = {
        select: () => query,
        eq: (column, value) => (filters.push([column, value]), query),
        async maybeSingle() {
          const match = orders.find((order) => filters.every(([c, v]) => order[c] === v));
          return { data: match ? { ...match } : null, error: null };
        },
      };
      return query;
    },

    async rpc(name, args) {
      const order = orders.find((candidate) => candidate.id === (args.p_order_id ?? null));
      if (name === "finalize_paid_order") {
        if (
          !order ||
          args.p_reference !== order.payment_reference ||
          args.p_amount_kobo !== order.total_kobo ||
          args.p_currency !== order.currency
        ) {
          return { data: null, error: { code: "22023" } };
        }
        globalThis.__finalizeCalls += 1;
        if (order.payment_status !== "paid") {
          order.payment_status = "paid";
          order.paid_at = new Date().toISOString();
        }
        return { data: { ...order }, error: null };
      }
      if (name === "claim_order_email") {
        if (
          order &&
          order.payment_status === "paid" &&
          ["pending", "failed"].includes(order.email_status)
        ) {
          order.email_status = "sending";
          order.email_attempt_id = crypto.randomUUID();
          order.email_attempt_at = new Date().toISOString();
          return { data: [{ ...order }], error: null };
        }
        return { data: [], error: null };
      }
      if (name === "complete_order_email") {
        if (order && order.email_status === "sending" && order.email_attempt_id === args.p_attempt_id) {
          order.email_status = args.p_status;
          order.mailgun_message_id = args.p_status === "accepted" ? args.p_message_id : null;
        }
        return { data: order ? [{ ...order }] : [], error: null };
      }
      throw new Error(`Unexpected rpc ${name}`);
    },
  };
}
