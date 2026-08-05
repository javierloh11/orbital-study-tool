import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import Icon from "./Icon";

const ToastContext = createContext(null);

const TOAST_ICONS = {
  success: "checkCircle",
  error: "alertCircle",
  info: "info",
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (message, variant = "info", duration = 4200) => {
      const id = ++idRef.current;
      setToasts((current) => [...current.slice(-3), { id, message, variant }]);

      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
    },
    [dismiss]
  );

  const api = useMemo(
    () => ({
      success: (message) => push(message, "success"),
      error: (message) => push(message, "error", 5500),
      info: (message) => push(message, "info"),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}

      <div className="toast-viewport" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.variant}`} role="status">
            <Icon name={TOAST_ICONS[toast.variant] || "info"} size={17} />
            <span className="toast-message">{toast.message}</span>
            <button
              type="button"
              className="toast-dismiss"
              aria-label="Dismiss notification"
              onClick={() => dismiss(toast.id)}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    // Fallback keeps callers safe if a component renders outside the provider.
    return {
      success: (message) => console.log("[toast]", message),
      error: (message) => console.error("[toast]", message),
      info: (message) => console.log("[toast]", message),
    };
  }

  return context;
}
