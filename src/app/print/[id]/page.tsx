import PrintButton from "@/components/print-button";
import { requireStaff } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getOrder } from "@/lib/orders";
import type { Order } from "@/lib/types";
import { money, time } from "@/lib/utils";
import { notFound, redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function PrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kind?: string }>;
}) {
  const staff = await requireStaff().catch(() => null);
  if (!staff) redirect("/login");
  const { id } = await params;
  const { kind } = await searchParams;
  const isBill = kind === "bill";
  let o: Order;
  let restaurant: { name: string; address: string; billingDetails: string };
  let number = "";
  let issuedAt = "";
  let width = "80mm";
  try {
    const detail = await getOrder(id, staff.restaurant_id);
    o = detail.order;
    const [r] =
      await sql`SELECT * FROM restaurants WHERE id=${staff.restaurant_id}`;
    restaurant = {
      name: r.name,
      address: r.settings.address,
      billingDetails: r.settings.billingDetails,
    };
    width = r.settings.printWidth;
    if (isBill) {
      const [b] =
        await sql`SELECT * FROM bills WHERE order_id=${id} AND restaurant_id=${staff.restaurant_id}`;
      if (!b)
        return (
          <main style={{ padding: 40 }}>
            Issue this bill from the order detail first.
          </main>
        );
      o = b.snapshot.order;
      restaurant = b.snapshot.restaurant;
      number = b.number;
      issuedAt = b.snapshot.issuedAt;
    }
  } catch {
    notFound();
  }
  return (
    <main style={{ padding: 30 }}>
      <div
        className="no-print"
        style={{ maxWidth: 600, margin: "0 auto 30px", textAlign: "center" }}
      >
        <PrintButton />
        <p className="subtitle">
          Sample document. Verify billing details and printer settings before a
          live pilot.
        </p>
      </div>
      <style>{`@media print { @page { size: ${width === "A4" ? "A4" : "80mm auto"}; margin: 5mm; } }`}</style>
      <article
        className="print-document"
        style={{
          maxWidth: width === "A4" ? 700 : 302,
          margin: "auto",
          padding: 20,
          background: "white",
          fontFamily: "ui-monospace,monospace",
          fontSize: 11,
        }}
      >
        <h1 style={{ fontSize: 19, textAlign: "center" }}>{restaurant.name}</h1>
        <p style={{ textAlign: "center", margin: "10px 0", lineHeight: 1.7 }}>
          {isBill ? restaurant.address : "KITCHEN TICKET"}
        </p>
        <hr />
        <p style={{ margin: "12px 0", lineHeight: 1.9 }}>
          <strong>{isBill ? number : "KOT · " + o.reference}</strong>
          <br />
          Order {o.reference}
          <br />
          {new Date(issuedAt || o.created_at).toLocaleDateString("en-IN", {
            timeZone: "Asia/Kolkata",
          })}{" "}
          {time(issuedAt || o.created_at)}
          <br />
          <strong>{o.fulfillment.toUpperCase()}</strong>
        </p>
        <hr />
        {o.items.map((i, n) => (
          <div
            key={n}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              margin: "13px 0",
              lineHeight: 1.6,
            }}
          >
            <span>
              {i.quantity} × {i.name}
              {i.options.length > 0 && (
                <>
                  <br />
                  {i.options.map((o) => o.name).join(", ")}
                </>
              )}
            </span>
            {isBill && <span>{money(i.total)}</span>}
          </div>
        ))}
        {o.notes && (
          <p style={{ borderTop: "1px dashed #aaa", paddingTop: 10 }}>
            NOTE: {o.notes}
          </p>
        )}
        {isBill && (
          <>
            <hr />
            {[
              ["Subtotal", o.subtotal],
              ["Demo tax", o.tax],
              ["Packaging", o.packaging],
              ["Delivery", o.delivery_fee],
              ["TOTAL", o.total],
            ].map(([k, v]) => (
              <div
                key={String(k)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  margin: "10px 0",
                  fontWeight: k === "TOTAL" ? "bold" : "normal",
                }}
              >
                <span>{k}</span>
                <span>{money(Number(v))}</span>
              </div>
            ))}
            <hr />
            <p style={{ lineHeight: 1.8 }}>
              Payment at issue: {o.payment_status}
              <br />
              Method: {o.simulated_payment ? "SIMULATED online" : "COD"}
            </p>
            <p style={{ marginTop: 15, fontSize: 9, lineHeight: 1.8 }}>
              {restaurant.billingDetails}
            </p>
          </>
        )}
        <p style={{ textAlign: "center", marginTop: 20, fontSize: 9 }}>
          DEMONSTRATION DOCUMENT
          <br />
          {isBill
            ? "Not a verified tax invoice."
            : "For kitchen preparation only."}
        </p>
      </article>
    </main>
  );
}
