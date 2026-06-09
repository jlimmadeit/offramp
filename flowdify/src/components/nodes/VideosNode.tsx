import { useState, useCallback, useEffect, useRef } from "react";
import { Handle, Position } from "@xyflow/react";
import NodeShell from "../NodeShell";
import { supabase } from "../../lib/supabase";
import { useWorkspace } from "../../context/WorkspaceContext";
import {
  getMuxPlaybackId,
  muxThumbnailUrl,
  attachHls,
  uploadFileToMux,
  waitForPlaybackId,
} from "../../lib/mux";

interface VideosNodeData {
  dbId: number;
  label: string;
  kindName: "videos";
}

interface VideoRow {
  id: number;
  videoId: number;
  name: string;
  url: string | null;
  playbackId: string | null;
  duration: number | null;
}

interface UploadingVideo {
  id: string;
  name: string;
  progress: number;
  status: "uploading" | "processing" | "error";
}

export default function VideosNode({ data }: { data: VideosNodeData }) {
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const { loadWorkspace, dropVersion, removeNodeVideo, handleBucketFileDrop } =
    useWorkspace();
  const [previewId, setPreviewId] = useState<number | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const hlsCleanupRef = useRef<(() => void) | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<UploadingVideo[]>([]);
  const uploadQueueRef = useRef<Array<{ file: File; signature: string }>>([]);
  const uploadPumpRunningRef = useRef(false);
  const queuedSignaturesRef = useRef<Set<string>>(new Set());

  const loadVideos = useCallback(async () => {
    const { data: rows } = await supabase
      .from("node_videos")
      .select("id, video_id, videos(id, name, url, duration)")
      .eq("node_id", data.dbId)
      .order("id");

    if (rows) {
      setVideos(
        rows.map((r: any) => {
          const url = r.videos?.url ?? null;
          return {
            id: r.id,
            videoId: r.video_id,
            name: r.videos?.name ?? "Untitled",
            url,
            playbackId: url ? getMuxPlaybackId(url) : null,
            duration: r.videos?.duration ?? null,
          };
        })
      );
    }
  }, [data.dbId]);

  useEffect(() => {
    loadVideos();
  }, [loadVideos, dropVersion]);

  const removeVideo = useCallback(
    async (nodeVideoId: number) => {
      await removeNodeVideo(nodeVideoId);
      setVideos((prev) => prev.filter((v) => v.id !== nodeVideoId));
      if (previewId === nodeVideoId) setPreviewId(null);
      loadWorkspace();
    },
    [removeNodeVideo, loadWorkspace, previewId]
  );

  const handleVideoRef = useCallback(
    (el: HTMLVideoElement | null, playbackId: string) => {
      videoElRef.current = el;
      hlsCleanupRef.current?.();
      hlsCleanupRef.current = null;
      if (!el) return;
      const cleanup = attachHls(el, playbackId);
      if (cleanup) hlsCleanupRef.current = cleanup;
      el.play().catch(() => {});
    },
    []
  );

  useEffect(() => {
    return () => {
      hlsCleanupRef.current?.();
    };
  }, []);

  const processUpload = useCallback(
    async (file: File) => {
      const uploadId = crypto.randomUUID();
      const entry: UploadingVideo = {
        id: uploadId,
        name: file.name,
        progress: 0,
        status: "uploading",
      };
      setUploads((prev) => [...prev, entry]);

      try {
        const result = await uploadFileToMux(file, (pct) => {
          setUploads((prev) =>
            prev.map((u) => (u.id === uploadId ? { ...u, progress: pct } : u))
          );
        });

        setUploads((prev) =>
          prev.map((u) =>
            u.id === uploadId ? { ...u, status: "processing", progress: 100 } : u
          )
        );

        const resolved = await waitForPlaybackId(result.upload_id);
        const playbackId = resolved.playback_id!;
        const renditionName = resolved.mp4_rendition_name ?? "highest.mp4";
        const muxUrl = `https://stream.mux.com/${playbackId}/${renditionName}`;
        const thumbUrl = muxThumbnailUrl(playbackId, 640, 360);

        const insertData: Record<string, unknown> = {
          name: file.name,
          url: muxUrl,
          thumbnail_url: thumbUrl,
        };
        if (resolved.duration) insertData.duration = resolved.duration;

        const { data: video } = await supabase
          .from("videos")
          .insert(insertData)
          .select("id")
          .single();

        if (video) {
          await handleBucketFileDrop(data.dbId, "videos", {
            name: file.name,
            type: "video",
            dbVideoId: video.id,
          });
        }

        setUploads((prev) => prev.filter((u) => u.id !== uploadId));
      } catch (err) {
        console.error("Direct video upload failed:", err);
        setUploads((prev) =>
          prev.map((u) =>
            u.id === uploadId ? { ...u, status: "error" } : u
          )
        );
      }
    },
    [data.dbId, handleBucketFileDrop]
  );

  const pumpUploadQueue = useCallback(async () => {
    if (uploadPumpRunningRef.current) return;
    uploadPumpRunningRef.current = true;
    try {
      while (uploadQueueRef.current.length > 0) {
        const next = uploadQueueRef.current.shift();
        if (!next) continue;
        try {
          await processUpload(next.file);
        } finally {
          queuedSignaturesRef.current.delete(next.signature);
        }
      }
    } finally {
      uploadPumpRunningRef.current = false;
    }
  }, [processUpload]);

  const handleFileSelect = useCallback(
    (fileList: FileList | null) => {
      if (!fileList) return;
      for (const file of Array.from(fileList)) {
        if (!file.type.startsWith("video/")) continue;
        const signature = `${file.name}:${file.size}:${file.lastModified}`;
        if (queuedSignaturesRef.current.has(signature)) continue;
        queuedSignaturesRef.current.add(signature);
        uploadQueueRef.current.push({ file, signature });
      }
      void pumpUploadQueue();
    },
    [pumpUploadQueue]
  );

  const previewVideo = previewId != null ? videos.find((v) => v.id === previewId) : null;
  const hasContent = videos.length > 0 || uploads.length > 0;

  return (
    <NodeShell nodeId={data.dbId} kindName="videos" title={data.label}>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          handleFileSelect(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="min-h-[48px]">
        {!hasContent ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = "copy";
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleFileSelect(e.dataTransfer.files);
            }}
            className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center cursor-pointer hover:border-node-videos/40 hover:bg-purple-50/30 transition-colors duration-150 nopan nodrag"
          >
            <div className="text-gray-300 text-[16px] mb-0.5">↑</div>
            <p className="text-[11px] text-gray-400">
              Drop videos or click to upload
            </p>
          </div>
        ) : (
          <>
            <div
              className="overflow-y-auto nopan nodrag nowheel"
              style={{ maxHeight: 210 }}
            >
              <div className="grid grid-cols-3 gap-1.5">
                {videos.map((v) => (
                  <div
                    key={v.id}
                    className="aspect-square bg-gray-100 rounded-md flex items-center justify-center relative group overflow-hidden cursor-pointer"
                    onClick={() =>
                      v.playbackId &&
                      setPreviewId(previewId === v.id ? null : v.id)
                    }
                  >
                    {v.playbackId ? (
                      <img
                        src={muxThumbnailUrl(v.playbackId, 120, 120)}
                        alt={v.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-node-videos text-[16px]">▶</span>
                    )}
                    {v.playbackId && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/20 text-white text-[14px] opacity-0 group-hover:opacity-100 transition-opacity">
                        {previewId === v.id ? "■" : "▶"}
                      </span>
                    )}
                    {v.duration != null && (
                      <span className="absolute bottom-0.5 right-0.5 text-[9px] bg-black/60 text-white px-1 rounded">
                        {Math.floor(v.duration / 60)}:
                        {String(Math.round(v.duration % 60)).padStart(2, "0")}
                      </span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeVideo(v.id);
                      }}
                      className="absolute top-0.5 right-0.5 w-4 h-4 flex items-center justify-center text-[9px] bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ✕
                    </button>
                    <span className="absolute bottom-0.5 left-0.5 text-[8px] text-white bg-black/40 px-1 rounded truncate max-w-[90%]">
                      {v.name.replace(/\.[^.]+$/, "")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            {uploads.length > 0 && (
              <div className="mt-1.5 flex flex-col gap-1">
                {uploads.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-gray-50"
                  >
                    <span className="w-5 h-5 rounded flex items-center justify-center text-white text-[9px] flex-shrink-0 bg-node-videos">
                      {u.status === "error" ? "!" : "↑"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-gray-600 truncate">
                        {u.name}
                      </p>
                      {u.status === "uploading" && (
                        <div className="mt-0.5 h-[2px] bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-node-videos rounded-full transition-all duration-300"
                            style={{ width: `${u.progress}%` }}
                          />
                        </div>
                      )}
                      {u.status === "processing" && (
                        <p className="text-[9px] text-node-videos">
                          Processing...
                        </p>
                      )}
                      {u.status === "error" && (
                        <p className="text-[9px] text-red-500">Failed</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-1.5 w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[10px] text-gray-400 hover:text-node-videos hover:bg-purple-50/50 transition-colors duration-150 nopan nodrag"
            >
              <span className="text-[11px]">+</span> Upload videos
            </button>

            {previewVideo?.playbackId && (
              <div className="mt-2 rounded-md overflow-hidden bg-black">
                <video
                  key={previewVideo.id}
                  ref={(el) =>
                    handleVideoRef(el, previewVideo.playbackId!)
                  }
                  controls
                  muted
                  playsInline
                  className="w-full max-h-[160px] object-contain"
                />
              </div>
            )}
          </>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="clips-out"
        style={{ background: "#AF52DE" }}
      />
    </NodeShell>
  );
}
