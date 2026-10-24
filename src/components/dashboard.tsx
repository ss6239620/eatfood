"use client";
import DemoView from "./dashboard/demo";
import HistoryView from "./dashboard/history";
import MenuManagement from "./dashboard/menu-management";
import OrderDrawer from "./dashboard/order-drawer";
import SettingsView from "./dashboard/settings";
import { Heading, Metric } from "./dashboard/shared";

import { api, post } from "@/lib/client";
import { terminal } from "@/lib/domain";
import type { Order } from "@/lib/types";
import { money, time } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  ExternalLink,
  FlaskConical,
  History,
  IndianRupee,
  LayoutDashboard,
  Leaf,
  LoaderCircle,
  LogOut,
  Menu,
  MoreHorizontal,
  RefreshCw,
  Search,
  Settings,
  ShoppingBag,
  Truck,
  UtensilsCrossed,
  Volume2,
  Wallet,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Brand } from "./brand";
import type { Data } from "./dashboard/types";
const nav = [
  { id: "live", name: "Live orders", icon: LayoutDashboard },
  { id: "menu", name: "Menu management", icon: UtensilsCrossed },
  { id: "history", name: "Order history", icon: History },
  { id: "exceptions", name: "Needs attention", icon: AlertTriangle },
  { id: "settings", name: "Settings", icon: Settings },
];
function elapsed(s: string) {
  const m = Math.max(
    0,
    Math.floor((Date.now() - new Date(s).getTime()) / 60000),
  );
  return m < 1 ? "Just now" : m + " min ago";
}
export default function Dashboard() {
  const [data, setData] = useState<Data | null>(null),
    [view, setView] = useState("live"),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState<string | null>(null),
    [connected, setConnected] = useState(true),
    [shift, setShift] = useState(false),
    [toast, setToast] = useState<{ text: string; error?: boolean } | null>(
      null,
    ),
    [mobileNav, setMobileNav] = useState(false),
    [busy, setBusy] = useState(false);
  const audio = useRef<AudioContext | null>(null),
    lastAlert = useRef(0),
    shiftRef = useRef(false),
    requesting = useRef(false);
  const notify = useCallback((text: string, error = false) => {
    setToast({ text, error });
    setTimeout(() => setToast(null), 5000);
  }, []);
  const chime = useCallback(() => {
    const ctx = audio.current;
    if (!ctx) return;
    [0, 0.2].forEach((delay, i) => {
      const osc = ctx.createOscillator(),
        gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = i ? 880 : 660;
      gain.gain.setValueAtTime(0.08, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        ctx.currentTime + delay + 0.25,
      );
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.3);
    });
  }, []);
  const refresh = useCallback(async () => {
    if (requesting.current) return;
    requesting.current = true;
    try {
      const d: Data = await api("dashboard");
      setData(d);
      setConnected(true);
      if (
        shiftRef.current &&
        d.orders.some((o) => o.status === "awaiting") &&
        Date.now() - lastAlert.current > 30000
      ) {
        chime();
        lastAlert.current = Date.now();
      }
    } catch (e) {
      setConnected(false);
      if (
        (e as Error).message.includes("sign in") ||
        (e as Error).message.includes("expired")
      )
        window.location.href = "/login";
    } finally {
      requesting.current = false;
    }
  }, [chime]);
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    const on = () => refresh(),
      off = () => setConnected(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener("focus", on);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("focus", on);
    };
  }, [refresh]);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelected(null);
        setMobileNav(false);
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);
  async function action(
    fn: () => Promise<unknown>,
    message = "Updated successfully.",
  ) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await refresh();
      notify(message);
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function startShift() {
    try {
      audio.current ??= new AudioContext();
      await audio.current.resume();
      shiftRef.current = true;
      setShift(true);
      chime();
      lastAlert.current = Date.now();
      notify("Shift started. Keep this dashboard active to hear order alerts.");
    } catch {
      notify(
        "Your browser could not enable audio. Visual alerts remain active.",
        true,
      );
    }
  }
  if (!data)
    return (
      <div className="loading">
        <div style={{ textAlign: "center" }}>
          <Brand />
          <LoaderCircle className="spin" style={{ margin: "35px auto 15px" }} />
          <p>
            {connected
              ? "Warming up your kitchen…"
              : "Cannot connect to the kitchen. Retrying…"}
          </p>
        </div>
      </div>
    );
  const newCount = data.orders.filter((o) => o.status === "awaiting").length;
  const attention = data.orders.filter(
    (o) =>
      o.review_reason ||
      (o.status === "awaiting" &&
        Date.now() - new Date(o.created_at).getTime() >
          data.restaurant.settings.alertMinutes * 60000),
  );
  const failed = data.jobs.filter((j) => j.status === "failed");
  const active = data.orders.filter((o) => !terminal.includes(o.status));
  const visible = active.filter(
    (o) =>
      (filter === "all" || o.fulfillment === filter) &&
      (o.reference + " " + o.customer_name)
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const groups = [
    {
      name: "New orders",
      key: "new",
      color: "#c16b45",
      items: visible.filter((o) => o.status === "awaiting"),
    },
    {
      name: "In the kitchen",
      key: "kitchen",
      color: "#c7a352",
      items: visible.filter((o) =>
        ["accepted", "preparing"].includes(o.status),
      ),
    },
    {
      name: "Ready to go",
      key: "ready",
      color: "#889863",
      items: visible.filter((o) => o.status === "ready"),
    },
    {
      name: "Out for delivery",
      key: "delivery",
      color: "#8396ae",
      items: visible.filter((o) => o.status === "out_for_delivery"),
    },
  ];
  const setPage = (v: string) => {
    setView(v);
    setSearch("");
    setMobileNav(false);
  };
  return (
    <div className="shell">
      <aside className={"sidebar " + (mobileNav ? "open" : "")}>
        <Brand />
        <div className="restaurant-switch">
          <div className="restaurant-avatar">g.</div>
          <div style={{ flex: 1 }}>
            <strong style={{ fontSize: 12 }}>{data.restaurant.name}</strong>
            <p style={{ fontSize: 10, color: "#9a9b8f", marginTop: 4 }}>
              Indiranagar, Bengaluru
            </p>
          </div>
          <ChevronDown size={13} className="muted" />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {nav.map((n) => (
            <button
              key={n.id}
              className={"nav-item " + (view === n.id ? "active" : "")}
              onClick={() => setPage(n.id)}
            >
              <n.icon />
              {n.name}
              {n.id === "live" && newCount > 0 && (
                <span className="nav-count">{newCount}</span>
              )}
              {n.id === "exceptions" &&
                attention.length + failed.length > 0 && (
                  <span style={{ marginLeft: "auto", fontSize: 10 }}>
                    {attention.length + failed.length}
                  </span>
                )}
            </button>
          ))}
        </nav>
        <div className="nav-label" style={{ marginTop: 32 }}>
          EXPLORE
        </div>
        <button
          className={"nav-item " + (view === "demo" ? "active" : "")}
          onClick={() => setPage("demo")}
        >
          <FlaskConical />
          Demo playground
          <ArrowUpRight size={13} style={{ marginLeft: "auto" }} />
        </button>
        <a
          className="nav-item"
          href={"/menu/" + data.restaurant.slug}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink />
          Your storefront
          <ArrowUpRight size={13} style={{ marginLeft: "auto" }} />
        </a>
        <div className="sidebar-bottom">
          <div className="help-card">
            <div
              style={{
                display: "flex",
                gap: 7,
                alignItems: "center",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              <CircleHelp size={15} color="#858d70" />A hand in the kitchen?
            </div>
            <p
              style={{
                fontSize: 10,
                lineHeight: 1.8,
                color: "#999b89",
                marginTop: 8,
              }}
            >
              Try an order from start to finish
              <br />
              in the demo playground.
            </p>
            <button
              onClick={() => setPage("demo")}
              style={{
                border: 0,
                background: "transparent",
                padding: "10px 0 0",
                fontSize: 10,
                color: "#818a69",
              }}
            >
              Take a look{" "}
              <ArrowRight
                size={11}
                style={{ display: "inline", marginLeft: 6 }}
              />
            </button>
          </div>
          <div className="profile">
            <span className="avatar">
              {data.staff.name
                .split(" ")
                .map((x) => x[0])
                .join("")}
            </span>
            <div style={{ flex: 1 }}>
              <strong style={{ fontSize: 11 }}>{data.staff.name}</strong>
              <p style={{ fontSize: 10, color: "#9b9d8f", marginTop: 4 }}>
                {data.staff.role === "owner"
                  ? "Restaurant owner"
                  : "Counter staff"}
              </p>
            </div>
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={() =>
                action(async () => {
                  await post("auth/logout");
                  window.location.href = "/login";
                })
              }
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileNav(!mobileNav)}
            >
              <Menu size={19} />
            </button>
            <span style={{ color: "#555f4b" }}>Workspace</span>
            <span style={{ color: "#d1d3c6" }}>/</span>
            <span>
              {view === "demo"
                ? "Demo playground"
                : nav.find((n) => n.id === view)?.name}
            </span>
            <span className="date" style={{ marginLeft: 18 }}>
              {new Date().toLocaleDateString("en-IN", {
                timeZone: "Asia/Kolkata",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
          </div>
          <div className="topbar-right">
            <span className="demo-label">SIMULATED INTEGRATIONS</span>
            <button
              className="status-pill"
              disabled={busy || data.staff.role !== "owner"}
              onClick={() =>
                action(
                  () =>
                    api("settings", {
                      method: "PATCH",
                      body: JSON.stringify({
                        ...data.restaurant.settings,
                        open: !data.restaurant.settings.open,
                      }),
                    }),
                  "Restaurant availability updated.",
                )
              }
            >
              <span
                className="status-dot"
                style={{
                  background: data.restaurant.settings.open
                    ? "#71865e"
                    : "#c56d4e",
                }}
              />
              {data.restaurant.settings.open
                ? "Accepting orders"
                : "Restaurant paused"}
              <ChevronDown size={10} />
            </button>
            <button
              className="icon-button"
              aria-label="View notifications"
              onClick={() => setPage("exceptions")}
              style={{ position: "relative" }}
            >
              <Bell size={17} />
              {attention.length + failed.length > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 5,
                    width: 5,
                    height: 5,
                    background: "#bc5435",
                    borderRadius: "50%",
                  }}
                />
              )}
            </button>
          </div>
        </header>
        <main className="page">
          {!connected && (
            <div className="notice warning" role="alert">
              <WifiOff size={17} />
              <div>
                <strong>Connection lost.</strong> Showing the last synchronized
                orders. Updates need a connection.
              </div>
              <button className="button" onClick={refresh}>
                Retry
              </button>
            </div>
          )}
          {view === "live" && (
            <>
              <div className="heading-row">
                <div>
                  <div className="eyebrow muted" style={{ marginBottom: 9 }}>
                    A GOOD DAY FOR GOOD FOOD
                  </div>
                  <h1>
                    Your kitchen, at a glance
                    <span style={{ color: "#bd5133" }}>.</span>
                  </h1>
                  <p className="subtitle">
                    A little less chaos. A lot more happy customers.
                  </p>
                </div>
                <button
                  className={"button " + (!shift ? "primary" : "soft")}
                  onClick={startShift}
                >
                  <Volume2 />
                  {shift ? "Alerts are on" : "Start shift"}
                  {!shift && <ArrowRight />}
                </button>
              </div>
              <div className="metrics">
                <Metric
                  label="Orders today"
                  value={String(data.summary.orders)}
                  icon={ShoppingBag}
                  note="Every order. One place."
                />
                <Metric
                  label="Completed order value"
                  value={money(data.summary.completed_value)}
                  icon={IndianRupee}
                  note="Delivered & collected orders"
                />
                <Metric
                  label="In the kitchen"
                  value={String(
                    active.filter((o) =>
                      ["accepted", "preparing"].includes(o.status),
                    ).length,
                  ).padStart(2, "0")}
                  icon={UtensilsCrossed}
                  note="A little goodness in the making"
                />
                <Metric
                  label="COD collected"
                  value={money(data.summary.cod_collected)}
                  icon={Wallet}
                  note="Recorded cash collections only"
                />
              </div>
              <div className="notice">
                <Leaf size={18} />
                <div>
                  <strong>
                    {shift
                      ? "You’re all set for a good shift."
                      : "Good service starts with a hello."}
                  </strong>{" "}
                  {shift
                    ? "New orders will chime while this dashboard is active."
                    : "Start your shift to hear an alert when a new order arrives."}
                </div>
                <button className="button" onClick={() => setPage("demo")}>
                  Try a demo order <ArrowUpRight size={11} />
                </button>
              </div>
              <div className="board-toolbar">
                <div style={{ display: "flex", gap: 15, alignItems: "center" }}>
                  <h2 style={{ fontSize: 16 }}>
                    Live orders{" "}
                    <span
                      style={{
                        fontSize: 11,
                        color: "#a1a590",
                        fontWeight: 400,
                        marginLeft: 5,
                      }}
                    >
                      {active.length}
                    </span>
                  </h2>
                  <span
                    style={{ height: 18, width: 1, background: "#e0e2d6" }}
                  />
                  <div className="tabs">
                    {[
                      ["all", "All orders"],
                      ["delivery", "Delivery"],
                      ["pickup", "Pickup"],
                    ].map(([id, name]) => (
                      <button
                        key={id}
                        className={"tab " + (filter === id ? "active" : "")}
                        onClick={() => setFilter(id)}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="search">
                  <Search />
                  <input
                    aria-label="Search orders"
                    placeholder="Search order or customer…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="board">
                {groups.map((g) => (
                  <section className="lane" key={g.key}>
                    <div className="lane-head">
                      <div className="lane-title">
                        <span
                          className="lane-dot"
                          style={{ background: g.color }}
                        />
                        {g.name}
                        <span className="lane-count">{g.items.length}</span>
                      </div>
                      <MoreHorizontal size={15} color="#b3b6a5" />
                    </div>
                    {g.items.length ? (
                      g.items.map((o) => (
                        <OrderCard
                          key={o.id}
                          order={o}
                          onOpen={() => setSelected(o.id)}
                        />
                      ))
                    ) : (
                      <div className="empty-lane">
                        <div>
                          <ShoppingBag size={23} />
                          <p>A little breathing room.</p>
                        </div>
                      </div>
                    )}
                  </section>
                ))}
              </div>
              <div className="footer-note">
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="status-dot" />
                  Updates every 5 seconds{" "}
                  <span style={{ margin: "0 6px" }}>·</span> Last synced{" "}
                  {time(data.syncedAt)}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <Leaf size={11} /> Made for the way your kitchen works.
                </span>
              </div>
            </>
          )}
          {view === "menu" && (
            <MenuManagement data={data} action={action} busy={busy} />
          )}
          {view === "history" && <HistoryView data={data} open={setSelected} />}
          {view === "settings" && (
            <SettingsView data={data} action={action} busy={busy} />
          )}
          {view === "demo" && (
            <DemoView
              data={data}
              action={action}
              notify={notify}
              busy={busy}
              open={setSelected}
            />
          )}
          {view === "exceptions" && (
            <>
              <Heading
                title="A little attention goes a long way."
                subtitle="Payment reviews, waiting customers, and messages that need another try."
              />
              <div className="notice warning">
                <AlertTriangle size={18} />
                Orders waiting beyond {
                  data.restaurant.settings.alertMinutes
                }{" "}
                minutes are highlighted here. Unaccepted orders close after{" "}
                {data.restaurant.settings.timeoutMinutes} minutes.
              </div>
              {attention.length === 0 && failed.length === 0 ? (
                <div
                  className="panel"
                  style={{ textAlign: "center", padding: 60 }}
                >
                  <CheckCircle2
                    size={35}
                    color="#849369"
                    style={{ margin: "0 auto 15px" }}
                  />
                  <h2>Everything’s looking good.</h2>
                  <p className="subtitle">
                    No exceptions need your attention right now.
                  </p>
                </div>
              ) : (
                <div className="panel">
                  {attention.map((o) => (
                    <div
                      key={o.id}
                      style={{
                        padding: "16px 0",
                        borderBottom: "1px solid #eee",
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 15,
                      }}
                    >
                      <div>
                        <h3>
                          {o.reference} · {o.customer_name}
                        </h3>
                        <p className="subtitle">
                          {o.review_reason ||
                            "Customer is waiting for restaurant acceptance."}
                        </p>
                      </div>
                      <button
                        className="button"
                        onClick={() => setSelected(o.id)}
                      >
                        Review order <ArrowRight />
                      </button>
                    </div>
                  ))}
                  {failed.map((j) => (
                    <div
                      key={j.id}
                      style={{
                        padding: "16px 0",
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 15,
                      }}
                    >
                      <div>
                        <h3>Message failed · {j.kind.replaceAll("_", " ")}</h3>
                        <p className="subtitle">
                          {j.error} · {j.attempts} attempts · Simulated provider
                        </p>
                      </div>
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() =>
                          action(
                            () => post("messages/" + j.id + "/retry"),
                            "Message queued for retry.",
                          )
                        }
                      >
                        <RefreshCw />
                        Retry
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </main>
      </div>
      {selected && (
        <OrderDrawer
          id={selected}
          staff={data.staff}
          onClose={() => setSelected(null)}
          refresh={refresh}
          notify={notify}
        />
      )}{" "}
      {toast && (
        <div role="status" className={"toast " + (toast.error ? "error" : "")}>
          {toast.text}
        </div>
      )}
    </div>
  );
}
function OrderCard({ order: o, onOpen }: { order: Order; onOpen: () => void }) {
  return (
    <article className={"order-card " + (o.status === "awaiting" ? "new" : "")}>
      <div className="card-top">
        <button
          style={{ border: 0, background: "none", padding: 0 }}
          onClick={onOpen}
          className="reference"
        >
          #{o.reference.replace("EF-", "")}
        </button>
        <span className={"elapsed " + (o.status === "awaiting" ? "late" : "")}>
          <Clock3 size={10} />
          {elapsed(o.created_at)}
        </span>
      </div>
      <div className="customer-line">
        {o.customer_name}
        <span className="fulfillment">
          {o.fulfillment === "delivery" ? <Truck /> : <ShoppingBag />}
          {o.fulfillment === "delivery" ? "Delivery" : "Pickup"}
        </span>
      </div>
      {o.items.slice(0, 3).map((i, n) => (
        <div className="item-line" key={n}>
          <span>{i.quantity}×</span> {i.name}
        </div>
      ))}
      {o.items.length > 3 && (
        <p className="muted" style={{ fontSize: 9 }}>
          + {o.items.length - 3} more items
        </p>
      )}
      {o.notes && <div className="card-note">“{o.notes}”</div>}
      <hr className="card-divider" />
      <div className="card-bottom">
        <span className="card-total">{money(o.total)}</span>
        <span
          className={
            "payment-tag " + (o.payment_status === "paid" ? "paid" : "")
          }
        >
          {o.payment_method === "cod"
            ? "COD"
            : o.simulated_payment
              ? "Test online"
              : "Online"}{" "}
          ·{" "}
          {o.payment_status === "paid"
            ? "Paid"
            : o.payment_status === "pending"
              ? "Pending"
              : "Unpaid"}
        </span>
      </div>
      <div className="card-actions">
        {o.status === "awaiting" ? (
          <>
            <button className="button small" onClick={onOpen}>
              Review
            </button>
            <button className="button primary" onClick={onOpen}>
              <Check />
              Accept order
            </button>
          </>
        ) : (
          <button className="button soft" onClick={onOpen}>
            {o.status === "ready"
              ? o.fulfillment === "pickup"
                ? "Mark collected"
                : "Send for delivery"
              : o.status === "out_for_delivery"
                ? "Mark delivered"
                : o.status === "accepted"
                  ? "Start preparing"
                  : "Mark as ready"}
            <ArrowRight />
          </button>
        )}
      </div>
    </article>
  );
}
