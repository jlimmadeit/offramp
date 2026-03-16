import type { VercelRequest, VercelResponse } from "@vercel/node";

function muxAuth(): string {
  const id = process.env.MUX_TOKEN_ID ?? "";
  const secret = process.env.MUX_TOKEN_SECRET ?? "";
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { source_url, start_time, end_time } = req.body ?? {};

    const input: Record<string, unknown> = { url: source_url };
    if (start_time != null) input.start_time = start_time;
    if (end_time != null) input.end_time = end_time;

    const muxRes = await fetch("https://api.mux.com/video/v1/assets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: muxAuth(),
      },
      body: JSON.stringify({
        input: [input],
        playback_policies: ["public"],
        static_renditions: [{ resolution: "highest" }],
      }),
    });

    const body = await muxRes.json();

    if (!muxRes.ok) {
      return res.status(muxRes.status).json({ error: body });
    }

    return res.status(200).json({ asset_id: body.data.id });
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
