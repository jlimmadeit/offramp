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
    const { asset_id } = req.body ?? {};

    const assetRes = await fetch(
      `https://api.mux.com/video/v1/assets/${asset_id}`,
      { headers: { Authorization: muxAuth() } }
    );
    const assetBody = await assetRes.json();
    const asset = assetBody.data;

    if (asset?.status === "errored") {
      return res.status(200).json({ status: "errored" });
    }

    if (asset?.status !== "ready") {
      return res
        .status(200)
        .json({ status: asset?.status ?? "preparing" });
    }

    const sr = asset.static_renditions;
    const srList: Array<{ status: string; name: string }> = Array.isArray(sr)
      ? sr
      : sr?.files ?? [];
    const mp4Rendition = srList.find(
      (r: { name: string }) => r.name?.endsWith(".mp4")
    );

    const playbackId = asset.playback_ids?.[0]?.id ?? null;
    return res.status(200).json({
      status: "ready",
      playback_id: playbackId,
      duration: asset.duration ?? null,
      mp4_rendition_name: mp4Rendition?.name ?? null,
      mp4_rendition_status:
        mp4Rendition?.status ??
        (Array.isArray(sr) ? null : sr?.status ?? null),
    });
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
