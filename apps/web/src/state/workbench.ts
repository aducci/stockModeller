// The workbench's UI state around one live session (design/04-ux/workbench.md): selection shared by every
// region, open tabs, toasts, and a revision that bumps whenever the model view changes.
import { create } from "zustand";
import { LiveSession, type PresenceUser, type SessionStatus } from "@connectome/client";
import { ulid, type DiagramType, type Edit, type Id, type MetamodelPackage } from "@connectome/model";
import { describeRejection } from "../text";

export type ItemKind = "object" | "folder" | "diagram";
export interface Selection {
  kind: ItemKind;
  id: Id;
}
/** What the properties panel shows: an explorer item, or a relationship (picked on a diagram or in the panel). */
export type Focus = Selection | { kind: "relationship"; id: Id };
/** The selection when it is an explorer item (a folder, object or diagram), else null. */
export const itemSelected = (focus: Focus | null): Selection | null =>
  focus && focus.kind !== "relationship" ? focus : null;
export interface Tab {
  kind: "object" | "diagram" | "metamodel" | "duplicates" | "objects" | "cxn";
  id: Id;
  /** The object viewer's folder (kind "objects"). */
  folderId?: Id;
  /** An unsaved CXN Builder's definition (kind "cxn", views §15); *Save view* turns it into a diagram. */
  definition?: Record<string, unknown>;
  /** Objects a CXN Builder opens with selected in its left pane. */
  selectLeft?: Id[];
}

/** The metamodel tab's id: there is one, whatever view it shows. */
export const METAMODEL_TAB = "metamodel";
/** The Possible duplicates tab's id (design/02-model/duplicates-and-identity.md §6). */
export const DUPLICATES_TAB = "duplicates";
export type MetamodelView = "types" | "diagramTypes" | "properties" | "matrix" | "sentences" | "try";

/** The metamodel being edited (package and diagram types), and the version it was edited from. */
export interface MetamodelDraft {
  baseVersion: string;
  package: MetamodelPackage;
  diagramTypes: DiagramType[];
}

export interface Toast {
  id: string;
  text: string;
  tone: "info" | "warning" | "error";
  /** The change it reports: Undo becomes available once the server has committed it. */
  changeId?: Id;
  committed?: boolean;
  /** A further step offered next to Undo (e.g. "Delete object" after removing it from a diagram). */
  action?: { label: string; run(): void };
}

