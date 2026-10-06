// Development sign-in (decision B12): the server accepts "Bearer dev:<workspace>:<user>" when
// CONNECTOME_DEV_AUTH=1. OIDC replaces this in M1. Remembered in this browser only.
import { create } from "zustand";

export interface SignIn {
  workspaceId: string;
  userId: string;
}

const KEY = "connectome.devSignIn";

function load(): SignIn | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SignIn) : null;
  } catch {
    return null;
  }
}

interface AuthState {
  signIn: SignIn | null;
  setSignIn(signIn: SignIn | null): void;
}

export const useAuth = create<AuthState>((set) => ({
  signIn: load(),
  setSignIn(signIn) {
    try {
      if (signIn) localStorage.setItem(KEY, JSON.stringify(signIn));
      else localStorage.removeItem(KEY);
    } catch {
      // Storage may be unavailable (private windows): sign-in then lasts until the page closes.
    }
    set({ signIn });
  },
}));

export const authorization = (s: SignIn) => `Bearer dev:${s.workspaceId}:${s.userId}`;
