import Link from "next/link";
import styles from "./site-footer.module.css";

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={`shell ${styles.inner}`}>
        <div>
          <p className={styles.brand}>Cohort Shop</p>
          <p className={styles.muted}>Simple fashion, secure checkout.</p>
        </div>
        <nav className={styles.links} aria-label="Footer navigation">
          <Link href="/">Shop</Link>
          <Link href="/cart">Cart</Link>
          <Link href="/checkout">Checkout</Link>
        </nav>
      </div>
    </footer>
  );
}
