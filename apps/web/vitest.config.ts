import { defineProject, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default mergeConfig(
  viteConfig,
  defineProject({
    test: {
      name: "@lg/web",
      include: ["test/**/*.test.{ts,tsx}"],
      environment: "node",
      // El primer test de cada archivo paga el arranque en frío de bootApp + App; con la suite entera en paralelo
      // pasa de los 5 s por defecto (como los otros proyectos pesados, que ya tienen 30-60 s).
      testTimeout: 30000,
    },
  }),
);
