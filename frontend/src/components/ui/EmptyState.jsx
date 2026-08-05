import Icon from "./Icon";

export default function EmptyState({ icon = "sparkles", title, text, children }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <Icon name={icon} size={24} />
      </div>

      {title && <p className="empty-state-title">{title}</p>}
      {text && <p className="empty-state-text">{text}</p>}

      {children && <div className="empty-state-actions">{children}</div>}
    </div>
  );
}
