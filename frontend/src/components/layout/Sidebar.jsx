import Icon from "../ui/Icon";

export const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "upload", label: "Upload Notes", icon: "upload" },
  { id: "resources", label: "Study Resources", icon: "sparkles" },
  { id: "editor", label: "Cheat Sheet Builder", icon: "layout" },
  { id: "saved", label: "Saved Notes", icon: "folder" },
  { id: "subjectsummary", label: "Subject Summary", icon: "bookOpen" },
];

export default function Sidebar({
  activeView,
  onNavigate,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  subject,
  userEmail,
  onLogout,
}) {
  const initials = (userEmail || "?").slice(0, 1).toUpperCase();

  return (
    <>
      {mobileOpen && (
        <div
          className="sidebar-scrim"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <nav
        className={[
          "sidebar",
          collapsed ? "sidebar-collapsed" : "",
          mobileOpen ? "sidebar-mobile-open" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label="Main navigation"
      >
        <div className="sidebar-brand">
          <span className="sidebar-brand-mark">
            <Icon name="logo" size={19} strokeWidth={2.2} />
          </span>

          {!collapsed && <span className="sidebar-brand-name">Stitch.io</span>}

          <button
            type="button"
            className="btn btn-icon sidebar-collapse-btn"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <Icon name={collapsed ? "chevronRight" : "chevronLeft"} size={15} />
          </button>

          <button
            type="button"
            className="btn btn-icon sidebar-close-btn"
            onClick={onCloseMobile}
            aria-label="Close navigation"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {!collapsed && (
          <div className="sidebar-subject" title={subject || "No subject selected"}>
            <span className="sidebar-subject-label">Subject</span>
            <span className={`sidebar-subject-value ${subject ? "" : "is-empty"}`}>
              {subject || "None selected"}
            </span>
          </div>
        )}

        <ul className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`sidebar-item ${activeView === item.id ? "active" : ""}`}
                onClick={() => onNavigate(item.id)}
                aria-current={activeView === item.id ? "page" : undefined}
                title={collapsed ? item.label : undefined}
              >
                <Icon name={item.icon} size={18} />
                {!collapsed && <span>{item.label}</span>}
              </button>
            </li>
          ))}
        </ul>

        <div className="sidebar-footer">
          <div className="sidebar-user" title={userEmail}>
            <span className="sidebar-avatar" aria-hidden="true">
              {initials}
            </span>

            {!collapsed && (
              <span className="sidebar-user-email">{userEmail}</span>
            )}
          </div>

          <button
            type="button"
            className={`sidebar-item sidebar-logout ${collapsed ? "" : ""}`}
            onClick={onLogout}
            title={collapsed ? "Log out" : undefined}
          >
            <Icon name="logout" size={18} />
            {!collapsed && <span>Log out</span>}
          </button>
        </div>
      </nav>
    </>
  );
}
