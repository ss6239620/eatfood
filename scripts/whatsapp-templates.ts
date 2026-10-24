import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { whatsappTemplates } from "../src/lib/whatsapp-templates";
if (existsSync(".env")) process.loadEnvFile(".env");
const access = process.env.WHATSAPP_ACCESS_TOKEN,
  waba = process.env.WHATSAPP_WABA_ID;
if (!access || !waba)
  throw new Error("Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_WABA_ID in .env.");
const base =
  "https://graph.facebook.com/" +
  (process.env.WHATSAPP_GRAPH_VERSION || "v25.0") +
  "/" +
  waba +
  "/message_templates";
async function call(url: string, body?: unknown) {
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + access,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      "Meta " +
        response.status +
        ": " +
        String(
          data.error?.error_user_msg || data.error?.message || "Request failed",
        ).replaceAll(access!, "[redacted]"),
    );
  return data;
}
const list = await call(
  base + "?fields=id,name,status,language,category,components&limit=100",
);
const existing = list.data as {
  id: string;
  name: string;
  status: string;
  language: string;
  category: string;
  components?: { type: string; text?: string }[];
}[];
const submit = process.argv.includes("--submit");
const result = [];
for (const t of whatsappTemplates) {
  const found = existing.find(
    (e) => e.name === t.name && e.language === t.language,
  );
  if (found) {
    const body = found.components?.find((c) => c.type === "BODY")?.text;
    result.push({
      name: t.name,
      kind: t.kind,
      id: found.id,
      status: found.status,
      category: found.category,
      bodyMatches: body === t.body,
    });
    console.log(
      t.name +
        ": " +
        found.status +
        (body !== t.body
          ? " (content differs; existing template preserved)"
          : ""),
    );
    continue;
  }
  if (!submit) {
    result.push({ name: t.name, kind: t.kind, status: "NOT_SUBMITTED" });
    console.log(t.name + ": NOT_SUBMITTED");
    continue;
  }
  try {
    const created = await call(base, {
      name: t.name,
      language: t.language,
      category: t.category,
      components: [
        { type: "BODY", text: t.body, example: { body_text: [t.examples] } },
      ],
    });
    result.push({
      name: t.name,
      kind: t.kind,
      id: created.id,
      status: created.status,
      category: created.category,
    });
    console.log(t.name + ": " + created.status);
  } catch (e) {
    const error = (e as Error).message;
    result.push({ name: t.name, kind: t.kind, status: "ERROR", error });
    console.log(t.name + ": " + error);
  }
}
mkdirSync("artifacts", { recursive: true });
writeFileSync(
  "artifacts/whatsapp-template-status.json",
  JSON.stringify(
    { checkedAt: new Date().toISOString(), templates: result },
    null,
    2,
  ) + "\n",
);
const counts = result.reduce<Record<string, number>>((out, t) => {
  out[t.status] = (out[t.status] || 0) + 1;
  return out;
}, {});
console.log("Summary:", JSON.stringify(counts));
if (result.some((t) => t.status === "ERROR")) process.exitCode = 1;
