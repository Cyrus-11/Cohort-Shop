export default class Mailgun {
  client() {
    return { messages: { async create(domain, message) {
      const state = globalThis.__mailgunSdk;
      if (!state) throw new Error("Mailgun SDK must be configured by the test; real sends are forbidden.");
      state.sent.push({ domain, message });
      if (state.error) throw state.error;
      return { id: "<receipt@example.test>" };
    } } };
  }
}
