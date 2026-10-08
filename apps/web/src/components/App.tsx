import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiClient } from "@connectome/client";
import { authorization, useAuth } from "../state/auth";
import { navigate, useRoute } from "../route";
import { emptyMetamodel, readMetamodel, type MetamodelFile } from "../type-admin";
import { GlyphSprite } from "./Glyph";
import { Workbench } from "./Workbench";

export function App() {
  const signIn = useAuth((s) => s.signIn);
  const route = useRoute();
  return (
    <>
      <GlyphSprite />
      {!signIn ? (
        <SignInPage />
      ) : !route.repositoryId ? (
        <RepositoryList />
      ) : (
        <Workbench repositoryId={route.repositoryId} scenarioId={route.scenarioId} />
      )}
    </>
  );
}

/** Development sign-in: the server must run with CONNECTOME_DEV_AUTH=1 (`npm run seed` prints these values). */
function SignInPage() {
  const setSignIn = useAuth((s) => s.setSignIn);
  const [workspaceId, setWorkspaceId] = useState("W-DEV");
  const [userId, setUserId] = useState("dev@example.com");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (workspaceId.trim() && userId.trim()) setSignIn({ workspaceId: workspaceId.trim(), userId: userId.trim() });
  };
  return (
    <main className="page">
      <form className="card" onSubmit={submit}>
        <h1>Connectome</h1>
        <p className="muted">Development sign-in. Real sign-in (OIDC) arrives later.</p>
        <label>
          Workspace
          <input value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} />
        </label>
        <label>
          Email
          <input value={userId} onChange={(e) => setUserId(e.target.value)} />
        </label>
        <button className="primary" type="submit">
          Sign in
        </button>
      </form>
    </main>
  );
}

type Start = "essentials" | "empty" | "copy" | "file";

function RepositoryList() {
  const signIn = useAuth((s) => s.signIn)!;
  const setSignIn = useAuth((s) => s.setSignIn);
  const api = useMemo(() => new ApiClient({ baseUrl: "", authorization: authorization(signIn) }), [signIn]);
  const [repositories, setRepositories] = useState<{ id: string; name: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(() => {
    api.repositories().then(setRepositories, (e: Error) => setError(e.message));
  }, [api]);
  useEffect(load, [load]);

  return (
    <main className="page">
      <section className="card">
        <h1>Repositories</h1>
        <p className="muted">
          Signed in as {signIn.userId} in {signIn.workspaceId}.{" "}
          <button className="link" onClick={() => setSignIn(null)}>
            Sign out
          </button>
        </p>
        {error && <p className="error">{error}</p>}
        {repositories === null && !error && <p className="muted">Loading…</p>}
        {repositories?.length === 0 && <p className="muted">No repositories in this workspace yet.</p>}
        <ul className="plain repo-list" aria-label="Repositories">
          {repositories?.map((r) => (
            <li key={r.id}>
              <button className="link" onClick={() => navigate({ repositoryId: r.id, scenarioId: null })}>
                {r.name}
              </button>
              <span className="spacer" />
              <button className="link muted" aria-label={`Delete ${r.name}`} onClick={() => setDeleting(r)}>
                Delete…
              </button>
            </li>
          ))}
        </ul>
        {creating ? (
          <NewRepositoryForm
            api={api}
            repositories={repositories ?? []}
            onCancel={() => setCreating(false)}
            onCreated={(id) => navigate({ repositoryId: id, scenarioId: null })}
          />
        ) : (
          <button className="primary" onClick={() => setCreating(true)}>
            New repository…
          </button>
        )}
      </section>
      {deleting && (
        <DeleteRepositoryDialog
          api={api}
          repository={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            load();
          }}
        />
      )}
    </main>
  );
}

/** A new repository with Essentials, an empty metamodel (start from scratch), another one's metamodel, or a file's. */
function NewRepositoryForm(props: {
  api: ApiClient;
  repositories: { id: string; name: string }[];
  onCancel(): void;
  onCreated(id: string): void;
}) {
  const { api, repositories } = props;
  const [name, setName] = useState("");
  const [start, setStart] = useState<Start>("essentials");
  const [copyFrom, setCopyFrom] = useState(repositories[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const metamodel = async (): Promise<MetamodelFile | undefined> => {
    if (start === "essentials") return undefined;
    if (start === "empty") return emptyMetamodel(name.trim());
    if (start === "copy") return (await api.snapshot(copyFrom)).metamodel;
    if (!file) throw new Error("Choose a metamodel file");
    return readMetamodel(await file.text());
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const chosen = await metamodel();
      const created = await api.createRepository({
        name: name.trim(),
        ...(chosen ? { metamodel: { package: chosen.package, diagramTypes: chosen.diagramTypes } } : {}),
      });
      props.onCreated(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <form className="new-repository" aria-label="New repository" onSubmit={(e) => void submit(e)}>
      <label>
        Name
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <fieldset className="choice">
        <legend>Start with</legend>
        <label>
          <input type="radio" name="start" checked={start === "essentials"} onChange={() => setStart("essentials")} />
          The Essentials metamodel (applications, capabilities, processes…)
        </label>
        <label>
          <input type="radio" name="start" checked={start === "empty"} onChange={() => setStart("empty")} />
          An empty metamodel: define your own types from scratch
        </label>
        <label>
          <input
            type="radio"
            name="start"
            checked={start === "copy"}
            disabled={repositories.length === 0}
            onChange={() => setStart("copy")}
          />
          The metamodel of another repository
        </label>
        {start === "copy" && (
          <select aria-label="Copy the metamodel of" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
            {repositories.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}
        <label>
          <input type="radio" name="start" checked={start === "file"} onChange={() => setStart("file")} />
          An exported metamodel file
        </label>
        {start === "file" && (
          <input
            type="file"
            accept=".json,application/json"
            aria-label="Choose a metamodel file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        )}
      </fieldset>
      <p className="muted small">The repository starts with no content. Only the metamodel is copied.</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="button" onClick={props.onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={busy || !name.trim()}>
          {busy ? "Creating…" : "Create"}
        </button>
      </div>
    </form>
  );
}

/** Deleting a repository cannot be undone, so its name is typed to confirm. */
function DeleteRepositoryDialog(props: {
  api: ApiClient;
  repository: { id: string; name: string };
  onClose(): void;
  onDeleted(): void;
}) {
  const { api, repository, onClose } = props;
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteRepository(repository.id);
      props.onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <div className="backdrop" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Delete ${repository.name}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      >
        <h2>Delete {repository.name}?</h2>
        <p>
          Its metamodel, scenarios, objects, relationships, diagrams and history are deleted for everyone. This cannot
          be undone. Export the metamodel first if you want to keep it.
        </p>
        <label className="field">
          <span>Type the name to confirm</span>
          <input autoFocus aria-label="Repository name" value={typed} onChange={(e) => setTyped(e.target.value)} />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button onClick={onClose}>Cancel</button>
          <button className="danger" disabled={busy || typed.trim() !== repository.name} onClick={() => void remove()}>
            {busy ? "Deleting…" : "Delete repository"}
          </button>
        </div>
      </div>
    </div>
  );
}
