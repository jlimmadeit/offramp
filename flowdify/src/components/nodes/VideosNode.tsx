import { useState, useCallback, useEffect, useRef } from "react";
import { Handle, Position } from "@xyflow/react";
import NodeShell from "../NodeShell";
import { supabase } from "../../lib/supabase";
import { useWorkspace } from "../../context/WorkspaceContext";
import { getMuxPlaybackId, muxThumbnailUrl, attachHls } from "../../lib/mux";

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

export default function VideosNode({ data }: { data: VideosNodeData }) {
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const { loadWorkspace, dropVersion, removeNodeVideo } = useWorkspace();
  const [previewId, setPreviewId] = useState<number | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const hlsCleanupRef = useRef<(() => void) | null>(null);

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

  const previewVideo = previewId != null ? videos.find((v) => v.id === previewId) : null;

  return (
    <NodeShell nodeId={data.dbId} kindName="videos" title={data.label}>
      <div className="min-h-[48px]">
        {videos.length === 0 ? (
          <div className="text-[11px] text-gray-400 text-center py-3">
            Drop videos from video bucket
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
