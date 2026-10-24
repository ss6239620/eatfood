"use client";
import { api, post } from "@/lib/client";
import type { MenuItem, Settings } from "@/lib/types";
import { money } from "@/lib/utils";
import {
  ArrowRight,
  Check,
  Clock3,
  Leaf,
  LoaderCircle,
  MapPin,
  ShoppingBag,
  Star,
  Truck,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Brand } from "./brand";
import { Button } from "./ui/button";
type CartRow = {
  key: string;
  item: MenuItem;
  quantity: number;
  optionIds: string[];
};
type MenuData = {
  restaurant: { id: string; name: string; slug: string; settings: Settings };
  menu: MenuItem[];
};
export default function CustomerMenu({ slug }: { slug: string }) {
  const [data, setData] = useState<MenuData | null>(null),
    [error, setError] = useState(""),
    [category, setCategory] = useState("All"),
    [cart, setCart] = useState<CartRow[]>([]),
    [adding, setAdding] = useState<MenuItem | null>(null),
    [options, setOptions] = useState<string[]>([]),
    [drawer, setDrawer] = useState(false),
    [fulfillment, setFulfillment] = useState<"pickup" | "delivery">("pickup"),
    [address, setAddress] = useState(""),
    [area, setArea] = useState(""),
    [payment, setPayment] = useState("cod"),
    [notes, setNotes] = useState(""),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [session, setSession] = useState(""),
    [customer, setCustomer] = useState<{ name: string; phone: string } | null>(
      null,
    ),
    [sessionError, setSessionError] = useState("");
  const eventId = useRef(""),
    submitted = useRef(false);
  async function load() {
    try {
      const d = await api("public/menu?slug=" + encodeURIComponent(slug));
      setData(d);
      setArea((a) => a || d.restaurant.settings.deliveryAreas[0]);
      return d as MenuData;
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    load();
    const t = new URLSearchParams(window.location.search).get("session") || "";
    setSession(t);
    if (t)
      api("customer/session?token=" + encodeURIComponent(t))
        .then((c) => setCustomer(c))
        .catch((e) => setSessionError(e.message));
  }, [slug]);
  const subtotal = cart.reduce(
      (s, r) =>
        s +
        (r.item.price +
          r.optionIds.reduce(
            (sum, id) =>
              sum + (r.item.options.find((o) => o.id === id)?.price || 0),
            0,
          )) *
          r.quantity,
      0,
    ),
    tax = Math.round(
      (subtotal * (data?.restaurant.settings.taxBps || 0)) / 10000,
    ),
    deliveryFee =
      fulfillment === "delivery"
        ? data?.restaurant.settings.deliveryFee || 0
        : 0,
    packaging = data?.restaurant.settings.packagingFee || 0,
    total = subtotal + tax + deliveryFee + packaging,
    count = cart.reduce((s, r) => s + r.quantity, 0);
  function invalidate() {
    eventId.current = "";
    submitted.current = false;
  }
  function add(item: MenuItem, optionIds: string[]) {
    const key = item.id + ":" + [...optionIds].sort().join(",");
    setCart((old) => {
      const found = old.find((r) => r.key === key);
      return found
        ? old.map((r) =>
            r.key === key
              ? { ...r, quantity: Math.min(20, r.quantity + 1) }
              : r,
          )
        : [...old, { key, item, quantity: 1, optionIds }];
    });
    setAdding(null);
    invalidate();
  }
  function qty(key: string, n: number) {
    setCart((c) =>
      c
        .map((r) =>
          r.key === key ? { ...r, quantity: Math.min(20, r.quantity + n) } : r,
        )
        .filter((r) => r.quantity > 0),
    );
    invalidate();
  }
  async function checkout(e: React.FormEvent) {
    e.preventDefault();
    if (busy || submitted.current) return;
    setBusy(true);
    setError("");
    eventId.current ||= "checkout-" + crypto.randomUUID();
    try {
      const result = await post("customer/orders", {
        sessionToken: session,
        eventId: eventId.current,
        items: cart.map((r) => ({
          id: r.item.id,
          quantity: r.quantity,
          optionIds: r.optionIds,
        })),
        fulfillment,
        address:
          fulfillment === "delivery" ? { line: address, area } : undefined,
        paymentMethod: payment,
        notes,
        expectedTotal: total,
        marketingConsent: consent,
      });
      submitted.current = true;
      window.location.href = result.trackingPath;
    } catch (e) {
      setError((e as Error).message);
      if (
        (e as Error).message.includes("Prices changed") ||
        (e as Error).message.includes("sold out")
      ) {
        const fresh = await load();
        if (fresh)
          setCart((c) =>
            c.map((r) => ({
              ...r,
              item: fresh.menu.find((m) => m.id === r.item.id) || r.item,
            })),
          );
        invalidate();
      }
      setBusy(false);
    }
  }
  if (!data)
    return (
      <main className="loading">
        <div>
          <LoaderCircle className="spin" style={{ margin: "0 auto 20px" }} />
          <p>{error || "Something good is coming…"}</p>
        </div>
      </main>
    );
  return (
    <main className="customer-shell">
      <header className="customer-nav">
        <Brand />
        <span className="demo-label">DEMO STOREFRONT</span>
      </header>
      <div className="menu-hero">
        <div className="menu-hero-text">
          <span className="eyebrow" style={{ fontSize: 9, color: "#7b875f" }}>
            FRESH FROM OUR KITCHEN
          </span>
          <h1>
            A bowlful of <span className="serif">good.</span>
          </h1>
          <p style={{ fontSize: 12, color: "#7d876c", lineHeight: 1.8 }}>
            Made with care. Served with love.
            <br />
            Your neighborhood favorites, ordered direct.
          </p>
          <div
            style={{
              display: "flex",
              gap: 15,
              marginTop: 18,
              fontSize: 10,
              color: "#788268",
            }}
          >
            <span>
              <Star size={11} style={{ display: "inline", marginRight: 4 }} />
              Made fresh
            </span>
            <span>
              <Clock3 size={11} style={{ display: "inline", marginRight: 4 }} />
              20–30 min
            </span>
          </div>
        </div>
        <div
          className="menu-hero-image"
          role="img"
          aria-label="Freshly prepared food bowl"
        />
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 15,
          alignItems: "center",
          margin: "25px 0",
        }}
      >
        <div>
          <h2>{data.restaurant.name}</h2>
          <p className="subtitle">
            <MapPin size={12} style={{ display: "inline", marginRight: 5 }} />
            {data.restaurant.settings.address}
          </p>
        </div>
        <span className="status-pill">
          <span className="status-dot" />
          {data.restaurant.settings.open
            ? "Kitchen is open"
            : "Kitchen is paused"}
        </span>
      </div>
      {customer ? (
        <div className="notice">
          <Check size={16} />
          Hi {customer.name}. You’re ordering through a verified demo
          conversation.
        </div>
      ) : (
        <div className="notice warning">
          <Leaf size={17} />
          <div>
            {sessionError ||
              "You’re browsing the demo menu. Start a simulated WhatsApp conversation in the dashboard to get a secure checkout link."}
            <a
              href="/"
              style={{
                display: "block",
                textDecoration: "underline",
                marginTop: 5,
              }}
            >
              Go to the demo dashboard →
            </a>
          </div>
        </div>
      )}
      <div className="category-nav" aria-label="Menu categories">
        {["All", ...new Set(data.menu.map((m) => m.category))].map((c) => (
          <button
            key={c}
            className={"category-chip " + (category === c ? "active" : "")}
            onClick={() => setCategory(c)}
          >
            {c === "All" ? "All the good stuff" : c}
          </button>
        ))}
      </div>
      <div className="menu-grid">
        {data.menu
          .filter((m) => category === "All" || m.category === category)
          .map((m) => (
            <article
              className="food-card"
              key={m.id}
              style={{ opacity: m.available ? 1 : 0.65 }}
            >
              <img className="food-image" src={m.image} alt={m.name} />
              <div className="food-content">
                <span className="eyebrow muted" style={{ fontSize: 8 }}>
                  {m.category}
                </span>
                <h3 style={{ marginTop: 9 }}>
                  <span
                    className={"veg-mark " + (!m.vegetarian ? "nonveg" : "")}
                  />
                  {m.name}
                </h3>
                <p className="description">{m.description}</p>
                <div className="food-bottom" style={{ marginTop: 16 }}>
                  <strong>{money(m.price)}</strong>
                  <Button
                    className="button"
                    variant="outline"
                    disabled={!m.available || !data.restaurant.settings.open}
                    onClick={() => {
                      setOptions([]);
                      setAdding(m);
                    }}
                  >
                    {m.available ? (
                      <>
                        Add{" "}
                        <span style={{ fontSize: 17, marginLeft: 10 }}>+</span>
                      </>
                    ) : (
                      "Sold out"
                    )}
                  </Button>
                </div>
              </div>
            </article>
          ))}
      </div>
      <p
        style={{
          textAlign: "center",
          fontSize: 11,
          color: "#a2a58f",
          marginTop: 45,
        }}
      >
        <Leaf size={13} style={{ display: "inline", marginRight: 7 }} />A little
        more local. A little more direct.
        <a
          href="/food/CREDITS.md"
          target="_blank"
          rel="noreferrer"
          style={{
            display: "block",
            marginTop: 10,
            fontSize: 9,
            textDecoration: "underline",
          }}
        >
          Illustrative photo credits
        </a>
      </p>
      {count > 0 && (
        <button
          className="cart-bar"
          onClick={() => {
            setDrawer(true);
            setError("");
          }}
        >
          <span>
            <ShoppingBag size={18} />
            {count} {count === 1 ? "item" : "items"} · {money(subtotal)}
          </span>
          <span>
            View your bag <ArrowRight size={17} />
          </span>
        </button>
      )}
      {adding && (
        <div className="overlay" onClick={() => setAdding(null)}>
          <section
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-label={"Customize " + adding.name}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-head">
              <h2>Make it your own.</h2>
              <button
                className="icon-button"
                aria-label="Close item"
                onClick={() => setAdding(null)}
              >
                <X />
              </button>
            </div>
            <img
              src={adding.image}
              alt={adding.name}
              style={{
                width: "100%",
                height: 220,
                objectFit: "cover",
                borderRadius: 10,
              }}
            />
            <h2 style={{ marginTop: 20 }}>{adding.name}</h2>
            <p className="subtitle">{adding.description}</p>
            <h3 style={{ margin: "25px 0 15px" }}>A little extra?</h3>
            {adding.options.length ? (
              adding.options.map((o) => (
                <label
                  key={o.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "15px 0",
                    borderBottom: "1px solid #e9e9df",
                    fontWeight: 400,
                  }}
                >
                  <span>
                    <input
                      style={{
                        width: 15,
                        marginRight: 10,
                        accentColor: "#bd5133",
                      }}
                      type="checkbox"
                      checked={options.includes(o.id)}
                      onChange={(e) =>
                        setOptions((v) =>
                          e.target.checked
                            ? [...v, o.id]
                            : v.filter((x) => x !== o.id),
                        )
                      }
                    />
                    {o.name}
                  </span>
                  <span>{money(o.price)}</span>
                </label>
              ))
            ) : (
              <p className="subtitle">
                Perfect just the way it is. No add-ons for this item.
              </p>
            )}
            <button
              className="button primary"
              style={{ width: "100%", marginTop: 30, padding: 14 }}
              onClick={() => add(adding, options)}
            >
              Add to your bag ·{" "}
              {money(
                adding.price +
                  options.reduce(
                    (s, id) =>
                      s + (adding.options.find((o) => o.id === id)?.price || 0),
                    0,
                  ),
              )}
              <ArrowRight />
            </button>
          </section>
        </div>
      )}
      {drawer && (
        <div className="overlay" onClick={() => !busy && setDrawer(false)}>
          <section
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkout-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-head">
              <h2 id="checkout-title">Your bag of goodness.</h2>
              <button
                disabled={busy}
                className="icon-button"
                aria-label="Close checkout"
                onClick={() => setDrawer(false)}
              >
                <X />
              </button>
            </div>
            {cart.length ? (
              cart.map((r) => (
                <div className="cart-item" key={r.key}>
                  <img src={r.item.image} alt="" />
                  <div style={{ flex: 1 }}>
                    <strong style={{ fontSize: 12 }}>{r.item.name}</strong>
                    <p
                      className="subtitle"
                      style={{ fontSize: 10, marginTop: 3 }}
                    >
                      {r.optionIds
                        .map(
                          (id) => r.item.options.find((o) => o.id === id)?.name,
                        )
                        .join(", ") || money(r.item.price)}
                    </p>
                  </div>
                  <div className="quantity">
                    <button
                      aria-label={"Remove one " + r.item.name}
                      onClick={() => qty(r.key, -1)}
                      disabled={busy}
                    >
                      −
                    </button>
                    {r.quantity}
                    <button
                      aria-label={"Add one " + r.item.name}
                      onClick={() => qty(r.key, 1)}
                      disabled={busy}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="subtitle">
                Your bag is empty. A world of good food awaits.
              </p>
            )}
            <form onSubmit={checkout}>
              <fieldset
                disabled={busy}
                style={{ border: 0, padding: 0, margin: 0 }}
              >
                <section className="detail-section">
                  <h3>How are we meeting?</h3>
                  <div style={{ display: "flex", gap: 10 }}>
                    {(["pickup", "delivery"] as const).map((f) => (
                      <button
                        className={
                          "button " + (fulfillment === f ? "primary" : "")
                        }
                        key={f}
                        type="button"
                        onClick={() => {
                          setFulfillment(f);
                          invalidate();
                        }}
                      >
                        {f === "pickup" ? <ShoppingBag /> : <Truck />}
                        {f === "pickup" ? "I’ll pick it up" : "Bring it to me"}
                      </button>
                    ))}
                  </div>
                  {fulfillment === "delivery" && (
                    <div style={{ marginTop: 20 }}>
                      <label htmlFor="delivery-address">Delivery address</label>
                      <textarea
                        id="delivery-address"
                        required
                        minLength={5}
                        maxLength={300}
                        value={address}
                        onChange={(e) => {
                          setAddress(e.target.value);
                          invalidate();
                        }}
                        placeholder="House, street, and a helpful landmark"
                      />
                      <label htmlFor="delivery-area" style={{ marginTop: 15 }}>
                        Delivery area
                      </label>
                      <select
                        id="delivery-area"
                        value={area}
                        onChange={(e) => {
                          setArea(e.target.value);
                          invalidate();
                        }}
                      >
                        {data.restaurant.settings.deliveryAreas.map((a) => (
                          <option key={a}>{a}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </section>
                <section className="detail-section">
                  <h3>Your details</h3>
                  {customer ? (
                    <p>
                      {customer.name}
                      <br />
                      {customer.phone}
                      <br />
                      <small>
                        Verified demo identity · contact is bound to your
                        session
                      </small>
                    </p>
                  ) : (
                    <p className="error-text">
                      A secure conversation link is required for checkout.
                    </p>
                  )}
                  <label htmlFor="notes" style={{ marginTop: 15 }}>
                    Anything we should know? (optional)
                  </label>
                  <textarea
                    id="notes"
                    maxLength={500}
                    value={notes}
                    onChange={(e) => {
                      setNotes(e.target.value);
                      invalidate();
                    }}
                    placeholder="Allergies or a little note for the kitchen"
                  />
                </section>
                <section className="detail-section">
                  <h3>Payment, your way.</h3>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      type="button"
                      className={
                        "button " + (payment === "cod" ? "primary" : "")
                      }
                      onClick={() => {
                        setPayment("cod");
                        invalidate();
                      }}
                    >
                      Pay on {fulfillment === "pickup" ? "pickup" : "delivery"}
                    </button>
                    <button
                      type="button"
                      className={
                        "button " + (payment === "online" ? "primary" : "")
                      }
                      onClick={() => {
                        setPayment("online");
                        invalidate();
                      }}
                    >
                      Online · simulated
                    </button>
                  </div>
                  {payment === "online" && (
                    <p className="subtitle">
                      No money will be charged. Staff can simulate payment in
                      the dashboard before accepting your order.
                    </p>
                  )}
                </section>
                <section className="detail-section">
                  {[
                    ["Subtotal", subtotal],
                    ["Demo tax", tax],
                    ["Packaging", packaging],
                    ["Delivery", deliveryFee],
                  ].map(([label, v]) => (
                    <div className="detail-row muted" key={String(label)}>
                      <span>{label}</span>
                      <span>{money(Number(v))}</span>
                    </div>
                  ))}
                  <div className="detail-row total-row">
                    <span>Your total</span>
                    <span>{money(total)}</span>
                  </div>
                  <small className="muted">
                    All charges are shown. Minimum subtotal:{" "}
                    {money(data.restaurant.settings.minimumOrder)}.
                  </small>
                </section>
                <label
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                    fontWeight: 400,
                    color: "#929883",
                    fontSize: 10,
                    lineHeight: 1.8,
                    margin: "20px 0",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={consent}
                    style={{ width: 15, marginTop: 3, accentColor: "#bd5133" }}
                    onChange={(e) => {
                      setConsent(e.target.checked);
                      invalidate();
                    }}
                  />
                  Keep me in the loop about offers. Optional, and separate from
                  order updates.
                </label>
                {error && (
                  <p className="error-text" role="alert">
                    {error}
                  </p>
                )}
                <button
                  className="button primary"
                  style={{ width: "100%", padding: 15 }}
                  type="submit"
                  disabled={
                    !customer ||
                    !cart.length ||
                    busy ||
                    subtotal < data.restaurant.settings.minimumOrder
                  }
                >
                  {busy ? (
                    <LoaderCircle className="spin" />
                  ) : (
                    <>
                      Place my order · {money(total)} <ArrowRight />
                    </>
                  )}
                </button>
                <p
                  className="subtitle"
                  style={{ textAlign: "center", fontSize: 10 }}
                >
                  Your order is confirmed only after the restaurant accepts it.
                </p>
              </fieldset>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
