const FLOWSTAGE_PROXY = "/api/flowstage";

let _flowstageKey: string | null = null;

/** Set from AuthContext when the user's Settings key loads or changes. */
export function setFlowstageKey(key: string | null) {
  _flowstageKey = key;
}

function flowstageKeyForRequest(): string | null {
  return _flowstageKey;
}

export function hasFlowstageKey(): boolean {
  return !!_flowstageKey;
}

async function fsFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const key = flowstageKeyForRequest();
  if (key) {
    headers.set("X-Flowstage-Key", key);
  }

  const res = await fetch(`${FLOWSTAGE_PROXY}${path}`, {
    ...init,
    headers,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = `Flowstage API error (${res.status})`;
    try {
      const parsed = JSON.parse(text);
      if (parsed.detail) detail = typeof parsed.detail === "string" ? parsed.detail : JSON.stringify(parsed.detail);
    } catch {
      if (text) detail = `${res.status}: ${text.slice(0, 200)}`;
    }
    console.error(`[Flowstage] ${init?.method ?? "GET"} ${path} → ${res.status}:`, text.slice(0, 500));
    throw new Error(detail);
  }
  return res;
}

interface FlowstageAesthetic {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export async function createFlowstageAesthetic(
  name: string
): Promise<FlowstageAesthetic> {
  const res = await fsFetch("/v1/aesthetics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return res.json();
}

export async function updateFlowstageAesthetic(
  aestheticId: string,
  name: string
): Promise<void> {
  await fsFetch(`/v1/aesthetics/${aestheticId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function getFlowstageAesthetics(): Promise<FlowstageAesthetic[]> {
  const res = await fsFetch("/v1/aesthetics");
  const body = await res.json();
  return body.aesthetics ?? body;
}

export interface FlowstageSectionLine {
  text: string;
  start_time: number;
  end_time: number;
}

export interface FlowstageSection {
  id: string;
  name: string;
  start_time: number;
  end_time: number;
  lines?: FlowstageSectionLine[];
}

export interface FlowstageAudio {
  id: string;
  name: string;
  duration: number;
  url?: string;
  sections: FlowstageSection[];
}

export interface FlowstageAestheticDetail extends FlowstageAesthetic {
  audios: FlowstageAudio[];
  video_preset_names?: string[];
}

export async function getFlowstageAestheticDetail(
  aestheticId: string
): Promise<FlowstageAestheticDetail> {
  const res = await fsFetch(`/v1/aesthetics/${aestheticId}`);
  return res.json();
}

export interface FlowstageAudiosPage {
  audios: FlowstageAudio[];
  total: number;
}

/** Parses GET /v1/audios response (shape varies slightly by API version). */
function parseFlowstageAudiosListBody(body: unknown): FlowstageAudio[] {
  if (Array.isArray(body)) return body as FlowstageAudio[];
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    if (Array.isArray(o.audios)) return o.audios as FlowstageAudio[];
    if (Array.isArray(o.items)) return o.items as FlowstageAudio[];
    if (Array.isArray(o.data)) return o.data as FlowstageAudio[];
  }
  return [];
}

function parseFlowstageAudiosTotal(body: unknown, pageLength: number): number {
  if (body && typeof body === "object") {
    const total = (body as Record<string, unknown>).total;
    if (typeof total === "number" && Number.isFinite(total)) return total;
  }
  return pageLength;
}

/**
 * List audios for the authenticated user (including those not attached to any aesthetic).
 * Paginated: max 50 per page per API.
 */
export async function fetchFlowstageAudiosPage(
  limit = 50,
  offset = 0
): Promise<FlowstageAudiosPage> {
  const params = new URLSearchParams({
    limit: String(Math.min(50, Math.max(1, limit))),
    offset: String(Math.max(0, offset)),
  });
  const res = await fsFetch(`/v1/audios?${params}`);
  const body = await res.json();
  const audios = parseFlowstageAudiosListBody(body);
  return { audios, total: parseFlowstageAudiosTotal(body, audios.length) };
}

/** Fetch every audio on the account via GET /v1/audios pagination. */
export async function fetchAllFlowstageAudios(): Promise<FlowstageAudio[]> {
  const PAGE = 50;
  const all: FlowstageAudio[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { audios, total } = await fetchFlowstageAudiosPage(PAGE, offset);
    if (audios.length === 0) break;
    all.push(...audios);
    if (offset + audios.length >= total) break;
  }
  return all;
}

export async function addAudioToFlowstageAesthetic(
  aestheticId: string,
  audioId: string
): Promise<FlowstageAudio> {
  const res = await fsFetch(`/v1/aesthetics/${aestheticId}/audios`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audio_id: audioId }),
  });
  return res.json();
}

export async function removeAudioFromFlowstageAesthetic(
  aestheticId: string,
  audioId: string
): Promise<void> {
  await fsFetch(`/v1/aesthetics/${aestheticId}/audios/${audioId}`, {
    method: "DELETE",
  });
}

export interface FlowstageTextHook {
  id: string;
  text: string;
}

export async function addTextHookToFlowstageAesthetic(
  aestheticId: string,
  text: string
): Promise<FlowstageTextHook> {
  const res = await fsFetch(`/v1/aesthetics/${aestheticId}/text-hooks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return res.json();
}

export async function removeTextHookFromFlowstageAesthetic(
  aestheticId: string,
  textHookId: string
): Promise<void> {
  await fsFetch(`/v1/aesthetics/${aestheticId}/text-hooks/${textHookId}`, {
    method: "DELETE",
  });
}

interface FlowstageVideo {
  id: string;
  name: string;
  url: string;
  analysis_triggered: boolean;
}

export async function removeVideoFromFlowstageAesthetic(
  aestheticId: string,
  videoId: string
): Promise<void> {
  await fsFetch(`/v1/aesthetics/${aestheticId}/videos/${videoId}`, {
    method: "DELETE",
  });
}

export interface FlowstageVideoEdit {
  id: string;
  name?: string;
  status?: string;
  render_url?: string | null;
}

export interface CreateVideoEditParams {
  aesthetic_id: string;
  audio_id: string;
  section_start_time: number;
  section_end_time: number;
  hook?: string;
  name?: string;
  render?: boolean;
}

export async function createVideoEdit(
  params: CreateVideoEditParams
): Promise<FlowstageVideoEdit> {
  const res = await fsFetch("/v1/video-edits/draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const body = await res.json();
  return {
    id: body.video_edit_id ?? body.id ?? body.edit_id,
    name: body.name,
    status: body.status,
    render_url: body.render_url,
  };
}

export async function getVideoEdit(
  editId: string
): Promise<FlowstageVideoEdit> {
  const res = await fsFetch(`/v1/video-edits/${editId}`);
  const body = await res.json();
  return {
    id: body.id ?? body.edit_id ?? editId,
    name: body.name,
    status: body.status,
    render_url: body.render_url,
  };
}

export async function copyPresetToAesthetic(
  aestheticId: string,
  sourceAestheticId: string,
  presetName: string
): Promise<void> {
  await fsFetch(`/v1/aesthetics/${aestheticId}/presets/copy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_aesthetic_id: sourceAestheticId,
      preset_name: presetName,
    }),
  });
}

export async function removePresetFromAesthetic(
  aestheticId: string,
  presetName: string
): Promise<void> {
  await fsFetch(
    `/v1/aesthetics/${aestheticId}/presets/${encodeURIComponent(presetName)}`,
    { method: "DELETE" }
  );
}

function ensureMuxMp4Url(url: string): string {
  const match = url.match(/^https:\/\/stream\.mux\.com\/([^/.]+)$/);
  if (match) return `${url}/highest.mp4`;
  return url;
}

export async function addVideoToFlowstageAesthetic(
  aestheticId: string,
  video: { url: string; name: string; duration?: number; thumbnailUrl?: string }
): Promise<FlowstageVideo> {
  const videoUrl = ensureMuxMp4Url(video.url);

  let thumbnailUrl = video.thumbnailUrl;
  if (!thumbnailUrl) {
    const match = videoUrl.match(/stream\.mux\.com\/([^/.]+)/);
    if (match?.[1]) {
      thumbnailUrl = `https://image.mux.com/${match[1]}/thumbnail.jpg`;
    }
  }

  const res = await fsFetch(`/v1/aesthetics/${aestheticId}/videos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: videoUrl,
      name: video.name,
      duration: video.duration ?? 0,
      thumbnail_url: thumbnailUrl ?? "",
      analyze: false,
    }),
  });

  return res.json();
}
