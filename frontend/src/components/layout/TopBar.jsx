import { useEffect, useRef, useState } from "react";
import Icon from "../ui/Icon";
import ThemeToggle from "../ui/ThemeToggle";

export default function TopBar({
  pageTitle,
  subject,
  userEmail,
  onOpenMobileNav,
  onLogout,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;

    const onClickAway = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    window.addEventListener("mousedown", onClickAway);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("mousedown", onClickAway);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const initials = (userEmail || "?").slice(0, 1).toUpperCase();

  return (
    <header className="topbar">
      <button
        type="button"
        className="btn btn-icon topbar-menu-btn"
        onClick={onOpenMobileNav}
        aria-label="Open navigation"
      >
        <Icon name="menu" size={19} />
      </button>

      <div className="topbar-titles">
        <h1 className="topbar-title">{pageTitle}</h1>
        {subject && (
          <span className="badge badge-primary topbar-subject">{subject}</span>
        )}
      </div>

      <div className="topbar-actions">
        <ThemeToggle />

        <div className="topbar-profile" ref={menuRef}>
          <button
            type="button"
            className="topbar-avatar"
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Account menu"
          >
            {initials}
          </button>

          {menuOpen && (
            <div className="topbar-menu" role="menu">
              <p className="topbar-menu-email" title={userEmail}>
                {userEmail}
              </p>

              <button
                type="button"
                role="menuitem"
                className="topbar-menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  onLogout();
                }}
              >
                <Icon name="logout" size={15} />
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
