// Platform interface (R15, 03 §3.1): permissions, local storage, updates, opening
// links and fullscreen. Today only the `web` adapter exists; `desktop`, `mobile` and `xr`
// arrive with their epics and are added here without touching whoever consumes the interface.

export type PlatformKind = "web" | "desktop" | "mobile" | "xr";

/** Permissions the game requests. The microphone goes through here (R13). */
export type PermissionKind = "microphone";

/** `unsupported`: the environment lacks the API (e.g. no mediaDevices). */
export type PermissionStatus = "granted" | "denied" | "prompt" | "unsupported";

export type UpdateStatus = { available: false } | { available: true; version: string };

export type PlatformErrorCode = "storage_unavailable" | "invalid_link" | "fullscreen_unavailable";

/** Platform error with a stable code: the caller decides what to show. */
export class PlatformError extends Error {
  readonly code: PlatformErrorCode;
  constructor(code: PlatformErrorCode, message: string) {
    super(message);
    this.name = "PlatformError";
    this.code = code;
  }
}

export interface Platform {
  readonly kind: PlatformKind;
  readonly permissions: {
    query(kind: PermissionKind): Promise<PermissionStatus>;
    request(kind: PermissionKind): Promise<PermissionStatus>;
  };
  /** Local storage key → text. Fails with PlatformError("storage_unavailable"). */
  readonly storage: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
  };
  readonly updates: {
    check(): Promise<UpdateStatus>;
  };
  /** Opens an http(s) link outside the game. Other schemes: PlatformError("invalid_link"). */
  openLink(url: string): Promise<void>;
  readonly fullscreen: {
    isActive(): boolean;
    enter(): Promise<void>;
    exit(): Promise<void>;
  };
}
