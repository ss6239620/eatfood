"use client";
import { api, post } from "@/lib/client";
import { nextStates, terminal } from "@/lib/domain";
import type { Order, Staff } from "@/lib/types";
import { labels, money, time } from "@/lib/utils";
import { AlertTriangle, Printer, Wallet, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { Event, Job } from "./types";
export default function OrderDrawer({
  id,
  staff,
  onClose,
  refresh,
  notify,
}: {
  id: string;
  staff: Staff;
  onClose: () => void;
  refresh: () => Promise<void>;
  notify: (s: string, e?: boolean) => void;
}) {
  const [detail, setDetail] = useState<{
      order: Order;
      events: Event[];
      messages: Job[];
    } | null>(null),
    [busy, setBusy] = useState(false),
    [reason, setReason] = useState(""),
    [estimate, setEstimate] = useState(20),
    [correction, setCorrection] = useState("preparing"),
    [loadError, setLoadError] = useState("");
  const load = useCallback(async () => {
    try {
      setDetail(await api("orders/" + id));
      setLoadError("");
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [id]);
  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);
  async function run(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await fn();
      await load();
      await refresh();
      notify(message);
    } catch (e) {
      notify((e as Error).message, true);
      await load();
    } finally {
      setBusy(false);
    }
  }
  const o = detail?.order;
  async function change(status: string, isCorrection = false) {
    if (!o) return;
    await run(
      () =>
        post("orders/" + id + "/transition", {
          status,
          version: o.version,
          estimate,
          reason,
          correction: isCorrection,
        }),
      "Order updated.",
    );
  }
  async function pay(kind: string) {
    if (!o) return;
    await run(
      async () => {
        const r = await post("orders/" + id + "/payment", {
          eventId: "payment-" + crypto.randomUUID(),
          kind,
          amount: o.total,
          currency: "INR",
        });
        if (r.review) throw new Error("Payment needs review.");
      },
      kind === "cod"
        ? "COD collection recorded."
        : "Simulated payment event recorded.",
    );
  }
  return (
    <div className="overlay" onClick={onClose}>
      <section
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <div>
            <div className="eyebrow muted" style={{ marginBottom: 8 }}>
              THE ORDER DETAILS
            </div>
            <h2 id="order-title">{o?.reference || "Getting your order…"}</h2>
          </div>
          <button
            autoFocus
            className="icon-button"
            aria-label="Close order details"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {loadError && (
          <p role="alert" className="error-text">
            {loadError}
          </p>
        )}
        {o && (
          <>
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span className={"status-tag " + o.status}>
                {labels[o.status]}
              </span>
              <span className="muted" style={{ fontSize: 11 }}>
                {time(o.created_at)} · {o.fulfillment}
              </span>
            </div>
            {o.review_reason && (
              <div className="notice warning" style={{ margin: "18px 0 0" }}>
                <AlertTriangle size={16} />
                <div style={{ flex: 1 }}>
                  {o.review_reason}
                  {staff.role === "owner" &&
                    o.payment_status !== "refund_pending" && (
                      <div style={{ marginTop: 10 }}>
                        <label htmlFor="resolve-reason">Resolution note</label>
                        <input
                          id="resolve-reason"
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="What was checked and resolved?"
                          maxLength={500}
                        />
                        <button
                          className="button small"
                          style={{ marginTop: 8 }}
                          disabled={busy || reason.trim().length < 3}
                          onClick={() =>
                            run(
                              () =>
                                post("orders/" + id + "/review", { reason }),
                              "Review resolved with an audit record.",
                            )
                          }
                        >
                          Resolve review
                        </button>
                      </div>
                    )}
                </div>
              </div>
            )}
            <section className="detail-section">
              <h3>A little about the customer</h3>
              <p>
                <strong style={{ color: "#48533c" }}>{o.customer_name}</strong>
                <br />
                {o.phone}
                {o.address && (
                  <>
                    <br />
                    {o.address.line}
                    <br />
                    {o.address.area}
                  </>
                )}
              </p>
              {o.notes && <div className="card-note">{o.notes}</div>}
            </section>
            <section className="detail-section">
              <h3>Something good is on the way</h3>
              {o.items.map((i, n) => (
                <div key={n} className="detail-row">
                  <div>
                    {i.quantity} × {i.name}
                    <small
                      className="muted"
                      style={{ display: "block", marginTop: 4 }}
                    >
                      {i.options.map((o) => o.name).join(", ")}
                    </small>
                  </div>
                  <span>{money(i.total)}</span>
                </div>
              ))}
              <div style={{ marginTop: 22 }}>
                {[
                  ["Subtotal", o.subtotal],
                  ["Demo tax", o.tax],
                  ["Packaging", o.packaging],
                  ["Delivery", o.delivery_fee],
                ].map(([name, v]) => (
                  <div className="detail-row muted" key={String(name)}>
                    <span>{name}</span>
                    <span>{money(Number(v))}</span>
                  </div>
                ))}
                <div className="detail-row total-row">
                  <span>Total</span>
                  <span>{money(o.total)}</span>
                </div>
              </div>
            </section>
            <section className="detail-section">
              <div className="detail-row">
                <h3>Payment</h3>
                <span className="status-tag">
                  {o.payment_status.replaceAll("_", " ")}
                </span>
              </div>
              <p>
                {o.payment_method === "cod"
                  ? "Cash on delivery / collection"
                  : "Simulated online payment · no money charged"}
              </p>
              {o.payment_method === "cod" &&
                o.payment_status !== "paid" &&
                !["rejected", "cancelled"].includes(o.status) && (
                  <button
                    disabled={busy}
                    className="button"
                    style={{ marginTop: 12 }}
                    onClick={() => pay("cod")}
                  >
                    <Wallet />
                    Record COD collected
                  </button>
                )}
              {o.payment_method === "online" && (
                <div
                  style={{
                    marginTop: 12,
                    display: "flex",
                    gap: 7,
                    flexWrap: "wrap",
                  }}
                >
                  {["pending", "failed"].includes(o.payment_status) && (
                    <>
                      <button
                        disabled={busy}
                        className="button"
                        onClick={() => pay("success")}
                      >
                        Simulate success
                      </button>
                      <button
                        disabled={busy}
                        className="button"
                        onClick={() => pay("failed")}
                      >
                        Simulate failure
                      </button>
                    </>
                  )}
                  {o.payment_status === "refund_pending" &&
                    staff.role === "owner" && (
                      <button
                        disabled={busy}
                        className="button"
                        onClick={() => pay("refund")}
                      >
                        Confirm simulated refund
                      </button>
                    )}
                </div>
              )}
            </section>
            <section className="detail-section">
              <h3>The next little step</h3>
              {!terminal.includes(o.status) ? (
                <>
                  <div className="form-grid" style={{ gap: 12 }}>
                    {o.status === "awaiting" && (
                      <div className="field full">
                        <label htmlFor="estimate">
                          Preparation estimate (minutes)
                        </label>
                        <input
                          id="estimate"
                          type="number"
                          min="1"
                          max="180"
                          value={estimate}
                          onChange={(e) => setEstimate(Number(e.target.value))}
                        />
                      </div>
                    )}
                    <div className="field full">
                      <label htmlFor="reason">Reason / customer note</label>
                      <textarea
                        id="reason"
                        maxLength={500}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Required for rejection, cancellation or delivery failure"
                      />
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      marginTop: 16,
                    }}
                  >
                    {nextStates(o.status, o.fulfillment).map((s, i) => (
                      <button
                        disabled={busy}
                        className={"button " + (i === 0 ? "primary" : "danger")}
                        key={s}
                        onClick={() => change(s)}
                      >
                        {s === "accepted"
                          ? "Accept order"
                          : s === "preparing"
                            ? "Start preparing"
                            : s === "ready"
                              ? "Mark ready"
                              : s === "collected"
                                ? "Mark collected"
                                : s === "delivered"
                                  ? "Mark delivered"
                                  : labels[s]}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <p>This order is {labels[o.status]?.toLowerCase()}.</p>
                  {staff.role === "owner" && (
                    <details style={{ marginTop: 15 }}>
                      <summary
                        style={{
                          fontSize: 11,
                          color: "#9c694c",
                          cursor: "pointer",
                        }}
                      >
                        Correct a mistaken terminal state
                      </summary>
                      <label
                        htmlFor="correction-state"
                        style={{ marginTop: 15 }}
                      >
                        Corrected state
                      </label>
                      <select
                        id="correction-state"
                        value={correction}
                        onChange={(e) => setCorrection(e.target.value)}
                      >
                        {[
                          "accepted",
                          "preparing",
                          "ready",
                          ...(o.fulfillment === "delivery"
                            ? ["out_for_delivery"]
                            : []),
                        ].map((s) => (
                          <option key={s} value={s}>
                            {labels[s]}
                          </option>
                        ))}
                      </select>
                      <label
                        htmlFor="correction-reason"
                        style={{ marginTop: 15 }}
                      >
                        Audit reason
                      </label>
                      <textarea
                        id="correction-reason"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                      <button
                        className="button"
                        style={{ marginTop: 10 }}
                        disabled={busy}
                        onClick={() => change(correction, true)}
                      >
                        Record owner correction
                      </button>
                    </details>
                  )}
                </>
              )}
            </section>
            <section className="detail-section">
              <h3>From kitchen to customer</h3>
              <div style={{ display: "flex", gap: 10 }}>
                <a
                  className="button"
                  href={"/print/" + id + "?kind=ticket"}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Printer />
                  Kitchen ticket
                </a>
                <button
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await post("orders/" + id + "/bill");
                      window.open("/print/" + id + "?kind=bill", "_blank");
                    }, "Sample bill issued. Reprints preserve this snapshot.")
                  }
                >
                  <Printer />
                  Bill / reprint
                </button>
              </div>
              <p className="subtitle">
                Demo documents · browser print dialog · not a verified tax
                invoice.
              </p>
            </section>
            <section className="detail-section">
              <h3>Order timeline</h3>
              {detail.events.map((e) => (
                <div className="event" key={e.id}>
                  <strong>
                    {labels[e.kind] || e.kind.replaceAll("_", " ")}
                  </strong>
                  <br />
                  {e.reason && (
                    <span className="muted">
                      {e.reason}
                      <br />
                    </span>
                  )}
                  <small>
                    {time(e.created_at)} · {e.actor}
                  </small>
                </div>
              ))}
            </section>
            <section className="detail-section">
              <h3>
                WhatsApp updates{" "}
                <span className="demo-label" style={{ marginLeft: 7 }}>
                  SIMULATED
                </span>
              </h3>
              {detail.messages.length ? (
                detail.messages.map((m) => (
                  <div key={m.id} className="detail-row">
                    <span>
                      {m.kind.replaceAll("_", " ")}
                      {m.error && <p className="error-text">{m.error}</p>}
                    </span>
                    <span className="muted">
                      {m.status === "simulated"
                        ? "Simulated · not sent"
                        : m.status}
                    </span>
                  </div>
                ))
              ) : (
                <p>No message jobs for this sample order.</p>
              )}
            </section>
          </>
        )}
      </section>
    </div>
  );
}
