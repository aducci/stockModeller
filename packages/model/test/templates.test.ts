// Resolving document templates (views-and-design-artifacts.md §8.4): patterns with parameters and prefixes, a base
// template with sections inserted after named ones, overrides, and the problems a package reports.
import { describe, expect, it } from "vitest";
import { entryKey, resolveTemplate, sectionMay, type DocumentPattern, type DocumentTemplate } from "../src";

const pattern: DocumentPattern = {
  key: "pair",
  name: "Diagram and table",
  params: { diagramType: {}, kinds: { default: ["flow"] }, perRow: { default: null } },
  sections: [
    { key: "context", title: "Context", component: "diagramLink", config: { diagramType: "$template.diagramType" } },
    {
      key: "table",
      title: "Table",
      component: "relationTable",
      config: {
        source: { section: "context", relationships: { kinds: "$template.kinds" as never } },
        columns: ["direction"],
        perRow: "$template.perRow" as never,
      },
    },
    { region: "more", title: "More", palette: ["prose"] },
  ],
};

function resolve(templates: Record<string, DocumentTemplate>, key: string, patterns = [pattern]) {
  const problems: string[] = [];
  const template = resolveTemplate(key, (k) => templates[k], patterns, problems);
  return { template, problems, keys: template.entries.map(entryKey) };
}

describe("document templates", () => {
  it("expand a pattern with its parameters, defaults and a key prefix", () => {
    const { template, problems, keys } = resolve(
      {
        t: {
          subject: { type: ["application"] },
          sections: [
            { use: "pair", with: { diagramType: "context" } },
            { use: "pair", with: { diagramType: "landscape", kinds: ["interaction"] }, prefix: "data" },
          ],
        },
      },
      "t",
    );
    expect(problems).toEqual([]);
    expect(keys).toEqual(["context", "table", "more", "dataContext", "dataTable", "dataMore"]);
    const table = template.entries[4] as Extract<(typeof template.entries)[number], { component: "relationTable" }>;
    // References inside the pattern follow the prefix; a null parameter removes its key.
    expect(table.config.source).toEqual({ section: "dataContext", relationships: { kinds: ["interaction"] } });
    expect("perRow" in table.config).toBe(false);
    expect(table.lock).toBe("configurable");
  });

  it("extend a base, insert after a named section, and override what the base fixed", () => {
    const templates: Record<string, DocumentTemplate> = {
      base: {
        subject: { type: ["application"] },
        sections: [
          { key: "summary", title: "Summary", component: "prose", lock: "fixed" },
          { key: "risks", title: "Risks", component: "prose" },
        ],
      },
      company: {
        extends: "base",
        sections: [
          { key: "security", title: "Security", component: "prose", after: "summary" },
          { key: "costs", title: "Costs", component: "prose" },
        ],
        overrides: { risks: { title: "Risks and issues", allow: { hide: true } } },
      },
    };
    const { template, problems, keys } = resolve(templates, "company");
    expect(problems).toEqual([]);
    expect(keys).toEqual(["summary", "security", "risks", "costs"]);
    expect(template.subject).toEqual({ type: ["application"] });
    const risks = template.entries[2] as Parameters<typeof sectionMay>[0];
    expect(risks.title).toBe("Risks and issues");
    expect(sectionMay(risks, "hide")).toBe(true);
    expect(sectionMay(template.entries[0] as Parameters<typeof sectionMay>[0], "rename")).toBe(false);
  });

  it("report unknown patterns and parameters, missing ones, bad inserts and cycles", () => {
    const { problems } = resolve(
      {
        a: {
          extends: "b",
          sections: [
            { use: "nope" },
            { use: "pair", with: { colour: "red" } },
            { key: "x", title: "X", component: "prose", after: "zzz" },
          ],
          overrides: { ghost: { title: "Boo" } },
        },
        b: { extends: "a", sections: [{ key: "y", title: "Y", component: "prose" }] },
      },
      "a",
    );
    expect(problems).toEqual([
      'Document template "a" extends itself through a → b → a',
      'Document template "a" uses unknown pattern "nope"',
      'Document template "a", pattern "pair" sets "colour", which pattern "pair" has not',
      'Document template "a", pattern "pair" does not set "diagramType", which pattern "pair" needs',
      'Document template "a" inserts after "zzz", which it does not have',
      'Document template "a" overrides "ghost", which it does not have',
    ]);
  });
});

describe("section locks", () => {
  const section = (lock: "fixed" | "configurable" | "free", allow = {}, required = false) =>
    ({ key: "s", title: "S", component: "prose", lock, allow, required }) as const;
  it("grant what the lock and allow say", () => {
    expect(sectionMay(section("fixed", { hide: true }), "hide")).toBe(false);
    expect(sectionMay(section("configurable"), "hide")).toBe(false);
    expect(sectionMay(section("configurable", { hide: true }), "hide")).toBe(true);
    expect(sectionMay(section("configurable", { hide: true }, true), "hide")).toBe(false);
    expect(sectionMay(section("free"), "hide")).toBe(true);
    expect(sectionMay(section("free"), "rename")).toBe(true);
    expect(sectionMay(section("configurable", { columns: true }), "columns")).toBe(true);
  });
});
