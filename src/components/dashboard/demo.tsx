"use client";
import { post } from "@/lib/client";
import { time } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  FlaskConical,
} from "lucide-react";
import { useState } from "react";
import { Heading } from "./shared";
import type { Data } from "./types";
export default function DemoView({
  data,
  action,
  notify,
  busy,
  open,
}: {
  data: Data;
  action: (fn: () => Promise<unknown>, message?: string) => Promise<void>;
  notify: (s: string, e?: boolean) => void;
  busy: boolean;
  open: (id: string) => void;
}) {
  const [result, setResult] = useState<{
      id: string;
      reference: string;
      trackingPath: string;
      duplicate: boolean;
    } | null>(null),
    [link, setLink] = useState(""),
    [payload, setPayload] = useState(() =>
      JSON.stringify(
        {
          version: 1,
          eventId: "demo-" + crypto.randomUUID(),
          restaurantId: data.restaurant.id,
          customer: {
            id: "demo-diner",
            name: "Alex Morgan",
            phone: "+919876543210",
            verified: true,
          },
          items: [{ id: "paneer-tikka", quantity: 1, optionIds: [] }],
          fulfillment: "pickup",
          paymentMethod: "cod",
          notes: "A little extra mint chutney, please.",
        },
        null,
        2,
      ),
    );
  return (
    <>
      <Heading
        title="A little playground. A complete order."
        subtitle="See the whole experience, from the first hello to the final happy customer."
      />
      <div className="notice warning">
        <FlaskConical size={18} />
        <div>
          <strong>Everything here is a simulation.</strong> Orders use the real
          database and validation. WhatsApp messages and online payments are
          simulated.
        </div>
      </div>
      <div className="demo-grid">
        <section className="panel">
          <div className="eyebrow muted" style={{ marginBottom: 12 }}>
            01 · THE CUSTOMER EXPERIENCE
          </div>
          <h2>It starts with “hello”.</h2>
          <p className="subtitle" style={{ marginBottom: 22 }}>
            Simulate an incoming WhatsApp message. We’ll create a verified demo
            customer session and a secure, 30-minute menu link.
          </p>
          <button
            className="button primary"
            disabled={busy}
            onClick={() =>
              action(async () => {
                const r = await post("demo/start");
                setLink(r.menuPath);
              }, "Simulated conversation started. Your menu link is ready.")
            }
          >
            Start a conversation <ArrowRight />
          </button>
          {link && (
            <div style={{ marginTop: 20 }}>
              <div className="code">
                Hi Alex! Welcome to {data.restaurant.name}.<br />
                Ready for something good? Your menu is ready.
                <br />
                <span className="muted">
                  Simulated reply · no WhatsApp message sent
                </span>
              </div>
              <a
                className="button"
                href={link}
                target="_blank"
                rel="noreferrer"
                style={{ marginTop: 15 }}
              >
                Open customer menu <ExternalLink />
              </a>
            </div>
          )}
        </section>
        <section className="panel">
          <div className="eyebrow muted" style={{ marginBottom: 12 }}>
            02 · THE INTEGRATION
          </div>
          <h2>One callback. One order.</h2>
          <p className="subtitle" style={{ marginBottom: 15 }}>
            The simulator runs the same order service as the signed callback
            endpoint. Replay the event to check duplicate protection.
          </p>
          <label htmlFor="payload">Structured callback payload</label>
          <textarea
            id="payload"
            className="code"
            style={{ height: 245, resize: "vertical", width: "100%" }}
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            spellCheck={false}
          />
          <div
            style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 15 }}
          >
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                action(async () => {
                  const r = await post("demo/callback", JSON.parse(payload));
                  setResult(r);
                }, "Callback processed. Check the response below.")
              }
            >
              Send callback <ArrowRight />
            </button>
            <button
              className="button"
              onClick={() => {
                try {
                  const p = JSON.parse(payload);
                  p.eventId = "demo-" + crypto.randomUUID();
                  setPayload(JSON.stringify(p, null, 2));
                  setResult(null);
                } catch {
                  notify("Correct the JSON first.", true);
                }
              }}
            >
              New event ID
            </button>
          </div>
          {result && (
            <div style={{ marginTop: 15 }}>
              <div className="code">{JSON.stringify(result, null, 2)}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button
                  className="button small"
                  onClick={() => open(result.id)}
                >
                  View order
                </button>
                <a
                  className="button small"
                  href={result.trackingPath}
                  target="_blank"
                  rel="noreferrer"
                >
                  Track order <ExternalLink />
                </a>
              </div>
            </div>
          )}
        </section>
        <section className="panel">
          <h2>Make a little trouble.</h2>
          <p className="subtitle" style={{ marginBottom: 18 }}>
            Queue a failing notification to see bounded retries and the
            exceptions queue. Open an online order to simulate payment success,
            failure, or a refund.
          </p>
          <button
            className="button"
            disabled={busy}
            onClick={() =>
              action(
                () => post("demo/message-failure"),
                "Failing job queued. It will retry four times before appearing in Needs attention.",
              )
            }
          >
            <AlertTriangle />
            Simulate message failure
          </button>
        </section>
        <section className="panel">
          <h2>The callback contract</h2>
          <div className="code" style={{ marginTop: 15 }}>
            POST /api/integrations/whatsapp/orders
            <br />
            X-EatFood-Timestamp: unix-seconds
            <br />
            X-EatFood-Signature: sha256=HMAC
            <br />
            <br />
            HMAC-SHA256(secret, timestamp + "." + rawBody)
            <br />
            Signature expires after 5 minutes.
          </div>
          <p className="subtitle">
            Use the signed callback script in the repository for a real HTTP
            request. The secret remains on the server.
          </p>
        </section>
      </div>
      <h2 style={{ margin: "30px 0 16px" }}>The message outbox</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Message</th>
              <th>State</th>
              <th>Attempts</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {data.jobs.map((j) => (
              <tr key={j.id}>
                <td>
                  {j.kind.replaceAll("_", " ")}
                  {j.error && (
                    <p
                      className="error-text"
                      style={{ fontSize: 10, margin: 3 }}
                    >
                      {j.error}
                    </p>
                  )}
                </td>
                <td>
                  <span className="status-tag">
                    {j.status === "simulated"
                      ? "Simulated · not sent"
                      : j.status}
                  </span>
                </td>
                <td>{j.attempts} / 4</td>
                <td>{time(j.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.jobs.length && (
          <p style={{ padding: 25, textAlign: "center" }} className="muted">
            Start a conversation or create an order to see message jobs.
          </p>
        )}
      </div>
    </>
  );
}
