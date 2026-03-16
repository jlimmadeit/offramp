import type { VercelRequest, VercelResponse } from "@vercel/node";
import { decryptKey } from "../_lib/crypto";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.ENCRYPTION_SECRET;
  const encryptedKey = req.headers["x-flowstage-key"] as string | undefined;

  if (!encryptedKey) {
    return res
      .status(401)
      .json({ detail: "No Flowstage API key provided. Add your key in Settings." });
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
      detail: "Invalid or corrupted API key. Re-enter your key in Settings.",
    });
  }

  const pathSegments = req.query.path;
  const subpath = Array.isArray(pathSegments)
    ? pathSegments.join("/")
    : pathSegments ?? "";
  const upstream = `https://api.theflowstage.com/${subpath}`;

  const headers: Record<string, string> = {
    "X-API-Key": apiKey,
  };

  let body: string | undefined;
  if (
    req.method === "POST" ||
    req.method === "PATCH" ||
    req.method === "PUT"
  ) {
    body = JSON.stringify(req.body);
    headers["Content-Type"] = "application/json";
  }

  try {
    const upstreamRes = await fetch(upstream, {
      method: req.method,
      headers,
      body,
    });

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
