import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Rnd } from "react-rnd";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { useToast } from "./components/ui/Toast";
import ConfirmDialog from "./components/ui/ConfirmDialog";
import Icon from "./components/ui/Icon";
import ResourcePanel from "./components/builder/ResourcePanel";
import PropertiesPanel from "./components/builder/PropertiesPanel";
import PageStrip from "./components/builder/PageStrip";
import TemplatePicker from "./components/builder/TemplatePicker";
import ShortcutsDialog from "./components/builder/ShortcutsDialog";
import { escapeHtml, splitMarkdownSections, extractMermaidChart } from "./components/builder/markdownUtils";
import "./CheatSheetEditor.css";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const A4_WIDTH = 794; // px @ 96dpi
const A4_HEIGHT = 1123; // px @ 96dpi
const GRID_SIZE = 10;
const PAGE_MARGIN = 32;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;

const HIGHLIGHT_COLORS = ["#fff59d", "#a5d6a7", "#90caf9", "#f48fb1"];
const FONT_FAMILIES = [
  "Arial",
  "Georgia",
  "Courier New",
  "Verdana",
  "Times New Roman",
  "Comic Sans MS",
];
const FONT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32];

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function blankPage() {
  return { id: uid(), blocks: [] };
}

function newBlock(type, extra = {}) {
  const base = {
    id: uid(),
    type,
    x: 40,
    y: 40,
    width: 220,
    height: 120,
    zIndex: 1,
    locked: false,
  };

  switch (type) {
    case "text":
      return {
        ...base,
        content: "<p>New text block. Double-click to edit.</p>",
        style: { backgroundColor: "transparent" },
        ...extra,
      };
    case "sticky":
      return {
        ...base,
        width: 180,
        height: 160,
        content: "<p>Sticky note…</p>",
        style: { backgroundColor: "#fff9c4" },
        ...extra,
      };
    case "shape":
      return {
        ...base,
        width: 160,
        height: 100,
        shapeType: extra.shapeType || "rectangle",
        style: { fill: "#bfdbfe", stroke: "#2563eb", strokeWidth: 2 },
        ...extra,
      };
    case "image":
      return { ...base, width: 220, height: 160, content: null, ...extra };
    case "table":
      return {
        ...base,
        width: 320,
        height: 150,
        data: Array.from({ length: 3 }, () => Array(3).fill("")),
        ...extra,
      };
    case "code":
      return {
        ...base,
        width: 320,
        height: 160,
        content: "// your code here",
        language: "javascript",
        ...extra,
      };
    default:
      return base;
  }
}

/**
 * Backward-compatible layout migration: previously saved layouts may lack
 * newer optional fields. Fill safe defaults without mutating stored data
 * shapes. Old layouts always remain loadable.
 */
function normalizePages(rawPages) {
  if (!Array.isArray(rawPages) || rawPages.length === 0) {
    return [blankPage()];
  }

  return rawPages.map((page) => ({
    id: page?.id || uid(),
    ...page,
    blocks: Array.isArray(page?.blocks)
      ? page.blocks.map((block) => ({
          zIndex: 1,
          locked: false,
          ...block,
          id: block?.id || uid(),
        }))
      : [],
  }));
}

/* ------------------------------------------------------------------ */
/*  Shape rendering (SVG)                                              */
/* ------------------------------------------------------------------ */

function ShapeSvg({ shapeType, style }) {
  const { fill, stroke, strokeWidth } = style;
  return (
    <svg width="100%" height="100%" preserveAspectRatio="none">
      {shapeType === "rectangle" && (
        <rect
          x={strokeWidth}
          y={strokeWidth}
          width={`calc(100% - ${strokeWidth * 2}px)`}
          height={`calc(100% - ${strokeWidth * 2}px)`}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      )}
      {shapeType === "circle" && (
        <ellipse
          cx="50%"
          cy="50%"
          rx={`calc(50% - ${strokeWidth}px)`}
          ry={`calc(50% - ${strokeWidth}px)`}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      )}
      {shapeType === "line" && (
        <line
          x1="0"
          y1="50%"
          x2="100%"
          y2="50%"
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      )}
      {shapeType === "arrow" && (
        <>
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill={stroke} />
            </marker>
          </defs>
          <line
            x1="0"
            y1="50%"
            x2="95%"
            y2="50%"
            stroke={stroke}
            strokeWidth={strokeWidth}
            markerEnd="url(#arrowhead)"
          />
        </>
      )}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Rich text toolbar (operates on document.execCommand)               */
/* ------------------------------------------------------------------ */

function TextToolbar({ 
  onCommand,
  onInteractionStart,
  onInteractionEnd,
}) {
  const [color, setColor] = useState("#111827");
  const savedRange = useRef(null);

  // Interacting with a <select> or color picker moves focus away from the
  // contentEditable and destroys the text selection, so execCommand would
  // have nothing to format. Save the selection when the control is opened
  // and restore it just before applying the command.
  const saveSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      savedRange.current = selection.getRangeAt(0).cloneRange();
    }
  };

  const restoreSelection = () => {
    const selection = window.getSelection();
    if (!savedRange.current || !selection) {
      return false;
    }
    try {
      selection.removeAllRanges();
      selection.addRange(savedRange.current);
      return true;
    } catch (error) {
      console.warn("unable to restore text selection:", error);
      savedRange.current = null;
      return false;
    }
  };

  const run = (command, value) => {
    restoreSelection();
    onCommand(command, value);
    onInteractionEnd?.();
  };

  return (
    <div 
        className="cs-text-toolbar"
        data-text-toolbar="true"
        onMouseDownCapture={() => onInteractionStart?.()}
        onMouseUpCapture={() => onInteractionEnd?.()}
        onClick={(event) => event.stopPropagation}
      >
      <button onMouseDown={(e) => e.preventDefault()} onClick={() => onCommand("bold")} title="Bold">
        <b>B</b>
      </button>
      <button onMouseDown={(e) => e.preventDefault()} onClick={() => onCommand("italic")} title="Italic">
        <i>I</i>
      </button>
      <button onMouseDown={(e) => e.preventDefault()} onClick={() => onCommand("underline")} title="Underline">
        <u>U</u>
      </button>
      <button onMouseDown={(e) => e.preventDefault()} onClick={() => onCommand("strikeThrough")} title="Strikethrough">
        <s>S</s>
      </button>

      <select
        onMouseDown={saveSelection}
        onChange={(e) => {
          const value = e.target.value;
          e.target.value = "";
          if (value) run("fontName", value);
        }}
        defaultValue=""
        aria-label="Font family"
      >
        <option value="" disabled>
          Font
        </option>
        {FONT_FAMILIES.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>

      <select
        onMouseDown={saveSelection}
        onChange={(e) => {
          const value = e.target.value;
          e.target.value = "";
          if (value) run("fontSizePx", value);
        }}
        defaultValue=""
        aria-label="Font size"
      >
        <option value="" disabled>
          Size
        </option>
        {FONT_SIZES.map((s) => (
          <option key={s} value={s}>
            {s}px
          </option>
        ))}
      </select>

      <input
        type="color"
        title="Text color"
        aria-label="Text color"
        value={color}
        onMouseDown={saveSelection}
        onChange={(e) => {
          setColor(e.target.value);
          run("foreColor", e.target.value);
        }}
      />

      {HIGHLIGHT_COLORS.map((c) => (
        <button
          key={c}
          className="cs-highlight-swatch"
          style={{ background: c }}
          title="Highlight"
          aria-label="Highlight text"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onCommand("hiliteColor", c)}
        />
      ))}
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onCommand("hiliteColor", "transparent")}
        title="Remove highlight"
      >
        ⨯
      </button>

      <button onMouseDown={(e) => e.preventDefault()} onClick={() => onCommand("insertUnorderedList")} title="Bullet list">
        • List
      </button>
      <button onMouseDown={(e) => e.preventDefault()} onClick={() => onCommand("insertOrderedList")} title="Numbered list">
        1. List
      </button>
      <button onMouseDown={(e) => e.preventDefault()} onClick={() => onCommand("justifyLeft")} title="Align left">
        ⇤
      </button>
      <button onMouseDown={(e) => e.preventDefault()} onClick={() => onCommand("justifyCenter")} title="Align centre">
        ⇔
      </button>
      <button onMouseDown={(e) => e.preventDefault()} onClick={() => onCommand("justifyRight")} title="Align right">
        ⇥
      </button>
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          const url = window.prompt("Link URL:");
          if (url) onCommand("createLink", url);
        }}
        title="Insert link"
      >
        🔗
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

