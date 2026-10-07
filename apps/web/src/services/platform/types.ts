// Interfaz Platform (R15, 03 §3.1): permisos, almacenamiento local, actualizaciones, abrir
// enlaces y pantalla completa. Hoy solo existe el adaptador `web`; `desktop`, `mobile` y `xr`
// llegan con sus épicas y se agregan acá sin tocar a quien consume la interfaz.

export type PlatformKind = "web" | "desktop" | "mobile" | "xr";

/** Permisos que el juego pide. El micrófono pasa por acá (R13). */
export type PermissionKind = "microphone";

/** `unsupported`: el entorno no tiene la API (p. ej. sin mediaDevices). */
export type PermissionStatus = "granted" | "denied" | "prompt" | "unsupported";

export type UpdateStatus = { available: false } | { available: true; version: string };

export type PlatformErrorCode = "storage_unavailable" | "invalid_link" | "fullscreen_unavailable";

/** Error de plataforma con código estable: quien llama decide qué mostrar. */
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
  /** Almacenamiento local clave → texto. Falla con PlatformError("storage_unavailable"). */
  readonly storage: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
  };
  readonly updates: {
    check(): Promise<UpdateStatus>;
  };
  /** Abre un enlace http(s) fuera del juego. Otros esquemas: PlatformError("invalid_link"). */
  openLink(url: string): Promise<void>;
  readonly fullscreen: {
    isActive(): boolean;
    enter(): Promise<void>;
    exit(): Promise<void>;
  };
}
