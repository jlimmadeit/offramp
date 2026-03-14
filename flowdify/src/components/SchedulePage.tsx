import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { supabase } from "../lib/supabase";
import { rescheduleBundlePost } from "../lib/bundle";

interface CalendarPost {
  id: number;
  accountId: number;
  accountName: string;
  platform: string;
  scheduledTime: Date;
  bundlePostId: string | null;
  editName: string;
}

type CalendarView = "month" | "week" | "3day" | "day";

const PLAT_BG: Record<string, string> = {
  TIKTOK: "#18181b",
  INSTAGRAM: "#E1306C",
  YOUTUBE: "#FF0000",
};

const PLAT_LABEL: Record<string, string> = {
  TIKTOK: "TikTok",
  INSTAGRAM: "Instagram",
  YOUTUBE: "YouTube",
};

const ACCOUNT_COLORS = [
  "#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6",
  "#EC4899", "#06B6D4", "#F97316", "#6366F1", "#14B8A6",
  "#E11D48", "#84CC16", "#0EA5E9", "#A855F7", "#D946EF",
];

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function fmtTime(h: number) {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

function sundayOfWeek(d: Date) {
  const r = new Date(d);
  r.setDate(r.getDate() - r.getDay());
  r.setHours(0, 0, 0, 0);
  return r;
}

function daysFrom(start: Date, count: number) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);
    return d;
  });
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MIN_SLOT_H = 30;
const MAX_SLOT_H = 120;
const DEFAULT_SLOT_H = 60;

function isPast(d: Date) {
  return d.getTime() < Date.now();
}

/* ─── Post Detail Modal ─── */

