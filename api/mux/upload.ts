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

  if (!process.env.MUX_TOKEN_ID || !process.env.MUX_TOKEN_SECRET) {
    return res
      .status(500)
      .json({ error: "MUX_TOKEN_ID or MUX_TOKEN_SECRET not set" });
  }

  try {
    const muxRes = await fetch("https://api.mux.com/video/v1/uploads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: muxAuth(),
      },
      body: JSON.stringify({
        cors_origin: "*",
        new_asset_settings: {
          playback_policies: ["public"],
          video_quality: "basic",
          static_renditions: [{ resolution: "highest" }],
        },
      }),
    });

    const body = await muxRes.json();

    if (!muxRes.ok) {
      return res.status(muxRes.status).json({ error: body });
    }

    return res.status(200).json({
      upload_url: body.data.url,
      upload_id: body.data.id,
      asset_id: body.data.asset_id,
    });
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
