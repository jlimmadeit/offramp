import { useState, useCallback, useEffect } from "react";
import { Handle, Position } from "@xyflow/react";
import NodeShell from "../NodeShell";
import { supabase } from "../../lib/supabase";
import { useWorkspace } from "../../context/WorkspaceContext";

interface EditStyleNodeData {
  dbId: number;
  label: string;
  kindName: "edit_styles";
}

interface StyleRow {
  id: number;
  nodeEditStyleId: number;
  name: string;
}

export default function EditStyleNode({
  data,
}: {
  data: EditStyleNodeData;
}) {
  const [styles, setStyles] = useState<StyleRow[]>([]);
  const { loadWorkspace, dropVersion, removeNodeEditStyle } = useWorkspace();

  const loadStyles = useCallback(async () => {
    const { data: rows } = await supabase
      .from("node_edit_styles")
      .select("id, edit_style_id, edit_styles(id, name)")
      .eq("node_id", data.dbId)
      .order("id");

    if (rows) {
      setStyles(
        rows.map((r: any) => ({
          id: r.edit_style_id,
          nodeEditStyleId: r.id,
          name: r.edit_styles?.name ?? "Untitled",
        }))
      );
    }
  }, [data.dbId]);

  useEffect(() => {
    loadStyles();
  }, [loadStyles, dropVersion]);

  const removeStyle = useCallback(
    async (nodeEditStyleId: number) => {
      await removeNodeEditStyle(nodeEditStyleId);
      setStyles((prev) => prev.filter((s) => s.nodeEditStyleId !== nodeEditStyleId));
      loadWorkspace();
    },
    [removeNodeEditStyle, loadWorkspace]
  );

  return (
    <NodeShell
      nodeId={data.dbId}
      kindName="edit_styles"
      title={data.label}
    >
      <div className="nopan nodrag nowheel node-scroll min-h-[36px]" style={{ maxHeight: 300 }}>
        {styles.length === 0 ? (
          <div className="text-[11px] text-gray-400 text-center py-3">
            Drop edit styles from bucket
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {styles.map((s) => (
              <div
                key={s.nodeEditStyleId}
                className="flex items-center gap-2 group"
              >
                <span
                  className="px-2.5 py-1 rounded-full text-[11px] font-medium text-white flex-1 truncate"
                  style={{ backgroundColor: "#5856D6" }}
                >
                  {s.name}
                </span>
                <button
                  onClick={() => removeStyle(s.nodeEditStyleId)}
                  className="text-[10px] text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="editStyle-out"
        style={{ background: "#5856D6" }}
      />
    </NodeShell>
  );
}
