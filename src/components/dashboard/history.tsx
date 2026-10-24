"use client";
import { labels, money, time } from "@/lib/utils";
import {
  ArrowUpRight,
  Clock3,
  FlaskConical,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { Heading, Metric } from "./shared";
import type { Data } from "./types";
export default function HistoryView({
  data,
  open,
}: {
  data: Data;
  open: (id: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("all"),
    [payment, setPayment] = useState("all"),
    [date, setDate] = useState("");
  const orders = data.orders.filter(
    (o) =>
      (o.reference + " " + o.customer_name)
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (status === "all" || o.status === status) &&
      (payment === "all" || o.payment_status === payment) &&
      (!date ||
        new Date(o.created_at).toLocaleDateString("en-CA", {
          timeZone: "Asia/Kolkata",
        }) === date),
  );
  return (
    <>
      <Heading
        title="Every order has a story."
        subtitle="Your order history and daily collections, with every detail accounted for."
      />
      <div className="metrics">
        <Metric
          label="Verified online"
          value={money(data.summary.verified_online)}
          icon={Wallet}
          note="Actual provider-confirmed funds"
        />
        <Metric
          label="Simulated online"
          value={money(data.summary.simulated_online)}
          icon={FlaskConical}
          note="Demo amounts · no real charges"
        />
        <Metric
          label="Unpaid order value"
          value={money(data.summary.unpaid)}
          icon={Clock3}
          note="Open orders awaiting payment"
        />
        <Metric
          label="Refund records"
          value={money(data.summary.refunds)}
          icon={RefreshCw}
          note="Includes labeled simulated refunds"
        />
      </div>
      <div
        className="form-grid history-filters"
        style={{
          gap: 12,
          marginBottom: 20,
        }}
      >
        <input
          aria-label="Search history"
          placeholder="Search reference or customer…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="Fulfillment status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All statuses</option>
          {Object.entries(labels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          aria-label="Payment status"
          value={payment}
          onChange={(e) => setPayment(e.target.value)}
        >
          <option value="all">All payments</option>
          {[
            "unpaid",
            "pending",
            "paid",
            "failed",
            "refund_pending",
            "refunded",
          ].map((x) => (
            <option key={x} value={x}>
              {x.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <input
          type="date"
          aria-label="Order date in India"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Fulfillment</th>
              <th>Status</th>
              <th>Payment</th>
              <th>Total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>
                  <strong>{o.reference}</strong>
                  <p className="muted" style={{ marginTop: 5, fontSize: 10 }}>
                    {new Date(o.created_at).toLocaleDateString("en-IN", {
                      timeZone: "Asia/Kolkata",
                    })}{" "}
                    · {time(o.created_at)}
                  </p>
                </td>
                <td>{o.customer_name}</td>
                <td>{o.fulfillment}</td>
                <td>
                  <span className={"status-tag " + o.status}>
                    {labels[o.status]}
                  </span>
                </td>
                <td>
                  {o.simulated_payment ? "Test online" : "COD"} ·{" "}
                  {o.payment_status.replaceAll("_", " ")}
                </td>
                <td>{money(o.total)}</td>
                <td>
                  <button
                    className="icon-button"
                    aria-label={"Open " + o.reference}
                    onClick={() => open(o.id)}
                  >
                    <ArrowUpRight size={17} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!orders.length && (
          <div style={{ padding: 40, textAlign: "center", color: "#909781" }}>
            No orders match these filters.
          </div>
        )}
      </div>
      <p className="subtitle">
        Showing up to 500 most recent orders. Daily figures use Asia/Kolkata
        time.
      </p>
    </>
  );
}
