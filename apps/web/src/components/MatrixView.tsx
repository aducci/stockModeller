// A matrix view (design/02-model/views-and-design-artifacts.md §4): objects × objects, a cell per pair showing the
// relationships between them. Clicking a cell creates or deletes a relationship; the toolbar edits the definition.
import { useEffect, useRef, useState } from "react";
import type { Metamodel, ObjectRow } from "@connectome/engine";
import { SEMANTIC_KINDS, ulid, type Id, type MatrixDefinition, type SemanticKind } from "@connectome/model";
import { matrixDefinition, projectMatrix, type CellOption } from "@connectome/views";
import { useModel, useWorkbench } from "../state/workbench";
import { notationFor } from "../notation";
import { KIND_FAMILY } from "../metamodel-admin";
import { Glyph } from "./Glyph";
import { MatrixGrid, type GridItem } from "./MatrixGrid";

type Dir = NonNullable<MatrixDefinition["relationships"]["dir"]>;
const DIRS: { value: Dir; label: string }[] = [
  { value: "rowToColumn", label: "row → column" },
  { value: "columnToRow", label: "column → row" },
  { value: "either", label: "either way" },
];

export function MatrixView({ id }: { id: Id }) {
  const { state, metamodel } = useModel();
  const edit = useWorkbench((s) => s.edit);
  const select = useWorkbench((s) => s.select);
  const diagram = state.diagrams.get(id);
  const type = diagram ? metamodel.diagramType(diagram.diagramType)?.definition : undefined;
  const definition = matrixDefinition(type, diagram?.definition);
  // The store mutates one state in place and bumps a revision, so this is recomputed on every render.
  const matrix = projectMatrix(state, metamodel, definition);
  const [open, setOpen] = useState<{ row: Id; column: Id; at: { x: number; y: number } } | null>(null);

  if (!diagram) return <div className="empty-state muted">This view was deleted.</div>;

  const define = (label: string, set: Record<string, unknown>) =>
    edit(label, [{ edit: "setViewDefinition", diagramId: diagram.id, baseVersion: diagram.version, set }]);
  const own = diagram.definition ?? {};
  const rowType = definition.rows.from.type?.[0] ?? "";
  const columnType = definition.columns.from.type?.[0] ?? "";
  const relationship = definition.relationships.types?.length
    ? `type:${definition.relationships.types[0]}`
    : definition.relationships.kinds?.length
      ? `kind:${definition.relationships.kinds[0]}`
      : "";
  const dir = definition.relationships.dir ?? "rowToColumn";

  const item = (o: ObjectRow, depth: number, group: boolean): GridItem => {
    const n = notationFor(metamodel.objectType(o.type));
    return {
      key: o.id,
      title: o.name,
      depth,
      group,
      label: (
        <span className="mm-type">
          <Glyph glyph={n.glyph} colour={n.ink} />
          {o.name}
        </span>
      ),
    };
  };
  const rows = matrix.rows.map((r) => item(r.object, r.depth, r.hasChildren));
  const columns = matrix.columns.map((c) => item(c.object, 0, false));
  const name = (oid: Id) => state.objects.get(oid)?.name ?? "?";

  const create = (option: CellOption) => {
    const verb = option.name;
    edit(`${name(option.sourceId)} ${verb} ${name(option.targetId)}`, [
      {
        edit: "createRelationship",
        id: ulid(),
        type: option.type,
        sourceId: option.sourceId,
        targetId: option.targetId,
      },
    ]);
  };

  return (
    <div className="matrix-view">
      <div className="mm-filters matrix-toolbar">
        <label>
          Rows
          <TypeSelect
            metamodel={metamodel}
            value={rowType}
            onChange={(t) =>
              define("Change matrix rows", { rows: { ...definition.rows, from: t ? { type: [t] } : {} } })
            }
          />
        </label>
        <label>
          Columns
          <TypeSelect
            metamodel={metamodel}
            value={columnType}
            onChange={(t) =>
              define("Change matrix columns", { columns: { ...definition.columns, from: t ? { type: [t] } : {} } })
            }
          />
        </label>
        <label>
          Relationships
          <select
            value={relationship}
            onChange={(e) => {
              const [by, value] = e.target.value.split(":");
              const relationships = {
                dir,
                ...(by === "type" ? { types: [value!] } : by === "kind" ? { kinds: [value as SemanticKind] } : {}),
              };
              define("Change matrix relationships", { relationships, create: by === "type" ? value! : null });
            }}
          >
            <option value="">Any relationship</option>
            <optgroup label="Types">
              {metamodel.allRelationshipTypes().map((t) => (
                <option key={t.key} value={`type:${t.key}`}>
                  {t.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Kinds">
              {SEMANTIC_KINDS.map((k) => (
                <option key={k.kind} value={`kind:${k.kind}`}>
                  any {k.kind}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <label>
          Direction
          <select
            value={dir}
            onChange={(e) =>
              define("Change matrix direction", {
                relationships: { ...definition.relationships, dir: e.target.value as Dir },
              })
            }
          >
            {DIRS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={!!definition.groupRows}
            onChange={(e) => define("Group matrix rows", { groupRows: e.target.checked })}
          />
          Group rows
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={!!definition.hideEmpty}
            onChange={(e) => define("Hide empty rows and columns", { hideEmpty: e.target.checked })}
          />
          Hide empty
        </label>
        <button
          onClick={() =>
            define("Swap matrix rows and columns", {
              rows: definition.columns,
              columns: definition.rows,
              relationships: {
                ...definition.relationships,
                dir: dir === "rowToColumn" ? "columnToRow" : dir === "columnToRow" ? "rowToColumn" : "either",
              },
            })
          }
        >
          Swap rows and columns
        </button>
        {Object.keys(own).length > 0 && type?.matrix && (
          <button
            onClick={() =>
              define("Reset matrix to its type", Object.fromEntries(Object.keys(own).map((k) => [k, null])))
            }
          >
            Reset
          </button>
        )}
      </div>
      {rows.length === 0 || columns.length === 0 ? (
        <div className="empty-state muted">
          <p>
            {rows.length === 0 ? "No objects match the rows." : "No objects match the columns."} Choose other types
            above.
          </p>
        </div>
      ) : (
        <MatrixGrid
          ariaLabel={diagram.name}
          corner={<span className="muted">{DIRS.find((d) => d.value === dir)!.label}</span>}
          rows={rows}
          columns={columns}
          cellClass={(r, c) => {
            const filled = matrix.cell(r.key, c.key).length > 0;
            const refused = !filled && matrix.options(r.key, c.key).length === 0;
            const isOpen = open?.row === r.key && open.column === c.key;
            return `${filled ? "used" : ""}${refused ? " refused" : ""}${isOpen ? " open" : ""}`;
          }}
          renderCell={(r, c) => {
            const relationships = matrix.cell(r.key, c.key);
            const options = matrix.options(r.key, c.key);
            const label = relationships.length
              ? `${r.title} and ${c.title}: ${relationships.map((x) => metamodel.relationshipType(x.type)?.verb).join(", ")}`
              : options.length
                ? `${r.title} and ${c.title}: add ${options.map((o) => o.name).join(" or ")}`
                : `${r.title} and ${c.title}: no rule allows a relationship here`;
            return (
              <button
                className="cell-button"
                aria-label={label}
                title={label}
                data-row={r.key}
                data-column={c.key}
                disabled={!relationships.length && !options.length}
                onClick={(e) => {
                  if (!relationships.length && options.length === 1) return create(options[0]!);
                  const rect = e.currentTarget.getBoundingClientRect();
                  setOpen({ row: r.key, column: c.key, at: { x: rect.left, y: rect.bottom } });
                }}
              >
                {relationships.slice(0, 3).map((x) => {
                  const kind = metamodel.relationshipType(x.type)?.semantic ?? "association";
                  return <span key={x.id} className={`dot ${KIND_FAMILY[kind]}`} />;
                })}
                {relationships.length > 3 && <span className="count">+{relationships.length - 3}</span>}
              </button>
            );
          }}
          rowTotal={(r) => matrix.rowTotal(r.key) || ""}
          columnTotal={(c) => matrix.columnTotal(c.key) || ""}
        />
      )}
      {open && (
        <CellMenu
          at={open.at}
          onClose={() => setOpen(null)}
          relationships={matrix.cell(open.row, open.column).map((r) => ({
            id: r.id,
            text: `${name(r.sourceId)} ${metamodel.relationshipType(r.type)?.verb ?? r.type} ${name(r.targetId)}`,
            version: r.version,
          }))}
          options={matrix.options(open.row, open.column)}
          optionText={(o) => `${name(o.sourceId)} ${o.name} ${name(o.targetId)}`}
          onSelect={(rid) => select({ kind: "relationship", id: rid })}
          onDelete={(r) => edit(`Delete ${r.text}`, [{ edit: "deleteRelationship", id: r.id, baseVersion: r.version }])}
          onCreate={create}
        />
      )}
    </div>
  );
}

function TypeSelect(props: { metamodel: Metamodel; value: string; onChange(type: string): void }) {
  return (
    <select value={props.value} onChange={(e) => props.onChange(e.target.value)}>
      <option value="">Any object</option>
      {props.metamodel.allObjectTypes().map((t) => (
        <option key={t.definition.key} value={t.definition.key}>
          {t.definition.name}
        </option>
      ))}
    </select>
  );
}

/** The popover on a cell: the relationships it shows (select, delete) and what else may be added. */
function CellMenu(props: {
  at: { x: number; y: number };
  relationships: { id: Id; text: string; version: number }[];
  options: CellOption[];
  optionText(o: CellOption): string;
  onSelect(id: Id): void;
  onDelete(r: { id: Id; text: string; version: number }): void;
  onCreate(o: CellOption): void;
  onClose(): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { onClose } = props;
  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", esc);
    };
  }, [onClose]);
  const left = Math.min(props.at.x, window.innerWidth - 330);
  return (
    <div ref={ref} className="mm-cell-editor matrix-cell-menu" role="dialog" style={{ left, top: props.at.y + 4 }}>
      {props.relationships.length > 0 && <h4>In this cell</h4>}
      {props.relationships.map((r) => (
        <div key={r.id} className="matrix-cell-row">
          <button className="link" onClick={() => props.onSelect(r.id)}>
            {r.text}
          </button>
          <button
            onClick={() => {
              props.onDelete(r);
              props.onClose();
            }}
          >
            Delete
          </button>
        </div>
      ))}
      {props.options.length > 0 && <h4>Add</h4>}
      {props.options.map((o) => (
        <div key={`${o.type}:${o.sourceId}`} className="matrix-cell-row">
          <button
            onClick={() => {
              props.onCreate(o);
              props.onClose();
            }}
          >
            {props.optionText(o)}
          </button>
        </div>
      ))}
    </div>
  );
}
