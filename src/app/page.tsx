import Image from "next/image";
import { AddToCartButton } from "@/components/add-to-cart-button";
import { StatusPanel } from "@/components/status-panel";
import { getCurrentUser } from "@/lib/auth";
import { formatKobo } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

async function loadShop() {
  const supabase = await createClient();
  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, description, image_path, price_kobo")
    .order("price_kobo", { ascending: true });
  if (error) throw error;

  const quantities = new Map<string, number>();
  const user = await getCurrentUser();
  if (user) {
    const { data: cart } = await supabase
      .from("cart_items")
      .select("product_id, quantity")
      .eq("user_id", user.id);
    cart?.forEach((row) => quantities.set(row.product_id, row.quantity));
  }
  return { products: products ?? [], quantities };
}

export default async function ShopPage() {
  let shop: Awaited<ReturnType<typeof loadShop>> | null = null;
  try {
    shop = await loadShop();
  } catch {
    shop = null;
  }

  return (
    <div className="shell page">
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.copy}>
          <h1 id="hero-title" className={styles.title}>
            <span className={styles.line}>Let&apos;s</span>
            <span className={`${styles.line} ${styles.mark}`}>explore</span>
            <span className={styles.line}>unique</span>
            <span className={`${styles.line} ${styles.mark} ${styles.markWhite}`}>clothes</span>
          </h1>
          <p>Simple, well-made fashion priced in naira, with secure checkout on Paystack.</p>
          <a className="button" href="#products">Shop now</a>
        </div>
        <div className={styles.visual} aria-hidden="true">
          <svg className={`${styles.star} ${styles.starA}`} viewBox="0 0 24 24" fill="currentColor"><path d="M12 0l3 9 9 3-9 3-3 9-3-9-9-3 9-3z" /></svg>
          <svg className={`${styles.star} ${styles.starB}`} viewBox="0 0 24 24" fill="currentColor"><path d="M12 0l3 9 9 3-9 3-3 9-3-9-9-3 9-3z" /></svg>
          <div className={`${styles.frame} ${styles.frameLeft}`}>
            <Image src="/products/denim-jacket.jpg" alt="" width={640} height={800} unoptimized />
          </div>
          <div className={`${styles.frame} ${styles.frameRight}`}>
            <Image src="/products/weekend-hoodie.jpg" alt="" width={640} height={800} unoptimized />
          </div>
          <div className={`${styles.frame} ${styles.frameMain}`}>
            <Image src="/products/linen-dress.jpg" alt="" width={640} height={800} unoptimized priority />
          </div>
        </div>
      </section>

      <section id="products" aria-labelledby="products-title" className={styles.products}>
        <h2 id="products-title" className={styles.sectionTitle}>New arrivals</h2>
        {shop === null ? (
          <StatusPanel title="Products are unavailable">
            We could not load the shop right now. Please refresh in a moment.
          </StatusPanel>
        ) : shop.products.length === 0 ? (
          <StatusPanel title="No products yet">Check back soon for new arrivals.</StatusPanel>
        ) : (
          <ul className={styles.grid}>
            {shop.products.map((product) => (
              <li key={product.id} className={styles.card}>
                <div className={styles.imageWrap}>
                  <Image
                    src={product.image_path}
                    alt={product.name}
                    width={640}
                    height={800}
                    className={styles.image}
                    unoptimized
                  />
                </div>
                <div className={styles.head}>
                  <h3 className={styles.name}>{product.name}</h3>
                  <p className={styles.price}>{formatKobo(product.price_kobo)}</p>
                </div>
                <p className={styles.description}>{product.description}</p>
                <AddToCartButton
                  productId={product.id}
                  productName={product.name}
                  initialQuantity={shop.quantities.get(product.id) ?? 0}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
