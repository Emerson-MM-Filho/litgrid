import { defineConfig } from "@playwright/test";

// the fixtures load the built package from dist/ (and the editor from dist-app/): run `npm run build` first
export default defineConfig({
  testDir: "tests",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  // on GitHub Actions each failure is also an annotation in the run's summary
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }], ...(process.env.GITHUB_ACTIONS ? [["github"] as ["github"]] : [])] : "list",
  use: {
    baseURL: "http://localhost:4173",
    // locally, PW_CHANNEL=chrome uses the installed Chrome instead of a downloaded browser
    channel: process.env.PW_CHANNEL || undefined,
    viewport: { width: 1280, height: 800 },
  },
  webServer: { command: "node tests/server.mjs", url: "http://localhost:4173/package.json", reuseExistingServer: !process.env.CI },
});
