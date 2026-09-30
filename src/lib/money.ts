const naira = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" });

export function formatKobo(kobo: number): string {
  return naira.format(kobo / 100);
}