function PostDetailModal({
  post,
  accountColor,
  onClose,
}: {
  post: CalendarPost;
  accountColor: string;
  onClose: () => void;
}) {
  const pastPost = isPast(post.scheduledTime);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm animate-backdrop-in"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-xl shadow-xl w-[380px] animate-modal-in">
        {/* Color accent bar */}
        <div
          className="h-2 rounded-t-xl"
          style={{ backgroundColor: accountColor }}
        />

        <div className="flex items-start justify-between px-5 pt-4 pb-2">
          <h2 className="text-[16px] font-semibold text-gray-900 leading-tight">
            {post.editName}
          </h2>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors text-[13px] flex-shrink-0 ml-3"
          >
            ✕
          </button>
        </div>

        <div className="px-5 pb-5 flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: accountColor }}
              />
              <span className="text-[13px] text-gray-700 font-medium">
                {post.accountName}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span
                className="px-2 py-0.5 rounded text-white text-[11px] font-medium"
                style={{ backgroundColor: PLAT_BG[post.platform] ?? "#888" }}
              >
                {PLAT_LABEL[post.platform] ?? post.platform}
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                  pastPost
                    ? "bg-gray-100 text-gray-500"
                    : "bg-green-50 text-green-600"
                }`}
              >
                {pastPost ? "Posted" : "Scheduled"}
              </span>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-3 flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <svg
                className="w-4 h-4 text-gray-400 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
              <span className="text-[13px] text-gray-600">
                {post.scheduledTime.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <svg
                className="w-4 h-4 text-gray-400 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              <span className="text-[13px] text-gray-600">
                {post.scheduledTime.toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            </div>
          </div>

          {post.bundlePostId && (
            <div className="border-t border-gray-100 pt-3">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-gray-400">Bundle ID</span>
                <span className="text-[11px] text-gray-500 font-mono">
                  {post.bundlePostId}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Main Component ─── */

export default function SchedulePage() {
  const [view, setView] = useState<CalendarView>("week");
  const [anchor, setAnchor] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [posts, setPosts] = useState<CalendarPost[]>([]);
  const dragRef = useRef<CalendarPost | null>(null);
  const [hoverCell, setHoverCell] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(new Date());
  const [slotH, setSlotH] = useState(DEFAULT_SLOT_H);
  const [selectedPost, setSelectedPost] = useState<CalendarPost | null>(null);
  const [hiddenAccounts, setHiddenAccounts] = useState<Set<number>>(new Set());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const fetchPosts = useCallback(async () => {
    const { data } = await supabase
      .from("posts")
      .select(
        "id, scheduled_time, bundle_post_id, account_id, accounts(username, display_name, platform), edits(name)"
      )
      .not("scheduled_time", "is", null)
      .order("scheduled_time");

    if (!data) return;

    setPosts(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data.map((r: any) => ({
        id: r.id,
        accountId: r.account_id,
        accountName:
          r.accounts?.display_name ?? r.accounts?.username ?? "Unknown",
        platform: r.accounts?.platform ?? "TIKTOK",
        scheduledTime: new Date(r.scheduled_time),
        bundlePostId: r.bundle_post_id,
        editName: r.edits?.name ?? "Untitled",
      }))
    );
  }, []);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  useEffect(() => {
    if (view !== "month" && gridRef.current) {
      const hourIdx = Math.max(0, now.getHours() - 2);
      gridRef.current.scrollTop = hourIdx * slotH;
    }
    // only scroll on view change, not every slotH change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  /* ── Pinch-to-zoom ── */

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const scrollRatio = el.scrollTop / (el.scrollHeight - el.clientHeight || 1);
      setSlotH((prev) => {
        const next = Math.round(
          Math.min(MAX_SLOT_H, Math.max(MIN_SLOT_H, prev - e.deltaY * 0.5))
        );
        requestAnimationFrame(() => {
          const newScrollHeight = 24 * next;
          el.scrollTop = scrollRatio * (newScrollHeight - el.clientHeight);
        });
        return next;
      });
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [view]);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;

    let initialDistance = 0;
    let initialSlotH = slotH;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        initialDistance = Math.hypot(dx, dy);
        initialSlotH = slotH;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || initialDistance === 0) return;
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const scale = dist / initialDistance;
      setSlotH(
        Math.round(Math.min(MAX_SLOT_H, Math.max(MIN_SLOT_H, initialSlotH * scale)))
      );
    };

    const onTouchEnd = () => {
      initialDistance = 0;
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [view, slotH]);

  /* ── Unique accounts for legend ── */

  const uniqueAccounts = useMemo(() => {
    const map = new Map<number, { id: number; name: string; platform: string }>();
    for (const p of posts) {
      if (!map.has(p.accountId)) {
        map.set(p.accountId, {
          id: p.accountId,
          name: p.accountName,
          platform: p.platform,
        });
      }
    }
    return Array.from(map.values());
  }, [posts]);

  const accountColorMap = useMemo(() => {
    const m = new Map<number, string>();
    uniqueAccounts.forEach((a, i) => {
      m.set(a.id, ACCOUNT_COLORS[i % ACCOUNT_COLORS.length]);
    });
    return m;
  }, [uniqueAccounts]);

  const toggleAccount = useCallback((id: number) => {
    setHiddenAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const visiblePosts = useMemo(
    () => posts.filter((p) => !hiddenAccounts.has(p.accountId)),
    [posts, hiddenAccounts]
  );

  /* ── Reschedule ── */

  const reschedule = useCallback(
    async (post: CalendarPost, newTime: Date) => {
      if (newTime.getTime() < Date.now()) return;

      const iso = newTime.toISOString();

      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id ? { ...p, scheduledTime: newTime } : p
        )
      );

      await supabase
        .from("posts")
        .update({ scheduled_time: iso })
        .eq("id", post.id);

      if (post.bundlePostId) {
        try {
          await rescheduleBundlePost(post.bundlePostId, iso);
        } catch (err) {
          console.error("Bundle reschedule failed:", err);
        }
      }
    },
    []
  );

  const step = useCallback(
    (dir: 1 | -1) => {
      setAnchor((prev) => {
        const d = new Date(prev);
        if (view === "month") d.setMonth(d.getMonth() + dir);
        else if (view === "week") d.setDate(d.getDate() + 7 * dir);
        else if (view === "3day") d.setDate(d.getDate() + 3 * dir);
        else d.setDate(d.getDate() + dir);
        return d;
      });
    },
    [view]
  );

  const goToday = useCallback(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setAnchor(d);
  }, []);

  const days = useMemo(() => {
    if (view === "month") {
      const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      return daysFrom(sundayOfWeek(first), 42);
    }
    if (view === "week") return daysFrom(sundayOfWeek(anchor), 7);
    if (view === "3day") return daysFrom(anchor, 3);
    return daysFrom(anchor, 1);
  }, [view, anchor]);

  const title = useMemo(() => {
    if (view === "month") {
      return anchor.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });
    }
    if (days.length === 0) return "";
    if (days.length === 1) {
      return days[0]!.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      });
    }
    const f = days[0]!;
    const l = days[days.length - 1]!;
    if (f.getMonth() === l.getMonth()) {
      return `${f.toLocaleDateString("en-US", { month: "long" })} ${f.getDate()} – ${l.getDate()}, ${f.getFullYear()}`;
    }
    return `${f.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${l.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  }, [view, days, anchor]);

  const postsByDay = useMemo(() => {
    const map = new Map<string, CalendarPost[]>();
    for (const p of visiblePosts) {
      const k = `${p.scheduledTime.getFullYear()}-${p.scheduledTime.getMonth()}-${p.scheduledTime.getDate()}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    }
    return map;
  }, [visiblePosts]);

  function dk(d: Date) {
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }
  function ck(d: Date, h: number) {
    return `${dk(d)}-${h}`;
  }
  function postsOn(d: Date) {
    return postsByDay.get(dk(d)) ?? [];
  }
  function postsAt(d: Date, h: number) {
    return postsOn(d).filter((p) => p.scheduledTime.getHours() === h);
  }

  function onCellDrop(day: Date, hour: number) {
    const post = dragRef.current;
    if (!post) return;
    dragRef.current = null;
    setHoverCell(null);
    const t = new Date(day);
    t.setHours(hour, post.scheduledTime.getMinutes(), 0, 0);
    if (t.getTime() < Date.now()) return;
    if (t.getTime() !== post.scheduledTime.getTime()) reschedule(post, t);
  }

  function onDayDrop(day: Date) {
    const post = dragRef.current;
    if (!post) return;
    dragRef.current = null;
    setHoverCell(null);
    const t = new Date(day);
    t.setHours(
      post.scheduledTime.getHours(),
      post.scheduledTime.getMinutes(),
      0,
      0
    );
    if (t.getTime() < Date.now()) return;
    if (t.getTime() !== post.scheduledTime.getTime()) reschedule(post, t);
  }

  function canDrop(day: Date, hour: number) {
    const t = new Date(day);
    t.setHours(hour, 0, 0, 0);
    return t.getTime() >= Date.now() - 3600_000;
  }

  function canDropDay(day: Date) {
    const endOfDay = new Date(day);
    endOfDay.setHours(23, 59, 59, 999);
    return endOfDay.getTime() >= Date.now();
  }

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const views: CalendarView[] = ["day", "3day", "week", "month"];
  const viewLabels: Record<CalendarView, string> = {
    month: "Month",
    week: "Week",
    "3day": "3 Day",
    day: "Day",
  };

  function chipColor(post: CalendarPost) {
    return accountColorMap.get(post.accountId) ?? PLAT_BG[post.platform] ?? "#888";
  }

  function renderChip(post: CalendarPost, colCount: number) {
    const bg = chipColor(post);
    const postIsPast = isPast(post.scheduledTime);
    const draggable = !postIsPast;

    const timeStr = post.scheduledTime.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });

    const isCompact = colCount >= 7;
    const isMedium = colCount >= 3 && colCount < 7;

    return (
      <div
        key={post.id}
        draggable={draggable}
        onDragStart={(e) => {
          if (!draggable) {
            e.preventDefault();
            return;
          }
          e.stopPropagation();
          dragRef.current = post;
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => {
          dragRef.current = null;
          setHoverCell(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedPost(post);
        }}
        className={`rounded-md text-white select-none mb-0.5 overflow-hidden transition-opacity ${
          draggable
            ? "cursor-pointer hover:brightness-110 active:cursor-grabbing"
            : "cursor-pointer opacity-50"
        } ${isCompact ? "px-1 py-0.5 text-[10px]" : isMedium ? "px-1.5 py-1 text-[11px]" : "px-2 py-1.5 text-[12px]"}`}
        style={{ backgroundColor: bg }}
        title={`${post.editName}\n${post.accountName}\n${timeStr}${postIsPast ? "\n(Past — not movable)" : ""}`}
      >
        {!isCompact && (
          <div className="flex items-center gap-1">
            <span className="font-medium truncate">{post.editName}</span>
          </div>
        )}
        {!isCompact && !isMedium && (
          <div className="text-[10px] opacity-80 truncate mt-0.5">
            {post.accountName} · {timeStr}
          </div>
        )}
        {isMedium && (
          <span className="truncate">{post.editName}</span>
        )}
        {isCompact && (
          <span className="truncate text-[9px]">{post.editName}</span>
        )}
      </div>
    );
  }

  function renderMonthView() {
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const currentMonth = anchor.getMonth();

    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="grid grid-cols-7 border-b border-gray-200">
          {weekdays.map((wd) => (
            <div
              key={wd}
              className="text-[11px] text-gray-500 text-center font-medium py-2 border-r border-gray-100 last:border-r-0"
            >
              {wd}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 flex-1 auto-rows-fr overflow-y-auto">
          {days.map((d, i) => {
            const inMonth = d.getMonth() === currentMonth;
            const isToday = sameDay(d, today);
            const dayPosts = postsOn(d);
            const key = dk(d);
            const lit = hoverCell === key;
            const droppable = canDropDay(d);

            return (
              <div
                key={i}
                className={`relative border-r border-b border-gray-100 last:border-r-0 p-1 min-h-[90px] transition-colors ${
                  lit && droppable ? "bg-blue-50" : ""
                } ${!inMonth ? "bg-gray-50/50" : ""}`}
                onDragOver={(e) => {
                  if (!droppable) return;
                  e.preventDefault();
                  setHoverCell(key);
                }}
                onDragLeave={() => setHoverCell(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  if (droppable) onDayDrop(d);
                }}
                onClick={() => {
                  setAnchor(new Date(d));
                  setView("day");
                }}
              >
                <div className="flex justify-center mb-1">
                  <span
                    className={`text-[12px] inline-flex items-center justify-center w-6 h-6 rounded-full font-medium ${
                      isToday
                        ? "bg-red-500 text-white"
                        : inMonth
                          ? "text-gray-700"
                          : "text-gray-300"
                    }`}
                  >
                    {d.getDate()}
                  </span>
                </div>
                <div className="flex flex-col gap-[1px] overflow-hidden">
                  {dayPosts.slice(0, 3).map((p) => renderChip(p, 7))}
                  {dayPosts.length > 3 && (
                    <span className="text-[10px] text-gray-400 px-1">
                      +{dayPosts.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderTimeGrid() {
    const colCount = days.length;
    const nowDayIdx = days.findIndex((d) => sameDay(d, now));
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const nowTopPx = (nowMinutes / 60) * slotH;

    return (
      <div
        ref={gridRef}
        className="flex-1 overflow-y-auto overflow-x-hidden relative"
      >
        {/* Day headers */}
        <div className="flex sticky top-0 bg-white z-20 border-b border-gray-200 shadow-sm">
          <div className="w-[60px] flex-shrink-0" />
          {days.map((d, i) => {
            const isToday = sameDay(d, today);
            return (
              <div
                key={i}
                className={`flex-1 text-center py-2.5 min-w-0 border-l border-gray-100 ${
                  isToday ? "text-red-500" : "text-gray-500"
                }`}
              >
                <div className="text-[11px] font-medium leading-tight uppercase">
                  {d.toLocaleDateString("en-US", { weekday: "short" })}
                </div>
                <div
                  className={`text-[22px] font-light leading-tight mt-0.5 ${
                    isToday
                      ? "bg-red-500 text-white rounded-full w-[36px] h-[36px] inline-flex items-center justify-center"
                      : ""
                  }`}
                >
                  {d.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Time grid body */}
        <div className="relative">
          {HOURS.map((h) => (
            <div key={h} className="flex" style={{ height: `${slotH}px` }}>
              <div className="w-[60px] flex-shrink-0 text-[11px] text-gray-400 text-right pr-3 -mt-[7px] select-none">
                {h > 0 ? fmtTime(h) : ""}
              </div>
              {days.map((d, di) => {
                const key = ck(d, h);
                const cellPosts = postsAt(d, h);
                const lit = hoverCell === key;
                const droppable = canDrop(d, h);

                return (
                  <div
                    key={di}
                    className={`flex-1 border-t border-l border-gray-100 min-w-0 transition-colors ${
                      lit && droppable ? "bg-blue-50" : ""
                    }`}
                    onDragOver={(e) => {
                      if (!droppable) return;
                      e.preventDefault();
                      setHoverCell(key);
                    }}
                    onDragLeave={() => setHoverCell(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (droppable) onCellDrop(d, h);
                    }}
                  >
                    <div className="p-[2px] flex flex-col gap-[1px] overflow-hidden h-full">
                      {cellPosts.map((p) => renderChip(p, colCount))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {nowDayIdx !== -1 && (
            <div
              className="absolute pointer-events-none z-10"
              style={{
                top: `${nowTopPx}px`,
                left: `calc(60px + ${nowDayIdx} * (100% - 60px) / ${colCount})`,
                width: `calc((100% - 60px) / ${colCount})`,
              }}
            >
              <div className="relative flex items-center">
                <div className="w-[10px] h-[10px] rounded-full bg-red-500 -ml-[5px] flex-shrink-0" />
                <div className="h-[2px] bg-red-500 flex-1" />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── Account Legend Sidebar ── */

  function renderLegend() {
    if (uniqueAccounts.length === 0) return null;

    const allVisible = hiddenAccounts.size === 0;

    return (
      <aside className="w-[200px] flex-shrink-0 border-r border-gray-200 bg-gray-50/50 flex flex-col h-full overflow-hidden">
        <div className="px-4 pt-5 pb-2">
          <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
            Accounts
          </h3>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-3">
          {/* Toggle all */}
          <button
            onClick={() => {
              if (allVisible) {
                setHiddenAccounts(new Set(uniqueAccounts.map((a) => a.id)));
              } else {
                setHiddenAccounts(new Set());
              }
            }}
            className="w-full text-left text-[11px] text-gray-400 hover:text-gray-600 px-1 py-1.5 mb-1 transition-colors"
          >
            {allVisible ? "Hide all" : "Show all"}
          </button>

          <div className="flex flex-col gap-0.5">
            {uniqueAccounts.map((account) => {
              const color = accountColorMap.get(account.id) ?? "#888";
              const visible = !hiddenAccounts.has(account.id);
              const platLabel = PLAT_LABEL[account.platform] ?? account.platform;

              return (
                <label
                  key={account.id}
                  className="flex items-center gap-2 px-1.5 py-1.5 rounded-md hover:bg-gray-100 cursor-pointer transition-colors group"
                >
                  <div className="relative flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={visible}
                      onChange={() => toggleAccount(account.id)}
                      className="sr-only"
                    />
                    <div
                      className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                        visible ? "border-transparent" : "border-gray-300 bg-white"
                      }`}
                      style={visible ? { backgroundColor: color } : {}}
                    >
                      {visible && (
                        <svg
                          className="w-2.5 h-2.5 text-white"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={3}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className={`text-[12px] font-medium truncate transition-colors ${
                        visible ? "text-gray-700" : "text-gray-400"
                      }`}
                    >
                      {account.name}
                    </div>
                    <div className="text-[10px] text-gray-400 truncate">
                      {platLabel}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* Zoom indicator */}
        {view !== "month" && (
          <div className="px-4 py-3 border-t border-gray-200">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-gray-400">Zoom</span>
              <span className="text-[10px] text-gray-400 font-mono">
                {Math.round((slotH / DEFAULT_SLOT_H) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={MIN_SLOT_H}
              max={MAX_SLOT_H}
              value={slotH}
              onChange={(e) => setSlotH(Number(e.target.value))}
              className="w-full h-1 accent-gray-400"
            />
          </div>
        )}
      </aside>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-white">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9" /> {/* spacer for hamburger */}
          <button
            onClick={goToday}
            className="px-4 py-1.5 text-[13px] font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            Today
          </button>
          <div className="flex items-center">
            <button
              onClick={() => step(-1)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors text-[16px]"
            >
              ‹
            </button>
            <button
              onClick={() => step(1)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors text-[16px]"
            >
              ›
            </button>
          </div>
          <h2 className="text-[20px] font-normal text-gray-800">{title}</h2>
        </div>

        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {views.map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-colors ${
                view === v
                  ? "bg-white text-gray-800 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {viewLabels[v]}
            </button>
          ))}
        </div>
      </div>

      {/* Body: legend sidebar + calendar */}
      <div className="flex flex-1 min-h-0">
        {renderLegend()}
        {view === "month" ? renderMonthView() : renderTimeGrid()}
      </div>

      {/* Post detail modal */}
      {selectedPost && (
        <PostDetailModal
          post={selectedPost}
          accountColor={chipColor(selectedPost)}
          onClose={() => setSelectedPost(null)}
        />
      )}
    </div>
  );
}
