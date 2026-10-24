"use client";
import { useEffect } from "react";
export default function DialogAccessibility() {
  useEffect(() => {
    let dialog: HTMLElement | null = null,
      previous: HTMLElement | null = null;
    const update = () => {
      const next = document.querySelector<HTMLElement>('[role="dialog"]');
      if (next === dialog) return;
      if (next) {
        previous = document.activeElement as HTMLElement;
        dialog = next;
        document.body.style.overflow = "hidden";
        const target = next.querySelector<HTMLElement>(
          "button,input,select,textarea,a[href]",
        );
        target?.focus();
      } else {
        dialog = null;
        document.body.style.overflow = "";
        previous?.focus();
        previous = null;
      }
    };
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    const key = (e: KeyboardEvent) => {
      if (!dialog) return;
      if (e.key === "Escape") {
        const close = dialog.querySelector<HTMLButtonElement>(
          'button[aria-label^="Close"]',
        );
        if (close && !close.disabled) {
          e.preventDefault();
          close.click();
        }
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex="0"]',
        ),
      ).filter((n) => n.offsetParent !== null);
      const first = focusable[0],
        last = focusable.at(-1);
      if (
        e.shiftKey &&
        (document.activeElement === first ||
          !dialog.contains(document.activeElement))
      ) {
        e.preventDefault();
        last?.focus();
      } else if (
        !e.shiftKey &&
        (document.activeElement === last ||
          !dialog.contains(document.activeElement))
      ) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", key);
      document.body.style.overflow = "";
    };
  }, []);
  return null;
}
