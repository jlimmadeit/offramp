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
    const { upload_id } = req.body ?? {};

    const uploadRes = await fetch(
      `https://api.mux.com/video/v1/uploads/${upload_id}`,
      { headers: { Authorization: muxAuth() } }
    );
    const uploadBody = await uploadRes.json();
    const assetId = uploadBody.data?.asset_id;

    if (!assetId) {
      return res.status(200).json({ status: "waiting" });
    }

    const assetRes = await fetch(
      `https://api.mux.com/video/v1/assets/${assetId}`,
      { headers: { Authorization: muxAuth() } }
    );
    const assetBody = await assetRes.json();
    const asset = assetBody.data;

    if (asset?.status !== "ready") {
      return res
        .status(200)
        .json({ status: "preparing", asset_id: assetId });
    }

    const sr = asset.static_renditions;
    const srList: Array<{ status: string; name: string }> = Array.isArray(sr)
      ? sr
      : sr?.files ?? [];
    const srStatus: string | undefined = Array.isArray(sr)
      ? undefined
      : sr?.status;
    const mp4Rendition = srList.find(
      (r: { name: string }) => r.name?.endsWith(".mp4")
    );

    const renditionPending =
      (srStatus && srStatus !== "ready") ||
      (mp4Rendition && mp4Rendition.status !== "ready");

    if (renditionPending) {
      return res.status(200).json({
        status: "preparing",
        asset_id: assetId,
        detail: "static_rendition_pending",
      });
    }

    const playbackId = asset.playback_ids?.[0]?.id ?? null;
    return res.status(200).json({
      status: "ready",
      asset_id: assetId,
      playback_id: playbackId,
      duration: asset.duration ?? null,
      mp4_rendition_name: mp4Rendition?.name ?? null,
    });
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
