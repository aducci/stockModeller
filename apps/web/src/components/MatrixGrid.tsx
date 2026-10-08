// One grid for every matrix: the metamodel's connection matrix (types × types) and matrix views (objects × objects).
// Sticky row headers, vertical column headers, row indentation for a hierarchy, optional totals.
import type { ReactNode } from "react";

export interface GridItem {
  key: string;
  /** What the header shows. */
  label: ReactNode;
  /** The header's plain name, for tooltips. */
  title: string;
  /** Indentation in a hierarchy. */
  depth?: number;
  /** A container row: drawn as a group header. */
  group?: boolean;
}

export function MatrixGrid(props: {
  ariaLabel: string;
  corner: ReactNode;
  rows: GridItem[];
  columns: GridItem[];
  /** Extra classes on a cell. */
  cellClass?(row: GridItem, column: GridItem): string;
  renderCell(row: GridItem, column: GridItem): ReactNode;
  /** A last column and a last row of totals, when given. */
  rowTotal?(row: GridItem): ReactNode;
  columnTotal?(column: GridItem): ReactNode;
}) {
  const { ariaLabel, corner, rows, columns, cellClass, renderCell, rowTotal, columnTotal } = props;
  return (
    <div className="matrix-grid-scroll">
      <table className="matrix-grid" aria-label={ariaLabel}>
        <thead>
          <tr>
            <th className="corner">{corner}</th>
            {columns.map((c) => (
              <th key={c.key} scope="col" className="col">
                <span className="vertical" title={c.title}>
                  {c.label}
                </span>
              </th>
            ))}
            {rowTotal && (
              <th scope="col" className="col total" title="Total">
                <span className="vertical">Σ</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={r.group ? "group" : undefined}>
              <th scope="row" style={{ paddingLeft: 6 + (r.depth ?? 0) * 12 }} title={r.title}>
                {r.label}
              </th>
              {columns.map((c) => (
                <td key={c.key} className={`cell${cellClass ? ` ${cellClass(r, c)}` : ""}`}>
                  {renderCell(r, c)}
                </td>
              ))}
              {rowTotal && <td className="total">{rowTotal(r)}</td>}
            </tr>
          ))}
          {columnTotal && (
            <tr className="totals">
              <th scope="row">Σ</th>
              {columns.map((c) => (
                <td key={c.key} className="total">
                  {columnTotal(c)}
                </td>
              ))}
              {rowTotal && <td className="total" />}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
