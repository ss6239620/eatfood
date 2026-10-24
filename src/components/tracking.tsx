"use client";
import { api } from "@/lib/client";
import type { Order } from "@/lib/types";
import { labels, money, time } from "@/lib/utils";
import {
  Check,
  Clock3,
  Leaf,
  Phone,
  ShoppingBag,
  Truck,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Brand } from "./brand";
export default function Tracking({ token }: { token: string }) {
  const [data, setData] = useState<{
      order: Order;
      restaurant: { name: string; phone: string };
      events: { kind: string; reason: string; created_at: string }[];
    } | null>(null),
    [error, setError] = useState(""),
    [offline, setOffline] = useState(false);
  useEffect(() => {
    let active = true;
    const load = () =>
      api("public/tracking?token=" + encodeURIComponent(token))
        .then((d) => {
          if (active) {
            setData(d);
            setError("");
            setOffline(false);
          }
        })
        .catch((e) => {
          if (active) {
            setError(e.message);
            setOffline(true);
          }
        });
    load();
    const t = setInterval(load, 5000);
    window.addEventListener("online", load);
    return () => {
      active = false;
      clearInterval(t);
      window.removeEventListener("online", load);
    };
  }, [token]);
  if (!data)
    return (
      <div className="loading">
        {error || "Finding your little bag of goodness…"}
      </div>
    );
  const o = data.order,
    exception = ["rejected", "cancelled", "delivery_failed"].includes(o.status),
    steps = [
      "awaiting",
      "accepted",
      "preparing",
      "ready",
      ...(o.fulfillment === "delivery"
        ? ["out_for_delivery", "delivered"]
        : ["collected"]),
    ],
    index = steps.indexOf(o.status);
  return (
    <main className="tracking">
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Brand />
        <span className="demo-label">LOCAL DEMO</span>
      </header>
      {offline && (
        <div className="notice warning" role="alert" style={{ marginTop: 20 }}>
          Connection lost. Showing the last confirmed state; retrying
          automatically.
        </div>
      )}
      <section className="track-hero">
        <div
          className="track-icon"
          style={exception ? { background: "#f4e7de", color: "#b26b4b" } : {}}
        >
          {exception ? (
            <X size={29} />
          ) : ["delivered", "collected"].includes(o.status) ? (
            <Check size={29} />
          ) : o.status === "out_for_delivery" ? (
            <Truck size={29} />
          ) : (
            <ShoppingBag size={29} />
          )}
        </div>
        <div className="eyebrow muted" style={{ marginBottom: 10 }}>
          {data.restaurant.name} · {o.reference}
        </div>
        <h1>
          {o.status === "awaiting"
            ? "Your order is in good hands."
            : o.status === "accepted"
              ? "We’re getting started."
              : o.status === "preparing"
                ? "A little goodness in the making."
                : o.status === "ready"
                  ? "Fresh, packed, and ready."
                  : o.status === "out_for_delivery"
                    ? "Good food is on its way."
                    : o.status === "delivered" || o.status === "collected"
                      ? "Hope that hit the spot."
                      : "A little change of plans."}
        </h1>
        <p className="subtitle">
          {o.status === "awaiting"
            ? "Awaiting restaurant acceptance. We’ll keep this page up to date."
            : labels[o.status] +
              (o.estimate && !exception
                ? " · Estimated preparation: " + o.estimate + " minutes"
                : "")}
        </p>
      </section>
      {!exception && (
        <div className="track-steps">
          {steps.map((s, i) => (
            <div className={"track-step " + (i <= index ? "done" : "")} key={s}>
              <span>
                {i <= index ? <Check size={12} /> : <Clock3 size={11} />}
              </span>
              {s === "awaiting" ? "Submitted" : labels[s]}
            </div>
          ))}
        </div>
      )}
      {exception && (
        <div className="notice warning">
          <div>
            <strong>{labels[o.status]}</strong>
            <p>
              {data.events.filter((e) => e.kind === o.status).at(-1)?.reason}
            </p>
            {o.payment_status === "refund_pending" && (
              <p>Payment received. Restaurant staff must review the refund.</p>
            )}
          </div>
        </div>
      )}
      <div className="panel">
        <h3>Your little bag of goodness</h3>
        {o.items.map((i, n) => (
          <div className="detail-row" key={n} style={{ margin: "20px 0" }}>
            <span>
              {i.quantity} × {i.name}
              <small
                className="muted"
                style={{ display: "block", marginTop: 4 }}
              >
                {i.options.map((x) => x.name).join(", ")}
              </small>
            </span>
            <span>{money(i.total)}</span>
          </div>
        ))}
        {[
          ["Demo tax", o.tax],
          ["Packaging", o.packaging],
          ["Delivery", o.delivery_fee],
        ].map(([k, v]) => (
          <div className="detail-row muted" key={String(k)}>
            <span>{k}</span>
            <span>{money(Number(v))}</span>
          </div>
        ))}
        <div className="detail-row total-row">
          <span>Total</span>
          <span>{money(o.total)}</span>
        </div>
        <div className="detail-row">
          <span className="muted">
            {o.payment_method === "cod"
              ? "Pay on " + (o.fulfillment === "pickup" ? "pickup" : "delivery")
              : "Simulated online payment"}
          </span>
          <span className="status-tag">
            {o.payment_status.replaceAll("_", " ")}
          </span>
        </div>
        {o.simulated_payment && (
          <p className="subtitle">No real money has been charged.</p>
        )}
      </div>
      <div className="panel" style={{ marginTop: 18 }}>
        <h3>A friendly update</h3>
        <p className="subtitle">
          WhatsApp messages are simulated in this demo. This page shows the
          latest server-confirmed order state.
        </p>
        <a
          className="button"
          href={"tel:" + data.restaurant.phone}
          style={{ marginTop: 17 }}
        >
          <Phone size={14} />
          Contact the restaurant
        </a>
      </div>
      <p
        className="subtitle"
        style={{ textAlign: "center", fontSize: 10, marginTop: 25 }}
      >
        Updated {time(o.updated_at)} · Asia/Kolkata{" "}
        <Leaf size={11} style={{ display: "inline", marginLeft: 5 }} />
      </p>
    </main>
  );
}
