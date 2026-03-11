const PROXY_BASE = "/api/bundle";

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

export async function createTeam(name: string): Promise<CreateTeamResult> {
  const res = await fetch(`${PROXY_BASE}/team/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `Create team failed (${res.status})`);
  }

  return res.json();
}

export async function createPortalLink(
  teamId: string
): Promise<string> {
  const redirectUrl = `${window.location.origin}/linked.html`;
  const res = await fetch(`${PROXY_BASE}/social-account/create-portal-link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
    throw new Error(err.message ?? `Portal link failed (${res.status})`);
  }

  const data = await res.json();
  return data.url;
}

export async function getTeam(teamId: string): Promise<BundleTeam> {
  const res = await fetch(`${PROXY_BASE}/team/${teamId}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `Get team failed (${res.status})`);
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
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `Upload failed (${res.status})`);
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
}): Promise<{ id: string }> {
  const { teamId, socialAccountType, uploadId, postDate, title, caption } = params;

  const platformData: Record<string, unknown> = {
    text: caption ?? "",
    uploadIds: [uploadId],
  };
  if (socialAccountType === "TIKTOK") platformData.type = "VIDEO";
  else if (socialAccountType === "INSTAGRAM") platformData.type = "REEL";
  else if (socialAccountType === "YOUTUBE") platformData.type = "SHORT";

  const res = await fetch(`${PROXY_BASE}/post/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
    throw new Error(err.message ?? `Create post failed (${res.status})`);
  }

  return res.json();
}

export async function rescheduleBundlePost(
  postId: string,
  newDate: string
): Promise<void> {
  const res = await fetch(`${PROXY_BASE}/post/${postId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ postDate: newDate }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `Reschedule failed (${res.status})`);
  }
}
