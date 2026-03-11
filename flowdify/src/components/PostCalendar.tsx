import { useState, useCallback, useEffect, useMemo, useRef } from "react";
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

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function fmtTime(h: number) {
  if (h === 0) return "12a";
  if (h < 12) return `${h}a`;
  if (h === 12) return "12p";
  return `${h - 12}p`;
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

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6);
const SLOT_H = 28;

export default function PostCalendar() {
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
      const now = new Date();
      const hourIdx = Math.max(0, now.getHours() - 6);
      gridRef.current.scrollTop = hourIdx * SLOT_H - 40;
    }
  }, [view]);

  const reschedule = useCallback(
    async (post: CalendarPost, newTime: Date) => {
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
        month: "short",
        year: "numeric",
      });
    }
    if (days.length === 0) return "";
    if (days.length === 1) {
      return days[0]!.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    }
    const f = days[0]!;
    const l = days[days.length - 1]!;
    if (f.getMonth() === l.getMonth()) {
      return `${f.toLocaleDateString("en-US", { month: "short" })} ${f.getDate()}–${l.getDate()}`;
    }
    return `${f.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${l.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  }, [view, days, anchor]);

  const postsByDay = useMemo(() => {
    const map = new Map<string, CalendarPost[]>();
    for (const p of posts) {
      const k = `${p.scheduledTime.getFullYear()}-${p.scheduledTime.getMonth()}-${p.scheduledTime.getDate()}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    }
    return map;
  }, [posts]);

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
    if (t.getTime() !== post.scheduledTime.getTime()) reschedule(post, t);
  }

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const views: CalendarView[] = ["month", "week", "3day", "day"];
  const viewLabels: Record<CalendarView, string> = {
    month: "Mo",
    week: "Wk",
    "3day": "3D",
    day: "Day",
  };

  function chipClasses(colCount: number) {
    if (colCount >= 7)
      return "rounded text-[7px] leading-[12px] px-0.5 truncate";
    if (colCount >= 3)
      return "rounded text-[9px] leading-[14px] px-1 truncate";
    return "rounded text-[10px] leading-[16px] px-1.5 truncate";
  }

  function renderChip(post: CalendarPost, colCount: number) {
    const bg = PLAT_BG[post.platform] ?? "#888";
    const cls = chipClasses(colCount);
    const showText = colCount < 7;
    const showAccount = colCount === 1;
    const timeStr = post.scheduledTime.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });

    return (
      <div
        key={post.id}
        draggable
        onDragStart={(e) => {
          e.stopPropagation();
          dragRef.current = post;
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => {
          dragRef.current = null;
          setHoverCell(null);
        }}
        className={`text-white cursor-grab active:cursor-grabbing select-none ${cls}`}
        style={{ backgroundColor: bg }}
        title={`${post.editName}\n${post.accountName}\n${timeStr}`}
      >
        {showText && (
          <span>
            {showAccount
              ? `${post.editName} · ${post.accountName}`
              : post.editName}
          </span>
        )}
      </div>
    );
  }

  function renderMonthView() {
    const weekdays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
    const currentMonth = anchor.getMonth();

    return (
      <div>
        <div className="grid grid-cols-7 mb-0.5">
          {weekdays.map((wd) => (
            <div
              key={wd}
              className="text-[9px] text-gray-400 text-center font-medium py-0.5"
            >
              {wd}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const inMonth = d.getMonth() === currentMonth;
            const isToday = sameDay(d, today);
            const dayPosts = postsOn(d);
            const key = dk(d);
            const lit = hoverCell === key;

            return (
              <div
                key={i}
                className={`relative min-h-[34px] p-0.5 text-center cursor-pointer transition-colors ${
                  lit ? "bg-blue-50" : "hover:bg-gray-50"
                } ${!inMonth ? "opacity-25" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setHoverCell(key);
                }}
                onDragLeave={() => setHoverCell(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  onDayDrop(d);
                }}
                onClick={() => {
                  setAnchor(new Date(d));
                  setView("day");
                }}
              >
                <span
                  className={`text-[10px] leading-none inline-flex items-center justify-center ${
                    isToday
                      ? "bg-blue-500 text-white rounded-full w-[18px] h-[18px]"
                      : "text-gray-600 w-[18px] h-[18px]"
                  }`}
                >
                  {d.getDate()}
                </span>
                {dayPosts.length > 0 && (
                  <div className="flex gap-[2px] justify-center mt-0.5 flex-wrap">
                    {dayPosts.slice(0, 3).map((p) => (
                      <div
                        key={p.id}
                        draggable
                        onDragStart={(e) => {
                          e.stopPropagation();
                          dragRef.current = p;
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => {
                          dragRef.current = null;
                          setHoverCell(null);
                        }}
                        className="w-[5px] h-[5px] rounded-full cursor-grab active:cursor-grabbing"
                        style={{
                          backgroundColor: PLAT_BG[p.platform] ?? "#888",
                        }}
                        title={`${p.editName} · ${p.accountName}`}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ))}
                    {dayPosts.length > 3 && (
                      <span className="text-[7px] text-gray-400 leading-none">
                        +{dayPosts.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderTimeGrid() {
    const colCount = days.length;

    return (
      <div
        ref={gridRef}
        className="overflow-y-auto overflow-x-hidden"
        style={{ maxHeight: "340px" }}
      >
        <div className="flex sticky top-0 bg-white z-10 border-b border-gray-100">
          <div className="w-[26px] flex-shrink-0" />
          {days.map((d, i) => {
            const isToday = sameDay(d, today);
            return (
              <div
                key={i}
                className={`flex-1 text-center py-1 min-w-0 ${
                  isToday ? "text-blue-500" : "text-gray-500"
                }`}
              >
                <div className="text-[8px] font-medium leading-tight">
                  {d.toLocaleDateString("en-US", { weekday: "short" })}
                </div>
                <div
                  className={`text-[11px] font-semibold leading-tight ${
                    isToday
                      ? "bg-blue-500 text-white rounded-full w-[20px] h-[20px] inline-flex items-center justify-center"
                      : ""
                  }`}
                >
                  {d.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        <div className="relative">
          {HOURS.map((h) => (
            <div key={h} className="flex" style={{ height: `${SLOT_H}px` }}>
              <div className="w-[26px] flex-shrink-0 text-[8px] text-gray-400 text-right pr-1 -mt-[4px] select-none">
                {fmtTime(h)}
              </div>
              {days.map((d, di) => {
                const key = ck(d, h);
                const cellPosts = postsAt(d, h);
                const lit = hoverCell === key;

                return (
                  <div
                    key={di}
                    className={`flex-1 border-t border-l border-gray-100 min-w-0 transition-colors ${
                      lit ? "bg-blue-50" : ""
                    }`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setHoverCell(key);
                    }}
                    onDragLeave={() => setHoverCell(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      onCellDrop(d, h);
                    }}
                  >
                    <div className="p-[1px] flex flex-col gap-[1px] overflow-hidden h-full">
                      {cellPosts.map((p) => renderChip(p, colCount))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => step(-1)}
            className="w-5 h-5 rounded flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 text-[12px] transition-colors"
          >
            ‹
          </button>
          <button
            onClick={goToday}
            className="text-[10px] text-gray-500 hover:text-gray-700 px-1 py-0.5 rounded hover:bg-gray-100 transition-colors"
          >
            Today
          </button>
          <button
            onClick={() => step(1)}
            className="w-5 h-5 rounded flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 text-[12px] transition-colors"
          >
            ›
          </button>
        </div>
        <span className="text-[11px] font-semibold text-gray-700">
          {title}
        </span>
      </div>

      <div className="flex gap-0.5 bg-gray-100 rounded-md p-0.5">
        {views.map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex-1 text-[10px] py-1 rounded font-medium transition-colors ${
              view === v
                ? "bg-white text-gray-800 shadow-sm"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            {viewLabels[v]}
          </button>
        ))}
      </div>

      {view === "month" ? renderMonthView() : renderTimeGrid()}

      {posts.length === 0 && (
        <p className="text-[11px] text-gray-400 text-center py-2">
          No scheduled posts yet
        </p>
      )}
    </div>
  );
}
