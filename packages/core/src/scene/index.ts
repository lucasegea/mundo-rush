// scene/ — scene machine (03 §3.5.1), success criteria and mission effects (03 §6.4.8). Shared by client and
// server. Imports with the .ts extension and nothing from outside the folder: the server runs it with Node's type stripping
// through the `@lg/core/scene` subpath (the rest of the core uses bundler resolution).
export * from "./machine.ts";
export * from "./criteria.ts";
export * from "./world.ts";
