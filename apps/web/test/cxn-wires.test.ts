import { describe, expect, it } from "vitest";
import { layoutWires, MAX_WIRES, partnersOf, wirePath, type PaneBoxes } from "../src/cxn-wires";

// Rows 20 px tall from the top of the gutter; each list shows 0–100.
const pane = (ids: string[], view = { top: 0, bottom: 100 }): PaneBoxes => ({
  rows: new Map(ids.map((id, i) => [id, { top: i * 20, bottom: i * 20 + 20 }])),
  view,
});

describe("the CXN Builder's wires", () => {
  it("joins the middles of two connected rows", () => {
    const [w] = layoutWires([["a", "x"]], pane(["a"]), pane(["y", "x"]));
    expect(w).toMatchObject({ left: "a", right: "x", y1: 10, y2: 30, off1: null, off2: null, strong: false });
    expect(wirePath(w!, 64)).toBe("M0 10 C32 10 32 30 64 30");
  });

  it("leaves out pairs whose row is not shown, or with both ends scrolled away", () => {
    const left = pane(["a", "b", "c", "d", "e", "f", "g"]);
    const right = pane(["x"]);
    expect(layoutWires([["gone", "x"]], left, right)).toEqual([]);
    // f (110–130) and g are below the left list; with x in view the end waits on the list's edge.
    expect(layoutWires([["g", "x"]], left, right)).toMatchObject([{ y1: 100, off1: "below" }]);
    expect(layoutWires([["g", "x"]], left, pane(["x"], { top: -50, bottom: 0 }))).toEqual([]);
  });

  it("marks the wires of selected or hovered rows strong, keeping their order", () => {
    const wires = layoutWires(
      [
        ["a", "x"],
        ["b", "y"],
        ["c", "x"],
      ],
      pane(["a", "b", "c"]),
      pane(["x", "y"]),
      new Set(["a"]),
    );
    expect(wires.map((w) => [w.left, w.strong])).toEqual([
      ["a", true],
      ["b", false],
      ["c", false],
    ]);
  });

  it("caps how many it draws, keeping the strong ones", () => {
    const ids = Array.from({ length: MAX_WIRES + 10 }, (_, i) => `r${i}`);
    const pairs = ids.map((id): [string, string] => [id, "x"]);
    const left = { rows: pane(ids).rows, view: { top: 0, bottom: 1e6 } };
    const wires = layoutWires(pairs, left, pane(["x"]), new Set(["r0"]));
    expect(wires).toHaveLength(MAX_WIRES);
    expect(wires[0]).toMatchObject({ left: "r0", strong: true });
    const late = layoutWires(pairs, left, pane(["x"]), new Set([`r${MAX_WIRES + 5}`]));
    expect(late).toHaveLength(MAX_WIRES);
    expect(late.at(-1)).toMatchObject({ left: `r${MAX_WIRES + 5}`, strong: true });
  });

  it("finds a row's partners on the other side", () => {
    const pairs: [string, string][] = [
      ["a", "x"],
      ["a", "y"],
      ["b", "x"],
    ];
    expect([...partnersOf(pairs, "a")]).toEqual(["x", "y"]);
    expect([...partnersOf(pairs, "x")]).toEqual(["a", "b"]);
    expect(partnersOf(pairs, null).size).toBe(0);
  });
});
