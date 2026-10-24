"use client";
import { api } from "@/lib/client";
import type { Settings as RestaurantSettings, Staff } from "@/lib/types";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { Heading } from "./shared";
import type { Data } from "./types";
export default function SettingsView({
  data,
  action,
  busy,
}: {
  data: Data;
  action: (fn: () => Promise<unknown>, message?: string) => Promise<void>;
  busy: boolean;
}) {
  const [s, setS] = useState(data.restaurant.settings),
    [members, setMembers] = useState<Staff[]>([]);
  useEffect(() => {
    if (data.staff.role === "owner")
      api("staff")
        .then(setMembers)
        .catch(() => {});
  }, [data.staff.role]);
  const set = (key: keyof RestaurantSettings, value: unknown) =>
    setS({ ...s, [key]: value });
  if (data.staff.role !== "owner")
    return (
      <>
        <Heading
          title="Your kitchen’s settings."
          subtitle="Ask your owner to update restaurant settings and staff access."
        />
        <div className="panel">
          <h3>{data.restaurant.name}</h3>
          <p className="subtitle">
            {s.address}
            <br />
            {s.phone}
          </p>
        </div>
      </>
    );
  return (
    <>
      <Heading
        title="Make yourself at home."
        subtitle="The details that make your restaurant yours."
      />
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          action(
            () => api("settings", { method: "PATCH", body: JSON.stringify(s) }),
            "Restaurant settings saved.",
          );
        }}
      >
        <h2 style={{ marginBottom: 24 }}>Restaurant & service</h2>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="address">Business address</label>
            <input
              id="address"
              value={s.address}
              onChange={(e) => set("address", e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="phone">Restaurant contact</label>
            <input
              id="phone"
              value={s.phone}
              onChange={(e) => set("phone", e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="areas">Delivery areas (comma-separated)</label>
            <input
              id="areas"
              value={s.deliveryAreas.join(", ")}
              onChange={(e) =>
                set(
                  "deliveryAreas",
                  e.target.value.split(",").map((x) => x.trim()),
                )
              }
            />
          </div>
          <div className="field">
            <label htmlFor="printWidth">Print format</label>
            <select
              id="printWidth"
              value={s.printWidth}
              onChange={(e) => set("printWidth", e.target.value)}
            >
              <option value="80mm">80mm thermal receipt</option>
              <option value="A4">A4 paper</option>
            </select>
          </div>
          {(
            [
              ["deliveryFee", "Delivery fee (₹)"],
              ["packagingFee", "Packaging fee (₹)"],
              ["minimumOrder", "Minimum order (₹)"],
              ["taxBps", "Demo tax rate (%)"],
            ] as const
          ).map(([key, name]) => (
            <div className="field" key={key}>
              <label htmlFor={key}>{name}</label>
              <input
                id={key}
                type="number"
                min="0"
                step=".01"
                value={s[key] / 100}
                onChange={(e) =>
                  set(key, Math.round(Number(e.target.value) * 100))
                }
              />
            </div>
          ))}
          <div className="field">
            <label htmlFor="opensAt">Opens at (India time)</label>
            <input
              id="opensAt"
              type="time"
              value={s.opensAt}
              onChange={(e) => set("opensAt", e.target.value)}
            />
            <small>
              Matching opening and closing times means open 24 hours.
            </small>
          </div>
          <div className="field">
            <label htmlFor="closesAt">Closes at (India time)</label>
            <input
              id="closesAt"
              type="time"
              value={s.closesAt}
              onChange={(e) => set("closesAt", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="alertMinutes">Waiting alert after (minutes)</label>
            <input
              id="alertMinutes"
              type="number"
              min="1"
              max="30"
              value={s.alertMinutes}
              onChange={(e) => set("alertMinutes", Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label htmlFor="timeoutMinutes">
              Close unanswered orders after (minutes)
            </label>
            <input
              id="timeoutMinutes"
              type="number"
              min="2"
              max="120"
              value={s.timeoutMinutes}
              onChange={(e) => set("timeoutMinutes", Number(e.target.value))}
            />
          </div>
          <div className="field full">
            <label htmlFor="billingDetails">
              Billing details / registration information
            </label>
            <textarea
              id="billingDetails"
              value={s.billingDetails}
              onChange={(e) => set("billingDetails", e.target.value)}
            />
            <small>
              Sample bills require accountant review before a live pilot.
            </small>
          </div>
        </div>
        <button
          className="button primary"
          type="submit"
          disabled={busy}
          style={{ marginTop: 25 }}
        >
          Save changes <Check size={15} />
        </button>
      </form>
      <div className="demo-grid" style={{ marginTop: 22 }}>
        <div className="panel">
          <h3>Connections</h3>
          <div className="detail-row">
            <span>WhatsApp</span>
            <span className="demo-label">SIMULATED</span>
          </div>
          <div className="detail-row">
            <span>Online payments</span>
            <span className="demo-label">SIMULATED</span>
          </div>
          <p className="subtitle">
            No messages are sent and no money is charged. COD collection records
            are persisted.
          </p>
        </div>
        <div className="panel">
          <h3>People in your kitchen</h3>
          {members.map((m) => (
            <div className="detail-row" key={m.id}>
              <span>
                {m.name}
                <small
                  className="muted"
                  style={{ display: "block", marginTop: 5 }}
                >
                  {m.email}
                </small>
              </span>
              <span className="status-tag">{m.role}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
