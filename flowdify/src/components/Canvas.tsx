import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  type OnConnect,
  type IsValidConnection,
  useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useWorkspace } from "../context/WorkspaceContext";
import { ACCENT_COLORS, type NodeKindName } from "../lib/types";
import { createFlowstageAesthetic } from "../lib/flowstage";
import VideosNode from "./nodes/VideosNode";
import AudioNode from "./nodes/AudioNode";
import TextHooksNode from "./nodes/TextHooksNode";
import EditStyleNode from "./nodes/EditStyleNode";
import EditsNode from "./nodes/EditsNode";
import AestheticNode from "./nodes/AestheticNode";
import AccountNode from "./nodes/AccountNode";
import CaptionsNode from "./nodes/CaptionsNode";
import NameNodeModal from "./NameNodeModal";

interface PendingDrop {
  kindId: number;
  kindName: NodeKindName;
  x: number;
  y: number;
}

const nodeTypes: NodeTypes = {
  videos: VideosNode,
  audios: AudioNode,
  text_hooks: TextHooksNode,
  edit_styles: EditStyleNode,
  edits: EditsNode,
  aesthetic: AestheticNode,
  account_group: AccountNode,
  captions: CaptionsNode,
};

const HANDLE_RULES: Record<
  string,
  { targetKind: NodeKindName; targetHandle: string }
> = {
  "clips-out": { targetKind: "aesthetic", targetHandle: "in" },
  "audio-out": { targetKind: "aesthetic", targetHandle: "in" },
  "text-out": { targetKind: "aesthetic", targetHandle: "in" },
  "editStyle-out": { targetKind: "aesthetic", targetHandle: "in" },
  "aesthetic-out": { targetKind: "edits", targetHandle: "in" },
  "edits-out": { targetKind: "account_group", targetHandle: "in" },
  "captions-out": { targetKind: "account_group", targetHandle: "in" },
};

const SOURCE_HANDLE_MAP: Partial<Record<NodeKindName, string>> = {
  videos: "clips-out",
  audios: "audio-out",
  text_hooks: "text-out",
  edit_styles: "editStyle-out",
  edits: "edits-out",
  aesthetic: "aesthetic-out",
  captions: "captions-out",
};

const TARGET_HANDLE_MAP: Partial<Record<NodeKindName, string>> = {
  videos: "in",
  audios: "in",
  text_hooks: "in",
  edits: "in",
  edit_styles: "in",
  aesthetic: "in",
};

