import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { GoogleButton } from "@/components/google-button";
import { getCurrentUser, safeNextPath } from "@/lib/auth";
import styles from "./login.module.css";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

type LoginProps = { searchParams: Promise<{ next?: string; error?: string }> };

const perks = [
  "Your cart is saved to your account",
  "Pay securely on Paystack's hosted page",
  "Order confirmation sent to your email",
];

export default async function LoginPage({ searchParams }: LoginProps) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  if (await getCurrentUser()) redirect(next);

  return (
    <div className="shell page">
      <div className={styles.card}>
        <aside className={styles.brand} aria-hidden="false">
          <p className={styles.eyebrow}>Cohort Shop</p>
          <h2 className={styles.tagline}>
            Welcome <span className={styles.mark}>back</span>
          </h2>
          <ul className={styles.perks}>
            {perks.map((perk) => (
              <li key={perk}>
                <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
                  <circle cx="10" cy="10" r="10" fill="currentColor" opacity="0.18" />
                  <path d="M5.5 10.5l3 3 6-6.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {perk}
              </li>
            ))}
          </ul>
          <div className={styles.photos} aria-hidden="true">
            <Image src="/products/denim-jacket.jpg" alt="" width={210} height={300} className={styles.photoA} />
            <Image src="/products/linen-dress.jpg" alt="" width={210} height={300} className={styles.photoB} />
          </div>
        </aside>

        <section className={styles.form} aria-labelledby="login-title">
          <h1 id="login-title" className={styles.title}>Sign in</h1>
          <p className={styles.copy}>
            Browsing is open to everyone. Sign in with your Google account to save items and check out.
          </p>
          {params.error ? (
            <p role="alert" className={styles.alert}>
              Sign-in did not complete. Please try again.
            </p>
          ) : null}
          <GoogleButton next={next} />
          <p className={styles.fine}>
            We only use your Google name and email to identify your cart and send your order
            confirmation. We never see your Google password.
          </p>
        </section>
      </div>
    </div>
  );
}
