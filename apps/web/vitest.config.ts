import { defineProject, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default mergeConfig(
  viteConfig,
  defineProject({
    test: {
      name: "@lg/web",
      include: ["test/**/*.test.{ts,tsx}"],
      environment: "node",
    },
  }),
);
