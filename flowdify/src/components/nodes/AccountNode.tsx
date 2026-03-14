import { useState, useCallback, useEffect } from "react";
import { Handle, Position } from "@xyflow/react";
import NodeShell from "../NodeShell";
import { useWorkspace, type AccountMember } from "../../context/WorkspaceContext";
import { supabase } from "../../lib/supabase";
import { uploadToBundle, createBundlePost, type BundlePlatform } from "../../lib/bundle";

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

interface AccountNodeData {
  dbId: number;
  label: string;
  kindName: "account_group";
}

interface PostRow {
  id: number;
  accountId: number;
  editId: number;
  editName: string;
  platform: string;
  platformCaption: string;
  scheduledTime: string;
  bundlePostId: string | null;
}

export default function AccountNode({
  data,
}: {
  data: AccountNodeData;
}) {
  const {
    isAccountConnected,
    accountGroupMembers,
    removeAccountGroupMember,
    dbCurrents,
    dbNodes,
    getKindName,
    addPostingNode,
    removePostingNode,
  } = useWorkspace();

  const connected = isAccountConnected(data.dbId);
  const members: AccountMember[] = accountGroupMembers[data.dbId] ?? [];
  const hasMembers = members.length > 0;
  const accentColor = hasMembers ? "#34C759" : (connected ? "#34C759" : "#FF3B30");

  const [posting, setPosting] = useState(false);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [expandedAccounts, setExpandedAccounts] = useState<Set<number>>(new Set());
  const [availableEditsCount, setAvailableEditsCount] = useState(0);
  const [availableEdits, setAvailableEdits] = useState<{ id: number; name: string; renderUrl: string }[]>([]);

  const loadPosts = useCallback(async () => {
    if (members.length === 0) return;
    const accountIds = members.map((m) => m.accountId);
    const { data: rows } = await supabase
      .from("posts")
      .select("id, account_id, edit_id, bundle_post_id, platform, platform_caption, scheduled_time, edits(name)")
      .in("account_id", accountIds)
      .order("scheduled_time", { ascending: false });

    if (rows) {
      setPosts(
        rows.map((r: any) => ({
          id: r.id,
          accountId: r.account_id,
          editId: r.edit_id,
          editName: r.edits?.name ?? "Untitled",
          platform: r.platform ?? "",
          platformCaption: r.platform_caption ?? "",
          scheduledTime: r.scheduled_time ?? "",
          bundlePostId: r.bundle_post_id ?? null,
        }))
      );
    }
  }, [members]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  const findConnectedEditsNodes = useCallback(() => {
    return dbCurrents
      .filter((c) => c.to_node_id === data.dbId)
      .map((c) => dbNodes.find((n) => n.id === c.from_node_id))
      .filter(
        (n): n is (typeof dbNodes)[number] =>
          !!n && getKindName(n.kind_id) === "edits"
      );
  }, [dbCurrents, dbNodes, data.dbId, getKindName]);

  const findConnectedCaptionNodes = useCallback(() => {
    return dbCurrents
      .filter((c) => c.to_node_id === data.dbId)
      .map((c) => dbNodes.find((n) => n.id === c.from_node_id))
      .filter(
        (n): n is (typeof dbNodes)[number] =>
          !!n && getKindName(n.kind_id) === "captions"
      );
  }, [dbCurrents, dbNodes, data.dbId, getKindName]);

  const refreshAvailableEdits = useCallback(async () => {
    const editsNodes = findConnectedEditsNodes();
    if (editsNodes.length === 0) {
      setAvailableEditsCount(0);
      setAvailableEdits([]);
      return;
    }

    const { data: neRows } = await supabase
      .from("node_edits")
      .select("edit_id, edits(name, render_url)")
      .in("node_id", editsNodes.map((n) => n.id));

    const rendered = (neRows as any[] ?? []).filter((r) => r.edits?.render_url);
    if (rendered.length === 0) {
      setAvailableEditsCount(0);
      setAvailableEdits([]);
      return;
    }

    const editIds = rendered.map((r: any) => r.edit_id);
    const { data: posted } = await supabase
      .from("posts")
      .select("edit_id")
      .in("edit_id", editIds);
    const postedIds = new Set((posted ?? []).map((r) => r.edit_id));

    const ready = rendered
      .filter((r: any) => !postedIds.has(r.edit_id))
      .map((r: any) => ({
        id: r.edit_id as number,
        name: (r.edits?.name ?? "Untitled") as string,
        renderUrl: r.edits.render_url as string,
      }));

    setAvailableEditsCount(ready.length);
    setAvailableEdits(ready);
  }, [findConnectedEditsNodes]);

  useEffect(() => {
    refreshAvailableEdits();
  }, [refreshAvailableEdits]);

  const handlePost = useCallback(async () => {
    const editsNodes = findConnectedEditsNodes();
    if (editsNodes.length === 0) {
      console.warn("[Account] No connected edits nodes");
      return;
    }

    const editsNodeIds = editsNodes.map((n) => n.id);
    const { data: neRows } = await supabase
      .from("node_edits")
      .select("edit_id, edits(id, name, render_url)")
      .in("node_id", editsNodeIds);

    const renderedEdits = (neRows as any[] ?? [])
      .filter((r) => r.edits?.render_url)
      .map((r) => ({
        id: r.edits.id as number,
        name: (r.edits.name ?? "Untitled") as string,
        renderUrl: r.edits.render_url as string,
      }));

    if (renderedEdits.length === 0) {
      console.warn("[Account] No rendered edits to post");
      return;
    }

    const { data: alreadyPosted } = await supabase
      .from("posts")
      .select("edit_id")
      .in("edit_id", renderedEdits.map((e) => e.id));
    const postedEditIds = new Set((alreadyPosted ?? []).map((r) => r.edit_id));
    const newEdits = renderedEdits.filter((e) => !postedEditIds.has(e.id));

    if (newEdits.length === 0) {
      console.warn("[Account] All edits already posted");
      return;
    }

    const captionNodes = findConnectedCaptionNodes();
    let allCaptions: string[] = [];
    if (captionNodes.length > 0) {
      const { data: capRows } = await supabase
        .from("node_captions")
        .select("caption")
        .in("node_id", captionNodes.map((n) => n.id))
        .not("caption", "is", null);
      allCaptions = (capRows ?? []).map((r) => r.caption!).filter(Boolean);
    }

    const node = dbNodes.find((n) => n.id === data.dbId);
    const groupId = node?.account_group_id;
    if (!groupId) {
      console.warn("[Account] No account_group_id on this node");
      return;
    }

    const [groupRes, membersRes] = await Promise.all([
      supabase
        .from("account_groups")
        .select("max_post_per_account_per_day")
        .eq("id", groupId)
        .single(),
      supabase
        .from("account_group_members")
        .select("account_id, accounts(id, bundle_id, bundle_team_id, platform, username)")
        .eq("account_group_id", groupId)
        .eq("is_active", true),
    ]);

    const maxPerDay = (groupRes.data as any)?.max_post_per_account_per_day ?? 3;
    const dbMembers = membersRes.data as any[];
    if (!dbMembers || dbMembers.length === 0) {
      console.warn("[Account] No active members in account group");
      return;
    }

    const member = dbMembers[Math.floor(Math.random() * dbMembers.length)];
    const account = member.accounts;
    if (!account?.bundle_id || !account?.bundle_team_id) {
      console.warn("[Account] Selected account missing bundle IDs");
      return;
    }

    const todayStr = new Date().toISOString().split("T")[0];
    const { data: existingPosts } = await supabase
      .from("posts")
      .select("scheduled_time")
      .eq("account_id", account.id)
      .gte("scheduled_time", todayStr);

    const postsByDay: Record<string, number> = {};
    for (const post of existingPosts ?? []) {
      if (post.scheduled_time) {
        const day = new Date(post.scheduled_time).toISOString().split("T")[0]!;
        postsByDay[day] = (postsByDay[day] ?? 0) + 1;
      }
    }

    setPosting(true);
    addPostingNode(data.dbId);
    try {
      const cursor = new Date();
      cursor.setHours(0, 0, 0, 0);
      const platform = (account.platform ?? "TIKTOK").toUpperCase() as BundlePlatform;

      for (const edit of newEdits) {
        let dateStr = "";
        while (true) {
          dateStr = cursor.toISOString().split("T")[0]!;
          if ((postsByDay[dateStr] ?? 0) < maxPerDay) break;
          cursor.setDate(cursor.getDate() + 1);
        }

        const hours = 9 + Math.floor(Math.random() * 11);
        const minutes = Math.floor(Math.random() * 60);
        const scheduled = new Date(cursor);
        scheduled.setHours(hours, minutes, 0, 0);
        if (scheduled.getTime() < Date.now()) {
          scheduled.setTime(Date.now() + 5 * 60 * 1000);
        }

        const { data: postRow, error: insertErr } = await supabase
          .from("posts")
          .insert({
            account_id: account.id,
            edit_id: edit.id,
            platform,
            scheduled_time: scheduled.toISOString(),
          })
          .select("id")
          .single();

        if (insertErr) {
          console.warn("[Account] Skipping edit", edit.id, "- already posted or insert failed:", insertErr.message);
          continue;
        }

        setPosts((prev) => [
          {
            id: postRow.id,
            accountId: account.id,
            editId: edit.id,
            editName: edit.name,
            platform,
            platformCaption: "",
            scheduledTime: scheduled.toISOString(),
            bundlePostId: null,
          },
          ...prev,
        ]);
        setExpandedAccounts((prev) => new Set(prev).add(account.id));

        postsByDay[dateStr] = (postsByDay[dateStr] ?? 0) + 1;

        try {
          const videoRes = await fetch("/api/fetch-proxy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: edit.renderUrl }),
          });
          const videoBlob = await videoRes.blob();
          const upload = await uploadToBundle(
            account.bundle_team_id,
            videoBlob,
            `${edit.name || "edit"}.mp4`
          );

          const caption = allCaptions.length > 0
            ? allCaptions[Math.floor(Math.random() * allCaptions.length)]!
            : edit.name || "";
          const bundlePost = await createBundlePost({
            teamId: account.bundle_team_id,
            socialAccountType: platform,
            uploadId: upload.id,
            postDate: scheduled.toISOString(),
            title: edit.name || "Edit",
            caption,
          });

          await supabase
            .from("posts")
            .update({
              bundle_post_id: bundlePost.id,
              platform_caption: caption,
            })
            .eq("id", postRow.id);

          setPosts((prev) =>
            prev.map((p) =>
              p.id === postRow.id
                ? { ...p, bundlePostId: bundlePost.id, platformCaption: caption }
                : p
            )
          );
        } catch (uploadErr) {
          console.error("[Account] Upload/post failed for edit", edit.id, uploadErr);
        }
      }
    } catch (err) {
      console.error("[Account] Post failed:", err);
    } finally {
      setPosting(false);
      removePostingNode(data.dbId);
      refreshAvailableEdits();
    }
  }, [findConnectedEditsNodes, findConnectedCaptionNodes, dbNodes, data.dbId, addPostingNode, removePostingNode, refreshAvailableEdits]);

  const connectedEditsCount = findConnectedEditsNodes().length;
  const connectedCaptionsCount = findConnectedCaptionNodes().length;
  const hasEditsConnected = connectedEditsCount > 0;
  const hasCaptionsConnected = connectedCaptionsCount > 0;
  const hasAvailableEdits = availableEditsCount > 0;
  const readyToPost = hasEditsConnected && hasCaptionsConnected && hasMembers && hasAvailableEdits;

  const toggleAccount = (accountId: number) => {
    setExpandedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  };

  const now = new Date().toISOString();
  const upcomingPosts = posts.filter(
    (p) => p.scheduledTime && p.scheduledTime > now
  );

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
        ", " +
        d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    } catch {
      return iso;
    }
  };

  return (
    <NodeShell
      nodeId={data.dbId}
      kindName="account_group"
      title={data.label}
      accentOverride={accentColor}
    >
      <div className="flex flex-col gap-0.5 mb-2">
        <div className="flex items-center gap-2 py-1">
          <div
            className="w-2 h-2 rounded-full flex-shrink-0 transition-colors duration-200"
            style={{ backgroundColor: hasAvailableEdits ? "#34C759" : hasEditsConnected ? "#FF9500" : "#E5E5EA" }}
          />
          <span className="text-[12px] text-gray-600 flex-1">Edits</span>
          <span className={`text-[11px] font-medium ${hasAvailableEdits ? "text-green-600" : "text-gray-400"}`}>
            {availableEditsCount}
          </span>
        </div>
        <div className="flex items-center gap-2 py-1">
          <div
            className="w-2 h-2 rounded-full flex-shrink-0 transition-colors duration-200"
            style={{ backgroundColor: hasCaptionsConnected ? "#34C759" : "#E5E5EA" }}
          />
          <span className="text-[12px] text-gray-600 flex-1">Captions</span>
          <span className={`text-[11px] font-medium ${hasCaptionsConnected ? "text-green-600" : "text-gray-400"}`}>
            {connectedCaptionsCount}
          </span>
        </div>
      </div>

      <button
        onClick={handlePost}
        disabled={posting || !readyToPost}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 mb-2 rounded-lg text-[12px] font-semibold text-white transition-all duration-150 disabled:opacity-40"
        style={{ backgroundColor: "#34C759" }}
        title={
          !hasMembers
            ? "Add accounts first"
            : !hasEditsConnected
            ? "Connect an Edits node first"
            : !hasCaptionsConnected
            ? "Connect a Captions node first"
            : !hasAvailableEdits
            ? "No rendered edits ready to post"
            : "Post edits to a random account"
        }
      >
        {posting ? (
          <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="2" opacity="0.3" />
            <path d="M14.5 8a6.5 6.5 0 00-6.5-6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3 1v14l11-7z" />
          </svg>
        )}
        {posting ? "Posting…" : "Post"}
      </button>

      <div className="flex flex-col gap-1.5">
        {hasMembers ? (
          members.map((m) => {
            const color = PLATFORM_COLORS[m.platform ?? ""] ?? "#888";
            const isExpanded = expandedAccounts.has(m.accountId);

            return (
              <div key={m.memberId}>
                <div className="flex items-center gap-2 group">
                  {m.profilePictureUrl ? (
                    <img
                      src={m.profilePictureUrl}
                      alt=""
                      className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                    />
                  ) : (
                    <span
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                      style={{ backgroundColor: color }}
                    >
                      {(m.username ?? m.displayName ?? "?")[0]?.toUpperCase()}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="text-[12px] font-semibold text-gray-900 truncate block">
                      {m.displayName ?? m.username ?? "Unknown"}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {m.username && (
                        <span className="text-[10px] text-gray-400 truncate">
                          @{m.username}
                        </span>
                      )}
                      <span
                        className="px-1 py-0.5 rounded text-white text-[8px] font-medium flex-shrink-0"
                        style={{ backgroundColor: color }}
                      >
                        {PLATFORM_LABELS[m.platform ?? ""] ?? m.platform}
                      </span>
                    </div>
                  </div>
                  {(() => {
                    const accountUpcoming = upcomingPosts.filter((p) => p.accountId === m.accountId);
                    return accountUpcoming.length > 0 ? (
                      <button
                        onClick={() => toggleAccount(m.accountId)}
                        className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium text-gray-500 hover:bg-gray-100 transition-colors flex-shrink-0 nopan nodrag"
                      >
                        <span>{accountUpcoming.length}</span>
                        <svg
                          className={`w-2.5 h-2.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          viewBox="0 0 10 10"
                          fill="currentColor"
                        >
                          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    ) : null;
                  })()}
                  <button
                    onClick={() => removeAccountGroupMember(m.memberId)}
                    className="text-[10px] text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  >
                    ✕
                  </button>
                </div>

                {isExpanded && (() => {
                  const accountUpcoming = upcomingPosts.filter((p) => p.accountId === m.accountId);
                  return accountUpcoming.length > 0 ? (
                    <div className="ml-10 mt-1 mb-1 flex flex-col gap-0.5 nopan nodrag nowheel overflow-y-auto" style={{ maxHeight: 120 }}>
                      {accountUpcoming.map((p) => (
                        <div
                          key={p.id}
                          className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] ${
                            p.bundlePostId ? "bg-gray-50" : "bg-green-50"
                          }`}
                        >
                          {!p.bundlePostId && (
                            <svg className="w-2.5 h-2.5 animate-spin text-green-500 flex-shrink-0" viewBox="0 0 16 16" fill="none">
                              <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="2" opacity="0.3" />
                              <path d="M14.5 8a6.5 6.5 0 00-6.5-6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                          )}
                          <span className="font-medium text-gray-700 truncate flex-shrink-0" style={{ maxWidth: 60 }}>
                            {p.editName}
                          </span>
                          <span className="text-gray-400 flex-shrink-0">
                            {formatDate(p.scheduledTime)}
                          </span>
                          <span className="text-gray-400 truncate flex-1" title={p.platformCaption}>
                            {p.bundlePostId ? p.platformCaption : "Uploading…"}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null;
                })()}
              </div>
            );
          })
        ) : (
          <p className="text-[11px] text-gray-400 text-center py-2">
            Drag accounts here
          </p>
        )}
      </div>

      <Handle
        type="target"
        position={Position.Left}
        id="in"
        style={{ background: accentColor }}
      />
    </NodeShell>
  );
}
