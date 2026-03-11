import { Handle, Position } from "@xyflow/react";
import NodeShell from "../NodeShell";
import { useWorkspace } from "../../context/WorkspaceContext";

interface AestheticNodeData {
  dbId: number;
  label: string;
  kindName: "aesthetic";
}

interface SlotRowProps {
  label: string;
  count: number;
  target: number;
  connected: boolean;
}

function SlotRow({ label, count, target, connected }: SlotRowProps) {
  const met = count >= target;
  return (
    <div className="flex items-center gap-2 py-1">
      <div
        className="w-2 h-2 rounded-full flex-shrink-0 transition-colors duration-200"
        style={{
          backgroundColor: connected
            ? met
              ? "#34C759"
              : "#FF9500"
            : "#E5E5EA",
        }}
      />
      <span className="text-[12px] text-gray-600 flex-1">{label}</span>
      <span
        className={`text-[11px] font-medium ${
          met ? "text-green-600" : "text-gray-400"
        }`}
      >
        {count}/{target}
      </span>
    </div>
  );
}

export default function AestheticNode({
  data,
}: {
  data: AestheticNodeData;
}) {
  const { getAestheticAssetCounts } = useWorkspace();
  const counts = getAestheticAssetCounts(data.dbId);

  const clipsConnected = counts.clips > 0 || counts.editStyle > 0;
  const clipsMet = counts.clips >= 5;
  const audioMet = counts.audio >= 1;
  const textMet = counts.text >= 1;
  const editMet = counts.editStyle >= 1;
  const readyCount =
    (clipsMet ? 1 : 0) +
    (audioMet ? 1 : 0) +
    (textMet ? 1 : 0) +
    (editMet ? 1 : 0);
  const allComplete = readyCount === 4;

  const accentColor = allComplete ? "#34C759" : "#007AFF";

  return (
    <NodeShell
      nodeId={data.dbId}
      kindName="aesthetic"
      title={data.label}
      accentOverride={accentColor}
    >
      <div className="flex flex-col gap-0.5">
        <SlotRow
          label="Clips"
          count={counts.clips}
          target={5}
          connected={clipsConnected}
        />
        <SlotRow
          label="Audio"
          count={counts.audio}
          target={1}
          connected={counts.audio > 0}
        />
        <SlotRow
          label="Text hooks"
          count={counts.text}
          target={1}
          connected={counts.text > 0}
        />
        <SlotRow
          label="Edit style"
          count={counts.editStyle}
          target={1}
          connected={counts.editStyle > 0}
        />
      </div>

      {/* Status footer */}
      <div className="mt-3 pt-2 border-t border-gray-100 flex items-center gap-2">
        <div
          className="w-2.5 h-2.5 rounded-full transition-colors duration-300"
          style={{
            backgroundColor: allComplete ? "#34C759" : "#FF3B30",
          }}
        />
        <span className="text-[12px] font-medium text-gray-600">
          {readyCount}/4 ready
        </span>
      </div>

      {/* Single target handle on left */}
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        style={{ background: accentColor }}
      />

      {/* Output handle on right */}
      <Handle
        type="source"
        position={Position.Right}
        id="aesthetic-out"
        style={{ background: accentColor }}
      />
    </NodeShell>
  );
}
