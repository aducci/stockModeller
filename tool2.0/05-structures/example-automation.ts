// Example automation: "Retire application".
// Patterns: typed parameters (the platform renders the form), a precondition, read-only snapshots,
// one labelled change, a run report. Runs in preview mode first by default.
import type { AutomationContext } from "./sdk";
import { param } from "./sdk";

export const parameters = {
  application: param.object({ label: "Application to retire", query: "type:application AND lifecycle.status != retired" }),
  replacement: param.optionalObject({ label: "Replacement application", query: "type:application OR type:saasApplication" }),
  retireOn: param.date({ label: "Retirement date" }),
};

export default async function run({ params, model, change, report }: AutomationContext<typeof parameters>): Promise<void> {
  const app = params.application;
  report.require(/^\d{4}-\d{2}-\d{2}$/.test(params.retireOn), "Retirement date must be YYYY-MM-DD.");

  const links = await model.relationships(app.id, { direction: "both" });
  const serves = links.filter(r => r.type === "serves" && r.sourceId === app.id);
  const flows = links.filter(r => r.type === "flowsTo");

  await change(`Retire ${app.name}`, c => {
    c.setProperties(app.id, { "lifecycle.status": "phaseOut", "lifecycle.retiredFrom": params.retireOn });
    report.changed(app, `phase out; retires ${params.retireOn}`);

    const replacement = params.replacement;
    if (!replacement) {
      if (serves.length > 0) report.warn(`${serves.length} process(es) will have no application; no replacement chosen.`, app);
      return;
    }
    for (const r of serves) c.createRelationship("serves", replacement.id, r.targetId);
    for (const r of flows) {
      const source = r.sourceId === app.id ? replacement.id : r.sourceId;
      const target = r.targetId === app.id ? replacement.id : r.targetId;
      if (source !== target) c.createRelationship("flowsTo", source, target, r.properties);
    }
    report.summary(`${serves.length} process link(s) and ${flows.length} interface(s) moved to ${replacement.name}.`);
  });
}
