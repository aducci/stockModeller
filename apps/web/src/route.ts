// The page's place in the app, kept in the URL hash so a reload returns to it: #/r/<repository>[/<scenario>].
import { useSyncExternalStore } from "react";

export interface Route {
  repositoryId: string | null;
  scenarioId: string | null;
}

export function parseRoute(hash: string): Route {
  const [, kind, repositoryId, scenarioId] = hash.replace(/^#/, "").split("/");
  if (kind !== "r" || !repositoryId) return { repositoryId: null, scenarioId: null };
  return {
    repositoryId: decodeURIComponent(repositoryId),
    scenarioId: scenarioId ? decodeURIComponent(scenarioId) : null,
  };
}

export function routeHash(route: Route): string {
  if (!route.repositoryId) return "#/";
  const scenario = route.scenarioId ? `/${encodeURIComponent(route.scenarioId)}` : "";
  return `#/r/${encodeURIComponent(route.repositoryId)}${scenario}`;
}

export function navigate(route: Route): void {
  window.location.hash = routeHash(route);
}

const subscribe = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parseRoute(hash);
}
