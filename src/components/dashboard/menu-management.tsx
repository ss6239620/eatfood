"use client";
import { api } from "@/lib/client";
import type { MenuItem } from "@/lib/types";
import { money } from "@/lib/utils";
import { X } from "lucide-react";
import { useState } from "react";
import { Heading } from "./shared";
import type { Data } from "./types";
export default function MenuManagement({
  data,
  action,
  busy,
}: {
  data: Data;
  action: (fn: () => Promise<unknown>, message?: string) => Promise<void>;
  busy: boolean;
}) {
  const [category, setCategory] = useState("All items"),
    [edit, setEdit] = useState<MenuItem | null>(null);
  return (
    <>
      <Heading
        title="Good things on the menu."
        subtitle="A fresh menu, happy customers. Keep your kitchen’s offerings up to date."
      />
      <div className="category-nav">
        {["All items", ...new Set(data.menu.map((m) => m.category))].map(
          (c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={"category-chip " + (category === c ? "active" : "")}
            >
              {c}
            </button>
          ),
        )}
      </div>
      <div className="menu-grid">
        {data.menu
          .filter((m) => category === "All items" || m.category === category)
          .map((m) => (
            <article className="food-card" key={m.id}>
              <img className="food-image" src={m.image} alt={m.name} />
              <div className="food-content">
                <div
                  className="eyebrow muted"
                  style={{ fontSize: 8, marginBottom: 8 }}
                >
                  {m.category}
                </div>
                <h3>
                  <span
                    className={"veg-mark " + (!m.vegetarian ? "nonveg" : "")}
                  />
                  {m.name}
                </h3>
                <p>{m.description}</p>
                <div className="food-bottom">
                  <strong>{money(m.price)}</strong>
                  <div
                    style={{ display: "flex", gap: 10, alignItems: "center" }}
                  >
                    <span className="muted" style={{ fontSize: 10 }}>
                      {m.available ? "Available" : "Sold out"}
                    </span>
                    <button
                      aria-label={"Toggle " + m.name + " availability"}
                      aria-pressed={m.available}
                      className={"toggle " + (m.available ? "on" : "")}
                      disabled={busy || data.staff.role !== "owner"}
                      onClick={() =>
                        action(
                          () =>
                            api("menu/" + m.id, {
                              method: "PATCH",
                              body: JSON.stringify({ available: !m.available }),
                            }),
                          "Menu availability updated.",
                        )
                      }
                    >
                      <span />
                    </button>
                  </div>
                </div>
                {data.staff.role === "owner" && (
                  <button
                    className="button small"
                    style={{ marginTop: 15, width: "100%" }}
                    onClick={() => setEdit(m)}
                  >
                    Edit item
                  </button>
                )}
              </div>
            </article>
          ))}
      </div>
      {edit && (
        <div className="overlay" onClick={() => setEdit(null)}>
          <section
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Edit menu item"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-head">
              <h2>Edit a little goodness.</h2>
              <button
                className="icon-button"
                aria-label="Close"
                onClick={() => setEdit(null)}
              >
                <X />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                action(async () => {
                  await api("menu/" + edit.id, {
                    method: "PATCH",
                    body: JSON.stringify({
                      name: f.get("name"),
                      description: f.get("description"),
                      price: Math.round(Number(f.get("price")) * 100),
                    }),
                  });
                  setEdit(null);
                }, "Menu item updated.");
              }}
            >
              <label htmlFor="item-name">Name</label>
              <input
                id="item-name"
                name="name"
                defaultValue={edit.name}
                required
                maxLength={100}
              />
              <label htmlFor="item-description" style={{ marginTop: 20 }}>
                Description
              </label>
              <textarea
                id="item-description"
                name="description"
                defaultValue={edit.description}
                maxLength={500}
              />
              <label htmlFor="item-price" style={{ marginTop: 20 }}>
                Price (₹)
              </label>
              <input
                id="item-price"
                name="price"
                type="number"
                min="0"
                step=".01"
                defaultValue={edit.price / 100}
                required
              />
              <p className="subtitle">
                Existing orders keep their confirmed prices. Customers must
                review any changed checkout total.
              </p>
              <button
                className="button primary"
                style={{ marginTop: 25 }}
                disabled={busy}
              >
                Save item
              </button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