/** What the explorer is asked to show inline: a form for a new item, or a rename box on a row. Menus set it. */
export type ExplorerTask =
  | { kind: "create"; what: "folder" | "object" | "diagram" | "group"; folderId: Id | null; members?: Id[] }
  | { kind: "rename"; item: Selection };

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
  selection: Focus | null;
  tabs: Tab[];
  activeTab: Id | null;
  /** Tabs whose item someone else changed since the tab was last looked at. */
  changedTabs: ReadonlySet<Id>;
  toasts: Toast[];
  /** The object the "Delete object" dialog asks about (Shift+Delete). */
  confirmDelete: Id | null;
  /** The trace shown in the properties panel and highlighted on diagrams (semantics.md §9.3). */
  trace: { startId: Id; label: string; objectIds: ReadonlySet<Id> } | null;
  explorerTask: ExplorerTask | null;
  /** Rows Ctrl/⌘-clicked in the explorer: they are dragged, grouped or moved together. */
  marked: Selection[];
  metamodelView: MetamodelView;
  /** Unpublished rule edits (notation-and-metamodel-admin.md §10); null when there are none. */
  metamodelDraft: MetamodelDraft | null;
  /** The Review and publish dialog is open (from the Metamodel menu or the draft bar). */
  metamodelReview: boolean;
  /** The property type the Properties view of the metamodel tab shows. */
  metamodelProperty: string | null;

  open(options: OpenOptions): Promise<void>;
  close(): void;
  select(selection: Focus | null): void;
  openTab(tab: Tab): void;
  closeTab(id: Id): void;
  /** Changes an open tab in place (an unsaved CXN Builder's definition). */
  updateTab(id: Id, patch: Partial<Tab>): void;
  closeAllTabs(): void;
  activateTab(id: Id): void;
  /** Applies a change at once and sends it. Returns false (and shows why) when it is refused. */
  edit(label: string, edits: Edit[], action?: Toast["action"]): boolean;
  undo(changeId: Id): Promise<void>;
  dismiss(toastId: string): void;
  askDeleteObject(id: Id | null): void;
  setExplorerTask(task: ExplorerTask | null): void;
  /** Adds an explorer row to the marked set, or takes it out; null clears the set. */
  toggleMark(item: Selection | null): void;
  /** A toast that reports no change (e.g. why a gesture did nothing). */
  notify(text: string, tone?: Toast["tone"]): void;
  showTrace(trace: WorkbenchState["trace"]): void;
  /** Opens the metamodel tab at a view. */
  openMetamodel(view: MetamodelView): void;
  /** Opens the metamodel tab's Properties view on one property type. */
  showMetamodelProperty(key: string | null): void;
  setMetamodelDraft(draft: MetamodelDraft | null): void;
  setMetamodelReview(open: boolean): void;
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
    confirmDelete: null,
    trace: null,
    explorerTask: null,
    marked: [],
    metamodelView: "matrix",
    metamodelDraft: null,
    metamodelReview: false,
    metamodelProperty: null,

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
          confirmDelete: null,
          explorerTask: null,
          marked: [],
          metamodelDraft: null,
          metamodelReview: false,
          metamodelProperty: null,
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
      set({ session: null, presence: [], toasts: [], trace: null });
    },

    showTrace(trace) {
      set({ trace });
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

    openMetamodel(view) {
      set({ metamodelView: view });
      get().openTab({ kind: "metamodel", id: METAMODEL_TAB });
    },

    showMetamodelProperty(metamodelProperty) {
      set({ metamodelProperty });
      if (metamodelProperty) get().openMetamodel("properties");
    },

    setMetamodelReview(metamodelReview) {
      set({ metamodelReview });
    },

    setMetamodelDraft(metamodelDraft) {
      set({ metamodelDraft });
    },

    closeTab(id) {
      set((s) => {
        const index = s.tabs.findIndex((t) => t.id === id);
        const tabs = s.tabs.filter((t) => t.id !== id);
        const activeTab = s.activeTab === id ? (tabs[Math.min(index, tabs.length - 1)]?.id ?? null) : s.activeTab;
        return { tabs, activeTab, changedTabs: without(s.changedTabs, id) };
      });
    },

    updateTab(id, patch) {
      set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
    },

    closeAllTabs() {
      set({ tabs: [], activeTab: null, changedTabs: new Set() });
    },

    activateTab(id) {
      set((s) => ({ activeTab: id, changedTabs: without(s.changedTabs, id) }));
    },

    edit(label, edits, action) {
      const session = get().session;
      if (!session) return false;
      const id = ulid();
      const result = session.edit({ id, label, edits });
      if (!result.ok) {
        toast({ text: `${label}: ${describeRejection(result.reasons[0]!)}`, tone: "error" });
        return false;
      }
      // A warn rule (a discouraged pair, a repeated name or relationship) keeps the change and says why.
      const finding = result.findings[0]?.message;
      toast({
        text: finding ? `${label}. ${finding}` : label,
        tone: finding ? "warning" : "info",
        changeId: id,
        committed: false,
        ...(action ? { action } : {}),
      });
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

    askDeleteObject(id) {
      set({ confirmDelete: id });
    },

    setExplorerTask(task) {
      set({ explorerTask: task });
    },

    toggleMark(item) {
      if (!item) return set({ marked: [] });
      set((s) => ({
        marked: s.marked.some((m) => m.id === item.id) ? s.marked.filter((m) => m.id !== item.id) : [...s.marked, item],
      }));
    },

    notify(text, tone = "info") {
      toast({ text, tone });
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
