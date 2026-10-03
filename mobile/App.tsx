import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Image, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import * as Crypto from "expo-crypto";
import type { Session } from "@supabase/supabase-js";
import { api, ApiError, type History, type Product } from "./src/api";
import { completeSignIn, signInWithGoogle } from "./src/auth";
import { config, configurationError } from "./src/config";
import { supabase } from "./src/supabase";
import { subscribeToCart } from "../src/lib/cart-sync";
import { deliveryLines, deliverySchema, parseDelivery, type DeliveryDetails } from "../src/lib/delivery";
import { parseOrderItems } from "../src/lib/order-items";
import { formatKobo } from "../src/lib/money";
import type { CartView, PaymentView } from "../src/lib/shop-types";

WebBrowser.maybeCompleteAuthSession();
const emptyCart: CartView = { items: [], count: 0, totalKobo: 0 };
const message = (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Please try again.";

function Button({ children, onPress, disabled = false, secondary = false, label }: { children: string; onPress: () => void; disabled?: boolean; secondary?: boolean; label?: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label ?? children} accessibilityState={{ disabled }} onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.button, secondary && styles.secondary, (pressed || disabled) && styles.dim]}><Text style={[styles.buttonText, secondary && styles.secondaryText]}>{children}</Text></Pressable>;
}
function Feedback({ error }: { error: string | null }) { return error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null; }
function Delivery({ details }: { details: DeliveryDetails | null }) { return <View style={styles.spaced}><Text style={styles.subtitle}>Delivery details</Text>{details ? deliveryLines(details).map((line, index) => <Text key={index} style={styles.copy}>{line}</Text>) : <Text style={styles.muted}>No delivery details were recorded for this order.</Text>}</View>; }

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const setupError = configurationError();

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    try { setProducts(await api.products()); setError(null); }
    catch (cause) { setError(message(cause)); }
    finally { setLoadingProducts(false); }
  }, []);

  useEffect(() => {
    if (setupError) return;
    let mounted = true;
    // Initial state already shows loading; only update it after the response.
    void api.products().then(next => { if (mounted) setProducts(next); }).catch(cause => { if (mounted) setError(message(cause)); }).finally(() => { if (mounted) setLoadingProducts(false); });
    void supabase.auth.getSession().then(({ data, error }) => { if (mounted) { setSession(data.session); setReady(true); if (error) setError("Could not restore your session. Please sign in again."); } });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, current) => { if (mounted) { setSession(current); setReady(true); } });
    const handleUrl = (url: string) => { void completeSignIn(url).catch(cause => { if (mounted) setError(message(cause)); }); };
    const linking = Linking.addEventListener("url", event => handleUrl(event.url));
    void Linking.getInitialURL().then(url => { if (url && mounted) handleUrl(url); });
    const appState = AppState.addEventListener("change", state => { if (state === "active") supabase.auth.startAutoRefresh(); else supabase.auth.stopAutoRefresh(); });
    if (AppState.currentState === "active") supabase.auth.startAutoRefresh();
    return () => { mounted = false; listener.subscription.unsubscribe(); linking.remove(); appState.remove(); supabase.auth.stopAutoRefresh(); };
  }, [setupError]);

  async function signIn() {
    if (signingIn) return;
    setSigningIn(true); setError(null);
    try { await signInWithGoogle(); } catch (cause) { setError(message(cause)); }
    finally { setSigningIn(false); }
  }

  return <SafeAreaProvider><SafeAreaView style={styles.safe}>
    <View style={styles.header}><Text style={styles.brand}>COHORT SHOP</Text><Text style={styles.tagline}>Your wardrobe, wherever you are.</Text></View>
    {setupError ? <View style={styles.body}><Text style={styles.heading}>Set up the app</Text><Feedback error={setupError} /></View> : !ready ? <ActivityIndicator size="large" accessibilityLabel="Restoring session" /> : session ? <SignedIn key={session.user.id} session={session} products={products} loadingProducts={loadingProducts} loadProducts={loadProducts} /> : <ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.heading}>Find your next favourite.</Text><Text style={styles.copy}>Sign in with the same Google account you use on the website. Your cart comes with you.</Text>
      <Button onPress={() => void signIn()} disabled={signingIn}>{signingIn ? "Opening Google…" : "Sign in with Google"}</Button><Feedback error={error} />
      {loadingProducts ? <ActivityIndicator accessibilityLabel="Loading products" /> : <Products products={products} onAdd={() => void signIn()} pending={signingIn} quantities={new Map()} />}
      {!loadingProducts && products.length === 0 ? <Button secondary onPress={() => void loadProducts()}>Reload products</Button> : null}
    </ScrollView>}
  </SafeAreaView></SafeAreaProvider>;
}

