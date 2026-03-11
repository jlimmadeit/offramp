import { useState, useCallback, useEffect } from "react";
import { Handle, Position } from "@xyflow/react";
import NodeShell from "../NodeShell";
import { supabase } from "../../lib/supabase";
import { useWorkspace } from "../../context/WorkspaceContext";

interface AudioNodeData {
  dbId: number;
  label: string;
  kindName: "audios";
}

interface AudioRow {
  id: number;
  nodeAudioId: number;
  name: string;
  duration: number | null;
}

function formatTime(seconds: number | null): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function AudioNode({ data }: { data: AudioNodeData }) {
  const [audios, setAudios] = useState<AudioRow[]>([]);
  const { dropVersion, removeNodeAudio, loadWorkspace } = useWorkspace();

  const loadAudios = useCallback(async () => {
    const { data: rows } = await supabase
      .from("node_audios")
      .select("id, audio_id, audios(id, name, song_duration)")
      .eq("node_id", data.dbId)
      .order("id");

    if (!rows) return;

    const audioRows: AudioRow[] = (rows as any[]).map((r) => ({
      id: r.audio_id,
      nodeAudioId: r.id,
      name: r.audios?.name ?? "Untitled",
      duration: r.audios?.song_duration ?? null,
    }));
    setAudios(audioRows);
  }, [data.dbId]);

  useEffect(() => {
    loadAudios();
  }, [loadAudios, dropVersion]);

  const removeAudio = useCallback(
    async (nodeAudioId: number) => {
      await removeNodeAudio(nodeAudioId);
      setAudios((prev) => prev.filter((a) => a.nodeAudioId !== nodeAudioId));
      loadWorkspace();
    },
    [removeNodeAudio, loadWorkspace]
  );

  return (
    <NodeShell nodeId={data.dbId} kindName="audios" title={data.label}>
      <div className="flex flex-col gap-2 nopan nodrag nowheel node-scroll min-h-[48px]">
        {audios.length === 0 && (
          <div className="text-[11px] text-gray-400 text-center py-3">
            Drop audio from audio bucket
          </div>
        )}
        {audios.map((audio) => (
          <div key={audio.nodeAudioId} className="bg-gray-50 rounded-md overflow-hidden group relative">
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="text-[14px] text-node-audio flex-shrink-0">♫</span>
              <div className="flex-1 min-w-0">
                <span className="text-[12px] text-gray-700 font-medium truncate block">
                  {audio.name}
                </span>
                <span className="text-[10px] text-gray-400">
                  {formatTime(audio.duration)}
                </span>
              </div>
              <button
                onClick={() => removeAudio(audio.nodeAudioId)}
                className="w-4 h-4 flex items-center justify-center text-[9px] bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="audio-out"
        style={{ background: "#5AC8FA" }}
      />
    </NodeShell>
  );
}
