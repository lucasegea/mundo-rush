// services/platform/ — Platform interface + web adapter, R15 seam (03 §3.1, F1.1b).
export type { PermissionKind, PermissionStatus, Platform, PlatformErrorCode, PlatformKind, UpdateStatus } from "./types";
export { PlatformError } from "./types";
export { browserEnv, createWebPlatform, STORAGE_PREFIX, type WebPlatformEnv } from "./web";
