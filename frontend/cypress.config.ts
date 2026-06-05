import { defineConfig } from "cypress";
import { config as loadEnv } from "dotenv";

// Load .env.local for local dev credentials (gitignored; CI uses env vars directly).
loadEnv({ path: ".env.local", override: false });

export default defineConfig({
  projectId: 'h7bqvk',
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL || "http://localhost",
    specPattern: "cypress/e2e/**/*.cy.{js,ts}",
    supportFile: "cypress/support/e2e.ts",
    env: {
      DEV_USER_EMAIL: process.env.DEV_USER_EMAIL || "devuser@example.com",
      DEV_USER_PASSWORD: process.env.DEV_USER_PASSWORD || "password123!",
    },
    setupNodeEvents(on, config) {},
  },
});
