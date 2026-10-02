import { deliveryLines, type DeliveryDetails } from "@/lib/delivery";

export function DeliverySummary({ details }: { details: DeliveryDetails | null }) {
  return <section aria-label="Delivery details">
    <h3>Delivery details</h3>
    {details ? <address style={{ fontStyle: "normal", overflowWrap: "anywhere" }}>{deliveryLines(details).map((line, index) => <div key={index}>{line}</div>)}</address> : <p>No delivery details were recorded for this order.</p>}
  </section>;
}
