// Menus (design/04-ux/workbench.md, "Menus"): one component behind the explorer's right-click menu and the top
// bar's menu bar. Keyboard: arrows move, → opens a submenu and ← closes it, Enter or Space runs, Esc closes.
// A disabled item says why in its tooltip.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { clampMenu } from "../explorer";

export interface MenuItem {
  label: string;
  /** Shown on the right, e.g. "F2". The key itself is handled where the selection lives. */
  shortcut?: string;
  /** Why the item cannot run now; the item is shown greyed out with this as its tooltip. */
  disabled?: string | null;
  danger?: boolean;
  run?(): void;
  submenu?: MenuEntry[];
}
export type MenuEntry = MenuItem | "separator";

/** A list of items with roving focus. `onClose` closes the whole menu (after running an item, or on Esc). */
export function MenuList(props: {
  entries: MenuEntry[];
  label: string;
  onClose(): void;
  /** Called on ← (and on Esc in a submenu): the parent takes focus back. */
  onBack?(): void;
  /** Called on → and ← in a menu bar's dropdown that has no submenu to open or close. */
  onSideways?(direction: 1 | -1): void;
  autoFocus?: boolean;
}) {
  const { entries, label, onClose, onBack, onSideways, autoFocus = true } = props;
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState<number | null>(null);

  const items = () => [...(list.current?.querySelectorAll<HTMLElement>(":scope > li > [role=menuitem]") ?? [])];
  useEffect(() => {
    if (!autoFocus) return;
    const first = items().find((el) => el.getAttribute("aria-disabled") !== "true");
    first?.focus();
  }, [autoFocus]);

  const activate = (entry: MenuItem, index: number) => {
    if (entry.disabled) return;
    if (entry.submenu) return setOpen(index);
    onClose();
    entry.run?.();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const all = items();
    const current = all.indexOf(document.activeElement as HTMLElement);
    const move = (step: number) => {
      for (let i = 1; i <= all.length; i++) {
        const next = all[(current + step * i + all.length * i) % all.length]!;
        if (next.getAttribute("aria-disabled") !== "true") return next.focus();
      }
    };
    const entry = entries.filter((x): x is MenuItem => x !== "separator")[current];
    switch (e.key) {
      case "ArrowDown":
        move(1);
        break;
      case "ArrowUp":
        move(-1);
        break;
      case "ArrowRight":
        if (entry?.submenu && !entry.disabled) setOpen(current);
        else onSideways?.(1);
        break;
      case "ArrowLeft":
        if (onBack) onBack();
        else onSideways?.(-1);
        break;
      case "Escape":
        if (onBack) onBack();
        else onClose();
        break;
      case "Tab":
        onClose();
        return;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  let index = -1;
  return (
    <ul className="menu" role="menu" aria-label={label} ref={list} onKeyDown={onKeyDown}>
      {entries.map((entry, i) => {
        if (entry === "separator") return <li key={`s${i}`} role="separator" className="separator" />;
        const mine = ++index;
        return (
          <li key={entry.label} className="menu-entry" onMouseEnter={() => setOpen(entry.submenu ? mine : null)}>
            <div
              role="menuitem"
              tabIndex={-1}
              aria-disabled={entry.disabled ? true : undefined}
              aria-haspopup={entry.submenu ? "menu" : undefined}
              aria-keyshortcuts={entry.shortcut}
              aria-expanded={entry.submenu ? open === mine : undefined}
              title={entry.disabled ?? undefined}
              className={`menu-item${entry.danger ? " danger" : ""}`}
              onClick={() => activate(entry, mine)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  activate(entry, mine);
                }
              }}
            >
              <span className="menu-label">{entry.label}</span>
              {entry.shortcut && (
                <span className="menu-shortcut" aria-hidden>
                  {entry.shortcut}
                </span>
              )}
              {entry.submenu && (
                <span className="menu-arrow" aria-hidden>
                  ▸
                </span>
              )}
            </div>
            {entry.submenu && open === mine && (
              <div className="submenu">
                <MenuList
                  entries={entry.submenu}
                  label={entry.label}
                  onClose={onClose}
                  onBack={() => {
                    setOpen(null);
                    items()[mine]?.focus();
                  }}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Closes on a pointer press outside `ref`, and on window blur or resize. */
function useDismiss(ref: RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
    };
  }, [ref, onClose]);
}

/** A right-click menu at a point, kept inside the window. Focus returns to where it was when it closes. */
export function ContextMenu(props: { x: number; y: number; label: string; entries: MenuEntry[]; onClose(): void }) {
  const { x, y, label, entries, onClose } = props;
  const box = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState({ x, y });
  const returnFocus = useRef(document.activeElement as HTMLElement | null);
  const close = useRef(() => {
    onClose();
    returnFocus.current?.focus();
  }).current;
  useLayoutEffect(() => {
    const rect = box.current!.getBoundingClientRect();
    setAt(clampMenu(x, y, rect, { width: window.innerWidth, height: window.innerHeight }));
  }, [x, y]);
  useDismiss(box, close);
  return (
    <div className="context-menu" ref={box} style={{ left: at.x, top: at.y }} onContextMenu={(e) => e.preventDefault()}>
      <MenuList entries={entries} label={label} onClose={close} />
    </div>
  );
}

/** A menu bar: click (or Enter / ↓) opens a menu; while one is open, hovering or ←/→ switches menus. */
export function MenuBar({ menus }: { menus: { label: string; entries: () => MenuEntry[] }[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const close = useRef(() => setOpen(null)).current;
  useDismiss(bar, close);
  const sideways = (from: number, direction: 1 | -1) => {
    const next = (from + direction + menus.length) % menus.length;
    setOpen(next);
    buttons.current[next]?.focus();
  };
  return (
    <div className="menubar" role="menubar" aria-label="Menu bar" ref={bar}>
      {menus.map((m, i) => (
        <div key={m.label} className="menubar-entry">
          <button
            ref={(el) => {
              buttons.current[i] = el;
            }}
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={open === i}
            className={open === i ? "open" : undefined}
            onClick={() => setOpen(open === i ? null : i)}
            onMouseEnter={() => open !== null && setOpen(i)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setOpen(i);
              } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                sideways(i, e.key === "ArrowRight" ? 1 : -1);
              }
            }}
          >
            {m.label}
          </button>
          {open === i && (
            <div className="dropdown">
              <MenuList
                entries={m.entries()}
                label={m.label}
                onClose={() => {
                  setOpen(null);
                  buttons.current[i]?.focus();
                }}
                onSideways={(d) => sideways(i, d)}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
