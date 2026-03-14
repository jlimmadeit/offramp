import { useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import {
  getBundlePostAnalytics,
  type BundlePostAnalyticsItem,
  type BundlePlatform,
} from "../lib/bundle";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

interface DayRow {
  date: string;
  label: string;
  [key: string]: string | number;
}

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

  const start = new Date(allDates[0] + "T00:00:00");
  const end = new Date(allDates[allDates.length - 1] + "T00:00:00");
  const rows: DayRow[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    const key = toDateKey(cursor);
    const row: DayRow = { date: key, label: formatLabel(key) };
    for (const k of keys) {
      row[k] = data[key]?.[k] ?? 0;
    }
    rows.push(row);
    cursor.setDate(cursor.getDate() + 1);
  }

  return rows;
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h3 className="text-[14px] font-semibold text-gray-700 mb-4">{title}</h3>
      <div className="h-[260px]">{children}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
      <div className="text-[48px] mb-4 opacity-20">▤</div>
      <h2 className="text-[16px] font-semibold text-gray-500 mb-1">
        No statistics yet
      </h2>
      <p className="text-[13px] text-gray-400">
        Click <span className="font-medium text-gray-500">Refresh</span> to
        fetch post analytics and populate the dashboard.
      </p>
    </div>
  );
}

export default function StatisticsPage() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const [viewsPerDay, setViewsPerDay] = useState<DayRow[]>([]);
  const [likesPerDay, setLikesPerDay] = useState<DayRow[]>([]);
  const [commentsPerDay, setCommentsPerDay] = useState<DayRow[]>([]);
  const [sharesPerDay, setSharesPerDay] = useState<DayRow[]>([]);
  const [savesPerDay, setSavesPerDay] = useState<DayRow[]>([]);
  const [viewsByPlatform, setViewsByPlatform] = useState<DayRow[]>([]);
  const [platformKeys, setPlatformKeys] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setStatus("Fetching posts…");
    try {
      const { data: posts, error: postsErr } = await supabase
        .from("posts")
        .select("id, bundle_post_id, platform, platform_post_id")
        .not("bundle_post_id", "is", null)
        .not("platform_post_id", "is", null);

      if (postsErr) throw postsErr;
      if (!posts || posts.length === 0) {
        setStatus("No posts with Bundle IDs found.");
        setLoading(false);
        return;
      }

      const today = toDateKey(new Date());

      setStatus(`Fetching analytics for ${posts.length} post(s)…`);

      let fetchedCount = 0;
      const upsertRows: {
        post_id: number;
        stat_date: string;
        views: number;
        likes: number;
        comments: number;
        shares: number;
        saves: number;
      }[] = [];

      await Promise.all(
        posts.map(async (post) => {
          if (!post.platform) {
            fetchedCount++;
            return;
          }
          try {
            const items: BundlePostAnalyticsItem[] =
              await getBundlePostAnalytics(
                post.bundle_post_id!,
                post.platform as BundlePlatform
              );

            const latest: BundlePostAnalyticsItem | undefined =
              items[items.length - 1];
            if (latest) {
              upsertRows.push({
                post_id: post.id,
                stat_date: today,
                views: latest.views ?? 0,
                likes: latest.likes ?? 0,
                comments: latest.comments ?? 0,
                shares: latest.shares ?? 0,
                saves: latest.saves ?? 0,
              });
            }
          } catch (err) {
            console.warn(
              `Analytics skipped for post ${post.id}:`,
              (err as Error).message
            );
          } finally {
            fetchedCount++;
            setStatus(
              `Fetched ${fetchedCount} / ${posts.length} post(s)…`
            );
          }
        })
      );

      if (upsertRows.length > 0) {
        setStatus("Saving statistics…");

        const postIds = upsertRows.map((r) => r.post_id);
        await supabase
          .from("post_statistics")
          .delete()
          .in("post_id", postIds)
          .eq("stat_date", today);

        const { error: insertErr } = await supabase
          .from("post_statistics")
          .insert(upsertRows);
        if (insertErr) {
          console.warn("DB save skipped (RLS):", insertErr.message);
        }
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
  }, []);

  const loadCharts = useCallback(
    async (
      posts: { id: number; bundle_post_id: string | null; platform: string | null; platform_post_id?: string | null }[],
      freshRows: {
        post_id: number;
        stat_date: string;
        views: number;
        likes: number;
        comments: number;
        shares: number;
        saves: number;
      }[]
    ) => {
      let allStats = [...freshRows];

      const { data: dbStats } = await supabase
        .from("post_statistics")
        .select("post_id, stat_date, views, likes, comments, shares, saves")
        .order("stat_date", { ascending: true });

      if (dbStats && dbStats.length > 0) {
        const freshKeys = new Set(
          freshRows.map((r) => `${r.post_id}_${r.stat_date}`)
        );
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

      const postPlatform: Record<number, string> = {};
      for (const p of posts) {
        if (p.platform) postPlatform[p.id] = p.platform;
      }

      const byDate: Record<
        string,
        { views: number; likes: number; comments: number; shares: number; saves: number }
      > = {};
      const viewsByPlat: Record<string, Record<string, number>> = {};
      const platforms = new Set<string>();

      for (const row of allStats) {
        const d = row.stat_date;
        if (!byDate[d]) {
          byDate[d] = { views: 0, likes: 0, comments: 0, shares: 0, saves: 0 };
        }
        byDate[d].views += row.views ?? 0;
        byDate[d].likes += row.likes ?? 0;
        byDate[d].comments += row.comments ?? 0;
        byDate[d].shares += row.shares ?? 0;
        byDate[d].saves += row.saves ?? 0;

        const plat = postPlatform[row.post_id];
        if (plat) {
          platforms.add(plat);
          if (!viewsByPlat[d]) viewsByPlat[d] = {};
          viewsByPlat[d][plat] = (viewsByPlat[d][plat] ?? 0) + (row.views ?? 0);
        }
      }

      const makeRows = (
        metric: "views" | "likes" | "comments" | "shares" | "saves"
      ) => {
        const mapped: Record<string, Record<string, number>> = {};
        for (const [d, vals] of Object.entries(byDate)) {
          mapped[d] = { [metric]: vals[metric] };
        }
        return fillDateRange(mapped, [metric]);
      };

      setViewsPerDay(makeRows("views"));
      setLikesPerDay(makeRows("likes"));
      setCommentsPerDay(makeRows("comments"));
      setSharesPerDay(makeRows("shares"));
      setSavesPerDay(makeRows("saves"));

      const platArr = Array.from(platforms).sort();
      setPlatformKeys(platArr);
      setViewsByPlatform(fillDateRange(viewsByPlat, platArr));
    },
    []
  );

  const hasData = viewsPerDay.length > 0;

  return (
    <div className="flex-1 flex flex-col bg-[#f5f5f7] min-h-0 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <div className="pl-36">
          <h1 className="text-[20px] font-bold text-gray-800">Statistics</h1>
          {status && (
            <p className="text-[12px] text-gray-400 mt-0.5">{status}</p>
          )}
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-2 h-9 px-4 rounded-lg bg-white border border-gray-200 shadow-sm text-[13px] font-semibold text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg
            className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {!hasData ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 px-6 pb-8">
          {/* Views per day */}
          <ChartCard title="Views Per Day">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={viewsPerDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="views"
                  stroke={METRIC_COLORS.views}
                  strokeWidth={2}
                  dot={{ r: 3, fill: METRIC_COLORS.views }}
                  activeDot={{ r: 5 }}
                  name="Views"
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Views by platform */}
          {viewsByPlatform.length > 0 && platformKeys.length > 0 && (
            <ChartCard title="Views by Platform Per Day">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={viewsByPlatform}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#9ca3af" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "#9ca3af" }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 10,
                      border: "1px solid #e5e7eb",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12 }}
                    iconType="circle"
                    iconSize={8}
                  />
                  {platformKeys.map((plat, i) => (
                    <Line
                      key={plat}
                      type="monotone"
                      dataKey={plat}
                      stroke={
                        PLATFORM_COLORS[plat] ??
                        Object.values(METRIC_COLORS)[i % 5]
                      }
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

          {/* Likes per day */}
          <ChartCard title="Likes Per Day">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={likesPerDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="likes"
                  stroke={METRIC_COLORS.likes}
                  strokeWidth={2}
                  dot={{ r: 3, fill: METRIC_COLORS.likes }}
                  activeDot={{ r: 5 }}
                  name="Likes"
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Comments per day */}
          <ChartCard title="Comments Per Day">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={commentsPerDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="comments"
                  stroke={METRIC_COLORS.comments}
                  strokeWidth={2}
                  dot={{ r: 3, fill: METRIC_COLORS.comments }}
                  activeDot={{ r: 5 }}
                  name="Comments"
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Shares per day */}
          <ChartCard title="Shares Per Day">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sharesPerDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="shares"
                  stroke={METRIC_COLORS.shares}
                  strokeWidth={2}
                  dot={{ r: 3, fill: METRIC_COLORS.shares }}
                  activeDot={{ r: 5 }}
                  name="Shares"
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Saves per day */}
          <ChartCard title="Saves Per Day">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={savesPerDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="saves"
                  stroke={METRIC_COLORS.saves}
                  strokeWidth={2}
                  dot={{ r: 3, fill: METRIC_COLORS.saves }}
                  activeDot={{ r: 5 }}
                  name="Saves"
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}
    </div>
  );
}
