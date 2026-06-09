import { supabase } from "./supabase";

const PROXY_BASE = "/api/bundle";

let _userId: number | null = null;

export function setBundleUser(userId: number | null) {
  _userId = userId;
}

async function freshBundleKey(): Promise<string> {
  if (!_userId) {
    throw new Error("No Bundle API key configured. Add your key in Settings.");
  }

  const { data, error } = await supabase
    .from("users")
    .select("bundle_key")
    .eq("id", _userId)
    .single();

  if (error || !data?.bundle_key) {
    throw new Error("No Bundle API key configured. Add your key in Settings.");
  }

  return data.bundle_key;
}

async function bundleHeaders(extra?: HeadersInit): Promise<Headers> {
  const key = await freshBundleKey();
  const headers = new Headers(extra);
  headers.set("X-Bundle-Key", key);
  return headers;
}

export type BundlePlatform = "TIKTOK" | "YOUTUBE" | "INSTAGRAM";

export interface BundleSocialAccount {
  id: string;
  type: BundlePlatform;
  teamId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  externalId: string | null;
}

export interface BundleTeam {
  id: string;
  name: string;
  socialAccounts: BundleSocialAccount[];
}

export interface CreateTeamResult {
  id: string;
  name: string;
}

export interface TeamListItem {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export async function listTeams(): Promise<TeamListItem[]> {
  const res = await fetch(`${PROXY_BASE}/team/?limit=50`, {
    headers: await bundleHeaders(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? err.message ?? `List teams failed (${res.status})`);
  }

  const data = await res.json();
  return data.items ?? [];
}

export async function createTeam(name: string): Promise<CreateTeamResult> {
  const res = await fetch(`${PROXY_BASE}/team/`, {
    method: "POST",
    headers: await bundleHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ name }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? err.message ?? `Create team failed (${res.status})`);
  }

  return res.json();
}

export async function createPortalLink(
  teamId: string
): Promise<string> {
  const redirectUrl = `${window.location.origin}/linked.html`;
  const res = await fetch(`${PROXY_BASE}/social-account/create-portal-link`, {
    method: "POST",
    headers: await bundleHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      teamId,
      socialAccountTypes: ["INSTAGRAM", "TIKTOK", "YOUTUBE"],
      redirectUrl,
      hideGoBackButton: true,
      showModalOnConnectSuccess: true,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? err.message ?? `Portal link failed (${res.status})`);
  }

  const data = await res.json();
  return data.url;
}

export async function getTeam(teamId: string): Promise<BundleTeam> {
  const res = await fetch(`${PROXY_BASE}/team/${teamId}`, {
    headers: await bundleHeaders(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? err.message ?? `Get team failed (${res.status})`);
  }

  return res.json();
}

export async function uploadToBundle(
  teamId: string,
  file: Blob,
  fileName: string
): Promise<{ id: string; url: string }> {
  const formData = new FormData();
  formData.append("teamId", teamId);
  formData.append("file", file, fileName);

  const res = await fetch(`${PROXY_BASE}/upload/`, {
    method: "POST",
    headers: await bundleHeaders(),
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? err.message ?? `Upload failed (${res.status})`);
  }

  return res.json();
}

export async function createBundlePost(params: {
  teamId: string;
  socialAccountType: BundlePlatform;
  uploadId: string;
  postDate: string;
  title: string;
  caption?: string;
  tiktokSoundId?: string;
  tiktokSoundStartMs?: number;
  tiktokSoundEndMs?: number;
}): Promise<{ id: string }> {
  const { teamId, socialAccountType, uploadId, postDate, title, caption, tiktokSoundId, tiktokSoundStartMs, tiktokSoundEndMs } = params;

  const platformData: Record<string, unknown> = {
    text: caption ?? "",
    uploadIds: [uploadId],
  };
  if (socialAccountType === "TIKTOK") {
    platformData.type = "VIDEO";
    if (tiktokSoundId) {
      const musicInfo: Record<string, unknown> = {
        musicSoundId: tiktokSoundId,
        musicSoundVolume: 5,
        videoOriginalSoundVolume: 95,
        musicSoundStart: tiktokSoundStartMs ?? 0,
      };
      if (tiktokSoundEndMs && tiktokSoundEndMs > (tiktokSoundStartMs ?? 0)) {
        musicInfo.musicSoundEnd = tiktokSoundEndMs;
      }
      platformData.musicSoundInfo = musicInfo;
    }
  }
  else if (socialAccountType === "INSTAGRAM") platformData.type = "REEL";
  else if (socialAccountType === "YOUTUBE") platformData.type = "SHORT";

  const res = await fetch(`${PROXY_BASE}/post/`, {
    method: "POST",
    headers: await bundleHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      teamId,
      title,
      socialAccountTypes: [socialAccountType],
      postDate,
      status: "SCHEDULED",
      data: { [socialAccountType]: platformData },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? err.message ?? `Create post failed (${res.status})`);
  }

  return res.json();
}

export async function rescheduleBundlePost(
  postId: string,
  newDate: string
): Promise<void> {
  const res = await fetch(`${PROXY_BASE}/post/${postId}`, {
    method: "PATCH",
    headers: await bundleHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ postDate: newDate }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? err.message ?? `Reschedule failed (${res.status})`);
  }
}

export interface BundlePostAnalyticsItem {
  id: string;
  profilePostId: string;
  impressions: number;
  impressionsUnique: number;
  views: number;
  viewsUnique: number;
  likes: number;
  dislikes: number;
  comments: number;
  shares: number;
  saves: number;
  createdAt: string;
}

export async function getBundlePostAnalytics(
  bundlePostId: string,
  platformType: BundlePlatform
): Promise<BundlePostAnalyticsItem[]> {
  const params = new URLSearchParams({
    postId: bundlePostId,
    platformType,
  });
  const res = await fetch(`${PROXY_BASE}/analytics/post?${params}`, {
    headers: await bundleHeaders(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? err.message ?? `Post analytics failed (${res.status})`);
  }

  const data = await res.json();
  return data.items ?? [];
}
