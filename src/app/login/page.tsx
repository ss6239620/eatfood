"use client";
import { Brand } from "@/components/brand";
import { post } from "@/lib/client";
import { ArrowRight, Leaf, LoaderCircle } from "lucide-react";
import { useState } from "react";
export default function Login() {
  const [email, setEmail] = useState("owner@eatfood.local"),
    [password, setPassword] = useState("EatFoodDemo!2026"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await post("auth/login", { email, password });
      window.location.href = "/";
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-art">
        <div>
          <span className="eyebrow">Made for your neighborhood kitchen</span>
          <h1 style={{ fontSize: 52, margin: "20px 0", maxWidth: 470 }}>
            Good food.
            <br />
            Closer connections.
          </h1>
          <p style={{ maxWidth: 330, lineHeight: 1.8, opacity: 0.8 }}>
            Your orders, your customers, your way. A little less busywork. A lot
            more hospitality.
          </p>
          <p style={{ marginTop: 45, fontSize: 12 }}>
            <Leaf size={14} style={{ display: "inline", marginRight: 8 }} />A
            fresh approach to direct ordering.
          </p>
        </div>
      </section>
      <section className="login-form">
        <form onSubmit={submit} className="login-box">
          <Brand />
          <h1>Welcome to your kitchen.</h1>
          <p className="subtitle">Sign in and make something good happen.</p>
          <div className="field">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
          <button
            className="button primary"
            disabled={busy}
            style={{ width: "100%", marginTop: 25, padding: 13 }}
          >
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <>
                Open my dashboard <ArrowRight size={15} />
              </>
            )}
          </button>
          <div className="notice" style={{ marginTop: 30, display: "block" }}>
            <span className="demo-label">LOCAL DEMO</span>
            <p style={{ marginTop: 12 }}>
              Owner and staff accounts are preconfigured.
              <br />
              Staff: staff@eatfood.local
              <br />
              Password: EatFoodDemo!2026
            </p>
          </div>
          <p className="muted" style={{ fontSize: 10, textAlign: "center" }}>
            Handcrafted for independent restaurants.
          </p>
        </form>
      </section>
    </main>
  );
}
