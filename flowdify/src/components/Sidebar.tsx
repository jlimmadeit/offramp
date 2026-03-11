import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useWorkspace } from "../context/WorkspaceContext";
import { ACCENT_COLORS, KIND_ICONS, type NodeKindName } from "../lib/types";
import {
  uploadFileToMux,
  waitForPlaybackId,
  getMuxPlaybackId,
  muxThumbnailUrl,
  attachHls,
} from "../lib/mux";
import {
  getFlowstageAesthetics,
  getFlowstageAestheticDetail,
} from "../lib/flowstage";
import { supabase } from "../lib/supabase";
import {
  createTeam,
  createPortalLink,
  getTeam,
  type BundleSocialAccount,
} from "../lib/bundle";
import PostCalendar from "./PostCalendar";

function CollapsibleSection({
  title,
  defaultOpen = true,
  flex = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  flex?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className={`border-b border-sidebar-border flex flex-col ${
        flex && open ? "flex-1 min-h-0" : ""
      }`}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-[12px] font-semibold text-gray-500 uppercase tracking-wider hover:bg-gray-50/50 transition-colors duration-150 flex-shrink-0"
      >
        {title}
        <svg
          className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${
            open ? "rotate-0" : "-rotate-90"
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {open && (
        <div
          className={`px-3 pb-3 ${
            flex ? "flex-1 min-h-0 overflow-y-auto" : "overflow-hidden"
          }`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function DraggableNodeItem({
  kindName,
  displayName,
  kindId,
}: {
  kindName: NodeKindName;
  displayName: string;
  kindId: number;
}) {
  const color = ACCENT_COLORS[kindName];
  const icon = KIND_ICONS[kindName];

  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(
      "application/flowdify-node",
      JSON.stringify({ kindId, kindName })
    );
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-grab active:cursor-grabbing hover:bg-gray-50 transition-colors duration-150 select-none"
    >
      <span
        className="w-6 h-6 rounded-md flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
        style={{ backgroundColor: color }}
      >
        {icon}
      </span>
      <span className="text-[13px] font-medium text-gray-800">
        {displayName}
      </span>
    </div>
  );
}

type UploadStatus = "pending" | "uploading" | "done" | "error";

interface BucketFile {
  id: string;
  name: string;
  type: "video";
  duration: string;
  file?: File;
  thumbnail?: string;
  uploadStatus: UploadStatus;
  uploadProgress: number;
  muxUploadId?: string;
  muxAssetId?: string;
  muxPlaybackId?: string;
  dbVideoId?: number;
}

function VideoBucket() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<BucketFile[]>([]);
  const dbLoadedRef = useRef(false);

  useEffect(() => {
    if (dbLoadedRef.current) return;
    dbLoadedRef.current = true;

    (async () => {
      const videosRes = await supabase.from("videos").select("id, name, url, duration");

      const dbFiles: BucketFile[] = [];

      for (const v of videosRes.data ?? []) {
        const dur = v.duration ?? 0;
        const m = Math.floor(dur / 60);
        const s = Math.round(dur % 60);
        const pbId = v.url ? getMuxPlaybackId(v.url) : null;
        dbFiles.push({
          id: `db-video-${v.id}`,
          name: v.name ?? "Untitled video",
          type: "video",
          duration: dur ? `${m}:${String(s).padStart(2, "0")}` : "—",
          thumbnail: pbId ? muxThumbnailUrl(pbId) : undefined,
          uploadStatus: "done",
          uploadProgress: 100,
          muxPlaybackId: pbId ?? undefined,
          muxAssetId: pbId ?? undefined,
          dbVideoId: v.id,
        });
      }

      setFiles((prev) => {
        const existingIds = new Set(prev.map((f) => f.id));
        const newFiles = dbFiles.filter((f) => !existingIds.has(f.id));
        return [...newFiles, ...prev];
      });
    })();
  }, []);

  const updateFile = useCallback(
    (id: string, patch: Partial<BucketFile>) => {
      setFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, ...patch } : f))
      );
    },
    []
  );

  const startMuxUpload = useCallback(
    async (entry: BucketFile) => {
      if (!entry.file) return;
      updateFile(entry.id, { uploadStatus: "uploading", uploadProgress: 0 });
      try {
        const result = await uploadFileToMux(entry.file, (pct) => {
          updateFile(entry.id, { uploadProgress: pct });
        });

        updateFile(entry.id, { uploadProgress: 100, muxUploadId: result.upload_id });

        const resolved = await waitForPlaybackId(result.upload_id);
        const playbackId = resolved.playback_id!;
        const renditionName = resolved.mp4_rendition_name ?? "highest.mp4";
        const muxUrl = `https://stream.mux.com/${playbackId}/${renditionName}`;

        const patch: Partial<BucketFile> = {
          uploadStatus: "done",
          uploadProgress: 100,
          muxUploadId: result.upload_id,
          muxAssetId: resolved.asset_id,
          muxPlaybackId: playbackId,
          thumbnail: muxThumbnailUrl(playbackId),
        };

        const thumbUrl = muxThumbnailUrl(playbackId, 640, 360);
        const insertData: Record<string, unknown> = {
          name: entry.name,
          url: muxUrl,
          thumbnail_url: thumbUrl,
        };
        if (resolved.duration) insertData.duration = resolved.duration;
        const { data: video } = await supabase
          .from("videos")
          .insert(insertData)
          .select("id")
          .single();
        if (video) patch.dbVideoId = video.id;

        updateFile(entry.id, patch);
      } catch (err) {
        console.error("Mux upload failed:", err);
        updateFile(entry.id, { uploadStatus: "error" });
      }
    },
    [updateFile]
  );

  const processFiles = useCallback(
    (incoming: FileList | null) => {
      if (!incoming) return;
      Array.from(incoming).forEach((file) => {
        if (!file.type.startsWith("video/")) return;

        const entry: BucketFile = {
          id: crypto.randomUUID(),
          name: file.name,
          type: "video",
          duration: "—",
          file,
          uploadStatus: "pending",
          uploadProgress: 0,
        };

        const url = URL.createObjectURL(file);
        const video = document.createElement("video");
        video.preload = "metadata";
        video.onloadedmetadata = () => {
          const secs = Math.round(video.duration);
          const m = Math.floor(secs / 60);
          const s = secs % 60;
          entry.duration = `${m}:${String(s).padStart(2, "0")}`;

          video.currentTime = 1;
          video.onseeked = () => {
            const canvas = document.createElement("canvas");
            canvas.width = 80;
            canvas.height = 80;
            const ctx = canvas.getContext("2d")!;
            const scale = Math.max(
              80 / video.videoWidth,
              80 / video.videoHeight
            );
            const w = video.videoWidth * scale;
            const h = video.videoHeight * scale;
            ctx.drawImage(video, (80 - w) / 2, (80 - h) / 2, w, h);
            entry.thumbnail = canvas.toDataURL("image/jpeg", 0.6);
            URL.revokeObjectURL(url);
            setFiles((prev) => [...prev, { ...entry }]);
            startMuxUpload(entry);
          };
        };
        video.src = url;
      });
    },
    [startMuxUpload]
  );

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      processFiles(e.dataTransfer.files);
    },
    [processFiles]
  );

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const [sortNewest, setSortNewest] = useState(false);

  const displayFiles = useMemo(
    () => (sortNewest ? [...files].reverse() : files),
    [files, sortNewest]
  );

  const [previewVideoId, setPreviewVideoId] = useState<string | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const videoHlsCleanupRef = useRef<(() => void) | null>(null);

  const toggleVideoPreview = useCallback(
    (f: BucketFile) => {
      if (previewVideoId === f.id) {
        videoPreviewRef.current?.pause();
        videoHlsCleanupRef.current?.();
        videoHlsCleanupRef.current = null;
        setPreviewVideoId(null);
        return;
      }
      setPreviewVideoId(f.id);
    },
    [previewVideoId]
  );

  const onVideoPreviewRef = useCallback(
    (el: HTMLVideoElement | null, f: BucketFile) => {
      videoPreviewRef.current = el;
      videoHlsCleanupRef.current?.();
      videoHlsCleanupRef.current = null;
      if (!el || !f.muxPlaybackId) return;
      const cleanup = attachHls(el, f.muxPlaybackId);
      if (cleanup) videoHlsCleanupRef.current = cleanup;
      el.play().catch(() => {});
    },
    []
  );

  useEffect(() => {
    return () => {
      videoHlsCleanupRef.current?.();
    };
  }, []);

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="video/*"
        className="hidden"
        onChange={(e) => processFiles(e.target.files)}
      />

      <div
        onClick={handleClick}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={handleDrop}
        className="border-2 border-dashed border-gray-200 rounded-lg p-5 text-center cursor-pointer hover:border-gray-300 hover:bg-gray-50/50 transition-colors duration-150"
      >
        <div className="text-gray-300 text-[20px] mb-1">↑</div>
        <p className="text-[12px] text-gray-400">
          Drop video files here
        </p>
        <p className="text-[11px] text-gray-300 mt-0.5">
          or click to browse
        </p>
      </div>

      {files.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          <div className="flex items-center justify-between px-1 mb-0.5">
            <span className="text-[10px] text-gray-400">
              {files.length} file{files.length !== 1 ? "s" : ""}
            </span>
            <button
              onClick={() => setSortNewest((v) => !v)}
              className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                sortNewest
                  ? "bg-gray-200 text-gray-700 font-medium"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {sortNewest ? "Newest first" : "Oldest first"}
            </button>
          </div>
          {displayFiles.map((f) => {
            const isVideoPreviewing = previewVideoId === f.id;
            const canPlay = f.uploadStatus === "done" && !!f.muxPlaybackId;

            return (
              <div key={f.id} className="flex flex-col">
                <div
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      "application/flowdify-bucket-file",
                      JSON.stringify({
                        id: f.id,
                        name: f.name,
                        type: f.type,
                        muxUploadId: f.muxUploadId,
                        muxAssetId: f.muxAssetId,
                        dbVideoId: f.dbVideoId,
                      })
                    );
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-gray-50 hover:bg-gray-100 transition-colors cursor-grab active:cursor-grabbing group"
                >
                  {f.thumbnail ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (canPlay) toggleVideoPreview(f);
                      }}
                      className="relative w-8 h-8 rounded overflow-hidden flex-shrink-0"
                    >
                      <img
                        src={f.thumbnail}
                        className="w-full h-full object-cover"
                        alt=""
                      />
                      {canPlay && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white text-[10px] opacity-0 hover:opacity-100 transition-opacity">
                          {isVideoPreviewing ? "■" : "▶"}
                        </span>
                      )}
                    </button>
                  ) : (
                    <span
                      className="w-8 h-8 rounded flex items-center justify-center text-white text-[12px] flex-shrink-0"
                      style={{ backgroundColor: "#AF52DE" }}
                    >
                      ▶
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] text-gray-700 truncate">
                      {f.name}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <p className="text-[10px] text-gray-400">{f.duration}</p>
                      {f.uploadStatus === "uploading" && (
                        <span className="text-[10px] text-blue-500 font-medium">
                          {f.uploadProgress}%
                        </span>
                      )}
                      {f.uploadStatus === "done" && (
                        <span className="text-[10px] text-green-500 font-medium">
                          ✓
                        </span>
                      )}
                      {f.uploadStatus === "error" && (
                        <span className="text-[10px] text-red-500 font-medium">
                          failed
                        </span>
                      )}
                    </div>
                    {f.uploadStatus === "uploading" && (
                      <div className="mt-1 h-[2px] bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all duration-300"
                          style={{ width: `${f.uploadProgress}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(f.id);
                    }}
                    className="text-[11px] text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  >
                    ✕
                  </button>
                </div>

                {isVideoPreviewing && f.muxPlaybackId && (
                  <div className="mt-1 rounded-md overflow-hidden bg-black">
                    <video
                      ref={(el) => onVideoPreviewRef(el, f)}
                      controls
                      muted
                      playsInline
                      className="w-full max-h-[140px] object-contain"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface AudioBucketItem {
  dbId: number;
  flowstageUuid: string;
  name: string;
  duration: number | null;
  url: string | null;
  startTime: number | null;
  endTime: number | null;
}

function AudioBucket({ reloadKey }: { reloadKey: number }) {
  const [audios, setAudios] = useState<AudioBucketItem[]>([]);
  const dbLoadedRef = useRef(false);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const endTimeRef = useRef<number | null>(null);

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
    }
    endTimeRef.current = null;
    setPlayingId(null);
  }, []);

  const togglePlay = useCallback(
    (item: AudioBucketItem) => {
      if (!item.url) return;

      if (playingId === item.dbId) {
        stopPlayback();
        return;
      }

      stopPlayback();

      if (!audioRef.current) {
        audioRef.current = new Audio();
        audioRef.current.addEventListener("ended", () => setPlayingId(null));
        audioRef.current.addEventListener("timeupdate", () => {
          if (
            endTimeRef.current != null &&
            audioRef.current &&
            audioRef.current.currentTime >= endTimeRef.current
          ) {
            audioRef.current.pause();
            setPlayingId(null);
          }
        });
      }

      audioRef.current.src = item.url;
      endTimeRef.current = item.endTime;

      const startFrom = item.startTime ?? 0;
      audioRef.current.currentTime = startFrom;
      audioRef.current.play().catch(() => setPlayingId(null));
      setPlayingId(item.dbId);
    },
    [playingId, stopPlayback]
  );

  useEffect(() => {
    return () => stopPlayback();
  }, [stopPlayback]);

  const loadFromDb = useCallback(async () => {
    const { data: rows } = await supabase
      .from("audios")
      .select("id, flowstage_uuid, name, song_duration, url, start_time, end_time")
      .not("flowstage_uuid", "is", null)
      .order("name");

    if (!rows) return;

    const items: AudioBucketItem[] = rows.map((r) => ({
      dbId: r.id,
      flowstageUuid: r.flowstage_uuid!,
      name: r.name,
      duration: r.song_duration,
      url: r.url ?? null,
      startTime: r.start_time ?? null,
      endTime: r.end_time ?? null,
    }));
    setAudios(items);
  }, []);

  useEffect(() => {
    if (!dbLoadedRef.current) {
      dbLoadedRef.current = true;
      loadFromDb();
    }
  }, [loadFromDb]);

  useEffect(() => {
    if (reloadKey > 0) loadFromDb();
  }, [reloadKey, loadFromDb]);

  const formatDuration = (d: number | null) => {
    if (d == null) return "—";
    const m = Math.floor(d / 60);
    const s = Math.round(d % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div>
      {audios.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-gray-400 px-1">
            {audios.length} song{audios.length !== 1 ? "s" : ""}
          </span>
          {audios.map((a) => {
            const isPlaying = playingId === a.dbId;
            return (
              <div
                key={a.dbId}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(
                    "application/flowdify-bucket-file",
                    JSON.stringify({
                      id: `audio-${a.dbId}`,
                      name: a.name,
                      type: "audio",
                      dbAudioId: a.dbId,
                    })
                  );
                  e.dataTransfer.effectAllowed = "copy";
                }}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-gray-50 hover:bg-gray-100 transition-colors cursor-grab active:cursor-grabbing"
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePlay(a);
                  }}
                  disabled={!a.url}
                  className="w-8 h-8 rounded flex items-center justify-center text-white text-[12px] flex-shrink-0 disabled:opacity-40"
                  style={{ backgroundColor: "#5AC8FA" }}
                  title={!a.url ? "No audio URL yet — sync first" : isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? (
                    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                      <rect x="3" y="2" width="4" height="12" rx="1" />
                      <rect x="9" y="2" width="4" height="12" rx="1" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M4 2l10 6-10 6z" />
                    </svg>
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-gray-700 truncate">{a.name}</p>
                  <p className="text-[10px] text-gray-400">
                    {formatDuration(a.duration)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {audios.length === 0 && (
        <p className="text-[11px] text-gray-400 text-center py-3">
          Sync to load audios from Flowstage
        </p>
      )}
    </div>
  );
}

interface EditStyleBucketItem {
  dbId: number;
  name: string;
}

function EditStyleBucket({ reloadKey }: { reloadKey: number }) {
  const [styles, setStyles] = useState<EditStyleBucketItem[]>([]);
  const dbLoadedRef = useRef(false);

  const loadFromDb = useCallback(async () => {
    const { data: rows } = await supabase
      .from("edit_styles")
      .select("id, name")
      .order("name");

    if (rows) {
      setStyles(rows.map((r) => ({ dbId: r.id, name: r.name ?? "Untitled" })));
    }
  }, []);

  useEffect(() => {
    if (!dbLoadedRef.current) {
      dbLoadedRef.current = true;
      loadFromDb();
    }
  }, [loadFromDb]);

  useEffect(() => {
    if (reloadKey > 0) loadFromDb();
  }, [reloadKey, loadFromDb]);

  return (
    <div>
      {styles.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-gray-400 px-1">
            {styles.length} preset{styles.length !== 1 ? "s" : ""}
          </span>
          {styles.map((s) => (
            <div
              key={s.dbId}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(
                  "application/flowdify-bucket-file",
                  JSON.stringify({
                    id: `edit-style-${s.dbId}`,
                    name: s.name,
                    type: "edit_style",
                    dbEditStyleId: s.dbId,
                  })
                );
                e.dataTransfer.effectAllowed = "copy";
              }}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-gray-50 hover:bg-gray-100 transition-colors cursor-grab active:cursor-grabbing"
            >
              <span
                className="w-8 h-8 rounded flex items-center justify-center text-white text-[12px] flex-shrink-0"
                style={{ backgroundColor: "#5856D6" }}
              >
                ◆
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-gray-700 truncate">{s.name}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {styles.length === 0 && (
        <p className="text-[11px] text-gray-400 text-center py-3">
          Sync to load presets from Flowstage
        </p>
      )}
    </div>
  );
}

interface DbAccountRow {
  id: number;
  username: string | null;
  display_name: string | null;
  platform: string | null;
  bundle_team_id: string | null;
  bundle_team_name: string | null;
  bundle_id: string | null;
  profile_picture_url: string | null;
  follower_ct: number | null;
}

const PLATFORM_COLORS: Record<string, string> = {
  TIKTOK: "#000000",
  INSTAGRAM: "#E1306C",
  YOUTUBE: "#FF0000",
};

const PLATFORM_LABELS: Record<string, string> = {
  TIKTOK: "TikTok",
  INSTAGRAM: "Instagram",
  YOUTUBE: "YouTube",
};

function LinkAccountModal({
  open,
  onClose,
  onAccountsLinked,
}: {
  open: boolean;
  onClose: () => void;
  onAccountsLinked: () => void;
}) {
  const [teamName, setTeamName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [portalOpened, setPortalOpened] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncedCount, setSyncedCount] = useState(0);

  const teamRef = useRef<{ id: string; name: string } | null>(null);

  const handleClose = useCallback(() => {
    setTeamName("");
    setLoading(false);
    setError(null);
    setPortalOpened(false);
    setSyncing(false);
    setSyncedCount(0);
    teamRef.current = null;
    onClose();
  }, [onClose]);

  const handleCreateAndOpenPortal = useCallback(async () => {
    if (!teamName.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const team = await createTeam(teamName.trim());
      teamRef.current = { id: team.id, name: team.name };
      const url = await createPortalLink(team.id);
      window.open(url, "_blank");
      setPortalOpened(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create team");
    } finally {
      setLoading(false);
    }
  }, [teamName]);

  const syncAccounts = useCallback(async () => {
    const team = teamRef.current;
    if (!team) {
      setError("No team created yet — try again.");
      return;
    }

    setSyncing(true);
    setError(null);

    try {
      const teamData = await getTeam(team.id);
      const allSocials = teamData.socialAccounts ?? [];
      const relevantAccounts = allSocials.filter(
        (sa: BundleSocialAccount) =>
          sa.type === "TIKTOK" || sa.type === "INSTAGRAM" || sa.type === "YOUTUBE"
      );

      if (relevantAccounts.length === 0) {
        setError("No accounts found yet. Link your accounts in the Bundle window, then try again.");
        return;
      }

      let inserted = 0;
      for (const sa of relevantAccounts) {
        const { data: existing } = await supabase
          .from("accounts")
          .select("id")
          .eq("bundle_id", sa.id)
          .maybeSingle();

        const row = {
          username: sa.username,
          display_name: sa.displayName,
          platform: sa.type,
          bundle_team_id: team.id,
          bundle_team_name: team.name,
          bundle_id: sa.id,
          profile_picture_url: sa.avatarUrl,
        };

        if (existing) {
          const { error: updErr } = await supabase
            .from("accounts")
            .update(row)
            .eq("id", existing.id);
          if (updErr) {
            setError(`DB update failed: ${updErr.message}`);
            return;
          }
        } else {
          const { error: insErr } = await supabase
            .from("accounts")
            .insert(row);
          if (insErr) {
            setError(`DB insert failed: ${insErr.message}`);
            return;
          }
        }
        inserted++;
      }

      setSyncedCount(inserted);
      onAccountsLinked();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync accounts");
    } finally {
      setSyncing(false);
    }
  }, [onAccountsLinked]);

  if (!open) return null;

  const showDone = syncedCount > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={handleClose}
      />
      <div className="relative bg-white rounded-xl shadow-lg w-[380px] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-gray-900">
            Link account
          </h2>
          <button
            onClick={handleClose}
            className="w-6 h-6 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors text-[13px]"
          >
            ✕
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {showDone ? (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center">
                <svg className="w-6 h-6 text-green-500" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 10l3 3 7-7" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-[13px] font-medium text-gray-800">
                  {syncedCount} account{syncedCount !== 1 ? "s" : ""} linked
                </p>
                <p className="text-[11px] text-gray-400 mt-1">
                  Saved to {teamRef.current?.name}
                </p>
              </div>
              <button
                onClick={handleClose}
                className="w-full px-4 py-2.5 rounded-lg text-[13px] font-semibold text-white bg-[#007AFF] hover:bg-[#0066DD] transition-all duration-150"
              >
                Done
              </button>
            </div>
          ) : !portalOpened ? (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-gray-600">
                  Team name
                </label>
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateAndOpenPortal()}
                  placeholder='e.g. "Drake fan pages"'
                  className="w-full px-3 py-2 text-[13px] text-gray-800 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-all placeholder:text-gray-300"
                  autoFocus
                />
              </div>

              <p className="text-[11px] text-gray-400 leading-relaxed">
                Name your team, then connect your Instagram,
                TikTok, or YouTube accounts.
              </p>

              <button
                onClick={handleCreateAndOpenPortal}
                disabled={!teamName.trim() || loading}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-[13px] font-semibold text-white bg-[#007AFF] hover:bg-[#0066DD] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150"
              >
                {loading ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="2" opacity="0.3" />
                      <path d="M14.5 8a6.5 6.5 0 00-6.5-6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    Creating team...
                  </>
                ) : (
                  "Connect accounts"
                )}
              </button>
            </>
          ) : (
            <>
              <p className="text-[13px] text-gray-600 leading-relaxed">
                Link your accounts in the Bundle Social window, then come back here and sync.
              </p>

              <button
                onClick={syncAccounts}
                disabled={syncing}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-[13px] font-semibold text-white bg-[#34C759] hover:bg-[#2DB84E] disabled:opacity-60 transition-all duration-150"
              >
                {syncing ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="2" opacity="0.3" />
                      <path d="M14.5 8a6.5 6.5 0 00-6.5-6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    Syncing...
                  </>
                ) : (
                  "Sync accounts"
                )}
              </button>
            </>
          )}

          {error && (
            <p className="text-[11px] text-red-500 leading-relaxed">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function AccountsBucket() {
  const [accounts, setAccounts] = useState<DbAccountRow[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const dbLoadedRef = useRef(false);

  const loadFromDb = useCallback(async () => {
    const { data: rows } = await supabase
      .from("accounts")
      .select("id, username, display_name, platform, bundle_team_id, bundle_team_name, bundle_id, profile_picture_url, follower_ct")
      .order("created_at", { ascending: false });

    if (rows) setAccounts(rows);
  }, []);

  useEffect(() => {
    if (!dbLoadedRef.current) {
      dbLoadedRef.current = true;
      loadFromDb();
    }
  }, [loadFromDb]);

  const groupedByTeam = useMemo(() => {
    const groups: Record<string, { teamName: string; accounts: DbAccountRow[] }> = {};
    for (const acc of accounts) {
      const tid = acc.bundle_team_id ?? "unknown";
      if (!groups[tid]) {
        groups[tid] = { teamName: acc.bundle_team_name ?? tid, accounts: [] };
      }
      groups[tid].accounts.push(acc);
    }
    return groups;
  }, [accounts]);

  const removeAccount = useCallback(async (id: number) => {
    await supabase.from("accounts").delete().eq("id", id);
    setAccounts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  return (
    <div>
      <button
        onClick={() => setModalOpen(true)}
        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-[12px] font-semibold text-white transition-all duration-150 hover:opacity-90"
        style={{ backgroundColor: "#FF3B30" }}
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M8 3v10M3 8h10" />
        </svg>
        Link account
      </button>

      {accounts.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          {Object.entries(groupedByTeam).map(([teamId, group]) => (
            <div key={teamId} className="flex flex-col gap-1">
              <span className="text-[10px] text-gray-400 px-1 font-medium uppercase tracking-wider">
                {group.teamName}
              </span>
              {group.accounts.map((acc) => {
                const platform = acc.platform ?? "TIKTOK";
                const color = PLATFORM_COLORS[platform] ?? "#888";
                return (
                  <div
                    key={acc.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        "application/flowdify-account",
                        JSON.stringify({
                          accountId: acc.id,
                          username: acc.username,
                          displayName: acc.display_name,
                          platform: acc.platform,
                          profilePictureUrl: acc.profile_picture_url,
                          followerCt: acc.follower_ct,
                        })
                      );
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-gray-50 hover:bg-gray-100 transition-colors group cursor-grab active:cursor-grabbing"
                  >
                    {acc.profile_picture_url ? (
                      <img
                        src={acc.profile_picture_url}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <span
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[12px] font-bold flex-shrink-0"
                        style={{ backgroundColor: color }}
                      >
                        {(acc.username ?? acc.display_name ?? "?")[0]?.toUpperCase()}
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] text-gray-700 truncate font-medium">
                        {acc.display_name ?? acc.username ?? "Unknown"}
                      </p>
                      <div className="flex items-center gap-1.5">
                        {acc.username && (
                          <span className="text-[10px] text-gray-400 truncate">
                            @{acc.username}
                          </span>
                        )}
                        <span
                          className="px-1 py-0.5 rounded text-white text-[9px] font-medium flex-shrink-0"
                          style={{ backgroundColor: color }}
                        >
                          {PLATFORM_LABELS[platform] ?? platform}
                        </span>
                      </div>
                      {acc.follower_ct != null && acc.follower_ct > 0 && (
                        <span className="text-[10px] text-gray-400">
                          {acc.follower_ct.toLocaleString()} followers
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => removeAccount(acc.id)}
                      className="text-[11px] text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {accounts.length === 0 && (
        <p className="text-[11px] text-gray-400 text-center py-3 mt-1">
          No accounts linked yet
        </p>
      )}

      <LinkAccountModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onAccountsLinked={loadFromDb}
      />
    </div>
  );
}

export default function Sidebar() {
  const { nodeKinds, nodeKindsLoaded } = useWorkspace();
  const [syncing, setSyncing] = useState(false);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [syncVersion, setSyncVersion] = useState(0);

  const syncFromFlowstage = useCallback(async () => {
    setSyncing(true);
    setLastSyncError(null);
    try {
      const aesthetics = await getFlowstageAesthetics();
      const presetEntries: { name: string; sourceAestheticId: string }[] = [];
      const seenPresets = new Set<string>();

      for (const aesthetic of aesthetics) {
        let detail;
        try {
          detail = await getFlowstageAestheticDetail(aesthetic.id);
        } catch (err) {
          console.error(`[Sync] Failed to fetch detail for ${aesthetic.id}:`, err);
          continue;
        }

        // Sync audios
        if (detail.audios && detail.audios.length > 0) {
          for (const fsAudio of detail.audios) {
            const { data: existing } = await supabase
              .from("audios")
              .select("id, url")
              .eq("flowstage_uuid", fsAudio.id)
              .maybeSingle();

            let audioDbId: number;
            let hasUrl = !!existing?.url;

            const firstSection = fsAudio.sections?.[0];

            if (existing) {
              await supabase
                .from("audios")
                .update({
                  name: fsAudio.name,
                  song_duration: fsAudio.duration,
                  start_time: firstSection?.start_time ?? null,
                  end_time: firstSection?.end_time ?? null,
                })
                .eq("id", existing.id);
              audioDbId = existing.id;
            } else {
              const { data: inserted, error } = await supabase
                .from("audios")
                .insert({
                  flowstage_uuid: fsAudio.id,
                  name: fsAudio.name,
                  song_duration: fsAudio.duration,
                  start_time: firstSection?.start_time ?? null,
                  end_time: firstSection?.end_time ?? null,
                })
                .select("id")
                .single();
              if (error || !inserted) {
                console.error("[Sync] Insert audio failed:", error?.message);
                continue;
              }
              audioDbId = inserted.id;
              hasUrl = false;
            }

            if (!hasUrl && fsAudio.url) {
              await supabase
                .from("audios")
                .update({ url: fsAudio.url })
                .eq("id", audioDbId);
            }
          }
        }

        // Collect preset names with source aesthetic
        if (detail.video_preset_names) {
          for (const name of detail.video_preset_names) {
            if (!seenPresets.has(name)) {
              seenPresets.add(name);
              presetEntries.push({ name, sourceAestheticId: aesthetic.id });
            }
          }
        }
      }

      // Sync edit styles (presets) with source aesthetic id
      for (const entry of presetEntries) {
        const { data: existing, error: selErr } = await supabase
          .from("edit_styles")
          .select("id")
          .eq("name", entry.name)
          .maybeSingle();

        if (selErr) {
          console.error("[Sync] edit_styles select failed:", selErr.message);
          continue;
        }

        if (existing) {
          const { error: updErr } = await supabase
            .from("edit_styles")
            .update({ flowstage_aesthetic_id: entry.sourceAestheticId })
            .eq("id", existing.id);
          if (updErr) {
            console.error("[Sync] edit_styles update failed:", updErr.message);
          }
        } else {
          const { error: insErr } = await supabase
            .from("edit_styles")
            .insert({ name: entry.name, flowstage_aesthetic_id: entry.sourceAestheticId });
          if (insErr) {
            console.error("[Sync] edit_styles insert failed:", insErr.message);
          }
        }
      }

      setSyncVersion((v) => v + 1);
    } catch (err) {
      console.error("[Sync] Sync failed:", err);
      setLastSyncError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }, []);

  const orderedKinds: NodeKindName[] = [
    "account_group",
    "aesthetic",
    "audios",
    "captions",
    "edit_styles",
    "edits",
    "text_hooks",
    "videos",
  ];

  return (
    <aside className="w-[260px] flex-shrink-0 bg-white border-r border-sidebar-border flex flex-col h-full select-none">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-sidebar-border">
        <h1 className="text-[18px] font-semibold text-gray-900 tracking-tight">
          Flowdify
        </h1>
      </div>

      {/* Sync button */}
      <div className="px-3 py-3 border-b border-sidebar-border">
        <button
          onClick={syncFromFlowstage}
          disabled={syncing}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-[12px] font-semibold text-white transition-all duration-150 disabled:opacity-60"
          style={{ backgroundColor: "#5AC8FA" }}
        >
          {syncing ? (
            <>
              <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="2" opacity="0.3" />
                <path d="M14.5 8a6.5 6.5 0 00-6.5-6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Syncing…
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 8a7 7 0 0112.9-3.8M15 8a7 7 0 01-12.9 3.8" />
                <path d="M14 1v3.2h-3.2M2 15v-3.2h3.2" />
              </svg>
              Sync from Flowstage
            </>
          )}
        </button>
        {lastSyncError && (
          <p className="text-[10px] text-red-500 mt-1.5 px-1">{lastSyncError}</p>
        )}
      </div>

      {/* Node types */}
      <CollapsibleSection title="Nodes">
        {!nodeKindsLoaded ? (
          <div className="text-[12px] text-gray-400 px-3 py-2">
            Loading...
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {orderedKinds.map((kindName) => {
              const kind = nodeKinds.find((k) => k.name === kindName);
              if (!kind) return null;
              return (
                <DraggableNodeItem
                  key={kind.id}
                  kindId={kind.id}
                  kindName={kindName}
                  displayName={
                    kind.display_name ?? kind.name.replace(/_/g, " ")
                  }
                />
              );
            })}
          </div>
        )}
      </CollapsibleSection>

      {/* Video Bucket */}
      <CollapsibleSection title="Video bucket" defaultOpen={false} flex>
        <VideoBucket />
      </CollapsibleSection>

      {/* Audio Bucket */}
      <CollapsibleSection title="Audio bucket" defaultOpen={false} flex>
        <AudioBucket reloadKey={syncVersion} />
      </CollapsibleSection>

      {/* Edit Style Bucket */}
      <CollapsibleSection title="Edit style bucket" defaultOpen={false} flex>
        <EditStyleBucket reloadKey={syncVersion} />
      </CollapsibleSection>

      {/* Accounts */}
      <CollapsibleSection title="Accounts" defaultOpen={false} flex>
        <AccountsBucket />
      </CollapsibleSection>

      {/* Other */}
      <CollapsibleSection title="Other" defaultOpen={false} flex>
        <div className="mb-1">
          <span className="text-[10px] text-gray-400 px-1 font-medium uppercase tracking-wider">
            Post Schedule
          </span>
        </div>
        <PostCalendar />
      </CollapsibleSection>
    </aside>
  );
}
