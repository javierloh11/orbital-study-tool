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
import "./CheatSheetEditor.css";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const A4_WIDTH = 794; // px @ 96dpi
const A4_HEIGHT = 1123; // px @ 96dpi
const GRID_SIZE = 10;

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

function TextToolbar({ onCommand }) {
  const [color, setColor] = useState("#111827");

  return (
    <div className="cs-text-toolbar">
      <button onMouseDown={(e) => e.preventDefault()} onClick={() => onCommand("bold")}>
        <b>B</b>
      </button>
      <button onMouseDown={(e) => e.preventDefault()} onClick={() => onCommand("italic")}>
        <i>I</i>
      </button>
      <button onMouseDown={(e) => e.preventDefault()} onClick={() => onCommand("underline")}>
        <u>U</u>
      </button>
      <button onMouseDown={(e) => e.preventDefault()} onClick={() => onCommand("strikeThrough")}>
        <s>S</s>
      </button>

      <select
        onMouseDown={(e) => e.preventDefault()}
        onChange={(e) => onCommand("fontName", e.target.value)}
        defaultValue=""
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
        onMouseDown={(e) => e.preventDefault()}
        onChange={(e) => onCommand("fontSize", e.target.value)}
        defaultValue=""
      >
        <option value="" disabled>
          Size
        </option>
        {FONT_SIZES.map((s, i) => (
          // execCommand fontSize only accepts 1-7, map roughly
          <option key={s} value={Math.min(7, Math.ceil((i + 1) * 7 / FONT_SIZES.length))}>
            {s}px
          </option>
        ))}
      </select>

      <input
        type="color"
        title="Text color"
        value={color}
        onMouseDown={(e) => e.preventDefault()}
        onChange={(e) => {
          setColor(e.target.value);
          onCommand("foreColor", e.target.value);
        }}
      />

      {HIGHLIGHT_COLORS.map((c) => (
        <button
          key={c}
          className="cs-highlight-swatch"
          style={{ background: c }}
          title="Highlight"
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

      <button onMouseDown={(e) => e.preventDefault()} onClick={() => onCommand("insertUnorderedList")}>
        • List
      </button>
      <button onMouseDown={(e) => e.preventDefault()} onClick={() => onCommand("insertOrderedList")}>
        1. List
      </button>
      <button onMouseDown={(e) => e.preventDefault()} onClick={() => onCommand("justifyLeft")}>
        ⇤
      </button>
      <button onMouseDown={(e) => e.preventDefault()} onClick={() => onCommand("justifyCenter")}>
        ⇔
      </button>
      <button onMouseDown={(e) => e.preventDefault()} onClick={() => onCommand("justifyRight")}>
        ⇥
      </button>
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          const url = window.prompt("Link URL:");
          if (url) onCommand("createLink", url);
        }}
      >
        🔗
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

const CheatSheetEditor = forwardRef(function CheatSheetEditor(
  { initialPages, onChange, exportFileName = "cheat-sheet" },
  ref
) {
  const [pages, setPages] = useState(
    initialPages && initialPages.length ? initialPages : [blankPage()]
  );
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [snap, setSnap] = useState(true);
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [clipboard, setClipboard] = useState(null);

  const canvasRef = useRef(null);
  const editableRefs = useRef({});
  const skipNextHistory = useRef(false);

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

  /* ---------------- history ---------------- */
  const undo = () => {
    if (!history.length) return;
    const prevSnapshot = history[history.length - 1];
    setFuture((f) => [JSON.stringify(pages), ...f]);
    setHistory((h) => h.slice(0, -1));
    skipNextHistory.current = true;
    setPages(JSON.parse(prevSnapshot));
  };

  const redo = () => {
    if (!future.length) return;
    const nextSnapshot = future[0];
    setHistory((h) => [...h, JSON.stringify(pages)]);
    setFuture((f) => f.slice(1));
    skipNextHistory.current = true;
    setPages(JSON.parse(nextSnapshot));
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

  /* ---------------- pages ---------------- */

  const addPage = () => {
    setPages((prev) => [...prev, blankPage()]);
    setPageIndex(pages.length);
  };

  const duplicatePage = () => {
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
    setPages((prev) => prev.filter((_, idx) => idx !== i));
    setPageIndex((prev) => Math.max(0, prev >= i ? prev - 1 : prev));
  };

  /* ---------------- text editing ---------------- */

  const execCommand = (command, value) => {
    document.execCommand(command, false, value);
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
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        deleteBlock(selectedId);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && selectedId) {
        const b = blocks.find((x) => x.id === selectedId);
        if (b) setClipboard(b);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v" && clipboard) {
        e.preventDefault();
        duplicateBlock(clipboard.id === selectedId ? clipboard.id : clipboard.id);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, editingId, clipboard, blocks]);

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
  
  const exportAsPNG = async () => {
  if (!canvasRef.current) return;

  try {
    setSelectedId(null);
    setEditingId(null);

    await new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    });

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
  } catch (error) {
    console.error("PNG export failed:", error);
    alert(`PNG export failed: ${error.message}`);
  }
};

  const exportAsPDF = async () => {
  if (!canvasRef.current) return;

  try {
    setSelectedId(null);
    setEditingId(null);

    await new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    });

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
  } catch (error) {
    console.error("PDF export failed:", error);
    alert(`PDF export failed: ${error.message}`);
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
    setPages(
      Array.isArray(nextPages) && nextPages.length
        ? nextPages
        : [blankPage()]
    );

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
  
  const selectedBlock = blocks.find((b) => b.id === selectedId);

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  return (
    <div className="cs-root">
      {/* ---------- Top toolbar ---------- */}
      <div className="cs-toolbar">
        <div className="cs-toolbar-group">
          <button onClick={() => addBlock("text")}>+ Text</button>
          <button onClick={() => addBlock("sticky")}>+ Sticky</button>
          <button onClick={() => addBlock("shape", { shapeType: "rectangle" })}>▭</button>
          <button onClick={() => addBlock("shape", { shapeType: "circle" })}>◯</button>
          <button onClick={() => addBlock("shape", { shapeType: "line" })}>─</button>
          <button onClick={() => addBlock("shape", { shapeType: "arrow" })}>→</button>
          <label className="cs-file-btn">
            + Image
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files[0];
                if (!file) return;
                const id = addBlock("image");
                handleImageUpload(id, file);
              }}
            />
          </label>
          <button onClick={() => addBlock("table")}>+ Table</button>
          <button onClick={() => addBlock("code")}>+ Code</button>
        </div>

        <div className="cs-toolbar-group">
          <button onClick={undo} disabled={!history.length} title="Undo (Ctrl+Z)">
            ↺
          </button>
          <button onClick={redo} disabled={!future.length} title="Redo (Ctrl+Shift+Z)">
            ↻
          </button>
          <label className="cs-checkbox">
            <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />
            Snap to grid
          </label>
          <button onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))}>−</button>
          <span className="cs-zoom-label">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(2, z + 0.1))}>+</button>
        </div>

        <div className="cs-toolbar-group">
          <button onClick={exportAsPNG}>Export PNG</button>
          <button onClick={exportAsPDF}>Export PDF</button>
        </div>
      </div>

      <div className="cs-body">
        {/* ---------- Canvas ---------- */}
        <div className="cs-canvas-scroll">
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
                      }`}
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
                      {selectedId === b.id && (
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
                            ⋮⋮
                          </button>

                          {(b.type === "text" || b.type === "sticky") && (
                            <button
                              type="button"
                              title="Edit text"
                              onClick={() => setEditingId(b.id)}
                            >
                              Edit
                            </button>
                          )}

                          <button
                            type="button"
                            title="Duplicate block"
                            onClick={() => duplicateBlock(b.id)}
                          >
                            Duplicate
                          </button>

                          <button
                            type="button"
                            title={b.locked ? "Unlock block" : "Lock block"}
                            onClick={() =>
                              updateBlock(b.id, {
                                locked: !b.locked,
                              })
                            }
                          >
                            {b.locked ? "Unlock" : "Lock"}
                          </button>

                          <button
                            type="button"
                            className="cs-block-delete"
                            title="Delete block"
                            onClick={() => deleteBlock(b.id)}
                          >
                            Delete
                          </button>
                        </div>
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
  onBlur={(event) => {
    if (editingId !== b.id) return;

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
                          <img src={b.content} alt="" className="cs-block-image" draggable={false} />
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

                      {editingId === b.id && <TextToolbar onCommand={execCommand} />}
                    </div>
                  </Rnd>
                ))}
            </div>
          </div>
        </div>

        {/* ---------- Inspector sidebar ---------- */}
        <div className="cs-inspector">
          <h4>Page {pageIndex + 1}</h4>
          <div className="cs-page-tabs">
            {pages.map((p, i) => (
              <div key={p.id} className={`cs-page-tab ${i === pageIndex ? "active" : ""}`}>
                <button onClick={() => setPageIndex(i)}>{i + 1}</button>
                {pages.length > 1 && <span onClick={() => deletePage(i)}>✕</span>}
              </div>
            ))}
          </div>
          <div className="cs-inspector-row">
            <button onClick={addPage}>+ Page</button>
            <button onClick={duplicatePage}>Duplicate Page</button>
          </div>

          <hr />

          {selectedBlock ? (
            <>
              <h4>Block</h4>
              <div className="cs-inspector-row">
                <button onClick={() => duplicateBlock(selectedBlock.id)}>Duplicate</button>
                <button onClick={() => deleteBlock(selectedBlock.id)}>Delete</button>
              </div>
              <div className="cs-inspector-row">
                <button onClick={() => updateBlock(selectedBlock.id, { locked: !selectedBlock.locked })}>
                  {selectedBlock.locked ? "Unlock" : "Lock"}
                </button>
              </div>
              <div className="cs-inspector-row">
                <button onClick={() => reorder(selectedBlock.id, "front")}>To Front</button>
                <button onClick={() => reorder(selectedBlock.id, "forward")}>Forward</button>
              </div>
              <div className="cs-inspector-row">
                <button onClick={() => reorder(selectedBlock.id, "backward")}>Backward</button>
                <button onClick={() => reorder(selectedBlock.id, "back")}>To Back</button>
              </div>

              {(selectedBlock.type === "text" || selectedBlock.type === "sticky") && (
                <div className="cs-inspector-row">
                  <label>
                    Background
                    <input
                      type="color"
                      value={
                        selectedBlock.style.backgroundColor === "transparent"
                          ? "#ffffff"
                          : selectedBlock.style.backgroundColor
                      }
                      onChange={(e) =>
                        updateBlock(selectedBlock.id, {
                          style: { ...selectedBlock.style, backgroundColor: e.target.value },
                        })
                      }
                    />
                  </label>
                </div>
              )}

              {selectedBlock.type === "shape" && (
                <>
                  <div className="cs-inspector-row">
                    <label>
                      Fill
                      <input
                        type="color"
                        value={selectedBlock.style.fill}
                        onChange={(e) =>
                          updateBlock(selectedBlock.id, {
                            style: { ...selectedBlock.style, fill: e.target.value },
                          })
                        }
                      />
                    </label>
                    <label>
                      Stroke
                      <input
                        type="color"
                        value={selectedBlock.style.stroke}
                        onChange={(e) =>
                          updateBlock(selectedBlock.id, {
                            style: { ...selectedBlock.style, stroke: e.target.value },
                          })
                        }
                      />
                    </label>
                  </div>
                </>
              )}

              {selectedBlock.type === "table" && (
                <div className="cs-inspector-row">
                  <button onClick={() => addTableRow(selectedBlock.id)}>+ Row</button>
                  <button onClick={() => addTableCol(selectedBlock.id)}>+ Column</button>
                </div>
              )}
            </>
          ) : (
            <p className="cs-hint">Select a block to edit its properties.</p>
          )}
        </div>
      </div>
    </div>
  );
});

export default CheatSheetEditor;
