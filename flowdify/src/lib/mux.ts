import Hls from "hls.js";

export function getMuxPlaybackId(streamUrl: string): string | null {
  const match = streamUrl.match(/stream\.mux\.com\/([^/.]+)/);
  return match?.[1] ?? null;
}

export function muxThumbnailUrl(playbackId: string, width = 160, height = 160): string {
  return `https://image.mux.com/${playbackId}/thumbnail.jpg?width=${width}&height=${height}&fit_mode=smartcrop`;
}

export function muxStreamHlsUrl(playbackId: string): string {
  return `https://stream.mux.com/${playbackId}.m3u8`;
}

export function muxStaticMp4Url(playbackId: string, renditionName = "highest.mp4"): string {
  return `https://stream.mux.com/${playbackId}/${renditionName}`;
}

export function attachHls(
  element: HTMLMediaElement,
  playbackId: string,
  onError?: () => void
): (() => void) | null {
  const src = muxStreamHlsUrl(playbackId);

  if (element.canPlayType("application/vnd.apple.mpegurl")) {
    element.src = src;
    if (onError) element.onerror = onError;
    return null;
  }

  if (Hls.isSupported()) {
    const hls = new Hls();
    hls.loadSource(src);
    hls.attachMedia(element);
    if (onError) {
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) onError();
      });
    }
    return () => hls.destroy();
  }

  onError?.();
  return null;
}

interface MuxUploadResponse {
  upload_url: string;
  upload_id: string;
  asset_id: string;
}

export interface MuxResolvedAsset {
  status: "waiting" | "preparing" | "ready";
  asset_id?: string;
  playback_id?: string;
  duration?: number;
  mp4_rendition_name?: string;
}

export async function createMuxUpload(): Promise<MuxUploadResponse> {
  const res = await fetch("/api/mux/upload", { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      `Mux upload creation failed (${res.status}): ${JSON.stringify(body)}`
    );
  }
  return res.json();
}

async function resolveMuxUpload(uploadId: string): Promise<MuxResolvedAsset> {
  const res = await fetch("/api/mux/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ upload_id: uploadId }),
  });
  if (!res.ok) throw new Error(`Resolve failed: ${res.status}`);
  return res.json();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function waitForPlaybackId(
  uploadId: string,
  maxAttempts = 30
): Promise<MuxResolvedAsset> {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await resolveMuxUpload(uploadId);
    if (result.status === "ready" && result.playback_id) return result;
    await sleep(Math.min(2000 + i * 500, 5000));
  }
  throw new Error("Timed out waiting for Mux asset to be ready");
}

export async function uploadFileToMux(
  file: File,
  onProgress?: (pct: number) => void
): Promise<MuxUploadResponse> {
  const upload = await createMuxUpload();

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", upload.upload_url);
    xhr.setRequestHeader("Content-Type", file.type);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload PUT failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("Upload network error"));
    xhr.send(file);
  });

  return upload;
}
