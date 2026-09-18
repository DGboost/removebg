import type { ModelKey } from "./engine";

export interface EditorImage {
  id: string;
  name: string;
  photo: string;
}

export interface SavedItem {
  id: string;
  name: string;
  src: string;
  photo: string;
  fav: boolean;
  folder: string;
  ts: number;
}

/** Host-provided persistence for the 보관함 gallery (e.g. server API). */
export interface RemoveBgStorage {
  /** Load all saved items for the current user. */
  load: () => Promise<SavedItem[]>;
  /**
   * Persist a newly saved cutout. `item.src` / `item.photo` may be data URLs.
   * Return the canonical item (server id + public URLs).
   */
  save: (item: SavedItem) => Promise<SavedItem>;
  /** Patch metadata (fav / folder / name). */
  update: (
    id: string,
    patch: Partial<Pick<SavedItem, "fav" | "folder" | "name">>,
  ) => Promise<void>;
  /** Delete item from storage. */
  remove: (id: string) => Promise<void>;
}

export interface RemoveBgToolProps {
  /** Brand accent color, e.g. "#000". */
  accent?: string;
  /** Display name shown in the top-left brand mark's tooltip. */
  appName?: string;
  /** Which background-removal model the AI tool uses. */
  model?: ModelKey;
  /**
   * Optional persistence adapter. When set, the gallery loads/saves via this
   * API instead of the in-memory demo seed.
   */
  storage?: RemoveBgStorage;
}
export type Tool = "auto" | "click" | "brush";
export type View = "home" | "editor" | "gallery";
export type BrushOp = "add" | "sub";
