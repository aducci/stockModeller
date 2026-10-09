// One page per repository (design/04-ux/workbench.md): top bar, explorer, centre tabs, properties.
import { useEffect, useState, type CSSProperties } from "react";
import { authorization, useAuth } from "../state/auth";
import { useWorkbench } from "../state/workbench";
import { navigate } from "../route";
import { saveState } from "../text";
import { Explorer } from "./Explorer";
import { Centre } from "./Centre";
import { Dock, DOCK_RAIL } from "./Dock";
import { usePanelPrefs } from "./Inspector";
import { Toasts } from "./Toasts";
import { DeleteObjectDialog } from "./DeleteObjectDialog";
import { MenuBar } from "./Menu";
import { fileMenu, metamodelMenu, reviewMenu } from "./commands";

export function Workbench({ repositoryId, scenarioId }: { repositoryId: string; scenarioId: string | null }) {
  const signIn = useAuth((s) => s.signIn)!;
  const { session, loading, error, open, close } = useWorkbench();
  const status = useWorkbench((s) => s.status);
  const dockWidth = usePanelPrefs((s) => (s.dockMinimised ? DOCK_RAIL : s.dockWidth));

  useEffect(() => {
    void open({
      authorization: authorization(signIn),
      userId: signIn.userId,
      repositoryId,
      ...(scenarioId ? { scenarioId } : {}),
    });
    return () => close();
  }, [open, close, signIn, repositoryId, scenarioId]);

  // No Save button: leaving with unconfirmed changes asks first.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useWorkbench.getState().pending > 0) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  if (error && !session) {
    return (
      <main className="page">
        <section className="card">
          <h1>Cannot open the repository</h1>
          <p className="error">{error}</p>
          <button className="link" onClick={() => navigate({ repositoryId: null, scenarioId: null })}>
            Back to repositories
          </button>
        </section>
      </main>
    );
  }
  if (loading || !session) return <main className="page muted">Loading…</main>;

  const inScenario = session.store.scenario.parentId !== null;
  return (
    <div
      className={`workbench${inScenario ? " in-scenario" : ""}`}
      style={{ "--dock-width": `${dockWidth}px` } as CSSProperties}
    >
      <TopBar />
      {(status === "reconnecting" || status === "paused") && (
        <div className="banner" role="status">
          {status === "reconnecting"
            ? "Reconnecting… Your edits are kept and will be sent when the connection returns."
            : "Offline for more than two minutes: editing is paused until the connection returns."}
        </div>
      )}
      {error && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}
      <Explorer />
      <Centre />
      <Dock />
      <Toasts />
      <DeleteObjectDialog />
    </div>
  );
}

function TopBar() {
  const session = useWorkbench((s) => s.session)!;
  const status = useWorkbench((s) => s.status);
  const pending = useWorkbench((s) => s.pending);
  const presence = useWorkbench((s) => s.presence);
  const [scenarios, setScenarios] = useState<{ id: string; name: string; parentId: string | null }[]>([]);
  const { repository, scenario } = session.store;

  useEffect(() => {
    session.api.scenarios(repository.id).then(setScenarios, () => setScenarios([]));
  }, [session, repository.id]);

  const save = saveState(status, pending);
  // One chip per person, however many tabs they have open.
  const people = [...new Map(presence.map((u) => [u.id, u])).values()];
  return (
    <header className="topbar">
      <button
        className="repo link"
        title="All repositories"
        onClick={() => navigate({ repositoryId: null, scenarioId: null })}
      >
        ◧ {repository.name}
      </button>
      <MenuBar
        menus={[
          { label: "File", entries: () => fileMenu(session.store.state, session.store.metamodel) },
          { label: "Review", entries: reviewMenu },
          { label: "Metamodel", entries: metamodelMenu },
        ]}
      />
      <label className="scenario">
        Scenario
        <select
          value={scenario.id}
          onChange={(e) =>
            navigate({
              repositoryId: repository.id,
              scenarioId: e.target.value === repository.baselineScenarioId ? null : e.target.value,
            })
          }
        >
          {(scenarios.length ? scenarios : [scenario]).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {scenario.parentId !== null && <span className="chip scenario-chip">Edits go to {scenario.name}</span>}
      <span className="spacer" />
      <span className="presence" aria-label="Who is here">
        {people.map((u) => (
          <span key={u.id} className="avatar" style={{ background: u.color }} title={u.name}>
            {initials(u.name)}
          </span>
        ))}
      </span>
      <span className={`save ${save.tone}`} data-testid="save-state">
        {save.text}
      </span>
    </header>
  );
}

function initials(name: string): string {
  const parts = name.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}
