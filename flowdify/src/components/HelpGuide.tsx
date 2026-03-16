import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "flowdify-help-dismissed";
const SECTION_KEY = "flowdify-help-section";

interface Section {
  id: string;
  title: string;
  content: React.ReactNode;
}

const sections: Section[] = [
  {
    id: "overview",
    title: "What is Flowdify?",
    content: (
      <>
        <p>
          Flowdify is a visual automation tool for producing and distributing
          short-form video content at scale. Instead of editing one video at a
          time, you build reusable <strong>content pipelines</strong> on a
          drag-and-drop canvas.
        </p>
        <p>
          Define your clips, audio, text hooks, and editing style — wire them
          together into an <strong>Aesthetic</strong> — then connect it to your
          social accounts. Flowdify handles the rest.
        </p>
      </>
    ),
  },
  {
    id: "canvas",
    title: "The canvas",
    content: (
      <>
        <p>
          The canvas is your workspace. Pan by clicking and dragging the
          background. Zoom with your scroll wheel or trackpad. Every card on the
          canvas is a <strong>node</strong> — each one represents a piece of your
          content pipeline.
        </p>
        <p>
          Nodes save their position automatically, so your layout persists
          between sessions.
        </p>
      </>
    ),
  },
  {
    id: "nodes",
    title: "Creating nodes",
    content: (
      <>
        <p>
          Open the <strong>Nodes</strong> section in the left sidebar. Drag any
          node type onto the canvas to create it. You'll be prompted to give it a
          name.
        </p>
        <div className="mt-2 flex flex-col gap-1.5">
          <NodeLabel color="#AF52DE" label="Videos" desc="Holds your video clips" />
          <NodeLabel color="#5AC8FA" label="Audio Snippets" desc="Music / sound from Flowstage" />
          <NodeLabel color="#FF9500" label="Text Hooks" desc="Attention-grabbing text overlays" />
          <NodeLabel color="#FF2D55" label="Edit Style" desc="The editing preset to apply" />
          <NodeLabel color="#007AFF" label="Aesthetic" desc="Combines everything into a content recipe" />
          <NodeLabel color="#5856D6" label="Edits" desc="Rendered videos from Flowstage" />
          <NodeLabel color="#30D158" label="Captions" desc="Post captions for distribution" />
          <NodeLabel color="#FF3B30" label="Account" desc="Your TikTok / Instagram / YouTube account" />
        </div>
      </>
    ),
  },
  {
    id: "sidebar",
    title: "The sidebar buckets",
    content: (
      <>
        <p>
          Below the node list, the sidebar has several <strong>buckets</strong>{" "}
          — pools of assets you can drag onto nodes:
        </p>
        <ul>
          <li>
            <strong>Video bucket</strong> — Upload short video clips (under 60s).
            They upload to Mux for hosting. Drag a clip onto a Videos node to
            attach it.
          </li>
          <li>
            <strong>Audio bucket</strong> — Songs synced from Flowstage. Drag
            onto an Audio Snippets node.
          </li>
          <li>
            <strong>Edit style bucket</strong> — Editing presets synced from
            Flowstage. Drag onto an Edit Style node.
          </li>
          <li>
            <strong>Accounts</strong> — Link your TikTok, Instagram, or YouTube
            accounts via Bundle Social. Drag onto an Account node.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "flowstage",
    title: "Using Flowstage",
    content: (
      <>
        <p>
          Flowdify pulls its <strong>audio snippets</strong> and{" "}
          <strong>editing presets</strong> from{" "}
          <a
            href="https://app.theflowstage.com/docs"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#007AFF", textDecoration: "underline" }}
          >
            Flowstage
          </a>
          . Everything you need for Flowdify can be managed there.
        </p>
        <p>
          To find your audio and presets in Flowstage, go to{" "}
          <strong>Advanced Features → View All Media</strong> and open the{" "}
          <strong>Audio</strong> section. For presets, go to{" "}
          <strong>Advanced Features → View All Presets</strong>.
        </p>
        <p>
          To <strong>add new audio</strong>, you can do so directly from View
          All Media. However, to <strong>create a new preset</strong>, you need
          to go into an actual aesthetic inside Flowstage and create the preset
          from there — there's no way to create one from the presets list alone.
        </p>
      </>
    ),
  },
  {
    id: "syncing",
    title: "Syncing from Flowstage",
    content: (
      <>
        <p>
          Press the <strong>Sync from Flowstage</strong> button at the top of
          the sidebar. This pulls your audio snippets and editing presets from
          your Flowstage account into the sidebar buckets.
        </p>
        <p>
          You need a Flowstage API key to sync. Add it in{" "}
          <strong>Settings</strong> (bottom-left corner).
        </p>
      </>
    ),
  },
  {
    id: "connections",
    title: "Connecting nodes",
    content: (
      <>
        <p>
          Drag from a node's <strong>output handle</strong> (right side) to
          another node's <strong>input handle</strong> (left side) to connect
          them. Only valid connections are allowed:
        </p>
        <ul>
          <li>Videos, Audio, Text Hooks, Edit Style → Aesthetic</li>
          <li>Aesthetic → Edits</li>
          <li>Edits, Captions → Account</li>
        </ul>
        <p>
          Each Aesthetic only accepts one of each input type. Right-click an edge
          to remove it.
        </p>
      </>
    ),
  },
  {
    id: "aesthetic",
    title: "Building an Aesthetic",
    content: (
      <>
        <p>
          The <strong>Aesthetic</strong> node is the heart of your pipeline. It
          combines clips + audio + text hooks + an editing style into a complete
          content formula.
        </p>
        <p>
          When all four inputs are connected and have content, the Aesthetic
          turns <span style={{ color: "#34C759", fontWeight: 600 }}>green</span>{" "}
          — meaning it's ready to generate videos via Flowstage.
        </p>
      </>
    ),
  },
  {
    id: "accounts",
    title: "Linking social accounts",
    content: (
      <>
        <p>
          In the <strong>Accounts</strong> section of the sidebar, click{" "}
          <strong>Link account</strong>. Name a team, then connect your
          TikTok, Instagram, or YouTube in the Bundle Social portal that opens.
        </p>
        <p>
          Come back and hit <strong>Sync accounts</strong> to pull them in.
          Then drag an account onto an Account node on the canvas.
        </p>
      </>
    ),
  },
  {
    id: "distribution",
    title: "Publishing content",
    content: (
      <>
        <p>
          Once your full pipeline is wired — Videos + Audio + Text Hooks +
          Edit Style → Aesthetic → Edits → Account — Flowdify can render
          your edits and schedule posts to your linked accounts.
        </p>
        <p>
          Use the <strong>Schedule</strong> page (via the hamburger menu,
          top-left) to view and manage your posting calendar. The{" "}
          <strong>Statistics</strong> page tracks performance metrics.
        </p>
      </>
    ),
  },
  {
    id: "tips",
    title: "Tips",
    content: (
      <ul>
        <li>
          <strong>Rename a node</strong> — double-click its title.
        </li>
        <li>
          <strong>Delete a node</strong> — select it and press Backspace /
          Delete.
        </li>
        <li>
          <strong>Delete an edge</strong> — right-click on it.
        </li>
        <li>
          <strong>Scroll inside a node</strong> — scroll directly over the
          node's content area. The canvas won't pan.
        </li>
        <li>
          <strong>Keyboard shortcut</strong> — press <kbd>?</kbd> anywhere to
          toggle this guide.
        </li>
      </ul>
    ),
  },
];

function NodeLabel({
  color,
  label,
  desc,
}: {
  color: string;
  label: string;
  desc: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      <span className="text-[12px]">
        <strong>{label}</strong>{" "}
        <span className="text-gray-400">— {desc}</span>
      </span>
    </div>
  );
}

export default function HelpGuide({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [activeSection, setActiveSection] = useState(() => {
    try {
      return localStorage.getItem(SECTION_KEY) ?? "overview";
    } catch {
      return "overview";
    }
  });

  const selectSection = useCallback((id: string) => {
    setActiveSection(id);
    try {
      localStorage.setItem(SECTION_KEY, id);
    } catch {}
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {}
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, dismiss]);

  const current = sections.find((s) => s.id === activeSection) ?? sections[0]!;
  const currentIdx = sections.findIndex((s) => s.id === current.id);

  const goNext = () => {
    const next = sections[currentIdx + 1];
    if (next) selectSection(next.id);
  };

  const goPrev = () => {
    const prev = sections[currentIdx - 1];
    if (prev) selectSection(prev.id);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm animate-backdrop-in"
        onClick={dismiss}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl w-[600px] max-h-[80vh] flex flex-col animate-modal-in overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-full bg-[#007AFF] flex items-center justify-center text-white text-[13px] font-bold">
              ?
            </span>
            <h2 className="text-[15px] font-semibold text-gray-900">
              How to use Flowdify
            </h2>
          </div>
          <button
            onClick={dismiss}
            className="w-6 h-6 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors text-[13px]"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Section nav */}
          <nav className="w-[180px] flex-shrink-0 border-r border-gray-100 py-2 overflow-y-auto">
            {sections.map((s, i) => (
              <button
                key={s.id}
                onClick={() => selectSection(s.id)}
                className={`w-full text-left px-4 py-2 text-[12px] transition-colors ${
                  s.id === current.id
                    ? "text-[#007AFF] font-semibold bg-blue-50/60"
                    : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
                }`}
              >
                <span className="text-[10px] text-gray-300 mr-1.5 font-mono">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {s.title}
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto px-6 py-5 help-content">
              <h3 className="text-[14px] font-semibold text-gray-900 mb-3">
                {current.title}
              </h3>
              <div className="text-[13px] text-gray-600 leading-relaxed space-y-3">
                {current.content}
              </div>
            </div>

            {/* Footer nav */}
            <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100 flex-shrink-0">
              <button
                onClick={goPrev}
                disabled={currentIdx === 0}
                className="text-[12px] font-medium text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-default transition-colors"
              >
                Previous
              </button>
              <span className="text-[11px] text-gray-300">
                {currentIdx + 1} / {sections.length}
              </span>
              {currentIdx < sections.length - 1 ? (
                <button
                  onClick={goNext}
                  className="text-[12px] font-medium text-[#007AFF] hover:text-[#0056CC] transition-colors"
                >
                  Next
                </button>
              ) : (
                <button
                  onClick={dismiss}
                  className="text-[12px] font-semibold text-[#007AFF] hover:text-[#0056CC] transition-colors"
                >
                  Got it
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function useHelpGuide() {
  const [open, setOpen] = useState(() => {
    try {
      return !localStorage.getItem(STORAGE_KEY);
    } catch {
      return true;
    }
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key === "?" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return { open, setOpen };
}
