import { useState } from "react";
import Icon from "../ui/Icon";

export const TEMPLATES = [
  {
    id: "one-page",
    name: "One-Page Revision Sheet",
    icon: "fileText",
    desc: "Title plus your key point sections stacked for quick reading.",
    requires: "keyPoints",
    requiresLabel: "key points",
  },
  {
    id: "two-column",
    name: "Two-Column Cheat Sheet",
    icon: "layoutRight",
    desc: "Key point sections arranged in two dense columns.",
    requires: "keyPoints",
    requiresLabel: "key points",
  },
  {
    id: "summary-sheet",
    name: "Summary Sheet",
    icon: "bookOpen",
    desc: "Title plus your generated summary sections.",
    requires: "summary",
    requiresLabel: "a summary",
  },
  {
    id: "flashcard-grid",
    name: "Flashcard Grid",
    icon: "cards",
    desc: "Up to six flashcards laid out as a self-test sheet.",
    requires: "flashcards",
    requiresLabel: "flashcards",
  },
  {
    id: "visual-overview",
    name: "Lecture Overview",
    icon: "image",
    desc: "Your selected lecture visuals arranged on one page.",
    requires: "visuals",
    requiresLabel: "lecture visuals",
  },
];

export default function TemplatePicker({
  open,
  onClose,
  availability,
  hasBlocks,
  onApply,
}) {
  const [pendingId, setPendingId] = useState(null);

  if (!open) return null;

  const apply = (id, mode) => {
    setPendingId(null);
    onApply(id, mode);
  };

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal csb-template-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Recommended layouts"
      >
        <h3 className="modal-title">Recommended layouts</h3>
        <p className="modal-body">
          Presets only use resources you have already generated — nothing is
          invented. Applying a layout can be undone with Ctrl+Z.
        </p>

        <div className="csb-template-grid">
          {TEMPLATES.map((template) => {
            const available = availability[template.requires];

            return (
              <div
                key={template.id}
                className={`csb-template-card ${available ? "" : "disabled"}`}
              >
                <span className="csb-element-icon">
                  <Icon name={template.icon} size={16} />
                </span>

                <span className="csb-element-name">{template.name}</span>
                <span className="csb-element-desc">{template.desc}</span>

                {!available ? (
                  <span className="csb-template-requires">
                    Generate {template.requiresLabel} first
                  </span>
                ) : pendingId === template.id ? (
                  <div className="csb-template-confirm">
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => apply(template.id, "replace")}
                    >
                      Replace page
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => apply(template.id, "add")}
                    >
                      Add to layout
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() =>
                      hasBlocks ? setPendingId(template.id) : apply(template.id, "replace")
                    }
                  >
                    Use layout
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
