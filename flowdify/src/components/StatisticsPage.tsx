import { useState, useCallback, useMemo, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import {
  getBundlePostAnalytics,
  type BundlePostAnalyticsItem,
  type BundlePlatform,
} from "../lib/bundle";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

/* ── Types ── */

interface DayRow {
  date: string;
  label: string;
  [key: string]: string | number;
}

interface PostStat {
  postId: number;
  editName: string;
  accountName: string;
  platform: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
}

/* ── Constants ── */

const METRIC_COLORS: Record<string, string> = {
  views: "#3B82F6",
  likes: "#EF4444",
  comments: "#8B5CF6",
  shares: "#10B981",
  saves: "#F59E0B",
};

const PLATFORM_COLORS: Record<string, string> = {
  TIKTOK: "#18181b",
  INSTAGRAM: "#E1306C",
  YOUTUBE: "#FF0000",
};

const PLATFORM_LABELS: Record<string, string> = {
  TIKTOK: "TikTok",
  INSTAGRAM: "Instagram",
  YOUTUBE: "YouTube",
};

const PIE_COLORS = ["#3B82F6", "#EF4444", "#8B5CF6", "#10B981", "#F59E0B"];

/* ── Helpers ── */

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatLabel(dateKey: string): string {
  const d = new Date(dateKey + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fillDateRange(
  data: Record<string, Record<string, number>>,
  keys: string[]
): DayRow[] {
  const allDates = Object.keys(data).sort();
  if (allDates.length === 0) return [];
  const start = new Date(allDates[0]! + "T00:00:00");
  const end = new Date(allDates[allDates.length - 1]! + "T00:00:00");
  const rows: DayRow[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const key = toDateKey(cursor);
    const row: DayRow = { date: key, label: formatLabel(key) };
    for (const k of keys) row[k] = data[key]?.[k] ?? 0;
    rows.push(row);
    cursor.setDate(cursor.getDate() + 1);
  }
  return rows;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

/* ── Shared Components ── */

function ChartCard({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 ${className}`}>
      <h3 className="text-[13px] font-semibold text-gray-500 uppercase tracking-wide mb-4">{title}</h3>
      <div className="h-[240px]">{children}</div>
    </div>
  );
}

function KpiCard({ label, value, color, icon }: { label: string; value: string; color: string; icon: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center text-white text-[18px] flex-shrink-0"
        style={{ backgroundColor: color }}
      >
        {icon}
      </div>
      <div>
        <p className="text-[24px] font-bold text-gray-900 leading-tight tracking-tight">{value}</p>
        <p className="text-[12px] text-gray-400 font-medium mt-0.5">{label}</p>
      </div>
    </div>
  );
}

const TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
};

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
      <div className="text-[48px] mb-4 opacity-20">▤</div>
      <h2 className="text-[16px] font-semibold text-gray-500 mb-1">No statistics yet</h2>
      <p className="text-[13px] text-gray-400 max-w-sm">
        Click <span className="font-medium text-gray-500">Refresh</span> to fetch post analytics from Bundle and populate the dashboard.
      </p>
    </div>
  );
}

/* ── Top Performers Table ── */

function TopPerformers({ posts }: { posts: PostStat[] }) {
  const [sortBy, setSortBy] = useState<keyof PostStat>("views");

  const sorted = useMemo(
    () => [...posts].sort((a, b) => (b[sortBy] as number) - (a[sortBy] as number)).slice(0, 10),
    [posts, sortBy]
  );

  const cols: { key: keyof PostStat; label: string; color: string }[] = [
    { key: "views", label: "Views", color: METRIC_COLORS.views! },
    { key: "likes", label: "Likes", color: METRIC_COLORS.likes! },
    { key: "comments", label: "Comments", color: METRIC_COLORS.comments! },
    { key: "shares", label: "Shares", color: METRIC_COLORS.shares! },
    { key: "saves", label: "Saves", color: METRIC_COLORS.saves! },
  ];

  if (posts.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-gray-500 uppercase tracking-wide">Top performers</h3>
        <span className="text-[11px] text-gray-400">{posts.length} post{posts.length !== 1 ? "s" : ""} total</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider px-5 py-3 w-8">#</th>
              <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3 py-3">Post</th>
              <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3 py-3">Account</th>
              {cols.map((c) => (
                <th
                  key={c.key}
                  onClick={() => setSortBy(c.key)}
                  className="text-right text-[11px] font-medium uppercase tracking-wider px-3 py-3 cursor-pointer select-none hover:text-gray-700 transition-colors whitespace-nowrap"
                  style={{ color: sortBy === c.key ? c.color : "#9ca3af" }}
                >
                  {c.label}
                  {sortBy === c.key && " ↓"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => {
              const platColor = PLATFORM_COLORS[p.platform] ?? "#888";
              return (
                <tr key={p.postId} className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3 text-[12px] text-gray-300 font-medium">{i + 1}</td>
                  <td className="px-3 py-3">
                    <p className="text-[13px] font-medium text-gray-800 truncate max-w-[200px]">{p.editName}</p>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] text-gray-600 truncate max-w-[120px]">{p.accountName}</span>
                      <span
                        className="px-1.5 py-0.5 rounded text-white text-[9px] font-medium flex-shrink-0"
                        style={{ backgroundColor: platColor }}
                      >
                        {PLATFORM_LABELS[p.platform] ?? p.platform}
                      </span>
                    </div>
                  </td>
                  {cols.map((c) => (
                    <td
                      key={c.key}
                      className="px-3 py-3 text-right text-[13px] tabular-nums"
                      style={{ color: sortBy === c.key ? c.color : "#374151", fontWeight: sortBy === c.key ? 600 : 400 }}
                    >
                      {fmtNum(p[c.key] as number)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Main Component ── */

export default function StatisticsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const [overviewData, setOverviewData] = useState<DayRow[]>([]);
  const [engagementData, setEngagementData] = useState<DayRow[]>([]);
  const [viewsByPlatform, setViewsByPlatform] = useState<DayRow[]>([]);
  const [platformKeys, setPlatformKeys] = useState<string[]>([]);
  const [platformPieData, setPlatformPieData] = useState<{ name: string; value: number; color: string }[]>([]);
  const [postStats, setPostStats] = useState<PostStat[]>([]);

  const totals = useMemo(() => {
    const t = { views: 0, likes: 0, comments: 0, shares: 0, saves: 0 };
    for (const p of postStats) {
      t.views += p.views;
      t.likes += p.likes;
      t.comments += p.comments;
      t.shares += p.shares;
      t.saves += p.saves;
    }
    return t;
  }, [postStats]);

  const engagementRate = useMemo(() => {
    if (totals.views === 0) return "0%";
    const rate = ((totals.likes + totals.comments + totals.shares + totals.saves) / totals.views) * 100;
    return rate.toFixed(1) + "%";
  }, [totals]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setStatus("Fetching posts…");
    try {
      let postsQuery = supabase
        .from("posts")
        .select("id, bundle_post_id, platform, platform_post_id, account_id, accounts(username, display_name, platform), edits(name)")
        .not("bundle_post_id", "is", null);
      if (user) postsQuery = postsQuery.eq("user_id", user.id);
      const { data: posts, error: postsErr } = await postsQuery;

      if (postsErr) throw postsErr;
      if (!posts || posts.length === 0) {
        setStatus("No posts with Bundle IDs found.");
        setLoading(false);
        return;
      }

      const today = toDateKey(new Date());
      setStatus(`Fetching analytics for ${posts.length} post(s)…`);

      let fetchedCount = 0;
      const upsertRows: { post_id: number; stat_date: string; views: number; likes: number; comments: number; shares: number; saves: number }[] = [];

      await Promise.all(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        posts.map(async (post: any) => {
          if (!post.platform) { fetchedCount++; return; }
          try {
            const items: BundlePostAnalyticsItem[] = await getBundlePostAnalytics(post.bundle_post_id!, post.platform as BundlePlatform);
            for (const item of items) {
              const itemDate = item.createdAt ? item.createdAt.slice(0, 10) : today;
              upsertRows.push({
                post_id: post.id,
                stat_date: itemDate,
                views: item.views ?? 0,
                likes: item.likes ?? 0,
                comments: item.comments ?? 0,
                shares: item.shares ?? 0,
                saves: item.saves ?? 0,
              });
            }
          } catch (err) {
            console.warn(`Analytics skipped for post ${post.id}:`, (err as Error).message);
          } finally {
            fetchedCount++;
            setStatus(`Fetched ${fetchedCount} / ${posts.length} post(s)…`);
          }
        })
      );

      if (upsertRows.length > 0) {
        setStatus("Saving statistics…");
        const postIds = [...new Set(upsertRows.map((r) => r.post_id))];
        await supabase.from("post_statistics").delete().in("post_id", postIds);
        const { error: insertErr } = await supabase.from("post_statistics").insert(upsertRows);
        if (insertErr) console.warn("DB save skipped (RLS):", insertErr.message);
      }

      setStatus("Loading dashboard…");
      await loadCharts(posts, upsertRows);
      setStatus("");
    } catch (err) {
      console.error("Refresh failed:", err);
      setStatus("Refresh failed. Check console for details.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  const loadCharts = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (posts: any[], freshRows: { post_id: number; stat_date: string; views: number; likes: number; comments: number; shares: number; saves: number }[]) => {
      let allStats = [...freshRows];
      const { data: dbStats } = await supabase
        .from("post_statistics")
        .select("post_id, stat_date, views, likes, comments, shares, saves")
        .order("stat_date", { ascending: true });

      if (dbStats && dbStats.length > 0) {
        const freshKeys = new Set(freshRows.map((r) => `${r.post_id}_${r.stat_date}`));
        for (const row of dbStats) {
          const key = `${row.post_id}_${row.stat_date}`;
          if (!freshKeys.has(key)) {
            allStats.push({
              post_id: row.post_id as number,
              stat_date: row.stat_date as string,
              views: (row.views as number) ?? 0,
              likes: (row.likes as number) ?? 0,
              comments: (row.comments as number) ?? 0,
              shares: (row.shares as number) ?? 0,
              saves: (row.saves as number) ?? 0,
            });
          }
        }
      }

      if (allStats.length === 0) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const postMeta: Record<number, { editName: string; accountName: string; platform: string }> = {};
      for (const p of posts) {
        postMeta[p.id] = {
          editName: p.edits?.name ?? "Untitled",
          accountName: p.accounts?.display_name ?? p.accounts?.username ?? "Unknown",
          platform: p.accounts?.platform ?? p.platform ?? "TIKTOK",
        };
      }

      const byDate: Record<string, { views: number; likes: number; comments: number; shares: number; saves: number }> = {};
      const viewsByPlat: Record<string, Record<string, number>> = {};
      const platforms = new Set<string>();
      const perPost: Record<number, { views: number; likes: number; comments: number; shares: number; saves: number }> = {};

      for (const row of allStats) {
        const d = row.stat_date;
        if (!byDate[d]) byDate[d] = { views: 0, likes: 0, comments: 0, shares: 0, saves: 0 };
        byDate[d]!.views += row.views;
        byDate[d]!.likes += row.likes;
        byDate[d]!.comments += row.comments;
        byDate[d]!.shares += row.shares;
        byDate[d]!.saves += row.saves;

        if (!perPost[row.post_id]) perPost[row.post_id] = { views: 0, likes: 0, comments: 0, shares: 0, saves: 0 };
        const pp = perPost[row.post_id]!;
        pp.views = Math.max(pp.views, row.views);
        pp.likes = Math.max(pp.likes, row.likes);
        pp.comments = Math.max(pp.comments, row.comments);
        pp.shares = Math.max(pp.shares, row.shares);
        pp.saves = Math.max(pp.saves, row.saves);

        const meta = postMeta[row.post_id];
        const plat = meta?.platform;
        if (plat) {
          platforms.add(plat);
          if (!viewsByPlat[d]) viewsByPlat[d] = {};
          viewsByPlat[d]![plat] = (viewsByPlat[d]![plat] ?? 0) + row.views;
        }
      }

      // Overview area chart (views)
      const overviewMap: Record<string, Record<string, number>> = {};
      for (const [d, vals] of Object.entries(byDate)) overviewMap[d] = { views: vals.views };
      setOverviewData(fillDateRange(overviewMap, ["views"]));

      // Engagement bar chart
      const engMap: Record<string, Record<string, number>> = {};
      for (const [d, vals] of Object.entries(byDate)) {
        engMap[d] = { likes: vals.likes, comments: vals.comments, shares: vals.shares, saves: vals.saves };
      }
      setEngagementData(fillDateRange(engMap, ["likes", "comments", "shares", "saves"]));

      // Platform lines
      const platArr = Array.from(platforms).sort();
      setPlatformKeys(platArr);
      setViewsByPlatform(fillDateRange(viewsByPlat, platArr));

      // Platform pie
      const platTotals: Record<string, number> = {};
      for (const vals of Object.values(viewsByPlat)) {
        for (const [p, v] of Object.entries(vals)) platTotals[p] = (platTotals[p] ?? 0) + v;
      }
      setPlatformPieData(
        platArr.map((p, i) => ({
          name: PLATFORM_LABELS[p] ?? p,
          value: platTotals[p] ?? 0,
          color: PLATFORM_COLORS[p] ?? PIE_COLORS[i % PIE_COLORS.length]!,
        }))
      );

      // Per-post stats
      const psList: PostStat[] = [];
      for (const [id, vals] of Object.entries(perPost)) {
        const meta = postMeta[Number(id)];
        if (!meta) continue;
        psList.push({ postId: Number(id), editName: meta.editName, accountName: meta.accountName, platform: meta.platform, ...vals });
      }
      setPostStats(psList);
    },
    []
  );

  // Auto-load existing stats from DB on mount
  useEffect(() => {
    (async () => {
      let postsQuery = supabase
        .from("posts")
        .select("id, bundle_post_id, platform, platform_post_id, account_id, accounts(username, display_name, platform), edits(name)");
      if (user) postsQuery = postsQuery.eq("user_id", user.id);
      const { data: posts } = await postsQuery;
      if (!posts || posts.length === 0) return;
      await loadCharts(posts, []);
    })();
  }, [user, loadCharts]);

  const hasData = overviewData.length > 0;

  return (
    <div className="flex-1 flex flex-col bg-[#f5f5f7] min-h-0 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <div className="pl-36">
          <h1 className="text-[20px] font-bold text-gray-800">Statistics</h1>
          {status && <p className="text-[12px] text-gray-400 mt-0.5">{status}</p>}
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-2 h-9 px-4 rounded-lg bg-white border border-gray-200 shadow-sm text-[13px] font-semibold text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {!hasData ? (
        <EmptyState />
      ) : (
        <div className="px-6 pb-8 space-y-5">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <KpiCard label="Total views" value={fmtNum(totals.views)} color={METRIC_COLORS.views!} icon="▶" />
            <KpiCard label="Total likes" value={fmtNum(totals.likes)} color={METRIC_COLORS.likes!} icon="♥" />
            <KpiCard label="Comments" value={fmtNum(totals.comments)} color={METRIC_COLORS.comments!} icon="◆" />
            <KpiCard label="Shares" value={fmtNum(totals.shares)} color={METRIC_COLORS.shares!} icon="↗" />
            <KpiCard label="Saves" value={fmtNum(totals.saves)} color={METRIC_COLORS.saves!} icon="★" />
            <KpiCard label="Engagement rate" value={engagementRate} color="#6366F1" icon="%" />
          </div>

          {/* Views overview + platform pie */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <ChartCard title="Views over time" className="xl:col-span-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={overviewData}>
                  <defs>
                    <linearGradient id="viewsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={METRIC_COLORS.views} stopOpacity={0.15} />
                      <stop offset="100%" stopColor={METRIC_COLORS.views} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={45} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Area type="monotone" dataKey="views" stroke={METRIC_COLORS.views} strokeWidth={2} fill="url(#viewsGrad)" name="Views" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            {platformPieData.length > 0 && (
              <ChartCard title="Views by platform">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={platformPieData}
                      cx="50%"
                      cy="45%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="value"
                      nameKey="name"
                      strokeWidth={0}
                    >
                      {platformPieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
          </div>

          {/* Engagement bar chart + Platform line chart */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <ChartCard title="Engagement breakdown">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={engagementData} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
                  <Bar dataKey="likes" fill={METRIC_COLORS.likes} radius={[4, 4, 0, 0]} name="Likes" />
                  <Bar dataKey="comments" fill={METRIC_COLORS.comments} radius={[4, 4, 0, 0]} name="Comments" />
                  <Bar dataKey="shares" fill={METRIC_COLORS.shares} radius={[4, 4, 0, 0]} name="Shares" />
                  <Bar dataKey="saves" fill={METRIC_COLORS.saves} radius={[4, 4, 0, 0]} name="Saves" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {viewsByPlatform.length > 0 && platformKeys.length > 0 && (
              <ChartCard title="Views by platform over time">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={viewsByPlatform}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={40} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
                    {platformKeys.map((plat, i) => (
                      <Line
                        key={plat}
                        type="monotone"
                        dataKey={plat}
                        stroke={PLATFORM_COLORS[plat] ?? PIE_COLORS[i % PIE_COLORS.length]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                        name={PLATFORM_LABELS[plat] ?? plat}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
          </div>

          {/* Top Performers */}
          <TopPerformers posts={postStats} />
        </div>
      )}
    </div>
  );
}
