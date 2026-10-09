// Search instead of lists (design/02-model/views-and-design-artifacts.md §13): a box that finds an element or a
// diagram of the repository as the name is typed, for every pick that would otherwise list the whole repository.
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { search, type Found, type SearchScope } from "../search";
import { notationFor } from "../notation";
import { KIND_GLYPH } from "../views";
import { useModel } from "../state/workbench";
import { Glyph } from "./Glyph";

/**
 * Type part of a name; arrow keys move between matches, Enter or a click picks one, Escape cancels. Neighbours of
 * `scope.nearFolderId` are offered before anything is typed.
 */
export function SearchPicker(props: {
  label: string;
  /** For a `<label htmlFor>` outside. */
  id?: string;
  scope: SearchScope;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  onPick(found: Found): void;
  onCancel?(): void;
}) {
  const { label, id, scope, placeholder = "Search by name…", autoFocus, className, onPick, onCancel } = props;
  const { state, metamodel } = useModel();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const found = useMemo(() => search(state, metamodel, query, scope), [state, metamodel, query, scope]);
  const open = focused && (found.length > 0 || query.trim() !== "");
  // Fixed to the viewport so a scrolling panel cannot cut the list off; it opens upwards when there is no room below.
  const [place, setPlace] = useState<CSSProperties>({});
  useLayoutEffect(() => {
    const box = input.current?.getBoundingClientRect();
    if (!open || !box) return;
    const below = window.innerHeight - box.bottom > 330;
    setPlace({
      left: box.left,
      minWidth: Math.max(box.width, 320),
      ...(below ? { top: box.bottom + 2 } : { bottom: window.innerHeight - box.top + 2 }),
    });
  }, [open, query]);
  const current = Math.min(active, Math.max(found.length - 1, 0));
  const take = (f: Found | undefined) => {
    if (!f) return;
    setQuery("");
    setActive(0);
    onPick(f);
  };
  const listId = useMemo(() => `pick-${Math.random().toString(36).slice(2, 8)}`, []);

  return (
    <div className={`find-or-create search-picker ${className ?? ""}`} onPointerDown={(e) => e.stopPropagation()}>
      <input
        ref={input}
        id={id}
        autoFocus={autoFocus}
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && found.length > 0 ? `${listId}-${current}` : undefined}
        aria-autocomplete="list"
        placeholder={placeholder}
        value={query}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if ((e.key === "ArrowDown" || e.key === "ArrowUp") && found.length > 0) {
            e.preventDefault();
            setActive((current + (e.key === "ArrowDown" ? 1 : found.length - 1)) % found.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            take(found[current]);
          } else if (e.key === "Escape") onCancel?.();
        }}
      />
      {open && (
        <div
          className="foc-list"
          style={place}
          id={listId}
          role="listbox"
          aria-label={`Matches for ${label.toLowerCase()}`}
          onMouseDown={(e) => e.preventDefault()}
        >
          {!query.trim() && <div className="foc-heading">Nearby</div>}
          {found.map((f, i) => (
            <div
              key={f.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === current}
              className={i === current ? "active" : ""}
              onClick={() => take(f)}
            >
              {f.kind === "object" ? (
                <Glyph
                  glyph={notationFor(metamodel.objectType(f.object.type)).glyph}
                  colour={notationFor(metamodel.objectType(f.object.type)).ink}
                />
              ) : (
                <span aria-hidden>
                  {KIND_GLYPH[metamodel.diagramType(f.diagram.diagramType)?.definition.kind ?? "canvas"]}
                </span>
              )}
              <span className="foc-name">{f.name}</span>
              <span className="muted foc-where">
                {f.what}
                {f.where && ` · ${f.where}`}
              </span>
            </div>
          ))}
          {found.length === 0 && <div className="foc-heading">Nothing matches “{query.trim()}”</div>}
        </div>
      )}
    </div>
  );
}

/**
 * One element or diagram chosen by search, in place of a select of the whole repository: the choice shows by name
 * with × to clear it, and the search box comes back.
 */
export function PickField(props: {
  label: string;
  id?: string;
  value: string;
  scope: SearchScope;
  placeholder?: string;
  onChange(id: string): void;
}) {
  const { label, id, value, scope, placeholder, onChange } = props;
  const { state, metamodel } = useModel();
  const object = value ? state.objects.get(value) : undefined;
  const diagram = value && !object ? state.diagrams.get(value) : undefined;
  const name = object?.name ?? diagram?.name;
  if (!value || !name)
    return (
      <SearchPicker label={label} id={id} scope={scope} placeholder={placeholder} onPick={(f) => onChange(f.id)} />
    );
  const what = object
    ? (metamodel.objectType(object.type)?.definition.name ?? object.type)
    : (metamodel.diagramType(diagram!.diagramType)?.definition.name ?? diagram!.diagramType);
  return (
    <span className="picked" id={id} role="group" aria-label={label}>
      <span className="picked-name">{name}</span>
      <span className="muted small"> {what}</span>
      <button type="button" className="link" aria-label={`Clear ${label.toLowerCase()}`} onClick={() => onChange("")}>
        ×
      </button>
    </span>
  );
}
