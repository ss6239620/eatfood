"use client";
import { api } from "@/lib/client";
import type { MenuItem } from "@/lib/types";
import { money } from "@/lib/utils";
import { X } from "lucide-react";
import { useState } from "react";
import { Heading } from "./shared";
import type { Data } from "./types";
const imageData = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.readAsDataURL(file);
  });
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
    [edit, setEdit] = useState<MenuItem | null>(null),
    [creatingCategory, setCreatingCategory] = useState(false),
    [creatingItem, setCreatingItem] = useState(false),
    [newDishImage, setNewDishImage] = useState(""),
    [editDishImage, setEditDishImage] = useState("");
  return (
    <>
      <Heading
        title="Good things on the menu."
        subtitle="A fresh menu, happy customers. Keep your kitchen’s offerings up to date."
      />
      {data.staff.role === "owner" && (
        <div className="menu-actions">
          <button
            className="button"
            disabled={busy}
            onClick={() => setCreatingCategory(true)}
          >
            Create category
          </button>
          <button
            className="button primary"
            disabled={busy || !data.categories.length}
            onClick={() => setCreatingItem(true)}
          >
            Add dish
          </button>
        </div>
      )}
      <div className="category-nav">
        {[
          "All items",
          ...data.categories.map((c) => c.name),
          ...new Set(
            data.menu
              .map((m) => m.category)
              .filter((c) => !data.categories.some((x) => x.name === c)),
          ),
        ].map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={"category-chip " + (category === c ? "active" : "")}
          >
            {c}
          </button>
        ))}
      </div>
      {!data.categories.length && data.staff.role === "owner" && (
        <p className="subtitle">
          Start by creating a category, such as Starters or Main course. Then
          add dishes to it.
        </p>
      )}
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
                    onClick={() => {
                      setEdit(m);
                      setEditDishImage("");
                    }}
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
                      ...(editDishImage ? { image: editDishImage } : {}),
                    }),
                  });
                  setEdit(null);
                  setEditDishImage("");
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
              <label htmlFor="edit-dish-image" style={{ marginTop: 20 }}>
                Replace dish photo
              </label>
              <input
                id="edit-dish-image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={async (e) => {
                  const file = e.currentTarget.files?.[0];
                  if (!file) return;
                  if (file.size > 1_500_000) {
                    window.alert("Choose an image smaller than 1.5 MB.");
                    e.currentTarget.value = "";
                    return;
                  }
                  setEditDishImage(await imageData(file));
                }}
              />
              <p className="subtitle">
                JPG, PNG or WebP · up to 1.5 MB. Leave blank to keep the current
                photo.
              </p>
              <img
                className="dish-image-preview"
                src={editDishImage || edit.image}
                alt="Dish photo preview"
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
      {(creatingCategory || creatingItem) && (
        <div
          className="overlay"
          onClick={() => {
            setCreatingCategory(false);
            setCreatingItem(false);
          }}
        >
          <section
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-label={
              creatingCategory ? "Create menu category" : "Add menu dish"
            }
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-head">
              <h2>{creatingCategory ? "Create a category" : "Add a dish"}</h2>
              <button
                className="icon-button"
                aria-label="Close"
                onClick={() => {
                  setCreatingCategory(false);
                  setCreatingItem(false);
                }}
              >
                <X />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                if (creatingCategory) {
                  action(async () => {
                    await api("menu/categories", {
                      method: "POST",
                      body: JSON.stringify({ name: f.get("category") }),
                    });
                    setCreatingCategory(false);
                  }, "Category created.");
                } else {
                  action(async () => {
                    await api("menu", {
                      method: "POST",
                      body: JSON.stringify({
                        name: f.get("name"),
                        description: f.get("description"),
                        category: f.get("category"),
                        price: Math.round(Number(f.get("price")) * 100),
                        vegetarian: f.get("vegetarian") === "yes",
                        image: newDishImage,
                      }),
                    });
                    setCreatingItem(false);
                    setNewDishImage("");
                  }, "Dish added to your menu.");
                }
              }}
            >
              {creatingCategory ? (
                <>
                  <label htmlFor="new-category">Category name</label>
                  <input
                    id="new-category"
                    name="category"
                    placeholder="e.g. Starters"
                    required
                    maxLength={60}
                    autoFocus
                  />
                </>
              ) : (
                <>
                  <label htmlFor="new-dish-name">Dish name</label>
                  <input
                    id="new-dish-name"
                    name="name"
                    required
                    maxLength={100}
                    autoFocus
                  />
                  <label
                    htmlFor="new-dish-description"
                    style={{ marginTop: 18 }}
                  >
                    Description
                  </label>
                  <textarea
                    id="new-dish-description"
                    name="description"
                    maxLength={500}
                  />
                  <label htmlFor="new-dish-category" style={{ marginTop: 18 }}>
                    Category
                  </label>
                  <select
                    id="new-dish-category"
                    name="category"
                    required
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Select a category
                    </option>
                    {data.categories.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <label htmlFor="new-dish-price" style={{ marginTop: 18 }}>
                    Price (₹)
                  </label>
                  <input
                    id="new-dish-price"
                    name="price"
                    type="number"
                    min="0"
                    step=".01"
                    required
                  />
                  <label htmlFor="new-dish-type" style={{ marginTop: 18 }}>
                    Dish type
                  </label>
                  <select
                    id="new-dish-type"
                    name="vegetarian"
                    defaultValue="yes"
                  >
                    <option value="yes">Vegetarian</option>
                    <option value="no">Non-vegetarian</option>
                  </select>
                  <label htmlFor="new-dish-image" style={{ marginTop: 18 }}>
                    Dish photo
                  </label>
                  <input
                    id="new-dish-image"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    required
                    onChange={async (e) => {
                      const file = e.currentTarget.files?.[0];
                      if (!file) return;
                      if (file.size > 1_500_000) {
                        window.alert("Choose an image smaller than 1.5 MB.");
                        e.currentTarget.value = "";
                        setNewDishImage("");
                        return;
                      }
                      setNewDishImage(await imageData(file));
                    }}
                  />
                  <p className="subtitle">JPG, PNG or WebP · up to 1.5 MB.</p>
                  {newDishImage && (
                    <img
                      className="dish-image-preview"
                      src={newDishImage}
                      alt="New dish photo preview"
                    />
                  )}
                </>
              )}
              <button
                className="button primary"
                style={{ marginTop: 25 }}
                disabled={busy}
              >
                {creatingCategory ? "Create category" : "Add dish"}
              </button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