function Products({ products, onAdd, pending, quantities }: { products: Product[]; onAdd: (id: string) => void; pending: boolean; quantities: Map<string, number> }) {
  return <View style={styles.spaced}>{products.length === 0 ? <Text style={styles.muted}>No products are available right now.</Text> : products.map(product => <View key={product.id} style={styles.card}>
    <Image source={{ uri: new URL(product.image_path, config.apiUrl).toString() }} style={styles.image} accessibilityLabel={product.name} resizeMode="cover" />
    <Text style={styles.subtitle}>{product.name}</Text><Text style={styles.muted}>{product.description}</Text><Text style={styles.price}>{formatKobo(product.price_kobo)}</Text>
    <Button onPress={() => onAdd(product.id)} disabled={pending || (quantities.get(product.id) ?? 0) >= 99} label={`Add ${product.name} to cart`}>Add to cart</Button>
  </View>)}</View>;
}

function SignedIn({ session, products, loadingProducts, loadProducts }: { session: Session; products: Product[]; loadingProducts: boolean; loadProducts: () => Promise<void> }) {
  const [tab, setTab] = useState<"shop" | "cart" | "orders">("shop");
  const [cart, setCart] = useState<CartView>(emptyCart);
  const [cartReady, setCartReady] = useState(false);
  const [history, setHistory] = useState<History | null>(null);
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [connected, setConnected] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentView | null>(null);
  const [previousPayment, setPreviousPayment] = useState<{ payment_reference: string; total_kobo: number } | null>(null);
  const alive = useRef(true);
  const generation = useRef(0);
  const orderGeneration = useRef(0);
  const mutation = useRef(false);
  const attempt = useRef<{ signature: string; key: string } | null>(null);

  const refreshCart = useCallback(async () => {
    const current = ++generation.current;
    try { const next = await api.cart(); if (alive.current && current === generation.current) { setCart(next); setCartReady(true); } }
    catch (cause) { if (alive.current && current === generation.current) setError(message(cause)); }
  }, []);
  const refreshOrders = useCallback(async () => {
    const current = ++orderGeneration.current;
    try { const next = await api.orders(page); if (alive.current && current === orderGeneration.current) setHistory(next); }
    catch (cause) { if (alive.current && current === orderGeneration.current) setError(message(cause)); }
  }, [page]);

  useEffect(() => {
    alive.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- State changes only after the network response.
    void refreshCart();
    return () => { alive.current = false; };
  }, [refreshCart]);
  useEffect(() => {
    let stopped = false;
    let unsubscribe: (() => void) | undefined;
    void supabase.realtime.setAuth(session.access_token).then(() => {
      if (!stopped) unsubscribe = subscribeToCart(supabase, session.user.id, () => { if (AppState.currentState === "active") void refreshCart(); }, setConnected);
    }).catch(() => { if (!stopped) setConnected(false); });
    const appState = AppState.addEventListener("change", state => { if (state === "active") void refreshCart(); });
    const timer = setInterval(() => { if (AppState.currentState === "active") void refreshCart(); }, 10000);
    return () => { stopped = true; unsubscribe?.(); appState.remove(); clearInterval(timer); };
  }, [session.access_token, session.user.id, refreshCart]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Load the selected page asynchronously.
    if (tab === "orders") void refreshOrders();
  }, [tab, refreshOrders]);
  useEffect(() => {
    if (tab !== "cart") return;
    let active = true;
    void api.pendingCheckout().then(result => { if (active) setPreviousPayment(result.pending); }).catch(cause => { if (active) setError(message(cause)); });
    return () => { active = false; };
  }, [tab, cart.totalKobo]);

  async function act(operation: () => Promise<void>) {
    if (mutation.current) return;
    mutation.current = true; setPending(true); setError(null); setNotice(null);
    try { await operation(); } catch (cause) { if (alive.current) { setError(message(cause)); if (cause instanceof ApiError && cause.reference) { setReference(cause.reference); setTab("cart"); } } }
    finally { mutation.current = false; if (alive.current) setPending(false); }
  }
  function update(productId: string, quantity: number | null) {
    void act(async () => {
      generation.current++;
      const next = quantity === null ? await api.remove(productId) : await api.setQuantity(productId, quantity);
      if (alive.current) { setCart(next); setNotice(quantity === null ? "Item removed." : "Cart updated."); }
      await refreshCart();
    });
  }
  async function verify(ref = reference) {
    if (!ref) return;
    const view = await api.verify(ref);
    if (alive.current) { setPayment(view); setReference(ref); setTab("cart"); }
    await refreshCart();
  }
  async function checkout(delivery: DeliveryDetails) {
    await act(async () => {
      const signature = JSON.stringify([cart.items, delivery]);
      if (attempt.current?.signature !== signature) attempt.current = { signature, key: Crypto.randomUUID() };
      const order = await api.checkout(attempt.current.key, delivery);
      if (!alive.current) return;
      setReference(order.reference);
      if (order.authorizationUrl) {
        const url = new URL(order.authorizationUrl);
        if (url.protocol !== "https:" || url.hostname !== "checkout.paystack.com") throw new Error("The payment link could not be opened safely. Check payment status.");
        await WebBrowser.openBrowserAsync(url.toString());
      }
      // The browser return is only a prompt to verify; it never confirms payment.
      await verify(order.reference);
    });
  }
  async function refresh() {
    setRefreshing(true); setError(null);
    try { await refreshCart(); if (tab === "orders") await refreshOrders(); else if (tab === "shop") await loadProducts(); }
    finally { if (alive.current) setRefreshing(false); }
  }

  return <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}>
      <View style={styles.account}><Text style={styles.email}>{session.user.email}</Text><Button secondary disabled={pending} onPress={() => void act(async () => { const { error } = await supabase.auth.signOut(); if (error) throw new Error("Sign-out failed. Try again."); })}>Sign out</Button></View>
      <Text accessibilityLiveRegion="polite" style={styles.muted}>{connected ? "Cart live sync connected" : "Connecting live sync · pull down to refresh"}</Text>
      <Feedback error={error} />{notice ? <Text accessibilityLiveRegion="polite" style={styles.success}>{notice}</Text> : null}
      {tab === "shop" ? <><Text style={styles.heading}>Find your next favourite.</Text>{loadingProducts ? <ActivityIndicator /> : <Products products={products} pending={pending || !cartReady} quantities={new Map(cart.items.map(item => [item.productId, item.quantity]))} onAdd={id => update(id, (cart.items.find(item => item.productId === id)?.quantity ?? 0) + 1)} />}</> : tab === "cart" ? <>
        <Text style={styles.heading}>Your cart</Text>
        {previousPayment && previousPayment.payment_reference !== reference ? <View style={styles.card}><Text style={styles.subtitle}>A payment is waiting</Text><Text style={styles.copy}>Check the payment of {formatKobo(previousPayment.total_kobo)} before paying again.</Text><Button secondary disabled={pending} onPress={() => void act(() => verify(previousPayment.payment_reference))}>Check previous payment</Button></View> : null}
        {payment ? <View style={styles.card}><Text style={styles.subtitle}>{payment.paymentStatus === "paid" ? "Payment confirmed" : payment.paymentStatus === "pending" ? "Payment still processing" : "Payment was not successful"}</Text><Text style={styles.copy}>{payment.paymentStatus === "paid" ? (payment.emailStatus === "accepted" ? "Your confirmation email was accepted for sending." : "Payment confirmed; confirmation email pending.") : "Your cart is kept. Check payment status before paying again."}</Text><Text selectable style={styles.muted}>Order {payment.orderId}</Text><Text style={styles.price}>{formatKobo(payment.totalKobo)}</Text><Delivery details={payment.delivery} /></View> : null}
        {reference ? <Button secondary disabled={pending} onPress={() => void act(() => verify())}>Check payment status</Button> : null}
        {!cartReady ? <ActivityIndicator accessibilityLabel="Loading cart" /> : cart.items.length === 0 ? <View style={styles.card}><Text style={styles.subtitle}>Your cart is empty</Text><Text style={styles.copy}>Add something from the shop.</Text><Button onPress={() => setTab("shop")}>Browse the shop</Button></View> : <>
          {cart.items.map(item => <View key={item.productId} style={styles.card}><Text style={styles.subtitle}>{item.name}</Text><Text style={styles.price}>{formatKobo(item.lineTotalKobo)}</Text><View style={styles.row}><Button secondary label={`Decrease ${item.name} quantity`} disabled={pending || item.quantity <= 1} onPress={() => update(item.productId, item.quantity - 1)}>−</Button><Text style={styles.quantity}>{item.quantity}</Text><Button secondary label={`Increase ${item.name} quantity`} disabled={pending || item.quantity >= 99} onPress={() => update(item.productId, item.quantity + 1)}>+</Button></View><Button secondary disabled={pending} onPress={() => update(item.productId, null)}>Remove</Button></View>)}
          <Text style={styles.price}>Total {formatKobo(cart.totalKobo)}</Text><Text style={styles.muted}>Check Orders for any unresolved payment before paying again.</Text><DeliveryForm onPay={checkout} disabled={pending} />
        </>}
      </> : <>
        <Text style={styles.heading}>Your orders</Text>
        {!history ? <ActivityIndicator accessibilityLabel="Loading orders" /> : history.orders.length === 0 ? <Text style={styles.copy}>No orders on this page yet.</Text> : history.orders.map(order => <View key={order.id} style={styles.card}><Text style={styles.subtitle}>Order {order.id.slice(0, 8)}</Text><Text style={styles.badge}>{order.payment_status === "paid" ? "Payment confirmed" : "Payment not confirmed"}</Text><Text style={styles.muted}>{new Date(order.created_at).toLocaleDateString()}</Text>{parseOrderItems(order.items).map((item, index) => <Text key={index} style={styles.copy}>{item.name} × {item.quantity} · {formatKobo(item.unitPriceKobo * item.quantity)}</Text>)}<Text style={styles.price}>{formatKobo(order.total_kobo)}</Text><Delivery details={parseDelivery(order.delivery_details)} /><Button secondary disabled={pending} onPress={() => void act(() => verify(order.payment_reference))}>Check payment status</Button></View>)}
        {page > 1 ? <Button secondary onPress={() => { setHistory(null); setPage(value => value - 1); }}>Newer orders</Button> : null}{history?.hasNext ? <Button secondary onPress={() => { setHistory(null); setPage(value => value + 1); }}>Older orders</Button> : null}
      </>}
    </ScrollView>
    <View style={styles.tabs}>{(["shop", "cart", "orders"] as const).map(name => <Pressable key={name} accessibilityRole="tab" accessibilityState={{ selected: tab === name }} onPress={() => { setTab(name); setError(null); setNotice(null); }} style={[styles.tab, tab === name && styles.activeTab]}><Text style={styles.tabText}>{name === "cart" ? `Cart (${cart.count})` : name === "shop" ? "Shop" : "Orders"}</Text></Pressable>)}</View>
  </KeyboardAvoidingView>;
}

