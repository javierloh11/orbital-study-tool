import { useState } from "react";
import Icon from "../ui/Icon";

function NumberField({ label, value, onCommit, min = 0 }) {
  return (
    <label className="csb-number-field">
      <span>{label}</span>
      <input
        type="number"
        value={Math.round(value)}
        min={min}
        onChange={(e) => {
          const next = Number.parseInt(e.target.value, 10);
          if (!Number.isNaN(next)) {
            onCommit(next);
          }
        }}
      />
    </label>
  );
}

export default function PropertiesPanel({
  open,
  onClose,
  block,
  page,
  pageIndex,
  showGrid,
  onToggleGrid,
  showMargins,
  onToggleMargins,
  snap,
  onToggleSnap,
  onUpdateBlock,
  onAlign,
  onCenterOnPage,
  onMoveInsideBounds,
  onDuplicate,
  onDelete,
  onToggleLock,
  onReorder,
  onTableAddRow,
  onTableAddCol,
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const isText = block && (block.type === "text" || block.type === "sticky");
  const isShape = block && block.type === "shape";
  const isImage = block && block.type === "image";
  const isTable = block && block.type === "table";

  return (
    <aside
      className={`csb-panel csb-properties ${open ? "open" : ""}`}
      aria-label="Properties"
    >
      <div className="csb-panel-header">
        <h4 className="csb-panel-title">
          {block ? "Block properties" : "Page settings"}
        </h4>

        <button
          type="button"
          className="btn btn-icon csb-panel-close"
          onClick={onClose}
          aria-label="Close properties"
        >
          <Icon name="x" size={15} />
        </button>
      </div>

      <div className="csb-panel-scroll">
        {!block && (
          <>
            <div className="csb-prop-section">
              <p className="csb-prop-label">Page</p>
              <p className="csb-prop-hint">
                Page {pageIndex + 1} · {page?.blocks?.length ?? 0}{" "}
                {(page?.blocks?.length ?? 0) === 1 ? "block" : "blocks"} · A4
                portrait
              </p>
            </div>

            <div className="csb-prop-section">
              <p className="csb-prop-label">Canvas guides</p>

              <label className="csb-switch-row">
                <span>Show grid</span>
                <input
                  type="checkbox"
                  checked={showGrid}
                  onChange={onToggleGrid}
                />
              </label>

              <label className="csb-switch-row">
                <span>Show margins</span>
                <input
                  type="checkbox"
                  checked={showMargins}
                  onChange={onToggleMargins}
                />
              </label>

              <label className="csb-switch-row">
                <span>Snap to grid</span>
                <input type="checkbox" checked={snap} onChange={onToggleSnap} />
              </label>

              <p className="csb-prop-hint">
                Guides are only visible while editing — they never appear in
                PNG or PDF exports.
              </p>
            </div>

            <div className="csb-prop-section">
              <p className="csb-prop-label">Tips</p>
              <p className="csb-prop-hint">
                Select a block on the page to edit its position, styling and
                layer order here. Double-click a text block to edit its
                content.
              </p>
            </div>
          </>
        )}

        {block && (
          <>
            <div className="csb-prop-section">
              <p className="csb-prop-label">Position & size</p>
              <div className="csb-number-grid">
                <NumberField
                  label="X"
                  value={block.x}
                  onCommit={(v) => onUpdateBlock({ x: v })}
                />
                <NumberField
                  label="Y"
                  value={block.y}
                  onCommit={(v) => onUpdateBlock({ y: v })}
                />
                <NumberField
                  label="W"
                  value={block.width}
                  min={40}
                  onCommit={(v) => onUpdateBlock({ width: Math.max(40, v) })}
                />
                <NumberField
                  label="H"
                  value={block.height}
                  min={30}
                  onCommit={(v) => onUpdateBlock({ height: Math.max(30, v) })}
                />
              </div>
            </div>

            <div className="csb-prop-section">
              <p className="csb-prop-label">Align to page</p>
              <div className="csb-align-grid" role="group" aria-label="Align block">
                <button type="button" className="btn btn-icon" title="Align left" aria-label="Align left" onClick={() => onAlign("left")}>
                  <Icon name="alignLeft" size={15} />
                </button>
                <button type="button" className="btn btn-icon" title="Align horizontal centre" aria-label="Align horizontal centre" onClick={() => onAlign("centerH")}>
                  <Icon name="alignCenterH" size={15} />
                </button>
                <button type="button" className="btn btn-icon" title="Align right" aria-label="Align right" onClick={() => onAlign("right")}>
                  <Icon name="alignRight" size={15} />
                </button>
                <button type="button" className="btn btn-icon" title="Align top" aria-label="Align top" onClick={() => onAlign("top")}>
                  <Icon name="alignTop" size={15} />
                </button>
                <button type="button" className="btn btn-icon" title="Align vertical middle" aria-label="Align vertical middle" onClick={() => onAlign("middle")}>
                  <Icon name="alignMiddle" size={15} />
                </button>
                <button type="button" className="btn btn-icon" title="Align bottom" aria-label="Align bottom" onClick={() => onAlign("bottom")}>
                  <Icon name="alignBottom" size={15} />
                </button>
              </div>

              <div className="csb-prop-row">
                <button type="button" className="csb-prop-btn" onClick={onCenterOnPage}>
                  <Icon name="crosshair" size={14} />
                  Centre on page
                </button>
                <button type="button" className="csb-prop-btn" onClick={onMoveInsideBounds}>
                  <Icon name="shrink" size={14} />
                  Fit in bounds
                </button>
              </div>
            </div>

            {isText && (
              <div className="csb-prop-section">
                <p className="csb-prop-label">Appearance</p>
                <label className="csb-switch-row">
                  <span>Background</span>
                  <input
                    type="color"
                    value={
                      !block.style?.backgroundColor ||
                      block.style.backgroundColor === "transparent"
                        ? "#ffffff"
                        : block.style.backgroundColor
                    }
                    onChange={(e) =>
                      onUpdateBlock({
                        style: { ...block.style, backgroundColor: e.target.value },
                      })
                    }
                  />
                </label>
                <button
                  type="button"
                  className="csb-prop-btn"
                  onClick={() =>
                    onUpdateBlock({
                      style: { ...block.style, backgroundColor: "transparent" },
                    })
                  }
                >
                  <Icon name="x" size={13} />
                  Clear background
                </button>
                <p className="csb-prop-hint">
                  Double-click the block (or press Enter) to edit its text and
                  use the formatting toolbar.
                </p>
              </div>
            )}

            {isShape && (
              <div className="csb-prop-section">
                <p className="csb-prop-label">Shape</p>
                <label className="csb-switch-row">
                  <span>Fill</span>
                  <input
                    type="color"
                    value={block.style?.fill || "#bfdbfe"}
                    onChange={(e) =>
                      onUpdateBlock({
                        style: { ...block.style, fill: e.target.value },
                      })
                    }
                  />
                </label>
                <label className="csb-switch-row">
                  <span>Stroke</span>
                  <input
                    type="color"
                    value={block.style?.stroke || "#2563eb"}
                    onChange={(e) =>
                      onUpdateBlock({
                        style: { ...block.style, stroke: e.target.value },
                      })
                    }
                  />
                </label>
              </div>
            )}

            {isImage && (
              <div className="csb-prop-section">
                <p className="csb-prop-label">Image</p>
                <label className="csb-switch-row">
                  <span>Opacity</span>
                  <input
                    type="range"
                    min="0.2"
                    max="1"
                    step="0.05"
                    value={block.style?.opacity ?? 1}
                    onChange={(e) =>
                      onUpdateBlock({
                        style: { ...block.style, opacity: Number(e.target.value) },
                      })
                    }
                  />
                </label>
              </div>
            )}

            {isTable && (
              <div className="csb-prop-section">
                <p className="csb-prop-label">Table</p>
                <div className="csb-prop-row">
                  <button type="button" className="csb-prop-btn" onClick={onTableAddRow}>
                    <Icon name="plus" size={13} />
                    Row
                  </button>
                  <button type="button" className="csb-prop-btn" onClick={onTableAddCol}>
                    <Icon name="plus" size={13} />
                    Column
                  </button>
                </div>
              </div>
            )}

            <div className="csb-prop-section">
              <p className="csb-prop-label">Arrange</p>
              <div className="csb-prop-row">
                <button type="button" className="csb-prop-btn" onClick={() => onReorder("front")}>
                  To front
                </button>
                <button type="button" className="csb-prop-btn" onClick={() => onReorder("forward")}>
                  Forward
                </button>
              </div>
              <div className="csb-prop-row">
                <button type="button" className="csb-prop-btn" onClick={() => onReorder("backward")}>
                  Backward
                </button>
                <button type="button" className="csb-prop-btn" onClick={() => onReorder("back")}>
                  To back
                </button>
              </div>
            </div>

            <div className="csb-prop-section">
              <p className="csb-prop-label">Actions</p>
              <div className="csb-prop-row">
                <button type="button" className="csb-prop-btn" onClick={onDuplicate}>
                  <Icon name="copy" size={13} />
                  Duplicate
                </button>
                <button type="button" className="csb-prop-btn" onClick={onToggleLock}>
                  <Icon name={block.locked ? "unlock" : "lock"} size={13} />
                  {block.locked ? "Unlock" : "Lock"}
                </button>
              </div>
              <button type="button" className="csb-prop-btn danger" onClick={onDelete}>
                <Icon name="trash" size={13} />
                Delete block
              </button>
            </div>

            <div className="csb-prop-section">
              <button
                type="button"
                className="csb-library-group-header"
                onClick={() => setAdvancedOpen((v) => !v)}
                aria-expanded={advancedOpen}
              >
                <Icon name={advancedOpen ? "chevronDown" : "chevronRight"} size={14} />
                <span>Advanced</span>
              </button>

              {advancedOpen && (
                <div className="csb-prop-advanced">
                  <p className="csb-prop-hint">Block type: {block.type}</p>
                  <p className="csb-prop-hint">Layer (z-index): {block.zIndex}</p>
                  <p className="csb-prop-hint">
                    Locked: {block.locked ? "yes" : "no"}
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
