// The Possible duplicates tab (design/02-model/duplicates-and-identity.md §6): pairs of objects that may be one thing
// entered twice, best first, with the reasons. *Not duplicates* records the judgement so the pair is not raised again.
import { useMemo, useState } from "react";
import { possibleDuplicates, type ObjectRow } from "@connectome/engine";
import { useModel, useWorkbench } from "../state/workbench";
import { notDuplicatesEdits, percent } from "../duplicates";
import { notationFor } from "../notation";
import { folderPath } from "../text";
import { Glyph } from "./Glyph";

export function DuplicatesView() {
  const { state, metamodel } = useModel();
  const edit = useWorkbench((s) => s.edit);
  const select = useWorkbench((s) => s.select);
  const openTab = useWorkbench((s) => s.openTab);
  const revision = useWorkbench((s) => s.revision);
  const [filter, setFilter] = useState("");
  // The store mutates one state in place and bumps a revision on every change: that is when to look again.
  const pairs = useMemo(() => possibleDuplicates(state, metamodel), [state, metamodel, revision]);
  const query = filter.trim().toLocaleLowerCase();
  const shown = query
    ? pairs.filter((p) =>
        [p.a.name, p.b.name, typeName(p.a), typeName(p.b)].some((t) => t.toLocaleLowerCase().includes(query)),
      )
    : pairs;

  function typeName(o: ObjectRow) {
    return metamodel.objectType(o.type)?.definition.name ?? o.type;
  }
  const objectCell = (o: ObjectRow) => {
    const n = notationFor(metamodel.objectType(o.type));
    return (
      <td>
        <button
          className="link dup-object"
          title="Select it; double-click to open it"
          onClick={() => select({ kind: "object", id: o.id })}
          onDoubleClick={() => openTab({ kind: "object", id: o.id })}
        >
          <Glyph glyph={n.glyph} colour={n.ink} />
          {o.name}
        </button>
        <div className="muted small">
          {typeName(o)} · {folderPath(state, o.folderId).join(" / ")}
        </div>
      </td>
    );
  };

  return (
    <div className="duplicates-view">
      <div className="toolbar">
        <h2>Possible duplicates</h2>
        <span className="muted">
          {pairs.length === 0
            ? "None found"
            : `${pairs.length} pair${pairs.length === 1 ? "" : "s"} of objects that may be one thing entered twice`}
        </span>
        <span className="spacer" />
        <input
          className="filter"
          placeholder="Filter by name or type"
          aria-label="Filter possible duplicates"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      {pairs.length === 0 ? (
        <p className="muted pad">
          No objects look alike. Pairs are found by similar names and other names, and by sharing most of their related
          objects.
        </p>
      ) : (
        <table className="dup-table" aria-label="Possible duplicates">
          <thead>
            <tr>
              <th>Likeness</th>
              <th>Object</th>
              <th>May be the same as</th>
              <th>Why</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <tr key={`${p.a.id}|${p.b.id}`}>
                <td className="dup-score">{percent(p.score)}</td>
                {objectCell(p.a)}
                {objectCell(p.b)}
                <td>
                  <ul className="dup-reasons">
                    {p.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </td>
                <td>
                  <button
                    onClick={() => edit(`${p.a.name} and ${p.b.name} are not duplicates`, notDuplicatesEdits(p.a, p.b))}
                  >
                    Not duplicates
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
