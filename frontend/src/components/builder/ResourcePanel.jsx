import { useMemo, useState } from "react";
import Icon from "../ui/Icon";
import { MarkdownContent } from "../ui/Markdown";
import { splitMarkdownSections } from "./markdownUtils";

const ELEMENT_ITEMS = [
  {
    id: "heading",
    name: "Heading",
    icon: "type",
    desc: "Large section title",
  },
  {
    id: "text",
    name: "Body text",
    icon: "fileText",
    desc: "Editable paragraph block",
  },
  {
    id: "callout",
    name: "Callout",
    icon: "info",
    desc: "Highlighted tip or warning",
  },
  {
    id: "checklist",
    name: "Checklist",
    icon: "checkCircle",
    desc: "Tick-off revision list",
  },
  {
    id: "divider",
    name: "Divider",
    icon: "minus",
    desc: "Horizontal separator line",
  },
  {
    id: "code",
    name: "Code block",
    icon: "scan",
    desc: "Monospace code or formulas",
  },
  {
    id: "table",
    name: "Table",
    icon: "grid",
    desc: "Simple editable table",
  },
  {
    id: "rectangle",
    name: "Rectangle",
    icon: "layout",
    desc: "Container or box shape",
  },
  {
    id: "circle",
    name: "Circle",
    icon: "crosshair",
    desc: "Ellipse shape",
  },
  {
    id: "arrow",
    name: "Arrow",
    icon: "arrowRight",
    desc: "Directional connector",
  },
];

