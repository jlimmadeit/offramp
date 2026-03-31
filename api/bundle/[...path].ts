import type { VercelRequest, VercelResponse } from "@vercel/node";
import { decryptKey } from "../_lib/crypto";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Bundle-Key",
  "Access-Control-Max-Age": "86400",
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    res.setHeader(k, v);
  }

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const secret = process.env.ENCRYPTION_SECRET;
  const encryptedKey = req.headers["x-bundle-key"] as string | undefined;

  if (!encryptedKey) {
    return res
      .status(401)
      .json({ detail: "No Bundle API key provided. Add your key in Settings." });
  }
  if (!secret) {
    return res
      .status(500)
      .json({ detail: "ENCRYPTION_SECRET not configured on server." });
  }

  let apiKey: string;
  try {
    apiKey = decryptKey(encryptedKey, secret);
  } catch {
    return res.status(401).json({
      detail:
        "Invalid or corrupted Bundle API key. Re-enter your key in Settings.",
    });
  }

  if (!apiKey || apiKey.trim().length === 0) {
    return res.status(401).json({
      detail: "Decrypted Bundle API key is empty. Re-enter your key in Settings.",
    });
  }

  const pathSegments = req.query.path;
  const subpath = Array.isArray(pathSegments)
    ? pathSegments.filter(Boolean).join("/")
    : pathSegments ?? "";

  const queryParts: string[] = [];
  for (const [key, val] of Object.entries(req.query)) {
    if (key === "path") continue;
    const values = Array.isArray(val) ? val : [val];
    for (const v of values) {
      if (v != null) queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
    }
  }
  const qs = queryParts.length > 0 ? "?" + queryParts.join("&") : "";

  const needsSlash = subpath.length > 0 && !subpath.includes(".");
  const upstream = `https://api.bundle.social/api/v1/${subpath}${needsSlash ? "/" : ""}${qs}`;

  const headers: Record<string, string> = {
    "x-api-key": apiKey,
  };

  let body: BodyInit | undefined;
  if (
    req.method === "POST" ||
    req.method === "PATCH" ||
    req.method === "PUT" ||
    req.method === "DELETE"
  ) {
    const ct = req.headers["content-type"] ?? "";
    if (ct.includes("multipart/")) {
      const chunks: Uint8Array[] = [];
      for await (const chunk of req)
        chunks.push(new Uint8Array(chunk as Buffer));
      let totalLen = 0;
      for (const c of chunks) totalLen += c.length;
      const merged = new Uint8Array(totalLen);
      let offset = 0;
      for (const c of chunks) {
        merged.set(c, offset);
        offset += c.length;
      }
      body = new Blob([merged], { type: ct });
      headers["Content-Type"] = ct;
    } else if (req.body != null && typeof req.body === "object") {
      body = JSON.stringify(req.body);
      headers["Content-Type"] = "application/json";
    } else if (req.body != null) {
      body = String(req.body);
      headers["Content-Type"] = "application/json";
    }
  }

  try {
    let upstreamRes = await fetch(upstream, {
      method: req.method,
      headers,
      body,
      redirect: "manual",
    });

    if ([301, 302, 307, 308].includes(upstreamRes.status)) {
      const location = upstreamRes.headers.get("location");
      if (location) {
        upstreamRes = await fetch(location, {
          method: req.method,
          headers,
          body,
          redirect: "manual",
        });
      }
    }

    const responseBody = await upstreamRes.text();
    res.status(upstreamRes.status);
    res.setHeader(
      "Content-Type",
      upstreamRes.headers.get("content-type") ?? "application/json"
    );
    res.end(responseBody);
  } catch (err) {
    res.status(502).json({
      detail: err instanceof Error ? err.message : "Proxy error",
    });
  }
}
