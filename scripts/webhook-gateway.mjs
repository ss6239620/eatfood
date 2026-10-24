import http from "node:http";
export function allowedPublicRoute(path, method) {
  if (path === "/api/webhooks/whatsapp")
    return ["GET", "POST"].includes(method);
  if (
    [
      "/api/public/menu",
      "/api/public/tracking",
      "/api/customer/session",
    ].includes(path)
  )
    return method === "GET";
  if (path === "/api/customer/orders") return method === "POST";
  if (
    path.startsWith("/menu/") ||
    path.startsWith("/track/") ||
    path.startsWith("/_next/static/") ||
    path.startsWith("/food/")
  )
    return ["GET", "HEAD"].includes(method);
  return false;
}
export function createGateway(targetPort = 3080) {
  return http.createServer((req, res) => {
    const parsed = new URL(req.url, "http://localhost");
    let pathname;
    try {
      pathname = decodeURIComponent(parsed.pathname);
    } catch {
      res.writeHead(400);
      res.end("Invalid URL");
      return;
    }
    // Reject ambiguous separators/dot traversal before forwarding to Next.js.
    if (
      pathname.includes("\\") ||
      pathname.includes("%") ||
      pathname.split("/").some((s) => s === "." || s === "..") ||
      !allowedPublicRoute(pathname, req.method)
    ) {
      res.writeHead(404, {
        "Content-Type": "text/plain",
        "Cache-Control": "no-store",
      });
      res.end("Not found");
      return;
    }
    const upstream = http.request(
      {
        hostname: "127.0.0.1",
        port: targetPort,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: "localhost:" + targetPort },
      },
      (response) => {
        res.writeHead(response.statusCode, response.headers);
        response.pipe(res);
      },
    );
    upstream.setTimeout(20000, () => upstream.destroy());
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end("EatFood is unavailable");
    });
    req.pipe(upstream);
  });
}
if (
  process.argv[1] &&
  import.meta.url === new URL("file://" + process.argv[1]).href
) {
  const server = createGateway(Number(process.env.EATFOOD_PORT || 3080));
  server.listen(3082, "127.0.0.1", () =>
    console.log(
      "EatFood public webhook/customer gateway listening on 127.0.0.1:3082",
    ),
  );
}