function sectionTitle(section) {
  const firstLine = section.split("\n")[0] || "";
  return (
    firstLine.replace(/^#{1,6}\s+/, "").replace(/^[-*]\s+/, "").slice(0, 60) ||
    "Section"
  );
}

function MarkdownSourceGroup({ label, content, emptyMessage, search, onAddSection, onAddAll }) {
  const [open, setOpen] = useState(true);

  const sections = useMemo(() => splitMarkdownSections(content), [content]);
  const query = search.trim().toLowerCase();
  const visible = query
    ? sections
        .map((section, index) => ({ section, index }))
        .filter(({ section }) => section.toLowerCase().includes(query))
    : sections.map((section, index) => ({ section, index }));

  return (
    <section className="csb-library-group">
      <button
        type="button"
        className="csb-library-group-header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Icon name={open ? "chevronDown" : "chevronRight"} size={14} />
        <span>{label}</span>
        <span className="csb-library-count">{sections.length}</span>
      </button>

      {open && (
        <div className="csb-library-group-body">
          {sections.length === 0 ? (
            <p className="csb-library-empty">{emptyMessage}</p>
          ) : (
            <>
              <button
                type="button"
                className="csb-add-all"
                onClick={() => onAddAll(content)}
              >
                <Icon name="sparkles" size={13} />
                Add all sections
              </button>

              {visible.length === 0 && (
                <p className="csb-library-empty">No sections match your search.</p>
              )}

              {visible.map(({ section, index }) => (
                <article key={`${index}-${section.slice(0, 24)}`} className="csb-resource-card">
                  <div className="csb-resource-card-head">
                    <span className="csb-resource-card-title">
                      {sectionTitle(section)}
                    </span>
                    <button
                      type="button"
                      className="csb-resource-add"
                      onClick={() => onAddSection(section, index)}
                      aria-label={`Add "${sectionTitle(section)}" to canvas`}
                      title="Add to canvas"
                    >
                      <Icon name="plus" size={14} />
                    </button>
                  </div>

                  <div className="csb-resource-preview">
                    <MarkdownContent content={section} />
                  </div>
                </article>
              ))}
            </>
          )}
        </div>
      )}
    </section>
  );
}

export default function ResourcePanel({
  open,
  onClose,
  resources,
  onAddSection,
  onAddAll,
  onAddFlashcard,
  onAddVisual,
  onAddElement,
  onAddImageFile,
}) {
  const [tab, setTab] = useState("generated");
  const [search, setSearch] = useState("");
  const [flashcardsOpen, setFlashcardsOpen] = useState(true);
  const [visualsOpen, setVisualsOpen] = useState(true);

  const { keyPoints, summary, notes, flashcards, visuals } = resources;

  const query = search.trim().toLowerCase();
  const visibleFlashcards = query
    ? flashcards
        .map((card, index) => ({ card, index }))
        .filter(({ card }) =>
          `${card.question} ${card.answer}`.toLowerCase().includes(query)
        )
    : flashcards.map((card, index) => ({ card, index }));

  const visibleElements = query
    ? ELEMENT_ITEMS.filter((item) =>
        `${item.name} ${item.desc}`.toLowerCase().includes(query)
      )
    : ELEMENT_ITEMS;

  return (
    <aside className={`csb-panel csb-library ${open ? "open" : ""}`} aria-label="Content library">
      <div className="csb-panel-header">
        <div className="csb-panel-tabs" role="tablist" aria-label="Library categories">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "generated"}
            className={`csb-panel-tab ${tab === "generated" ? "active" : ""}`}
            onClick={() => setTab("generated")}
          >
            Generated
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "elements"}
            className={`csb-panel-tab ${tab === "elements" ? "active" : ""}`}
            onClick={() => setTab("elements")}
          >
            Elements
          </button>
        </div>

        <button
          type="button"
          className="btn btn-icon csb-panel-close"
          onClick={onClose}
          aria-label="Close content library"
        >
          <Icon name="x" size={15} />
        </button>
      </div>

      <div className="csb-panel-search">
        <Icon name="search" size={14} />
        <input
          type="search"
          placeholder={tab === "generated" ? "Search resources…" : "Search elements…"}
          aria-label="Search library"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="csb-panel-scroll">
        {tab === "generated" && (
          <>
            <MarkdownSourceGroup
              label="Key Points"
              content={keyPoints}
              emptyMessage="Generate key points to add them here."
              search={search}
              onAddSection={onAddSection}
              onAddAll={onAddAll}
            />

            <MarkdownSourceGroup
              label="Summary"
              content={summary}
              emptyMessage="Generate a summary to add it here."
              search={search}
              onAddSection={onAddSection}
              onAddAll={onAddAll}
            />

            <section className="csb-library-group">
              <button
                type="button"
                className="csb-library-group-header"
                onClick={() => setFlashcardsOpen((v) => !v)}
                aria-expanded={flashcardsOpen}
              >
                <Icon name={flashcardsOpen ? "chevronDown" : "chevronRight"} size={14} />
                <span>Flashcards</span>
                <span className="csb-library-count">{flashcards.length}</span>
              </button>

              {flashcardsOpen && (
                <div className="csb-library-group-body">
                  {flashcards.length === 0 ? (
                    <p className="csb-library-empty">
                      Generate flashcards to add them here.
                    </p>
                  ) : visibleFlashcards.length === 0 ? (
                    <p className="csb-library-empty">No flashcards match your search.</p>
                  ) : (
                    visibleFlashcards.map(({ card, index }) => (
                      <article key={`${card.question}-${index}`} className="csb-resource-card">
                        <div className="csb-resource-card-head">
                          <span className="csb-resource-card-title">
                            Flashcard {index + 1}
                          </span>
                          <button
                            type="button"
                            className="csb-resource-add"
                            onClick={() => onAddFlashcard(card, index)}
                            aria-label={`Add flashcard ${index + 1} to canvas`}
                            title="Add to canvas"
                          >
                            <Icon name="plus" size={14} />
                          </button>
                        </div>
                        <p className="csb-flashcard-q">{card.question}</p>
                        <p className="csb-flashcard-a">{card.answer}</p>
                      </article>
                    ))
                  )}
                </div>
              )}
            </section>

            <section className="csb-library-group">
              <button
                type="button"
                className="csb-library-group-header"
                onClick={() => setVisualsOpen((v) => !v)}
                aria-expanded={visualsOpen}
              >
                <Icon name={visualsOpen ? "chevronDown" : "chevronRight"} size={14} />
                <span>Lecture Visuals</span>
                <span className="csb-library-count">{visuals.length}</span>
              </button>

              {visualsOpen && (
                <div className="csb-library-group-body">
                  {visuals.length === 0 ? (
                    <p className="csb-library-empty">
                      Upload a PDF to collect lecture visuals here.
                    </p>
                  ) : (
                    visuals.map((page, index) => (
                      <article key={page.pageNumber} className="csb-resource-card">
                        <div className="csb-resource-card-head">
                          <span className="csb-resource-card-title">
                            Page {page.pageNumber}
                          </span>
                          <button
                            type="button"
                            className="csb-resource-add"
                            onClick={() => onAddVisual(page, index)}
                            aria-label={`Add lecture page ${page.pageNumber} to canvas`}
                            title="Add to canvas"
                          >
                            <Icon name="plus" size={14} />
                          </button>
                        </div>
                        <img
                          className="csb-visual-thumb"
                          src={page.imageUrl}
                          alt={`Lecture page ${page.pageNumber}`}
                          loading="lazy"
                        />
                      </article>
                    ))
                  )}
                </div>
              )}
            </section>

            <MarkdownSourceGroup
              label="Original Notes"
              content={notes}
              emptyMessage="No original notes are available."
              search={search}
              onAddSection={onAddSection}
              onAddAll={onAddAll}
            />
          </>
        )}

        {tab === "elements" && (
          <div className="csb-elements-grid">
            {visibleElements.map((item) => (
              <button
                key={item.id}
                type="button"
                className="csb-element-card"
                onClick={() => onAddElement(item.id)}
                title={item.desc}
              >
                <span className="csb-element-icon">
                  <Icon name={item.icon} size={16} />
                </span>
                <span className="csb-element-name">{item.name}</span>
                <span className="csb-element-desc">{item.desc}</span>
              </button>
            ))}

            <label className="csb-element-card" title="Upload an image from your device">
              <span className="csb-element-icon">
                <Icon name="image" size={16} />
              </span>
              <span className="csb-element-name">Image</span>
              <span className="csb-element-desc">Upload from your device</span>
              <input
                type="file"
                accept="image/*"
                className="visually-hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) onAddImageFile(file);
                }}
              />
            </label>
          </div>
        )}
      </div>
    </aside>
  );
}
