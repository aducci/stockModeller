import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { ObjectRow } from "@connectome/engine";
import type { Id, TypeKey } from "@connectome/model";
import { findOrCreateOptions } from "../find-or-create";
import { notationFor } from "../notation";
import { useModel } from "../state/workbench";
import { folderPath } from "../text";
import { Glyph } from "./Glyph";

/**
 * A name box for a new object that first offers the objects it may already be. Enter (or leaving the box) takes
 * the highlighted option: an exact match of the same type is highlighted by default, so retyping an existing
 * name reuses that object instead of making a copy. Arrow keys move between options; Escape cancels.
 */
export function FindOrCreate(props: {
  type: TypeKey;
  /** Where the new object would go, for folder-scoped name uniqueness. */
  folderId: Id | null;
  label: string;
  className?: string;
  style?: CSSProperties;
  /** Whether leaving the box takes the highlighted option (the canvas name box) or leaves it open (a form). */
  commitOnBlur?: boolean;
  onPick(object: ObjectRow): void;
  /** Returns false when the create was refused, to keep the box open for a correction. */
  onCreate(name: string): boolean;
  onDone(): void;
}) {
  const { type, folderId, label, className, style, commitOnBlur = false, onPick, onCreate, onDone } = props;
  const { state, metamodel } = useModel();
  const [name, setName] = useState("");
  const [active, setActive] = useState<number | null>(null);
  const done = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  // The list is fixed to the viewport so a scrolling or clipping parent (the canvas) cannot cut it off, and opens
  // upwards when there is no room below.
  const [place, setPlace] = useState<CSSProperties>({});
  const open = name.trim() !== "";
  useLayoutEffect(() => {
    const box = input.current?.getBoundingClientRect();
    if (!open || !box) return;
    const below = window.innerHeight - box.bottom > 330;
    setPlace({
      left: box.left,
      minWidth: Math.max(box.width, 320),
      ...(below ? { top: box.bottom + 2 } : { bottom: window.innerHeight - box.top + 2 }),
    });
  }, [open, name]);
  const options = useMemo(
    () => findOrCreateOptions(state, metamodel, name, type, folderId),
    [state, metamodel, name, type, folderId],
  );
  const { matches, refused } = options;
  const count = matches.length + 1;
  const current = active ?? options.defaultIndex;
  const typeName = metamodel.objectType(type)?.definition.name ?? type;

  const take = (index: number, keepIfRefused: boolean) => {
    if (done.current) return;
    const trimmed = name.trim();
    const match = matches[index];
    if (match) onPick(match.object);
    else if (!trimmed) {
      /* nothing typed: nothing to create */
    } else if (refused || !onCreate(trimmed)) {
      if (keepIfRefused) return;
    }
    done.current = true;
    onDone();
  };
  const cancel = () => {
    if (done.current) return;
    done.current = true;
    onDone();
  };

  const listId = `foc-${type}`;
  return (
    <div className={`find-or-create ${className ?? ""}`} style={style} onPointerDown={(e) => e.stopPropagation()}>
      <input
        ref={input}
        autoFocus
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={name.trim() ? `${listId}-${current}` : undefined}
        aria-autocomplete="list"
        placeholder="Name"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setActive(null);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setActive((current + (e.key === "ArrowDown" ? 1 : count - 1)) % count);
          } else if (e.key === "Enter") {
            e.preventDefault();
            take(current, true);
          } else if (e.key === "Escape") cancel();
        }}
        onBlur={() => commitOnBlur && take(current, false)}
      />
      {open && (
        <div
          className="foc-list"
          style={place}
          id={listId}
          role="listbox"
          aria-label="Existing or new"
          onMouseDown={(e) => e.preventDefault()}
        >
          {matches.length > 0 && <div className="foc-heading">Already in the model</div>}
          {matches.map((m, i) => {
            const t = metamodel.objectType(m.object.type);
            const n = notationFor(t);
            const where = folderPath(state, m.object.folderId).join(" / ");
            return (
              <div
                key={m.object.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === current}
                className={`${i === current ? "active" : ""} kin-${m.kinship}`}
                data-object={m.object.id}
                title={m.reason}
                onClick={() => take(i, true)}
              >
                <Glyph glyph={n.glyph} colour={n.ink} />
                <span className="foc-name">{m.object.name}</span>
                <span className="muted foc-where">
                  {m.kinship === "same" ? where : `${t?.definition.name ?? m.object.type} · ${where}`}
                </span>
              </div>
            );
          })}
          <div
            id={`${listId}-${matches.length}`}
            role="option"
            aria-selected={current === matches.length}
            aria-disabled={refused !== null}
            className={`foc-create ${current === matches.length ? "active" : ""}`}
            onClick={() => !refused && take(matches.length, true)}
          >
            {refused ?? (
              <>
                ＋ Create “{name.trim()}” as a new {typeName}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
