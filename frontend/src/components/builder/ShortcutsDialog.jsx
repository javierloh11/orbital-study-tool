const SHORTCUTS = [
  ["Click", "Select block"],
  ["Double-click / Enter", "Edit text block"],
  ["Escape", "Exit editing, then deselect"],
  ["Delete / Backspace", "Delete selected block (not while typing)"],
  ["Arrow keys", "Nudge selected block by 1px"],
  ["Shift + Arrow keys", "Nudge selected block by 10px"],
  ["Ctrl/Cmd + D", "Duplicate selected block"],
  ["Ctrl/Cmd + C, then V", "Copy and paste selected block"],
  ["Ctrl/Cmd + Z", "Undo"],
  ["Ctrl/Cmd + Shift + Z or Y", "Redo"],
  ["Ctrl/Cmd + S", "Save note"],
];

export default function ShortcutsDialog({ open, onClose }) {
  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
      >
        <h3 className="modal-title">Keyboard shortcuts</h3>

        <table className="csb-shortcuts-table">
          <tbody>
            {SHORTCUTS.map(([keys, action]) => (
              <tr key={keys}>
                <td>
                  <kbd>{keys}</kbd>
                </td>
                <td>{action}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
