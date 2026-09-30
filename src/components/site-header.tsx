import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getCart } from "@/lib/cart";
import { createClient } from "@/lib/supabase/server";
import styles from "./site-header.module.css";

async function loadHeaderState() {
  try {
    const user = await getCurrentUser();
    if (!user) return { user: null, count: 0 };
    const cart = await getCart(await createClient(), user.id);
    return { user, count: cart.count };
  } catch {
    return { user: null, count: 0 };
  }
}

export async function SiteHeader() {
  const { user, count } = await loadHeaderState();
  return (
    <header className={styles.header}>
      <div className={`shell ${styles.inner}`}>
        <Link className={styles.brand} href="/">
          <span className={styles.mark} aria-hidden="true" />
          Cohort Shop
        </Link>
        <nav className={styles.nav} aria-label="Primary navigation">
          <Link href="/">Shop</Link>
          <Link href="/cart" className={styles.cart} aria-label={`Cart, ${count} items`}>
            Cart <span className={styles.badge} aria-hidden="true">{count}</span>
          </Link>
          {user ? (
            <form action="/auth/signout" method="post" className={styles.account}>
              <span className={styles.email} title={user.email}>{user.email}</span>
              <button type="submit" className={styles.login}>Sign out</button>
            </form>
          ) : (
            <Link className={styles.login} href="/login">Continue with Google</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
