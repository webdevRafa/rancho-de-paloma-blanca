import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Scrolls the window to the top whenever the route changes.
 * - Uses 'auto' for instant snap or 'smooth' for animated scroll.
 * - If there’s a hash (#id), it tries to scroll that element into view.
 */
export default function ScrollToTop({ behavior = "auto" as ScrollBehavior }) {
  const { pathname, search, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      // If navigating to an anchor like /refunds#policy
      const el = document.querySelector(hash);
      if (el instanceof HTMLElement) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
    // Default: go to page top
    window.scrollTo({ top: 0, left: 0, behavior });
  }, [pathname, search, hash, behavior]);

  return null;
}
