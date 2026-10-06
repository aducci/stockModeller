import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The API and the live connection are proxied to the server, so the app talks to its own origin.
const api = process.env.CONNECTOME_API ?? "http://127.0.0.1:3000";
const proxy = { "/api": { target: api, ws: true } };

export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
});
