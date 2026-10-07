import { useEffect, useState, type FormEvent } from "react";
import { ApiClient } from "@connectome/client";
import { authorization, useAuth } from "../state/auth";
import { navigate, useRoute } from "../route";
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

function RepositoryList() {
  const signIn = useAuth((s) => s.signIn)!;
  const setSignIn = useAuth((s) => s.setSignIn);
  const [repositories, setRepositories] = useState<{ id: string; name: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const api = new ApiClient({ baseUrl: "", authorization: authorization(signIn) });
    api.repositories().then(setRepositories, (e: Error) => setError(e.message));
  }, [signIn]);

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
        <ul className="plain">
          {repositories?.map((r) => (
            <li key={r.id}>
              <button className="link" onClick={() => navigate({ repositoryId: r.id, scenarioId: null })}>
                {r.name}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
