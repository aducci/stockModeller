// The workbench's UI state around one live session (design/04-ux/workbench.md): selection shared by every
// region, open tabs, toasts, and a revision that bumps whenever the model view changes.
import { create } from "zustand";
import { LiveSession, type PresenceUser, type SessionStatus } from "@connectome/client";
import { ulid, type Edit, type Id } from "@connectome/model";
import { describeRejection } from "../text";

export type ItemKind = "object" | "folder" | "diagram";
export interface Selection {
  kind: ItemKind;
  id: Id;
}
export interface Tab {
  kind: "object" | "diagram";
  id: Id;
}

export interface Toast {
  id: string;
  text: string;
  tone: "info" | "error";
  /** The change it reports: Undo becomes available once the server has committed it. */
  changeId?: Id;
  committed?: boolean;
}

interface OpenOptions {
  authorization: string;
  userId: string;
  repositoryId: Id;
  scenarioId?: Id;
}

interface WorkbenchState {
  session: LiveSession | null;
  loading: boolean;
  error: string | null;
  /** Bumps on every change to the model view: components that read the model subscribe to it. */
  revision: number;
  status: SessionStatus;
  pending: number;
  presence: PresenceUser[];
  selection: Selection | null;
  tabs: Tab[];
  activeTab: Id | null;
  /** Tabs whose item someone else changed since the tab was last looked at. */
  changedTabs: ReadonlySet<Id>;
  toasts: Toast[];

  open(options: OpenOptions): Promise<void>;
  close(): void;
  select(selection: Selection | null): void;
  openTab(tab: Tab): void;
  closeTab(id: Id): void;
  activateTab(id: Id): void;
  /** Applies a change at once and sends it. Returns false (and shows why) when it is refused. */
  edit(label: string, edits: Edit[]): boolean;
  undo(changeId: Id): Promise<void>;
  dismiss(toastId: string): void;
}

let unsubscribe: (() => void) | undefined;
/** Bumped by every open and close, so a slow open that was superseded meanwhile closes its own session. */
let generation = 0;
let toastCounter = 0;
const TOAST_MS = 6000;

export const useWorkbench = create<WorkbenchState>((set, get) => {
  const toast = (t: Omit<Toast, "id">) => {
    const id = `t${++toastCounter}`;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
    setTimeout(() => get().dismiss(id), TOAST_MS);
    return id;
  };
  const patchToast = (changeId: Id, patch: Partial<Toast>) =>
    set((s) => ({ toasts: s.toasts.map((t) => (t.changeId === changeId ? { ...t, ...patch } : t)) }));

  return {
    session: null,
    loading: false,
    error: null,
    revision: 0,
    status: "connecting",
    pending: 0,
    presence: [],
    selection: null,
    tabs: [],
    activeTab: null,
    changedTabs: new Set(),
    toasts: [],

    async open(options) {
      get().close();
      const mine = ++generation;
      set({ loading: true, error: null });
      try {
        const session = await LiveSession.open({
          baseUrl: "",
          authorization: options.authorization,
          userId: options.userId,
          repositoryId: options.repositoryId,
          ...(options.scenarioId ? { scenarioId: options.scenarioId } : {}),
        });
        if (mine !== generation) return session.close();
        unsubscribe = session.subscribe((event) => {
          switch (event.type) {
            case "changed":
              set((s) => ({ revision: s.revision + 1, pending: session.store.pendingChanges.length }));
              return;
            case "status":
              set({ status: event.status });
              return;
            case "presence":
              set({ presence: event.users });
              return;
            case "confirmed":
              patchToast(event.change.id, { committed: true });
              return;
            case "applied": {
              if (event.own) return;
              // A dot on open tabs whose item someone else just changed.
              const touched = new Set(
                event.change.edits.flatMap((e) => ("id" in e ? [e.id] : "diagramId" in e ? [e.diagramId] : [])),
              );
              const { tabs, activeTab, changedTabs } = get();
              const hit = tabs.filter((t) => t.id !== activeTab && touched.has(t.id)).map((t) => t.id);
              if (hit.length > 0) set({ changedTabs: new Set([...changedTabs, ...hit]) });
              return;
            }
            case "rejected":
              set((s) => ({ toasts: s.toasts.filter((t) => t.changeId !== event.change.id) }));
              toast({ text: `${event.change.label}: ${describeRejection(event.reasons[0]!)}`, tone: "error" });
              return;
            case "error":
              set({ error: event.message });
              return;
          }
        });
        set({
          session,
          loading: false,
          status: session.status,
          pending: 0,
          revision: 0,
          selection: null,
          tabs: [],
          activeTab: null,
          changedTabs: new Set(),
        });
      } catch (error) {
        if (mine !== generation) return;
        set({ loading: false, error: error instanceof Error ? error.message : String(error) });
      }
    },

    close() {
      generation++;
      unsubscribe?.();
      unsubscribe = undefined;
      get().session?.close();
      set({ session: null, presence: [], toasts: [] });
    },

    select(selection) {
      set({ selection });
      const session = get().session;
      if (session) session.setPresence({ selection: selection ? [selection.id] : [] });
    },

    openTab(tab) {
      set((s) => ({
        tabs: s.tabs.some((t) => t.id === tab.id) ? s.tabs : [...s.tabs, tab],
        activeTab: tab.id,
        changedTabs: without(s.changedTabs, tab.id),
      }));
    },

    closeTab(id) {
      set((s) => {
        const index = s.tabs.findIndex((t) => t.id === id);
        const tabs = s.tabs.filter((t) => t.id !== id);
        const activeTab = s.activeTab === id ? (tabs[Math.min(index, tabs.length - 1)]?.id ?? null) : s.activeTab;
        return { tabs, activeTab, changedTabs: without(s.changedTabs, id) };
      });
    },

    activateTab(id) {
      set((s) => ({ activeTab: id, changedTabs: without(s.changedTabs, id) }));
    },

    edit(label, edits) {
      const session = get().session;
      if (!session) return false;
      const id = ulid();
      const result = session.edit({ id, label, edits });
      if (!result.ok) {
        toast({ text: `${label}: ${describeRejection(result.reasons[0]!)}`, tone: "error" });
        return false;
      }
      toast({ text: label, tone: "info", changeId: id, committed: false });
      return true;
    },

    async undo(changeId) {
      const session = get().session;
      if (!session) return;
      set((s) => ({ toasts: s.toasts.filter((t) => t.changeId !== changeId) }));
      try {
        await session.api.undo(session.store.repository.id, changeId);
        toast({ text: "Undone", tone: "info" });
      } catch (error) {
        toast({ text: `Could not undo: ${error instanceof Error ? error.message : String(error)}`, tone: "error" });
      }
    },

    dismiss(toastId) {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== toastId) }));
    },
  };
});

function without(set: ReadonlySet<Id>, id: Id): ReadonlySet<Id> {
  if (!set.has(id)) return set;
  const copy = new Set(set);
  copy.delete(id);
  return copy;
}

/** The session's model view; re-renders the caller whenever it changes. */
export function useModel() {
  useWorkbench((s) => s.revision);
  const session = useWorkbench((s) => s.session)!;
  return { state: session.store.state, metamodel: session.store.metamodel, store: session.store };
}
