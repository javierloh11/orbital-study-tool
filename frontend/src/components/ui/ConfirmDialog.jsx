import { useEffect, useRef } from "react";

/**
 * Confirmation dialog for destructive actions.
 *
 * Props:
 *  - open, title, message
 *  - confirmLabel (default "Delete"), cancelLabel (default "Cancel")
 *  - danger (default true) — styles the confirm button
 *  - onConfirm, onCancel
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  danger = true,
  onConfirm,
  onCancel,
}) {
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    cancelRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        onCancel?.();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel?.();
        }
      }}
    >
      <div className="modal" role="alertdialog" aria-modal="true" aria-label={title}>
        <h3 className="modal-title">{title}</h3>
        <p className="modal-body">{message}</p>

        <div className="modal-actions">
          <button
            type="button"
            ref={cancelRef}
            className="btn btn-secondary"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>

          <button
            type="button"
            className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
