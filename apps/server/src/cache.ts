// The per-repository resolution cache (design/03-platform/storage.md §3): each scenario's resolved state,
// kept in memory and checked against the repository sequence on every request. A request that finds the
// cache behind (another instance wrote, or the cache is cold) reloads the scenario from the database.
import type { Metamodel, ModelState } from "@connectome/engine";

/** Runs async functions one at a time, in arrival order. */
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn, fn);
    this.tail = result.catch(() => {});
    return result;
  }
}

export interface ScenarioView {
  state: ModelState;
  /** The repository sequence the state reflects. */
  seq: number;
}

export class RepositoryEntry {
  /** Serialises this process's requests on one repository, so no read sees a write half-applied. */
  readonly mutex = new Mutex();
  metamodel: Metamodel | undefined;
  readonly views = new Map<string, ScenarioView>();
}

export class StateCache {
  private readonly entries = new Map<string, RepositoryEntry>();

  constructor(private readonly maxRepositories = 50) {}

  entry(repositoryId: string): RepositoryEntry {
    let entry = this.entries.get(repositoryId);
    if (entry) {
      // Least recently used first: re-insert to move to the back.
      this.entries.delete(repositoryId);
    } else {
      entry = new RepositoryEntry();
      if (this.entries.size >= this.maxRepositories) this.entries.delete(this.entries.keys().next().value!);
    }
    this.entries.set(repositoryId, entry);
    return entry;
  }
}
