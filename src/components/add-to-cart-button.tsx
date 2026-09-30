"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = { productId: string; productName: string; initialQuantity: number };

export function AddToCartButton({ productId, productName, initialQuantity }: Props) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(initialQuantity);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function add() {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/cart", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity: Math.min(quantity + 1, 99) }),
      });
      if (response.status === 401) {
        router.push("/login?next=/");
        return;
      }
      const body = await response.json();
      if (!response.ok) {
        setMessage({ text: body.error ?? "Could not add this item.", error: true });
        return;
      }
      const line = (body.items as { productId: string; quantity: number }[]).find(
        (item) => item.productId === productId,
      );
      setQuantity(line?.quantity ?? quantity + 1);
      setMessage({ text: "Added to your cart.", error: false });
      router.refresh();
    } catch {
      setMessage({ text: "Network problem. Your cart was not changed.", error: true });
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        className="button"
        onClick={add}
        disabled={pending || quantity >= 99}
        aria-label={`Add ${productName} to cart`}
      >
        {pending ? "Adding…" : "Add to cart"}
      </button>
      <p
        role={message?.error ? "alert" : "status"}
        className={message?.error ? "form-error" : "form-note"}
      >
        {message?.text}
      </p>
    </div>
  );
}