function CanvasInner() {
  const {
    dbNodes,
    dbCurrents,
    nodeKindsLoaded,
    getKindName,
    insertNode,
    updateNodePosition,
    deleteNode,
    insertCurrent,
    deleteCurrent,
    handleBucketFileDrop,
    handleAccountDrop,
    syncingCurrentIds,
    postingNodeIds,
  } = useWorkspace();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const { screenToFlowPosition } = useReactFlow();
  const debounceTimers = useRef<
    Record<string, ReturnType<typeof setTimeout>>
  >({});

  useEffect(() => {
    if (!nodeKindsLoaded) return;
    const rfNodes: Node[] = dbNodes.map((dn) => {
      const kindName = getKindName(dn.kind_id) ?? "videos";
      return {
        id: String(dn.id),
        type: kindName,
        position: { x: dn.x_position, y: dn.y_position },
        data: {
          dbId: dn.id,
          label: dn.name ?? kindName.replace(/_/g, " "),
          kindName,
        },
      };
    });
    setNodes(rfNodes);
  }, [dbNodes, nodeKindsLoaded, getKindName, setNodes]);

  useEffect(() => {
    if (!nodeKindsLoaded) return;
    const rfEdges: Edge[] = dbCurrents.map((dc) => {
      const sourceNode = dbNodes.find((n) => n.id === dc.from_node_id);
      const sourceKind = sourceNode
        ? (getKindName(sourceNode.kind_id) as NodeKindName | undefined)
        : undefined;
      const color = sourceKind ? ACCENT_COLORS[sourceKind] : "#999";
      const isSyncing = syncingCurrentIds.has(dc.id);
      const isPosting = postingNodeIds.has(dc.to_node_id);

      return {
        id: `current-${dc.id}`,
        source: String(dc.from_node_id),
        target: String(dc.to_node_id),
        sourceHandle: sourceKind ? SOURCE_HANDLE_MAP[sourceKind] : undefined,
        targetHandle: sourceKind ? TARGET_HANDLE_MAP[sourceKind] : undefined,
        style: {
          stroke: isPosting ? "#34C759" : color,
          strokeWidth: isPosting ? 2.5 : 1.5,
          opacity: isPosting ? 0.9 : 0.6,
        },
        className: isSyncing ? "edge-syncing" : isPosting ? "edge-posting" : undefined,
        data: { currentId: dc.id },
      };
    });
    setEdges(rfEdges);
  }, [dbCurrents, dbNodes, nodeKindsLoaded, getKindName, setEdges, syncingCurrentIds, postingNodeIds]);

  const isValidConnection: IsValidConnection = useCallback(
    (connection: Connection | Edge) => {
      const sourceHandle = connection.sourceHandle;
      if (!sourceHandle || !HANDLE_RULES[sourceHandle]) return false;

      const rule = HANDLE_RULES[sourceHandle]!;
      if (connection.targetHandle !== rule.targetHandle) return false;

      const targetNode = nodes.find((n) => n.id === connection.target);
      if (!targetNode) return false;

      return (
        (targetNode.data as { kindName?: string }).kindName ===
        rule.targetKind
      );
    },
    [nodes]
  );

  const onConnect: OnConnect = useCallback(
    async (connection) => {
      const fromId = parseInt(connection.source!, 10);
      const toId = parseInt(connection.target!, 10);

      const newCurrent = await insertCurrent(fromId, toId);
      if (newCurrent) {
        const sourceNode = dbNodes.find((n) => n.id === fromId);
        const sourceKind = sourceNode
          ? (getKindName(sourceNode.kind_id) as NodeKindName | undefined)
          : undefined;
        const color = sourceKind ? ACCENT_COLORS[sourceKind] : "#999";

        const newEdge: Edge = {
          id: `current-${newCurrent.id}`,
          source: connection.source!,
          target: connection.target!,
          sourceHandle: connection.sourceHandle,
          targetHandle: connection.targetHandle,
          style: { stroke: color, strokeWidth: 1.5, opacity: 0.6 },
          data: { currentId: newCurrent.id },
        };
        setEdges((eds) => addEdge(newEdge, eds));
      }
    },
    [insertCurrent, dbNodes, getKindName, setEdges]
  );

  const onEdgeContextMenu = useCallback(
    async (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault();
      const currentId = (edge.data as { currentId?: number })?.currentId;
      if (currentId != null) {
        await deleteCurrent(currentId);
      }
    },
    [deleteCurrent]
  );

  const lastHighlightRef = useRef<Element | null>(null);
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();

    const hasBucketFile = event.dataTransfer.types.includes(
      "application/flowdify-bucket-file"
    );
    const hasAccount = event.dataTransfer.types.includes(
      "application/flowdify-account"
    );

    event.dataTransfer.dropEffect = (hasBucketFile || hasAccount) ? "copy" : "move";

    if (hasBucketFile || hasAccount) {
      const el = document.elementFromPoint(event.clientX, event.clientY);
      const nodeEl = el?.closest(".react-flow__node") ?? null;

      if (lastHighlightRef.current && lastHighlightRef.current !== nodeEl) {
        lastHighlightRef.current.classList.remove("drop-highlight");
      }
      if (nodeEl) {
        nodeEl.classList.add("drop-highlight");
      }
      lastHighlightRef.current = nodeEl;
    }
  }, []);

  const onDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();

      if (lastHighlightRef.current) {
        lastHighlightRef.current.classList.remove("drop-highlight");
        lastHighlightRef.current = null;
      }

      const bucketRaw = event.dataTransfer.getData(
        "application/flowdify-bucket-file"
      );
      if (bucketRaw) {
        const bucketFile = JSON.parse(bucketRaw) as {
          id: string;
          name: string;
          type: string;
          muxUploadId?: string;
          muxAssetId?: string;
          dbAudioId?: number;
          dbEditStyleId?: number;
        };

        const el = document.elementFromPoint(event.clientX, event.clientY);
        const nodeEl = el?.closest(".react-flow__node");
        const nodeId = nodeEl?.getAttribute("data-id");
        if (!nodeId) return;

        const targetNode = nodes.find((n) => n.id === nodeId);
        if (!targetNode) return;

        const kindName = (targetNode.data as { kindName?: string })
          .kindName as NodeKindName | undefined;
        if (!kindName) return;

        await handleBucketFileDrop(
          parseInt(nodeId, 10),
          kindName,
          bucketFile
        );
        return;
      }

      const accountRaw = event.dataTransfer.getData("application/flowdify-account");
      if (accountRaw) {
        const account = JSON.parse(accountRaw) as {
          accountId: number;
          username: string | null;
          displayName: string | null;
          platform: string | null;
          profilePictureUrl: string | null;
          followerCt: number | null;
        };

        const el = document.elementFromPoint(event.clientX, event.clientY);
        const nodeEl = el?.closest(".react-flow__node");
        const nodeId = nodeEl?.getAttribute("data-id");
        if (!nodeId) return;

        const targetNode = nodes.find((n) => n.id === nodeId);
        if (!targetNode) return;

        const kindName = (targetNode.data as { kindName?: string }).kindName;
        if (kindName !== "account_group") return;

        await handleAccountDrop(parseInt(nodeId, 10), account);
        return;
      }

      const raw = event.dataTransfer.getData("application/flowdify-node");
      if (!raw) return;

      const { kindId, kindName } = JSON.parse(raw) as {
        kindId: number;
        kindName: NodeKindName;
      };

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      setPendingDrop({
        kindId,
        kindName,
        x: Math.round(position.x),
        y: Math.round(position.y),
      });
    },
    [screenToFlowPosition, nodes, handleBucketFileDrop, handleAccountDrop]
  );

  const handleModalConfirm = useCallback(
    async (name: string) => {
      if (!pendingDrop) return;

      const { kindId, kindName, x, y } = pendingDrop;

      if (kindName === "aesthetic") {
        setModalLoading(true);
        try {
          const aesthetic = await createFlowstageAesthetic(name);
          await insertNode(name, x, y, kindId, aesthetic.id);
        } catch (err) {
          console.error("Flowstage create aesthetic failed:", err);
          setModalLoading(false);
          return;
        }
        setModalLoading(false);
      } else {
        await insertNode(name, x, y, kindId);
      }

      setPendingDrop(null);
    },
    [pendingDrop, insertNode]
  );

  const handleModalCancel = useCallback(() => {
    if (!modalLoading) setPendingDrop(null);
  }, [modalLoading]);

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const dbId = parseInt(node.id, 10);
      if (debounceTimers.current[node.id]) {
        clearTimeout(debounceTimers.current[node.id]);
      }
      debounceTimers.current[node.id] = setTimeout(() => {
        updateNodePosition(
          dbId,
          Math.round(node.position.x),
          Math.round(node.position.y)
        );
      }, 300);
    },
    [updateNodePosition]
  );

  const onNodesDelete = useCallback(
    async (deletedNodes: Node[]) => {
      for (const n of deletedNodes) {
        await deleteNode(parseInt(n.id, 10));
      }
    },
    [deleteNode]
  );

  const onEdgesDelete = useCallback(
    async (deletedEdges: Edge[]) => {
      for (const e of deletedEdges) {
        const currentId = (e.data as { currentId?: number })?.currentId;
        if (currentId != null) {
          await deleteCurrent(currentId);
        }
      }
    },
    [deleteCurrent]
  );

  const defaultEdgeOptions = useMemo(
    () => ({
      style: { strokeWidth: 1.5, opacity: 0.6 },
      type: "default" as const,
    }),
    []
  );

  return (
    <div className="flex-1 h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        isValidConnection={isValidConnection}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onNodeDragStop={onNodeDragStop}
        onEdgeContextMenu={onEdgeContextMenu}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        panOnScroll
        proOptions={{ hideAttribution: true }}
        className="bg-canvas"
      >
        <Background color="#ddd" gap={20} size={1} />
        <Controls
          showInteractive={false}
          className="!bg-white !border-sidebar-border !shadow-node !rounded-lg"
        />
        <MiniMap
          nodeStrokeWidth={3}
          className="!bg-white !border-sidebar-border !shadow-node !rounded-lg"
        />
      </ReactFlow>

      {pendingDrop && (
        <NameNodeModal
          kindName={pendingDrop.kindName}
          onConfirm={handleModalConfirm}
          onCancel={handleModalCancel}
          loading={modalLoading}
        />
      )}
    </div>
  );
}

export default function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