function DeliveryForm({ onPay, disabled }: { onPay: (delivery: DeliveryDetails) => Promise<void>; disabled: boolean }) {
  const [details, setDetails] = useState<DeliveryDetails>({ recipientName: "", phone: "", address: "", city: "", state: "" });
  const [error, setError] = useState<string | null>(null);
  function submit() {
    const parsed = deliverySchema.safeParse(details);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check your delivery details."); return; }
    setError(null); void onPay(parsed.data);
  }
  return <View style={styles.card}><Text style={styles.subtitle}>Delivery details</Text><Text style={styles.muted}>Nigeria · no delivery fee added. Receipt goes to your Google account email.</Text>{([
    ["recipientName", "Recipient name"], ["phone", "Phone number"], ["address", "Street address"], ["city", "City"], ["state", "State / FCT"],
  ] as const).map(([key, label]) => <View key={key} style={styles.spaced}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} value={details[key]} editable={!disabled} onChangeText={value => setDetails(current => ({ ...current, [key]: value }))} keyboardType={key === "phone" ? "phone-pad" : "default"} autoComplete={key === "recipientName" ? "name" : key === "phone" ? "tel" : key === "address" ? "street-address" : "off"} maxLength={key === "address" ? 250 : key === "phone" ? 25 : 100} style={styles.input} /></View>)}<Feedback error={error} /><Button onPress={submit} disabled={disabled}>{disabled ? "Please wait…" : "Pay with Paystack"}</Button></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" }, flex: { flex: 1 },
  header: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderColor: "#e5e7eb", backgroundColor: "#ebd96b" },
  brand: { fontSize: 24, fontWeight: "900", letterSpacing: -1, color: "#171717" }, tagline: { fontSize: 12, color: "#333" },
  body: { padding: 20, gap: 16, paddingBottom: 32 }, heading: { fontSize: 34, lineHeight: 38, fontWeight: "900", color: "#171717" },
  subtitle: { fontSize: 20, fontWeight: "700", color: "#171717" }, copy: { fontSize: 15, lineHeight: 23, color: "#333" }, muted: { fontSize: 13, lineHeight: 20, color: "#666" },
  card: { padding: 16, gap: 12, backgroundColor: "#f4f6f5", borderRadius: 16 }, image: { width: "100%", height: 280, borderRadius: 12, backgroundColor: "#e5e7eb" },
  button: { minHeight: 48, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#171717", borderWidth: 1, borderColor: "#171717", borderRadius: 8 },
  secondary: { backgroundColor: "transparent" }, buttonText: { fontSize: 15, fontWeight: "600", color: "#fff", textAlign: "center" }, secondaryText: { color: "#171717" }, dim: { opacity: .5 },
  error: { color: "#b42318", lineHeight: 22 }, success: { color: "#067647", lineHeight: 22 }, price: { fontSize: 19, fontWeight: "700", color: "#171717" },
  spaced: { gap: 6 }, account: { gap: 12 }, email: { fontSize: 14, color: "#333" }, row: { flexDirection: "row", gap: 16, alignItems: "center" }, quantity: { fontSize: 20, fontWeight: "700", minWidth: 24, textAlign: "center" },
  tabs: { flexDirection: "row", padding: 8, gap: 8, borderTopWidth: 1, borderColor: "#e5e7eb" }, tab: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 8 }, activeTab: { backgroundColor: "#ebd96b" }, tabText: { fontSize: 14, fontWeight: "700", color: "#171717" },
  badge: { alignSelf: "flex-start", backgroundColor: "#ebd96b", color: "#171717", padding: 6, borderRadius: 6, fontSize: 13 }, label: { fontSize: 14, fontWeight: "600", color: "#171717" }, input: { minHeight: 48, backgroundColor: "#fff", borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 12, color: "#171717", fontSize: 16 },
});