const EMPTY_RESOURCES = {
  keyPoints: "",
  summary: "",
  notes: "",
  flashcards: [],
  visuals: [],
};

const CheatSheetEditor = forwardRef(function CheatSheetEditor(
  {
    initialPages,
    onChange,
    exportFileName = "cheat-sheet",
    resources = EMPTY_RESOURCES,
    onAddSection,
    onAddAll,
    onAddFlashcard,
    onAddVisual,
    dirty = false,
    saving = false,
    onRequestSave,
    onBack,
  },
  ref
) {
  const [pages, setPages] = useState(() => normalizePages(initialPages));
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [snap, setSnap] = useState(true);
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [clipboard, setClipboard] = useState(null);
  const [pendingDeletePage, setPendingDeletePage] = useState(null);
  const toast = useToast();

  const [showGrid, setShowGrid] = useState(false);
  const [showMargins, setShowMargins] = useState(false);
  const [exporting, setExporting] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(
    () => typeof window !== "undefined" && window.innerWidth > 1100
  );
  const [propsOpen, setPropsOpen] = useState(
    () => typeof window !== "undefined" && window.innerWidth > 1280
  );
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [onboardDismissed, setOnboardDismissed] = useState(false);

  const canvasRef = useRef(null);
  const scrollRef = useRef(null);
  const exportMenuRef = useRef(null);
  const editableRefs = useRef({});
  const skipNextHistory = useRef(false);
  const textToolbarInteractingRef = useRef(false);

  const blocks = pages[pageIndex]?.blocks || [];

  const setBlocks = useCallback(
    (updater, recordHistory = true) => {
      setPages((prev) => {
        const next = prev.map((p, i) =>
          i === pageIndex
            ? { ...p, blocks: typeof updater === "function" ? updater(p.blocks) : updater }
            : p
        );
        return next;
      });
      if (recordHistory) pushHistory();
    },
    [pageIndex]
  );

  const pushHistory = useCallback(() => {
    if (skipNextHistory.current) {
      skipNextHistory.current = false;
      return;
    }
    setHistory((h) => [...h, JSON.stringify(pages)].slice(-50));
    setFuture([]);
  }, [pages]);

  useEffect(() => {
    if (onChange) onChange(pages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages]);

  // Warn before leaving the browser tab with unsaved builder changes.
  useEffect(() => {
    if (!dirty) return;

    const handler = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  /* ---------------- history ---------------- */
  const undo = () => {
    if (!history.length) return;
    const prevSnapshot = history[history.length - 1];
    setFuture((f) => [JSON.stringify(pages), ...f]);
    setHistory((h) => h.slice(0, -1));
    skipNextHistory.current = true;
    const restored = JSON.parse(prevSnapshot);
    setPages(restored);
    setPageIndex((p) => Math.min(p, restored.length - 1));
    setSelectedId(null);
    setEditingId(null);
  };

  const redo = () => {
    if (!future.length) return;
    const nextSnapshot = future[0];
    setHistory((h) => [...h, JSON.stringify(pages)]);
    setFuture((f) => f.slice(1));
    skipNextHistory.current = true;
    const restored = JSON.parse(nextSnapshot);
    setPages(restored);
    setPageIndex((p) => Math.min(p, restored.length - 1));
    setSelectedId(null);
    setEditingId(null);
  };

  /* ---------------- block CRUD ---------------- */

  const addBlock = useCallback(
    (type, extra = {}) => {
      const maxZ = blocks.reduce((m, b) => Math.max(m, b.zIndex), 0);
      const block = newBlock(type, { zIndex: maxZ + 1, ...extra });
      setBlocks((prev) => [...prev, block]);
      setSelectedId(block.id);
      return block.id;
    },
    [blocks, setBlocks]
  );

  const updateBlock = (id, patch, recordHistory = true) => {
    setBlocks(
      (prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      recordHistory
    );
  };

  const deleteBlock = (id) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
    setSelectedId(null);
  };

  const duplicateBlock = (id) => {
    const b = blocks.find((x) => x.id === id);
    if (!b) return;
    const maxZ = blocks.reduce((m, x) => Math.max(m, x.zIndex), 0);
    const copy = { ...b, id: uid(), x: b.x + 20, y: b.y + 20, zIndex: maxZ + 1 };
    setBlocks((prev) => [...prev, copy]);
    setSelectedId(copy.id);
  };

  const reorder = (id, dir) => {
    const b = blocks.find((x) => x.id === id);
    if (!b) return;
    const zs = blocks.map((x) => x.zIndex);
    let newZ = b.zIndex;
    if (dir === "front") newZ = Math.max(...zs) + 1;
    if (dir === "back") newZ = Math.min(...zs) - 1;
    if (dir === "forward") newZ = b.zIndex + 1;
    if (dir === "backward") newZ = b.zIndex - 1;
    updateBlock(id, { zIndex: newZ });
  };

  /* ---------------- alignment tools ---------------- */

  const alignBlock = (id, edge) => {
    const b = blocks.find((x) => x.id === id);
    if (!b || b.locked) return;

    const patch = {};
    if (edge === "left") patch.x = PAGE_MARGIN;
    if (edge === "centerH") patch.x = Math.round((A4_WIDTH - b.width) / 2);
    if (edge === "right") patch.x = A4_WIDTH - PAGE_MARGIN - b.width;
    if (edge === "top") patch.y = PAGE_MARGIN;
    if (edge === "middle") patch.y = Math.round((A4_HEIGHT - b.height) / 2);
    if (edge === "bottom") patch.y = A4_HEIGHT - PAGE_MARGIN - b.height;

    updateBlock(id, patch);
  };

  const centerBlockOnPage = (id) => {
    const b = blocks.find((x) => x.id === id);
    if (!b || b.locked) return;
    updateBlock(id, {
      x: Math.round((A4_WIDTH - b.width) / 2),
      y: Math.round((A4_HEIGHT - b.height) / 2),
    });
  };

  const moveBlockInsideBounds = (id) => {
    const b = blocks.find((x) => x.id === id);
    if (!b || b.locked) return;

    const width = Math.min(b.width, A4_WIDTH - PAGE_MARGIN * 2);
    const height = Math.min(b.height, A4_HEIGHT - PAGE_MARGIN * 2);
    const x = Math.min(Math.max(b.x, PAGE_MARGIN), A4_WIDTH - PAGE_MARGIN - width);
    const y = Math.min(Math.max(b.y, PAGE_MARGIN), A4_HEIGHT - PAGE_MARGIN - height);

    updateBlock(id, { x, y, width, height });
  };

  const nudgeBlock = (id, dx, dy) => {
    const b = blocks.find((x) => x.id === id);
    if (!b || b.locked) return;
    updateBlock(id, {
      x: Math.max(0, b.x + dx),
      y: Math.max(0, b.y + dy),
    });
  };

  /* ---------------- pages ---------------- */

  const addPage = () => {
    pushHistory();
    setPages((prev) => [...prev, blankPage()]);
    setPageIndex(pages.length);
    setSelectedId(null);
    setEditingId(null);
  };

  const duplicatePage = () => {
    pushHistory();
    const clone = {
      id: uid(),
      blocks: blocks.map((b) => ({ ...b, id: uid() })),
    };
    setPages((prev) => {
      const next = [...prev];
      next.splice(pageIndex + 1, 0, clone);
      return next;
    });
    setPageIndex(pageIndex + 1);
  };

  const deletePage = (i) => {
    if (pages.length === 1) return;
    pushHistory();
    setPages((prev) => prev.filter((_, idx) => idx !== i));
    setPageIndex((prev) => Math.max(0, prev >= i ? prev - 1 : prev));
    setSelectedId(null);
    setEditingId(null);
  };

  const movePage = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= pages.length) return;
    pushHistory();
    setPages((prev) => {
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setPageIndex(j);
  };

  /* ---------------- templates ---------------- */

  const templateAvailability = {
    keyPoints: Boolean(resources.keyPoints?.trim()),
    summary: Boolean(resources.summary?.trim()),
    flashcards: (resources.flashcards?.length || 0) > 0,
    visuals: (resources.visuals?.length || 0) > 0,
  };

  const sectionsForTemplate = (content, limit) =>
    splitMarkdownSections(content)
      .map((section) => {
        const mermaidContent = extractMermaidChart(section);
        if (mermaidContent) {
          // Templates are synchronous; diagrams can be added individually
          // from the library (which converts them to images).
          return mermaidContent.remainingText || null;
        }
        return section;
      })
      .filter(Boolean)
      .slice(0, limit);

  const sectionToBlockHtml = (section) =>
    section
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        if (line.startsWith("### ")) return `<h3>${escapeHtml(line.slice(4))}</h3>`;
        if (line.startsWith("## ")) return `<h2>${escapeHtml(line.slice(3))}</h2>`;
        if (line.startsWith("# ")) return `<h1>${escapeHtml(line.slice(2))}</h1>`;
        if (/^[-*]\s+/.test(line))
          return `<p>• ${escapeHtml(line.replace(/^[-*]\s+/, ""))}</p>`;
        return `<p>${escapeHtml(line)}</p>`;
      })
      .join("");

  const buildTemplateBlocks = (templateId, zStart, yStart) => {
    const contentW = A4_WIDTH - PAGE_MARGIN * 2;
    const result = [];
    let z = zStart;
    let y = yStart;

    const pushHeading = () => {
      result.push(
        newBlock("text", {
          content: `<h1>${escapeHtml(exportFileName || "Revision Sheet")}</h1>`,
          x: PAGE_MARGIN,
          y,
          width: contentW,
          height: 58,
          zIndex: ++z,
        })
      );
      y += 74;
    };

    if (templateId === "one-page" || templateId === "summary-sheet") {
      const source =
        templateId === "one-page" ? resources.keyPoints : resources.summary;
      const sections = sectionsForTemplate(source, 5);

      pushHeading();
      sections.forEach((section) => {
        result.push(
          newBlock("text", {
            content: sectionToBlockHtml(section),
            x: PAGE_MARGIN,
            y,
            width: contentW,
            height: 150,
            zIndex: ++z,
          })
        );
        y += 166;
      });
    }

    if (templateId === "two-column") {
      const sections = sectionsForTemplate(resources.keyPoints, 8);
      const colW = Math.floor((contentW - 16) / 2);

      pushHeading();
      const columnTop = y;
      sections.forEach((section, index) => {
        const col = index % 2;
        const row = Math.floor(index / 2);
        result.push(
          newBlock("text", {
            content: sectionToBlockHtml(section),
            x: PAGE_MARGIN + col * (colW + 16),
            y: columnTop + row * 176,
            width: colW,
            height: 160,
            zIndex: ++z,
          })
        );
      });
    }

    if (templateId === "flashcard-grid") {
      const cards = (resources.flashcards || []).slice(0, 6);
      const colW = Math.floor((contentW - 16) / 2);

      pushHeading();
      const gridTop = y;
      cards.forEach((card, index) => {
        const col = index % 2;
        const row = Math.floor(index / 2);
        result.push(
          newBlock("text", {
            content: `
              <div class="editor-flashcard-content">
                <p><strong>Q${index + 1}.</strong> ${escapeHtml(card.question)}</p>
                <hr />
                <p>${escapeHtml(card.answer)}</p>
              </div>
            `,
            x: PAGE_MARGIN + col * (colW + 16),
            y: gridTop + row * 186,
            width: colW,
            height: 170,
            zIndex: ++z,
            style: { backgroundColor: "#eff6ff" },
          })
        );
      });
    }

    if (templateId === "visual-overview") {
      const visuals = (resources.visuals || []).slice(0, 4);
      const colW = Math.floor((contentW - 16) / 2);

      pushHeading();
      const gridTop = y;
      visuals.forEach((page, index) => {
        const col = index % 2;
        const row = Math.floor(index / 2);
        result.push(
          newBlock("image", {
            content: page.imageUrl,
            x: PAGE_MARGIN + col * (colW + 16),
            y: gridTop + row * 296,
            width: colW,
            height: 280,
            zIndex: ++z,
          })
        );
      });
    }

    return result;
  };

  const applyTemplate = (templateId, mode) => {
    setTemplatesOpen(false);

    if (mode === "replace") {
      const templateBlocks = buildTemplateBlocks(templateId, 0, PAGE_MARGIN);
      setBlocks(templateBlocks);
    } else {
      const maxZ = blocks.reduce((m, b) => Math.max(m, b.zIndex), 0);
      const maxY = blocks.reduce((m, b) => Math.max(m, b.y + b.height), 0);
      const startY = Math.min(maxY + 24, A4_HEIGHT - 200) || PAGE_MARGIN;
      const templateBlocks = buildTemplateBlocks(templateId, maxZ, startY);
      setBlocks((prev) => [...prev, ...templateBlocks]);
    }

    setSelectedId(null);
    setEditingId(null);
    toast.success("Layout applied — press Ctrl+Z to undo.");
  };

  /* ---------------- text editing ---------------- */

  const execCommand = (command, value) => {
    if (command === "fontSizePx") {
      // execCommand("fontSize") only accepts legacy values 1-7, so apply
      // size 7 as a marker and convert the generated elements to real px.
      document.execCommand("styleWithCSS", false, false);
      document.execCommand("fontSize", false, "7");

      const editable = editingId ? editableRefs.current[editingId] : null;
      if (editable) {
        editable.querySelectorAll('font[size="7"]').forEach((node) => {
          const span = document.createElement("span");
          span.style.fontSize = `${value}px`;
          span.innerHTML = node.innerHTML;
          node.replaceWith(span);
        });
        editable
          .querySelectorAll('span[style*="xxx-large"]')
          .forEach((node) => {
            node.style.fontSize = `${value}px`;
          });
      }
    } else {
      document.execCommand(command, false, value);
    }

    if (editingId) {
      const el = editableRefs.current[editingId];
      if (el) updateBlock(editingId, { content: el.innerHTML }, false);
    }
  };

  const finishEditing = (id) => {
    const el = editableRefs.current[id];
    if (el) updateBlock(id, { content: el.innerHTML });
    setEditingId(null);
  };

  /* ---------------- clipboard / keyboard ---------------- */

  useEffect(() => {
    const handler = (e) => {
      if (editingId) return; // let contentEditable handle its own keys

      // Never hijack typing inside inputs, textareas, selects or other
      // editable fields (panel search, number fields, code blocks, etc.).
      const target = e.target;
      const isFormField =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (isFormField) return;

      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        deleteBlock(selectedId);
        return;
      }

      if (e.key === "Escape") {
        if (selectedId) {
          e.preventDefault();
          setSelectedId(null);
        }
        return;
      }

      if (e.key === "Enter" && selectedId) {
        const b = blocks.find((x) => x.id === selectedId);
        if (b && !b.locked && (b.type === "text" || b.type === "sticky")) {
          e.preventDefault();
          setEditingId(selectedId);
        }
        return;
      }

      if (
        (e.key === "ArrowLeft" ||
          e.key === "ArrowRight" ||
          e.key === "ArrowUp" ||
          e.key === "ArrowDown") &&
        selectedId
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        nudgeBlock(selectedId, dx, dy);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d" && selectedId) {
        e.preventDefault();
        duplicateBlock(selectedId);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        onRequestSave?.();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && selectedId) {
        const b = blocks.find((x) => x.id === selectedId);
        if (b) setClipboard(b);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v" && clipboard) {
        e.preventDefault();
        const maxZ = blocks.reduce((m, x) => Math.max(m, x.zIndex), 0);
        const copy = {
          ...clipboard,
          id: uid(),
          x: clipboard.x + 20,
          y: clipboard.y + 20,
          zIndex: maxZ + 1,
        };
        setBlocks((prev) => [...prev, copy]);
        setSelectedId(copy.id);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, editingId, clipboard, blocks]);

  // Close the export menu on click-away / Escape.
  useEffect(() => {
    if (!exportMenuOpen) return;

    const onClickAway = (event) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target)) {
        setExportMenuOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setExportMenuOpen(false);
    };

    window.addEventListener("mousedown", onClickAway);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onClickAway);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [exportMenuOpen]);

  /* ---------------- export ---------------- */

  const waitForImages = async (element) => {
    const images = Array.from(element.querySelectorAll("img"));

    await Promise.all(
      images.map((img) => {
        if (img.complete) return Promise.resolve();

        return new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
        });
      })
    );
  };

  const doubleRaf = () =>
    new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    });

  const prepareForExport = async (label) => {
    if (editingId) {
      finishEditing(editingId);
    }
    setSelectedId(null);
    setEditingId(null);
    setExportMenuOpen(false);
    setExporting(label);

    const previousZoom = zoom;
    setZoom(1); // view zoom must never change export dimensions

    await doubleRaf();
    if (canvasRef.current) {
      await waitForImages(canvasRef.current);
    }
    await doubleRaf();

    return previousZoom;
  };

  const exportAsPNG = async () => {
    if (!canvasRef.current) return;
    let previousZoom = zoom;

    try {
      previousZoom = await prepareForExport("Exporting PNG…");

      const canvas = await html2canvas(canvasRef.current, {
        scale: 3,
        backgroundColor: "#ffffff",
        useCORS: true,
        allowTaint: false,
      });

      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = `${exportFileName}.png`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Cheat sheet exported as PNG.");
    } catch (error) {
      console.error("PNG export failed:", error);
      toast.error(`PNG export failed: ${error.message}`);
    } finally {
      setExporting("");
      setZoom(previousZoom);
    }
  };

  const exportAsPDF = async () => {
    if (!canvasRef.current) return;
    let previousZoom = zoom;

    try {
      previousZoom = await prepareForExport("Exporting PDF…");

      const canvas = await html2canvas(canvasRef.current, {
        scale: 3,
        backgroundColor: "#ffffff",
        useCORS: true,
        allowTaint: false,
      });

      const imageData = canvas.toDataURL("image/png");

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "px",
        format: [A4_WIDTH, A4_HEIGHT],
      });

      pdf.addImage(
        imageData,
        "PNG",
        0,
        0,
        A4_WIDTH,
        A4_HEIGHT
      );

      pdf.save(`${exportFileName}.pdf`);
      toast.success("Cheat sheet exported as PDF.");
    } catch (error) {
      console.error("PDF export failed:", error);
      toast.error(`PDF export failed: ${error.message}`);
    } finally {
      setExporting("");
      setZoom(previousZoom);
    }
  };

  /* ---------------- imperative API for parent (App.jsx) ---------------- */

  useImperativeHandle(ref, () => ({
    addTextBlock: (html, opts = {}) =>
      addBlock("text", {
        content: html,
        width: 340,
        height: 180,
        ...opts,
      }),

    addHeadingBlock: (text, opts = {}) =>
      addBlock("text", {
        content: `<h2>${text}</h2>`,
        width: 420,
        height: 100,
        ...opts,
      }),

    addFlashcardBlock: ({ question, answer }, opts = {}) =>
      addBlock("text", {
        content: `
          <div class="editor-flashcard-content">
            <p><strong>Question</strong></p>
            <p>${question}</p>
            <hr />
            <p><strong>Answer</strong></p>
            <p>${answer}</p>
          </div>
        `,
        width: 360,
        height: 240,
        style: {
          backgroundColor: "#eff6ff",
        },
        ...opts,
      }),

    addImageBlock: ({ imageUrl }, opts = {}) =>
      addBlock("image", {
        content: imageUrl,
        width: 380,
        height: 280,
        ...opts,
      }),

    exportAsPNG,
    exportAsPDF,
    getPages: () => pages,

    loadPages: (nextPages) => {
      setPages(normalizePages(nextPages));

      setPageIndex(0);
      setSelectedId(null);
      setEditingId(null);
    },
  }));

  /* ---------------- image upload ---------------- */

  const handleImageUpload = (id, file) => {
    const reader = new FileReader();
    reader.onload = () => updateBlock(id, { content: reader.result });
    reader.readAsDataURL(file);
  };

  const addImageFromFile = (file) => {
    const id = addBlock("image");
    handleImageUpload(id, file);
  };

  /* ---------------- element library ---------------- */

  const addElement = (elementId) => {
    switch (elementId) {
      case "heading":
        addBlock("text", {
          content: "<h1>Heading</h1>",
          width: 420,
          height: 62,
        });
        break;
      case "text":
        addBlock("text");
        break;
      case "callout":
        addBlock("sticky", {
          content: "<p><strong>💡 Tip:</strong> add a memory hook here.</p>",
          width: 300,
          height: 110,
          style: { backgroundColor: "#eef2ff" },
        });
        break;
      case "checklist":
        addBlock("text", {
          content:
            "<p>☐ First revision task</p><p>☐ Second revision task</p><p>☐ Third revision task</p>",
          width: 300,
          height: 120,
        });
        break;
      case "divider":
        addBlock("shape", {
          shapeType: "line",
          width: 400,
          height: 24,
        });
        break;
      case "code":
        addBlock("code");
        break;
      case "table":
        addBlock("table");
        break;
      case "rectangle":
        addBlock("shape", { shapeType: "rectangle" });
        break;
      case "circle":
        addBlock("shape", { shapeType: "circle" });
        break;
      case "arrow":
        addBlock("shape", { shapeType: "arrow" });
        break;
      default:
        addBlock("text");
    }
  };

  /* ---------------- table helpers ---------------- */

  const updateTableCell = (id, r, c, value) => {
    const b = blocks.find((x) => x.id === id);
    const data = b.data.map((row) => [...row]);
    data[r][c] = value;
    updateBlock(id, { data }, false);
  };

  const addTableRow = (id) => {
    const b = blocks.find((x) => x.id === id);
    updateBlock(id, { data: [...b.data, Array(b.data[0].length).fill("")] });
  };

  const addTableCol = (id) => {
    const b = blocks.find((x) => x.id === id);
    updateBlock(id, { data: b.data.map((row) => [...row, ""]) });
  };

  useEffect(() => {
    if (!editingId) return;

    const editableElement = editableRefs.current[editingId];

    if (!editableElement) return;

    editableElement.focus();

    const selection = window.getSelection();
    const range = document.createRange();

    range.selectNodeContents(editableElement);
    range.collapse(false);

    selection.removeAllRanges();
    selection.addRange(range);
  }, [editingId]);

  /* ---------------- view controls ---------------- */

  const zoomBy = (delta) =>
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((z + delta) * 100) / 100)));

  const fitPage = () => {
    const el = scrollRef.current;
    if (!el) return;
    const availableW = el.clientWidth - 72;
    const availableH = el.clientHeight - 72;
    const scale = Math.min(availableW / A4_WIDTH, availableH / A4_HEIGHT, MAX_ZOOM);
    setZoom(Math.max(MIN_ZOOM, Math.floor(scale * 100) / 100));
  };

  const selectedBlock = blocks.find((b) => b.id === selectedId);
  const showOnboarding =
    blocks.length === 0 && !onboardDismissed && !exporting;

  const saveStatus = saving
    ? { label: "Saving…", className: "saving" }
    : dirty
    ? { label: "Unsaved changes", className: "unsaved" }
    : { label: "Saved", className: "saved" };

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  return (
    <div className="cs-root csb-root">
      {/* ---------- Top toolbar ---------- */}
      <div className="cs-toolbar csb-toolbar">
        <div className="cs-toolbar-group csb-toolbar-left">
          {onBack && (
            <button
              type="button"
              className="csb-tool-btn"
              onClick={onBack}
              title="Back to study resources"
              aria-label="Back to study resources"
            >
              <Icon name="chevronLeft" size={16} />
            </button>
          )}

          <span className="csb-doc-title" title={exportFileName}>
            {exportFileName}
          </span>

          <span
            className={`builder-status-badge ${saveStatus.className}`}
            role="status"
          >
            {saving && <span className="spinner" style={{ width: 11, height: 11 }} />}
            {saveStatus.label}
          </span>
        </div>

        <div className="cs-toolbar-group">
          <button
            type="button"
            className="csb-tool-btn"
            onClick={undo}
            disabled={!history.length}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
          >
            <Icon name="undo" size={15} />
          </button>
          <button
            type="button"
            className="csb-tool-btn"
            onClick={redo}
            disabled={!future.length}
            title="Redo (Ctrl+Shift+Z)"
            aria-label="Redo"
          >
            <Icon name="redo" size={15} />
          </button>
        </div>

        <div className="cs-toolbar-group">
          <button
            type="button"
            className={`csb-tool-btn ${libraryOpen ? "active" : ""}`}
            onClick={() => setLibraryOpen((v) => !v)}
            title="Toggle content library"
            aria-label="Toggle content library"
            aria-pressed={libraryOpen}
          >
            <Icon name="layoutLeft" size={15} />
          </button>

          <button
            type="button"
            className="csb-tool-btn with-label"
            onClick={() => setTemplatesOpen(true)}
            title="Recommended layouts"
          >
            <Icon name="template" size={15} />
            <span>Layouts</span>
          </button>

          <button
            type="button"
            className="csb-tool-btn with-label"
            onClick={() => addElement("text")}
            title="Add a text block"
          >
            <Icon name="plus" size={15} />
            <span>Text</span>
          </button>
        </div>

        <div className="cs-toolbar-group">
          <button
            type="button"
            className={`csb-tool-btn ${showGrid ? "active" : ""}`}
            onClick={() => setShowGrid((v) => !v)}
            title="Toggle grid"
            aria-label="Toggle grid"
            aria-pressed={showGrid}
          >
            <Icon name="grid" size={15} />
          </button>

          <label className="cs-checkbox" title="Snap dragging and resizing to the grid">
            <input
              type="checkbox"
              checked={snap}
              onChange={(e) => setSnap(e.target.checked)}
            />
            Snap
          </label>

          <button
            type="button"
            className="csb-tool-btn"
            onClick={() => zoomBy(-0.1)}
            disabled={zoom <= MIN_ZOOM}
            title="Zoom out"
            aria-label="Zoom out"
          >
            <Icon name="minus" size={15} />
          </button>
          <button
            type="button"
            className="cs-zoom-label csb-zoom-reset"
            onClick={() => setZoom(1)}
            title="Reset zoom to 100%"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            className="csb-tool-btn"
            onClick={() => zoomBy(0.1)}
            disabled={zoom >= MAX_ZOOM}
            title="Zoom in"
            aria-label="Zoom in"
          >
            <Icon name="plus" size={15} />
          </button>
          <button
            type="button"
            className="csb-tool-btn"
            onClick={fitPage}
            title="Fit page to view"
            aria-label="Fit page to view"
          >
            <Icon name="maximize" size={15} />
          </button>
        </div>

        <div className="cs-toolbar-group csb-toolbar-right">
          <button
            type="button"
            className="csb-tool-btn"
            onClick={() => setShortcutsOpen(true)}
            title="Keyboard shortcuts"
            aria-label="Keyboard shortcuts"
          >
            <Icon name="keyboard" size={15} />
          </button>

          <button
            type="button"
            className={`csb-tool-btn ${propsOpen ? "active" : ""}`}
            onClick={() => setPropsOpen((v) => !v)}
            title="Toggle properties panel"
            aria-label="Toggle properties panel"
            aria-pressed={propsOpen}
          >
            <Icon name="layoutRight" size={15} />
          </button>

          {onRequestSave && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onRequestSave}
              disabled={saving}
              title="Save this note (Ctrl+S)"
            >
              <Icon name="save" size={14} />
              Save
            </button>
          )}

          <div className="csb-export-wrap" ref={exportMenuRef}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setExportMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={exportMenuOpen}
              disabled={Boolean(exporting)}
            >
              {exporting ? (
                <>
                  <span className="spinner" style={{ width: 13, height: 13 }} />
                  {exporting}
                </>
              ) : (
                <>
                  <Icon name="download" size={14} />
                  Export
                  <Icon name="chevronDown" size={13} />
                </>
              )}
            </button>

            {exportMenuOpen && (
              <div className="csb-export-menu" role="menu">
                <button type="button" role="menuitem" onClick={exportAsPNG}>
                  <Icon name="image" size={14} />
                  Export current page as PNG
                </button>
                <button type="button" role="menuitem" onClick={exportAsPDF}>
                  <Icon name="fileText" size={14} />
                  Export current page as PDF
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="cs-body csb-body">
        {/* ---------- Left content library ---------- */}
        <ResourcePanel
          open={libraryOpen}
          onClose={() => setLibraryOpen(false)}
          resources={resources}
          onAddSection={(section, index) => onAddSection?.(section, index)}
          onAddAll={(content) => onAddAll?.(content)}
          onAddFlashcard={(card, index) => onAddFlashcard?.(card, index)}
          onAddVisual={(page, index) => onAddVisual?.(page, index)}
          onAddElement={addElement}
          onAddImageFile={addImageFromFile}
        />

        {/* ---------- Canvas ---------- */}
        <div className="cs-canvas-scroll" ref={scrollRef}>
          <div
            className="cs-canvas-wrap"
            style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
          >
            <div
              id="cheatsheet-canvas"
              ref={canvasRef}
              className="cs-canvas"
              style={{ width: A4_WIDTH, height: A4_HEIGHT }}
              onMouseDown={(event) => {
                if (event.target !== event.currentTarget) return;

                if (editingId) {
                  finishEditing(editingId);
                }

                setSelectedId(null);
                setEditingId(null);
              }}
            >
              {showGrid && !exporting && (
                <div className="csb-grid-overlay" aria-hidden="true" />
              )}

              {showMargins && !exporting && (
                <div
                  className="csb-margin-overlay"
                  aria-hidden="true"
                  style={{ inset: PAGE_MARGIN }}
                />
              )}

              {showOnboarding && (
                <div className="csb-onboarding">
                  <h3>Build your revision sheet</h3>
                  <ol>
                    <li>Add study resources from the library</li>
                    <li>Arrange and edit blocks on the page</li>
                    <li>Export your finished sheet as PNG or PDF</li>
                  </ol>

                  <div className="csb-onboarding-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => setTemplatesOpen(true)}
                    >
                      <Icon name="template" size={14} />
                      Use recommended layout
                    </button>

                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setLibraryOpen(true);
                      }}
                    >
                      <Icon name="layoutLeft" size={14} />
                      Open content library
                    </button>

                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => addElement("text")}
                    >
                      <Icon name="plus" size={14} />
                      Add custom text
                    </button>

                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setOnboardDismissed(true)}
                    >
                      Start blank
                    </button>
                  </div>
                </div>
              )}

              {blocks
                .slice()
                .sort((a, b) => a.zIndex - b.zIndex)
                .map((b) => (
                  <Rnd
                    key={b.id}
                    size={{
                      width: b.width,
                      height: b.height,
                    }}
                    position={{
                      x: b.x,
                      y: b.y,
                    }}
                    bounds="parent"
                    minWidth={40}
                    minHeight={24}
                    dragHandleClassName="cs-block-drag-handle"
                    dragGrid={snap ? [GRID_SIZE, GRID_SIZE] : [1, 1]}
                    resizeGrid={snap ? [GRID_SIZE, GRID_SIZE] : [1, 1]}
                    disableDragging={b.locked || editingId === b.id}
                    enableResizing={!b.locked && editingId !== b.id}
                    style={{
                      zIndex: b.zIndex,
                    }}
                    onDragStart={() => {
                      setSelectedId(b.id);
                      setEditingId(null);
                    }}
                    onDragStop={(event, data) =>
                      updateBlock(b.id, {
                        x: data.x,
                        y: data.y,
                      })
                    }
                    onResizeStop={(event, direction, element, delta, position) =>
                      updateBlock(b.id, {
                        width: Number.parseInt(element.style.width, 10),
                        height: Number.parseInt(element.style.height, 10),
                        x: position.x,
                        y: position.y,
                      })
                    }
                  >
                    <div
                      className={`cs-block cs-block-${b.type} ${
                        selectedId === b.id ? "cs-block-selected" : ""
                      } ${b.locked ? "cs-block-locked" : ""}`}
                      onMouseDown={(event) => {
                        setSelectedId(b.id);

                        if (event.target.closest(".cs-block-drag-handle")) {
                          return;
                        }

                        event.stopPropagation();
                      }}
                      onDoubleClick={(event) => {
                        event.stopPropagation();

                        if (
                          !b.locked &&
                          (b.type === "text" || b.type === "sticky")
                        ) {
                          setSelectedId(b.id);
                          setEditingId(b.id);
                        }
                      }}
                      style={b.style}
                    >
                      {selectedId === b.id && !exporting && (
                        <div
                          className="cs-block-controls"
                          onMouseDown={(event) => {
                            if (event.target.closest(".cs-block-drag-handle")) {
                              return;
                            }

                            event.stopPropagation();
                          }}
                        >
                          <button
                            type="button"
                            className="cs-block-drag-handle"
                            title="Drag block"
                            aria-label="Drag block"
                          >
                            <Icon name="gripVertical" size={13} />
                          </button>

                          {(b.type === "text" || b.type === "sticky") && (
                            <button
                              type="button"
                              title="Edit text (Enter)"
                              aria-label="Edit text"
                              onClick={() => setEditingId(b.id)}
                            >
                              <Icon name="edit" size={13} />
                            </button>
                          )}

                          <button
                            type="button"
                            title="Duplicate block (Ctrl+D)"
                            aria-label="Duplicate block"
                            onClick={() => duplicateBlock(b.id)}
                          >
                            <Icon name="copy" size={13} />
                          </button>

                          <button
                            type="button"
                            title={b.locked ? "Unlock block" : "Lock block"}
                            aria-label={b.locked ? "Unlock block" : "Lock block"}
                            onClick={() =>
                              updateBlock(b.id, {
                                locked: !b.locked,
                              })
                            }
                          >
                            <Icon name={b.locked ? "unlock" : "lock"} size={13} />
                          </button>

                          <button
                            type="button"
                            className="cs-block-delete"
                            title="Delete block (Del)"
                            aria-label="Delete block"
                            onClick={() => deleteBlock(b.id)}
                          >
                            <Icon name="trash" size={13} />
                          </button>
                        </div>
                      )}

                      {b.locked && !exporting && (
                        <span className="csb-lock-indicator" aria-hidden="true">
                          <Icon name="lock" size={11} />
                        </span>
                      )}

                      {(b.type === "text" || b.type === "sticky") && (
                        <div
                          ref={(el) => {
                            editableRefs.current[b.id] = el;
                          }}
                          className={`cs-editable ${
                            editingId === b.id ? "cs-editable-active" : ""
                          }`}
                          contentEditable={editingId === b.id}
                          suppressContentEditableWarning
                          onMouseDown={(event) => {
                            if (editingId === b.id) {
                              event.stopPropagation();
                            }
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Escape" && editingId === b.id) {
                              event.preventDefault();
                              event.stopPropagation();
                              finishEditing(b.id);
                            }
                          }}
                          onBlur={(event) => {
                            if (editingId !== b.id) return;

                            const nextFocus = event.relatedTarget;

                            const movedIntoToolbar =
                              nextFocus instanceof Element &&
                              Boolean(
                                nextFocus.closest('[data-text-toolbar="true"]')
                              );

                            if (
                              textToolbarInteractingRef.current ||
                              movedIntoToolbar
                            ) {
                              return;
                            }
                            

                            updateBlock(b.id, {
                              content: event.currentTarget.innerHTML,
                            });

                            setEditingId(null);
                          }}
                          dangerouslySetInnerHTML={{ __html: b.content }}
                        />
                      )}

                      {b.type === "shape" && <ShapeSvg shapeType={b.shapeType} style={b.style} />}

                      {b.type === "image" &&
                        (b.content ? (
                          <img
                            src={b.content}
                            alt=""
                            className="cs-block-image"
                            draggable={false}
                            style={{ opacity: b.style?.opacity ?? 1 }}
                          />
                        ) : (
                          <label className="cs-image-placeholder">
                            Click to upload
                            <input
                              type="file"
                              accept="image/*"
                              hidden
                              onChange={(e) => e.target.files[0] && handleImageUpload(b.id, e.target.files[0])}
                            />
                          </label>
                        ))}

                      {b.type === "table" && (
                        <table className="cs-table">
                          <tbody>
                            {b.data.map((row, r) => (
                              <tr key={r}>
                                {row.map((cell, c) => (
                                  <td
                                    key={c}
                                    contentEditable
                                    suppressContentEditableWarning
                                    onBlur={(e) => updateTableCell(b.id, r, c, e.target.innerText)}
                                  >
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}

                      {b.type === "code" && (
                        <textarea
                          className="cs-code"
                          value={b.content}
                          onChange={(e) => updateBlock(b.id, { content: e.target.value }, false)}
                          onBlur={() => pushHistory()}
                          spellCheck={false}
                        />
                      )}

                      {editingId === b.id && (
                        <TextToolbar 
                          onCommand={execCommand}
                          onInteractionStart={() => {
                            textToolbarInteractingRef.current = true;
                          }}
                          onInteractionEnd={() => {
                            window.setTimeout(() => {
                              textToolbarInteractingRef.current = false;
                            }, 0);
                          }}
                        />
                      )}
                    </div>
                  </Rnd>
                ))}
            </div>
          </div>
        </div>

        {/* ---------- Right properties panel ---------- */}
        <PropertiesPanel
          open={propsOpen}
          onClose={() => setPropsOpen(false)}
          block={selectedBlock}
          page={pages[pageIndex]}
          pageIndex={pageIndex}
          showGrid={showGrid}
          onToggleGrid={() => setShowGrid((v) => !v)}
          showMargins={showMargins}
          onToggleMargins={() => setShowMargins((v) => !v)}
          snap={snap}
          onToggleSnap={() => setSnap((v) => !v)}
          onUpdateBlock={(patch) => selectedBlock && updateBlock(selectedBlock.id, patch)}
          onAlign={(edge) => selectedBlock && alignBlock(selectedBlock.id, edge)}
          onCenterOnPage={() => selectedBlock && centerBlockOnPage(selectedBlock.id)}
          onMoveInsideBounds={() => selectedBlock && moveBlockInsideBounds(selectedBlock.id)}
          onDuplicate={() => selectedBlock && duplicateBlock(selectedBlock.id)}
          onDelete={() => selectedBlock && deleteBlock(selectedBlock.id)}
          onToggleLock={() =>
            selectedBlock &&
            updateBlock(selectedBlock.id, { locked: !selectedBlock.locked })
          }
          onReorder={(dir) => selectedBlock && reorder(selectedBlock.id, dir)}
          onTableAddRow={() => selectedBlock && addTableRow(selectedBlock.id)}
          onTableAddCol={() => selectedBlock && addTableCol(selectedBlock.id)}
        />
      </div>

      {/* ---------- Page strip ---------- */}
      <PageStrip
        pages={pages}
        pageIndex={pageIndex}
        pageWidth={A4_WIDTH}
        pageHeight={A4_HEIGHT}
        onSelect={(i) => {
          setPageIndex(i);
          setSelectedId(null);
          setEditingId(null);
        }}
        onAdd={addPage}
        onDuplicate={() => duplicatePage()}
        onMove={movePage}
        onRequestDelete={(i) => setPendingDeletePage(i)}
      />

      <TemplatePicker
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        availability={templateAvailability}
        hasBlocks={blocks.length > 0}
        onApply={applyTemplate}
      />

      <ShortcutsDialog
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />

      <ConfirmDialog
        open={pendingDeletePage !== null}
        title="Delete this page?"
        message={`Page ${(pendingDeletePage ?? 0) + 1} and every block on it will be removed from the cheat sheet.`}
        confirmLabel="Delete page"
        onConfirm={() => {
          deletePage(pendingDeletePage);
          setPendingDeletePage(null);
        }}
        onCancel={() => setPendingDeletePage(null)}
      />
    </div>
  );
});

export default CheatSheetEditor;
