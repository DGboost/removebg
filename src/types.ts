import type { ModelKey } from "./engine";

export interface RemoveBgToolProps {
  /** Brand accent color, e.g. "#3d5afe". */
  accent?: string;
  /** Display name shown in the top-left brand mark's tooltip. */
  appName?: string;
  /** Default color-distance tolerance (0-255-ish) for the click-eraser tool before the user touches the slider. */
  autoTol?: number;
  /** Which background-removal model the AI tool uses. */
  model?: ModelKey;
}

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

export type Tool = "auto" | "click" | "rect" | "lasso" | "brush";
export type View = "home" | "editor" | "gallery";
export type LassoOp = "new" | "add" | "sub";
export type BrushOp = "add" | "sub";

export interface RectSel {
  x: number;
  y: number;
  w: number;
  h: number;
}
