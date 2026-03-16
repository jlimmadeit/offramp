import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { url } = req.body ?? {};

    const upstream = await fetch(url);
    if (!upstream.ok) {
      return res
        .status(upstream.status)
        .json({ error: `Upstream fetch failed (${upstream.status})` });
    }

    const ct =
      upstream.headers.get("content-type") ?? "application/octet-stream";
    res.setHeader("Content-Type", ct);
    res.status(200);
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.end(buffer);
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Proxy error",
    });
  }
}
