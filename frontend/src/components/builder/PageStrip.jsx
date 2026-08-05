import Icon from "../ui/Icon";

const THUMB_W = 62;
const THUMB_H = 88;

function PageThumb({ page, pageWidth, pageHeight }) {
  const scaleX = THUMB_W / pageWidth;
  const scaleY = THUMB_H / pageHeight;

  return (
    <span className="csb-page-thumb" aria-hidden="true">
      {(page.blocks || []).map((block) => (
        <span
          key={block.id}
          className={`csb-page-thumb-block ${
            block.type === "image" ? "is-image" : ""
          }`}
          style={{
            left: Math.max(0, block.x * scaleX),
            top: Math.max(0, block.y * scaleY),
            width: Math.max(3, block.width * scaleX),
            height: Math.max(2, block.height * scaleY),
          }}
        />
      ))}
    </span>
  );
}

export default function PageStrip({
  pages,
  pageIndex,
  pageWidth,
  pageHeight,
  onSelect,
  onAdd,
  onDuplicate,
  onMove,
  onRequestDelete,
}) {
  return (
    <div className="csb-page-strip" aria-label="Pages">
      <div className="csb-page-strip-scroll">
        {pages.map((page, i) => (
          <div
            key={page.id}
            className={`csb-page-card ${i === pageIndex ? "active" : ""}`}
          >
            <button
              type="button"
              className="csb-page-card-main"
              onClick={() => onSelect(i)}
              aria-label={`Go to page ${i + 1}`}
              aria-current={i === pageIndex ? "page" : undefined}
            >
              <PageThumb
                page={page}
                pageWidth={pageWidth}
                pageHeight={pageHeight}
              />
              <span className="csb-page-card-number">{i + 1}</span>
            </button>

            {i === pageIndex && (
              <div className="csb-page-card-actions">
                <button
                  type="button"
                  className="csb-page-action"
                  title="Move page left"
                  aria-label="Move page left"
                  disabled={i === 0}
                  onClick={() => onMove(i, -1)}
                >
                  <Icon name="chevronLeft" size={12} />
                </button>

                <button
                  type="button"
                  className="csb-page-action"
                  title="Duplicate page"
                  aria-label="Duplicate page"
                  onClick={() => onDuplicate(i)}
                >
                  <Icon name="copy" size={12} />
                </button>

                <button
                  type="button"
                  className="csb-page-action danger"
                  title="Delete page"
                  aria-label="Delete page"
                  disabled={pages.length === 1}
                  onClick={() => onRequestDelete(i)}
                >
                  <Icon name="trash" size={12} />
                </button>

                <button
                  type="button"
                  className="csb-page-action"
                  title="Move page right"
                  aria-label="Move page right"
                  disabled={i === pages.length - 1}
                  onClick={() => onMove(i, 1)}
                >
                  <Icon name="chevronRight" size={12} />
                </button>
              </div>
            )}
          </div>
        ))}

        <button
          type="button"
          className="csb-page-add"
          onClick={onAdd}
          aria-label="Add page"
          title="Add page"
        >
          <Icon name="plus" size={16} />
          <span>Add page</span>
        </button>
      </div>
    </div>
  );
}
