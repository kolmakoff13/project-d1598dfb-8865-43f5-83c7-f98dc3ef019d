// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // The default export uses the Web `fetch(request)` handler shape, which Nitro's
    // `node-server` preset wraps automatically via h3 — no Cloudflare runtime required.
    server: { entry: "server" },
  },
  // Build a standalone Node.js SSR server (Nitro `node-server` preset).
  // After `npm run build`, start with:  node .output/server/index.mjs
  // Runs on any Linux VPS (Ubuntu) behind PM2 / Nginx. No Cloudflare Workers,
  // no cloudflare-module / cloudflare-pages runtime is used.
  nitro: {
    preset: "node-server",
    output: {
      dir: ".output",
      serverDir: ".output/server",
      publicDir: ".output/public",
    },
  },
});
