import React, { type CSSProperties } from "react";
import { RemoveBgEngine, MODEL_LABELS, type EngineStatus } from "./engine";
import { getQuickScenes } from "./scenes";
import type {
  RemoveBgToolProps,
  EditorImage,
  SavedItem,
  Tool,
  View,
  BrushOp,
} from "./types";

type Pt = [number, number];

interface State {
  view: View;
  editorImage: EditorImage | null;
  tool: Tool;
  processed: boolean;
  processing: boolean;
  manualReady: boolean;
  manualError: string;
  notice: string;
  resultSrc: string | null;
  dragging: boolean;
  compareOn: boolean;
  saved: SavedItem[];
  filter: string;
  toast: string;
  engine: EngineStatus;
  engineMsg: string;
  brushPts: Pt[];
  brushSize: number;
  brushOp: BrushOp;
  cursorPos: [number, number] | null;
  dropActive: boolean;
}


const GLOBAL_CSS = `
.pdf-editor-root *{box-sizing:border-box}
.pdf-editor-root{
  height:100%;
  font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  font-size:14px;line-height:1.5;color-scheme:light;
  --accent:#000;
  --pdfe-page:#fff;
  --pdfe-bg:#fff;
  --pdfe-surface:#fff;
  --pdfe-surface-soft:#f9fafb;
  --pdfe-selected:#f3f4f6;
  --pdfe-canvas:#f9fafb;
  --pdfe-border:#e5e7eb;
  --pdfe-border-soft:rgba(229,231,235,.6);
  --pdfe-border-strong:#e5e7eb;
  --pdfe-text:#111827;
  --pdfe-text-muted:#6b7280;
  --pdfe-text-subtle:#9ca3af;
  --pdfe-text-faint:#9ca3af;
  --pdfe-scrollbar:#e5e7eb;
  --pdfe-toast-bg:#111827;
  --pdfe-danger:#dc2626;
  --pdfe-danger-bg:#fef2f2;
  /* Keep the component's local names as aliases for its inline styles. */
  --rbg-page:var(--pdfe-page);
  --rbg-bg:var(--pdfe-bg);
  --rbg-surface:var(--pdfe-surface);
  --rbg-surface-soft:var(--pdfe-surface-soft);
  --rbg-panel:var(--pdfe-surface-soft);
  --rbg-canvas:var(--pdfe-canvas);
  --rbg-border:var(--pdfe-border);
  --rbg-border-soft:var(--pdfe-border-soft);
  --rbg-border-strong:var(--pdfe-border-strong);
  --rbg-text:var(--pdfe-text);
  --rbg-text-muted:var(--pdfe-text-muted);
  --rbg-text-subtle:var(--pdfe-text-subtle);
  --rbg-text-faint:var(--pdfe-text-faint);
  --rbg-scrollbar:var(--pdfe-scrollbar);
  --rbg-toast-bg:var(--pdfe-toast-bg);
  --rbg-danger:var(--pdfe-danger);
  --rbg-danger-bg:var(--pdfe-danger-bg);
  color:var(--pdfe-text);background:var(--pdfe-bg);
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility
}
.pdf-editor-root a{color:var(--accent,#000);text-decoration:none}
.pdf-editor-root a:hover{opacity:.82}
.pdf-editor-root ::selection{background:color-mix(in srgb,var(--accent,#000) 12%,var(--pdfe-surface,#fff))}
.pdf-editor-root input{font-family:inherit;color:inherit}
.pdf-editor-root input:focus{outline:none}
.pdf-editor-root button{font-family:inherit;cursor:pointer;border:none;border-radius:9999px !important;background:none;color:inherit;transition:background-color .18s ease,color .18s ease,border-color .18s ease,outline-color .18s ease}
.pdf-editor-root button:disabled{opacity:.5;cursor:not-allowed}
.pdf-editor-root button:focus-visible,.pdf-editor-root input:focus-visible{outline:2px solid var(--pdfe-text);outline-offset:2px}
@keyframes rbg-spin{to{transform:rotate(360deg)}}
@keyframes rbg-pop{0%{transform:translateY(10px) scale(.98);opacity:0}100%{transform:none;opacity:1}}
.pdf-editor-root ::-webkit-scrollbar{width:11px;height:11px}
.pdf-editor-root ::-webkit-scrollbar-thumb{background:var(--pdfe-scrollbar);border-radius:10px;border:3px solid var(--pdfe-bg)}
.pdf-editor-root ::-webkit-scrollbar-thumb:hover{background:var(--pdfe-border-strong)}
.pdf-editor-root .rbg-quickscene:hover{border-color:var(--accent,#000);transform:translateY(-2px)}
.pdf-editor-root .rbg-recent-card:hover{border-color:var(--pdfe-border-strong);transform:translateY(-2px)}
.pdf-editor-root .rbg-topbar-back:not(:disabled):hover{--pdfe-button-bg:var(--pdfe-selected);--pdfe-button-color:var(--pdfe-text);background:var(--pdfe-button-bg);color:var(--pdfe-button-color)}
.pdf-editor-root .rbg-reset-sel:not(:disabled):hover{--pdfe-button-border:var(--pdfe-border-strong);--pdfe-button-color:var(--pdfe-text);border-color:var(--pdfe-button-border);color:var(--pdfe-button-color)}
.pdf-editor-root .rbg-dl-btn:not(:disabled):hover,.pdf-editor-root .rbg-gallery-new-btn:not(:disabled):hover,.pdf-editor-root .rbg-primary-btn:not(:disabled):hover{--pdfe-button-bg:#27272a;--pdfe-button-color:#fff;background:var(--pdfe-button-bg);color:var(--pdfe-button-color);filter:none}
.pdf-editor-root .rbg-save-btn:not(:disabled):hover{--pdfe-button-border:var(--pdfe-border-strong);border-color:var(--pdfe-button-border)}
.pdf-editor-root .rbg-gallery-card:hover{box-shadow:0 10px 28px rgba(0,0,0,.08);border-color:var(--pdfe-border)}
.pdf-editor-root .rbg-icon-btn:not(:disabled):hover{--pdfe-button-bg:var(--pdfe-surface-soft);--pdfe-button-color:var(--pdfe-text);background:var(--pdfe-button-bg);color:var(--pdfe-button-color)}
.pdf-editor-root .rbg-icon-btn-danger:not(:disabled):hover{--pdfe-button-bg:var(--pdfe-danger-bg);--pdfe-button-color:var(--pdfe-danger);background:var(--pdfe-button-bg);color:var(--pdfe-button-color)}
.pdf-editor-root .rbg-brand:hover{opacity:.7}
.pdf-editor-root .rbg-navlink{font-size:15px;font-weight:600;color:var(--pdfe-text-faint);letter-spacing:-.2px;padding:6px 0;background:none;line-height:1.2;transition:color .18s ease}
.pdf-editor-root .rbg-navlink:hover{color:var(--pdfe-text)}
.pdf-editor-root .rbg-navlink-active{color:var(--pdfe-text);font-weight:700}
.pdf-editor-root .rbg-navcount{margin-left:6px;font-size:12px;font-weight:600;color:inherit;opacity:.55;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
@media (prefers-reduced-motion:reduce){
  .pdf-editor-root *,.pdf-editor-root *::before,.pdf-editor-root *::after{
    animation-duration:.01ms!important;animation-iteration-count:1!important;
    transition-duration:.01ms!important;scroll-behavior:auto!important
  }
}
`;

export class RemoveBgTool extends React.Component<RemoveBgToolProps, State> {
  static defaultProps: Partial<RemoveBgToolProps> = {
    accent: "#000",
    appName: "누끼컷",
    model: "ormbg",
  };

  private engine = new RemoveBgEngine();
  private engineDisposed = false;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private request: symbol | null = null;
  private generation = 0;
  private mounted = false;
  private activePointer: number | null = null;
  // live selection overlay: the engine paints the current selection into this
  // canvas cheaply on every pointer move (no toDataURL), so brushing
  // stays smooth instead of re-encoding a PNG per move.
  private overlayRef = React.createRef<HTMLCanvasElement>();
  // Pointer strokes can fire far faster than the screen refreshes. Points are
  // accumulated in these buffers (never lost), while React re-renders — the
  // expensive part, since render() rebuilds the whole editor tree — are
  // coalesced to at most one per animation frame via scheduleState().
  private brushBuf: Pt[] = [];
  private rafId: number | null = null;
  private pendingState: Partial<State> | null = null;

  private scheduleState(patch: Partial<State>) {
    this.pendingState = this.pendingState ? { ...this.pendingState, ...patch } : patch;
    if (this.rafId === null) this.rafId = requestAnimationFrame(this.flushState);
  }
  private flushState = () => {
    this.rafId = null;
    const p = this.pendingState;
    this.pendingState = null;
    if (p) this.setState(p as State);
  };
  private cancelScheduled() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.pendingState = null;
  }

  state: State = {
    view: "home",
    editorImage: null,
    tool: "auto",
    processed: false,
    processing: false,
    manualReady: false,
    manualError: "",
    notice: "",
    resultSrc: null,
    dragging: false,
    compareOn: false,
    saved: [],
    filter: "all",
    toast: "",
    engine: "idle",
    engineMsg: "",
    brushPts: [],
    brushSize: 30,
    brushOp: "add",
    cursorPos: null,
    dropActive: false,
  };

  componentDidMount() {
    if (this.engineDisposed) {
      this.engine = new RemoveBgEngine();
      this.engineDisposed = false;
    }
    this.mounted = true;
    document.addEventListener("paste", this.onPaste);
    if (this.props.storage) {
      void this.loadFromStorage();
    } else {
      void this.seed();
    }
  }

  componentWillUnmount() {
    this.mounted = false;
    this.invalidate();
    void this.engine.dispose().catch((error) => console.error("[AI bg-remove] dispose:", error));
    this.engineDisposed = true;
    document.removeEventListener("paste", this.onPaste);
  }

  componentDidUpdate(prevProps: RemoveBgToolProps) {
    if (prevProps.model !== this.props.model) {
      this.invalidate();
      this.setState({ engine: "idle", engineMsg: "" }, () => {
        if (this.state.view === "editor" && this.state.tool === "brush") {
          void this.prepareManual();
        }
      });
    }
    // keep the live selection overlay in sync with the engine's _selCanvas.
    // Cheap (two drawImage calls), so running it after every render is fine and
    // covers mount, stroke commits, and tool switches without extra plumbing.
    if (this.state.manualReady && !this.state.processing) {
      this.paintOverlay();
    }
  }

  private paintOverlay = () => {
    const dom = this.overlayRef.current;
    if (dom) this.engine.renderSelOverlay(dom, this.props.accent || "#000");
  };

  private async loadFromStorage() {
    const storage = this.props.storage;
    if (!storage) return;
    try {
      const items = await storage.load();
      if (!this.mounted) return;
      this.setState({ saved: Array.isArray(items) ? items : [] });
    } catch {
      this.flash("보관함을 불러오지 못했어요");
    }
  }

  private async seed() {
    try {
      const scenes = getQuickScenes();
      const plan: [ReturnType<typeof getQuickScenes>[number], boolean][] = [
        [scenes[0], true],
        [scenes[4], false],
        [scenes[1], false],
        [scenes[3], true],
      ];
      const items: SavedItem[] = [];
      for (const [sc, fav] of plan) {
        const img = await this.engine.loadImage(sc.photo);
        if (!this.mounted) return;
        items.push({
          id: "seed_" + sc.id,
          name: sc.name,
          src: this.engine.autoRemove(img, 60),
          photo: sc.photo,
          fav,
          folder: "",
          ts: Date.now(),
        });
      }
      this.setState({ saved: items });
    } catch {
      // demo seeding is best-effort only
    }
  }

  // ---------- bring a photo in from anywhere on the web ----------
  // any image bytes we already have (a real uploaded File, or a Blob copied
  // from the OS clipboard) go straight to the editor — no network involved.
  private blobToEditor = (blob: Blob, name?: string) => {
    this.invalidate();
    const generation = this.generation;
    const rd = new FileReader();
    rd.onload = () => {
      if (!this.mounted || this.generation !== generation) return;
      this.openEditor({
        id: "img_" + Date.now(),
        name: (name || "이미지").replace(/\.[^.]+$/, ""),
        photo: rd.result as string,
      });
    };
    rd.onerror = () => {
      if (this.mounted && this.generation === generation) this.flash("이미지를 읽지 못했어요. 다시 업로드해 주세요.");
    };
    rd.readAsDataURL(blob);
  };

  private extractUrlFromDrop(dt: DataTransfer) {
    const uri = dt.getData("text/uri-list") || dt.getData("URL") || dt.getData("text/x-moz-url");
    if (uri) return uri.split("\n")[0].trim();
    const html = dt.getData("text/html");
    if (html) {
      const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (m) return m[1];
    }
    return null;
  }

  // dragging an <img> from another tab only gives us its URL, not bytes — we
  // have to fetch it ourselves, which only succeeds if that host allows
  // cross-origin reads. When it doesn't, guide the user to copy/paste instead.
  private loadUrlToEditor = async (url: string) => {
    this.invalidate();
    const generation = this.generation;
    this.flash("이미지를 불러오는 중…");
    try {
      const res = await fetch(url, { mode: "cors" });
      if (!this.mounted || this.generation !== generation) return;
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      if (!this.mounted || this.generation !== generation) return;
      if (!blob.type.startsWith("image/")) throw new Error("not an image");
      this.blobToEditor(blob, decodeURIComponent(url.split("/").pop() || "이미지"));
    } catch {
      if (!this.mounted || this.generation !== generation) return;
      this.flash("이 사이트의 이미지는 바로 가져올 수 없어요 · 이미지를 복사해 Ctrl/Cmd+V로 붙여넣어보세요");
    }
  };

  private onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!this.state.dropActive) this.setState({ dropActive: true });
  };
  private onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    this.setState({ dropActive: false });
  };
  private onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    this.setState({ dropActive: false });
    const dt = e.dataTransfer;
    if (dt.files && dt.files.length && dt.files[0].type.startsWith("image/")) {
      this.blobToEditor(dt.files[0], dt.files[0].name);
      return;
    }
    const url = this.extractUrlFromDrop(dt);
    if (url) {
      void this.loadUrlToEditor(url);
      return;
    }
    this.flash("이미지를 인식하지 못했어요 · 이미지를 복사해 Ctrl/Cmd+V로 붙여넣어보세요");
  };

  // clipboard paste always carries real decoded image bytes (from an OS-level
  // copy), so this works even for sites that block dragging or embedding.
  private onPaste = (e: ClipboardEvent) => {
    const items = (e.clipboardData && e.clipboardData.items) || [];
    let imgItem: DataTransferItem | null = null;
    for (const it of items as unknown as DataTransferItem[]) {
      if (it.type && it.type.startsWith("image/")) {
        imgItem = it;
        break;
      }
    }
    if (!imgItem) return;
    e.preventDefault();
    const blob = imgItem.getAsFile();
    if (blob) this.blobToEditor(blob, "붙여넣은 이미지");
  };

  // ---------- nav ----------
  private invalidate() {
    this.generation++;
    const request = Symbol();
    this.request = request;
    this.activePointer = null;
    this.cancelScheduled();
    this.brushBuf = [];
    this.engine.invalidatePreparation();
    clearTimeout(this.toastTimer ?? undefined);
    if (this.mounted) this.setState({
      processing: false, manualReady: false, manualError: "", notice: "", engine: "idle",
      dragging: false, brushPts: [], cursorPos: null, engineMsg: "", toast: "",
    }, () => {
      if (this.isCurrent(request)) this.request = null;
    });
  }
  private isCurrent(request: symbol) {
    return this.mounted && this.request === request;
  }
  private goHome = () => {
    this.invalidate();
    this.setState({ view: "home" });
  };
  private goGallery = () => {
    this.invalidate();
    this.setState({ view: "gallery" });
  };
  private openEditor = (sc: EditorImage) => {
    this.invalidate();
    this.setState({
      view: "editor",
      editorImage: sc,
      processed: false,
      processing: false,
      resultSrc: null,
      brushPts: [],
      tool: "auto",
      compareOn: false,
    });
  };

  private onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    this.blobToEditor(f, f.name);
    e.target.value = "";
  };

  // ---------- tools ----------
  // Auto and manual tools refine the current result. Object clicks start fresh
  // from the original so another object can be selected without losing pixels.
  private setTool = (t: Tool) => {
    if (this.request || this.activePointer !== null) return;
    this.invalidate();
    const generation = this.generation;
    this.setState({
      tool: t, compareOn: false,
    }, () => {
      if (!this.mounted || this.generation !== generation) return;
      if (t === "brush") void this.prepareManual();
    });
  };

  private async prepareRaster(request: symbol, photo: string, result: string | null) {
    this.setState({ manualReady: false, manualError: "", engineMsg: "수동 편집 준비 중…" });
    try {
      await this.engine.prepBrush(photo, result);
      if (!this.isCurrent(request)) return;
      this.setState({ manualReady: true, engineMsg: "" });
    } catch (error) {
      if (!this.isCurrent(request)) return;
      this.setState({
        manualReady: false, engineMsg: "",
        manualError: `편집 준비에 실패했어요. ${error instanceof Error ? error.message : "이미지를 다시 확인해 주세요."}`,
      });
    }
  }

  private prepareManual = async () => {
    const sc = this.state.editorImage;
    if (!sc || !this.mounted || this.state.view !== "editor" || this.request || this.activePointer !== null) return;
    const request = Symbol();
    this.request = request;
    this.setState({ processing: true });
    await this.prepareRaster(request, sc.photo, this.state.resultSrc);
    if (!this.isCurrent(request)) return;
    this.setState({ processing: false }, () => {
      if (this.isCurrent(request)) this.request = null;
    });
  };
  private toggleCompare = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (this.request || this.activePointer !== null) return;
    this.cancelScheduled();
    this.setState({ compareOn: !!e.target.checked, cursorPos: null });
  };
  private setBrushAdd = () => {
    if (this.request || this.activePointer !== null || !this.state.manualReady) return;
    this.setState({ brushOp: "add" });
  };
  private setBrushSub = () => {
    if (this.request || this.activePointer !== null || !this.state.manualReady) return;
    this.setState({ brushOp: "sub" });
  };
  private onBrushSize = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (this.request || this.activePointer !== null || !this.state.manualReady) return;
    this.setState({ brushSize: +e.target.value });
  };

  private selectObject = async (pt: Pt) => {
    const sc = this.state.editorImage;
    if (!sc || this.request) return;
    const request = Symbol();
    this.request = request;
    this.setState({ processing: true, notice: "", engineMsg: "객체 선택 모델 불러오는 중…" });
    try {
      const out = await this.engine.clickKeep(sc.photo, pt, (engineMsg) => {
        if (this.isCurrent(request)) this.setState({ engineMsg });
      });
      if (!this.isCurrent(request)) return;
      this.setState({ processed: true, resultSrc: out, compareOn: false });
    } catch (error) {
      if (!this.isCurrent(request)) return;
      this.setState({ notice: `객체를 선택하지 못했어요. ${error instanceof Error ? error.message : "다른 지점을 클릭해 주세요."}` });
    } finally {
      if (this.isCurrent(request)) this.setState({ processing: false, engineMsg: "" }, () => {
        if (this.isCurrent(request)) this.request = null;
      });
    }
  };

  private runRemoval = async () => {
    const sc = this.state.editorImage;
    if (!sc || this.request || this.state.tool !== "auto") return;
    const request = Symbol();
    this.request = request;
    const modelKey = this.props.model || "ormbg";
    const currentSrc = this.state.resultSrc;
    this.setState({ processing: true, notice: "", engine: "loading", engineMsg: "AI 엔진 불러오는 중…" });
    try {
      await this.engine.ensureModel(modelKey, (engineMsg) => {
        if (this.isCurrent(request)) this.setState({ engineMsg });
      });
      if (!this.isCurrent(request)) return;
      this.setState({ engine: "ready", engineMsg: "AI로 배경 분석 중…" });
      const out = await this.engine.rmbgRemove(sc.photo, modelKey, currentSrc);
      if (!this.isCurrent(request)) return;
      this.setState({ processed: true, resultSrc: out, compareOn: false });
    } catch (error) {
      if (!this.isCurrent(request)) return;
      this.setState({
        engine: "error",
        notice: `AI 배경 제거에 실패했어요. 기존 이미지는 변경하지 않았어요. ${error instanceof Error ? error.message : "다시 시도해 주세요."}`,
      });
    } finally {
      if (this.isCurrent(request)) this.setState({ processing: false, engineMsg: "" }, () => {
        if (this.isCurrent(request)) this.request = null;
      });
    }
  };

  // ---------- pointer ----------
  private frac(e: React.PointerEvent): Pt {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  }

  private onDown = (e: React.PointerEvent) => {
    if (this.request || this.activePointer !== null || e.button !== 0) return;
    const t = this.state.tool;
    if (t === "brush" && (!this.state.manualReady || this.state.compareOn)) return;
    if (t === "brush") this.activePointer = e.pointerId;
    const [fx, fy] = this.frac(e);
    if (t === "brush") {
      // draw first dot immediately for instant feedback; the overlay canvas is
      // repainted cheaply (no per-move PNG encoding).
      this.brushBuf = [[fx, fy]];
      this.engine.paintBrushDot([fx, fy], this.state.brushSize, this.state.brushOp, null);
      this.paintOverlay();
      this.setState({ dragging: true, brushPts: [[fx, fy]] });
    } else if (t === "click") {
      if (!this.state.resultSrc || this.state.compareOn) void this.selectObject([fx, fy]);
    }
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // pointer capture is best-effort
    }
  };

  private onMove = (e: React.PointerEvent) => {
    if (this.request || !this.state.manualReady || this.state.compareOn) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const px = e.clientX - r.left,
      py = e.clientY - r.top;
    const t = this.state.tool;
    if (t === "brush" && this.activePointer === null) {
      this.scheduleState({ cursorPos: [px, py] });
      return;
    }
    if (this.activePointer !== e.pointerId) return;
    const [fx, fy] = this.frac(e);
    if (t === "brush") {
      const p: Pt = [fx, fy];
      const last = this.brushBuf[this.brushBuf.length - 1] ?? null;
      if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.004) {
        this.brushBuf.push(p);
        // draw the dot straight onto the engine's selection canvas and repaint
        // the overlay right away, so painting feels immediate even though the
        // React re-render (brushPts/cursor) is coalesced to one per frame.
        this.engine.paintBrushDot(p, this.state.brushSize, this.state.brushOp, last);
        this.paintOverlay();
        this.scheduleState({ brushPts: this.brushBuf.slice(), cursorPos: [px, py] });
      } else {
        this.scheduleState({ cursorPos: [px, py] });
      }
    }
  };

  private onUp = (e: React.PointerEvent) => {
    if (this.activePointer !== e.pointerId) return;
    const pt = this.frac(e);
    if (this.state.tool === "brush") this.brushBuf.push(pt);
    this.activePointer = null;
    this.cancelScheduled();
    void this.commitStroke();
  };

  private onCancel = (e: React.PointerEvent) => {
    if (this.activePointer !== e.pointerId) return;
    this.activePointer = null;
    this.cancelScheduled();
    this.brushBuf = [];
    this.setState({ dragging: false, brushPts: [], cursorPos: null });
    // Rebuild the preview from committed pixels, discarding any painted dots.
    void this.prepareManual();
  };

  private async commitStroke() {
    const { editorImage: sc, brushOp, brushSize, resultSrc } = this.state;
    const pts = this.brushBuf;
    this.brushBuf = [];
    this.setState({ dragging: false, brushPts: [], cursorPos: null });
    if (!sc || this.request || !this.state.manualReady || !this.engine.work) return;
    if (pts.length < 1) return;
    const request = Symbol();
    this.request = request;
    this.setState({ processing: true, manualReady: false, notice: "", engineMsg: "영역을 처리하는 중…" });
    try {
      const mask = this.engine.brushMask(pts, brushSize);
      const out = await this.engine.brushApplyRun(resultSrc || sc.photo, mask, brushOp);
      if (!this.isCurrent(request)) return;
      this.setState({
        processed: true, resultSrc: out, compareOn: false,
      });
      await this.prepareRaster(request, sc.photo, out);
    } catch (error) {
      if (!this.isCurrent(request)) return;
      this.setState({
        notice: `${error instanceof Error ? error.message : "영역을 처리하지 못했어요."} 기존 이미지는 변경하지 않았어요. 다시 시도해 주세요.`,
      });
      await this.prepareRaster(request, sc.photo, resultSrc);
    } finally {
      if (this.isCurrent(request)) this.setState({ processing: false, engineMsg: "" }, () => {
        if (this.isCurrent(request)) this.request = null;
      });
    }
  }

  // ---------- gallery / save ----------
  private flash = (m: string) => {
    if (!this.mounted) return;
    this.setState({ toast: m });
    clearTimeout(this.toastTimer ?? undefined);
    this.toastTimer = setTimeout(() => this.setState({ toast: "" }), 2200);
  };
  private saveCurrent = async () => {
    if (!this.state.resultSrc) return;
    const sc = this.state.editorImage!;
    const item: SavedItem = {
      id: "g_" + Date.now(),
      name: sc.name || "누끼 이미지",
      src: this.state.resultSrc,
      photo: sc.photo,
      fav: false,
      folder: "",
      ts: Date.now(),
    };
    const storage = this.props.storage;
    if (storage) {
      try {
        this.flash("저장 중…");
        const saved = await storage.save(item);
        this.setState((s) => ({
          saved: [saved, ...s.saved.filter((i) => i.id !== saved.id)],
        }));
        this.flash("보관함에 저장했어요");
      } catch {
        this.flash("저장에 실패했어요");
      }
      return;
    }
    this.setState((s) => ({ saved: [item, ...s.saved] }));
    this.flash("보관함에 저장했어요");
  };
  /**
   * Reliable PNG download for data URLs *and* server paths.
   * A plain `<a download href="/api/uploads/...">` often fails (no Content-Disposition,
   * proxy/CORS, or the browser ignores `download` for non-same-origin absolute URLs).
   * Fetch → Blob → object URL works consistently.
   */
  private download = async (item: { src: string; name: string }) => {
    if (!item.src) {
      this.flash("다운로드할 이미지가 없어요");
      return;
    }
    const baseName = (item.name || "cutout")
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[\\/:*?"<>|]+/g, "_")
      .trim() || "cutout";
    const filename = `${baseName}.png`;
    let objectUrl: string | null = null;
    try {
      let href = item.src;
      if (!item.src.startsWith("data:") && !item.src.startsWith("blob:")) {
        const res = await fetch(item.src, { credentials: "include" });
        if (!res.ok) throw new Error(`download fetch failed: ${res.status}`);
        const blob = await res.blob();
        // Force PNG download name even if server served jpeg/webp.
        objectUrl = URL.createObjectURL(blob);
        href = objectUrl;
      }
      const a = document.createElement("a");
      a.href = href;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      this.flash("PNG를 다운로드했어요");
    } catch {
      // Last resort: open in a new tab so the user can still save manually.
      try {
        window.open(item.src, "_blank", "noopener,noreferrer");
        this.flash("새 탭에서 열어 저장해 주세요");
      } catch {
        this.flash("다운로드에 실패했어요");
      }
    } finally {
      if (objectUrl) {
        // Delay revoke so the browser has time to start the download.
        setTimeout(() => URL.revokeObjectURL(objectUrl!), 2000);
      }
    }
  };
  private downloadCurrent = () => {
    if (!this.state.resultSrc) return;
    void this.download({
      src: this.state.resultSrc,
      name: (this.state.editorImage && this.state.editorImage.name) || "cutout",
    });
  };
  private toggleFav = async (id: string) => {
    const cur = this.state.saved.find((i) => i.id === id);
    if (!cur) return;
    const nextFav = !cur.fav;
    this.setState((s) => ({
      saved: s.saved.map((i) => (i.id === id ? { ...i, fav: nextFav } : i)),
    }));
    const storage = this.props.storage;
    if (storage) {
      try {
        await storage.update(id, { fav: nextFav });
      } catch {
        this.setState((s) => ({
          saved: s.saved.map((i) => (i.id === id ? { ...i, fav: cur.fav } : i)),
        }));
        this.flash("즐겨찾기 변경에 실패했어요");
      }
    }
  };
  private deleteItem = async (id: string) => {
    const prev = this.state.saved;
    this.setState((s) => ({ saved: s.saved.filter((i) => i.id !== id) }));
    const storage = this.props.storage;
    if (storage) {
      try {
        await storage.remove(id);
        this.flash("삭제했어요");
      } catch {
        this.setState({ saved: prev });
        this.flash("삭제에 실패했어요");
      }
    }
  };
  /**
   * Re-open a gallery item for further editing.
   * - `photo` = original (for color sampling / compare). Falls back to cutout.
   * - `resultSrc` = saved cutout so the canvas starts on the processed image, not the raw original.
   */
  private reeditItem = (it: SavedItem) => {
    this.invalidate();
    const original = it.photo || it.src;
    const cutout = it.src || it.photo;
    this.setState({
      view: "editor",
      editorImage: { id: it.id, name: it.name, photo: original },
      processed: !!cutout,
      processing: false,
      resultSrc: cutout || null,
      brushPts: [],
      tool: "auto",
      compareOn: false,
    });
  };
  private filterSaved() {
    const { saved, filter } = this.state;
    if (filter === "fav") return saved.filter((i) => i.fav);
    return saved;
  }

  render() {
    const accent = this.props.accent || "#000";
    return (
      <div className="rbg-root pdf-editor-root" style={{ ["--accent" as string]: accent } as CSSProperties}>
        <style>{GLOBAL_CSS}</style>
        <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", overflow: "hidden", background: "var(--rbg-surface,#fff)" }}>
          {this.renderTopbar()}
          <div style={{ flex: 1, minWidth: 0, minHeight: 0, position: "relative", display: "flex", flexDirection: "column", background: "var(--rbg-surface,#fff)" }}>
            {this.state.view === "home" && this.renderHome()}
            {this.state.view === "editor" && this.renderEditor()}
            {this.state.view === "gallery" && this.renderGallery()}
            {this.state.toast && this.renderToast()}
          </div>
        </div>
      </div>
    );
  }

  private renderTopbar() {
    const s = this.state;
    return (
      <div
        style={{
          height: 60,
          flex: "none",
          background: "var(--rbg-surface,#fff)",
          borderBottom: "1px solid var(--rbg-border-soft,#f0f0f0)",
          display: "flex",
          alignItems: "center",
          padding: "0 28px",
        }}
      >
        {/* 워드마크(타이틀) — 클릭하면 홈으로 */}
        <button
          className="rbg-brand"
          onClick={this.goHome}
          title={this.props.appName}
          style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-.6px", color: "var(--rbg-text,#17171a)", marginRight: 46, padding: 0, background: "none", transition: "opacity .12s" }}
        >
          {this.props.appName}
        </button>

        {/* 상단 텍스트 내비게이션 — 선택: 진하게(볼드) / 호버: 진하게 */}
        <nav style={{ display: "flex", alignItems: "center", gap: 34 }}>
          <button
            className={s.view === "home" ? "rbg-navlink rbg-navlink-active" : "rbg-navlink"}
            onClick={this.goHome}
          >
            홈
          </button>
          <button
            className={s.view === "gallery" ? "rbg-navlink rbg-navlink-active" : "rbg-navlink"}
            onClick={this.goGallery}
          >
            보관함
            {s.saved.length > 0 && <span className="rbg-navcount">{s.saved.length}</span>}
          </button>
        </nav>
      </div>
    );
  }

  private renderHome() {
    const s = this.state;
    const scenes = getQuickScenes();
    const recent = s.saved.slice(0, 4);
    const modelBadge = (MODEL_LABELS[this.props.model || "ormbg"] || "BiRefNet lite").toUpperCase();
    return (
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 940, margin: "0 auto", padding: "48px 40px 80px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "5px 11px",
              border: "1px solid var(--rbg-border,#ececec)",
              borderRadius: 999,
              fontSize: 11.5,
              color: "var(--rbg-text-subtle,#7a7a82)",
              marginBottom: 22,
              fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace",
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)" }}></span>
            {modelBadge} · AI BACKGROUND REMOVER
          </div>
          <h1 style={{ fontSize: 40, lineHeight: 1.12, fontWeight: 800, letterSpacing: "-1.4px", margin: "0 0 12px" }}>
            이미지를 올리면,
            <br />
            배경은 자동으로 지워집니다.
          </h1>
          <p style={{ fontSize: 16, color: "var(--rbg-text-muted,#6b6b72)", margin: "0 0 34px", maxWidth: 520, lineHeight: 1.55 }}>
            사진을 첨부하거나 복사한 이미지를 붙여넣으세요. <b style={{ color: "var(--rbg-text,#17171a)", fontWeight: 600 }}>AI</b>가 피사체를 인식해{" "}
            <b style={{ color: "var(--rbg-text,#17171a)", fontWeight: 600 }}>투명 PNG</b>로 오려 드립니다.
          </p>

          <label
            htmlFor="rbg-file-input"
            onDragOver={this.onDragOver}
            onDragLeave={this.onDragLeave}
            onDrop={this.onDrop}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 14,
              padding: "48px 24px",
              borderRadius: 18,
              cursor: "pointer",
              transition: ".15s",
              marginBottom: 44,
              border: s.dropActive ? "1.5px solid var(--accent)" : "1.5px dashed var(--rbg-border-strong,#d7d7dd)",
              background: s.dropActive ? "color-mix(in srgb, var(--accent) 7%, var(--rbg-surface,#fff))" : "var(--rbg-panel,#fcfcfd)",
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                background: "var(--accent)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 15V4"></path>
                <path d="m7.5 8.5 4.5-4.5 4.5 4.5"></path>
                <path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"></path>
              </svg>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 15.5, fontWeight: 700, marginBottom: 4 }}>{s.dropActive ? "여기에 놓으세요" : "이미지 첨부하기"}</div>
              <div style={{ fontSize: 12.5, color: "var(--rbg-text-subtle,#9a9aa2)", lineHeight: 1.5 }}>
                클릭해서 업로드 · 웹 이미지를 드래그하거나
                <br />
                복사한 이미지는 어디서나 <b style={{ color: "var(--rbg-text-muted,#6b6b72)" }}>Ctrl/Cmd+V</b>로 붙여넣기
              </div>
            </div>
            <input id="rbg-file-input" type="file" accept="image/*" onChange={this.onUpload} style={{ display: "none" }} />
          </label>



          {s.saved.length > 0 && (
            <div style={{ marginTop: 44 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, letterSpacing: "-.3px" }}>최근 작업</h2>
                <button onClick={this.goGallery} style={{ fontSize: 12.5, color: "var(--accent)", fontWeight: 600 }}>
                  보관함 전체 보기 →
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
                {recent.map((it) => (
                  <button
                    key={it.id}
                    className="rbg-recent-card"
                    onClick={() => this.reeditItem(it)}
                    style={{
                      aspectRatio: "1",
                      borderRadius: 14,
                      border: "1px solid var(--rbg-border,#ececec)",
                      overflow: "hidden",
                      padding: 0,
                      backgroundColor: "var(--rbg-surface,#fff)",
                      backgroundImage: "conic-gradient(var(--rbg-border,#eef0f3) 25%,transparent 0 50%,var(--rbg-border,#eef0f3) 0 75%,transparent 0)",
                      backgroundSize: "18px 18px",
                      transition: ".15s",
                    }}
                  >
                    <img src={it.src} alt={it.name} style={{ width: "100%", height: "100%", objectFit: "contain", padding: 14, display: "block" }} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  private renderEditor() {
    const s = this.state;
    const tool = s.tool;
    const manual = tool === "brush";
    const manualDisabled = !s.manualReady || s.processing || s.dragging;
    const overlayActive = !!s.editorImage && !s.processing && ((manual && s.manualReady && !s.compareOn) || (tool === "click" && (!s.resultSrc || s.compareOn)));
    const showingResult = s.processed && (manual ? s.compareOn : !s.compareOn);
    const stageSrc = showingResult && s.resultSrc ? s.resultSrc : s.editorImage ? s.editorImage.photo : "";
    const primaryEnabled = tool === "auto" && !s.processing;
    const primaryLabel = s.engine === "error" ? "AI 배경 제거 다시 시도" : "AI로 배경 제거";
    const primaryHint = "AI가 원본을 분석해 현재 결과의 배경을 더 지워요";

    const toolStyle = (on: boolean): CSSProperties => ({
      width: "100%",
      display: "flex",
      alignItems: "center",
      gap: 11,
      padding: 9,
      borderRadius: 12,
      marginBottom: 6,
      transition: ".12s",
      border: "1px solid " + (on ? "color-mix(in srgb, var(--accent) 40%, var(--rbg-surface,#fff))" : "transparent"),
      background: on ? "color-mix(in srgb, var(--accent) 7%, var(--rbg-surface,#fff))" : "transparent",
    });
    const icoBg = (on: boolean) => (on ? "var(--accent)" : "var(--rbg-surface-soft,#f0f0f2)");
    const icoFg = (on: boolean) => (on ? "#fff" : "var(--rbg-text-subtle,#9a9aa2)");
    const segStyle = (on: boolean): CSSProperties => ({
      flex: 1,
      height: 32,
      borderRadius: 8,
      fontSize: 12,
      fontWeight: 600,
      transition: ".12s",
      border: "1px solid " + (on ? "var(--accent)" : "var(--rbg-border,#e6e6ea)"),
      background: on ? "var(--accent)" : "var(--rbg-surface-soft,#f7f7f8)",
      color: on ? "#fff" : "var(--rbg-text-muted,#6b6b72)",
    });
    const primaryStyle: CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      height: 46,
      padding: "0 22px",
      borderRadius: 12,
      fontSize: 14.5,
      fontWeight: 700,
      transition: ".12s",
      background: primaryEnabled ? "var(--pdfe-button-bg,var(--accent))" : "var(--rbg-border,#ececed)",
      color: primaryEnabled ? "var(--pdfe-button-color,#fff)" : "var(--rbg-text-faint,#b0b0b8)",
      cursor: primaryEnabled ? "pointer" : "not-allowed",
      boxShadow: primaryEnabled ? "0 6px 18px color-mix(in srgb, var(--accent) 34%, transparent)" : undefined,
    };
    const dlOn = s.processed;
    const dlBtnStyle: CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      height: 38,
      padding: "0 14px",
      borderRadius: 10,
      fontSize: 13,
      fontWeight: 700,
      transition: ".12s",
      background: dlOn ? "var(--pdfe-button-bg,var(--accent))" : "var(--rbg-surface-soft,#f2f2f3)",
      color: dlOn ? "var(--pdfe-button-color,#fff)" : "var(--rbg-text-faint,#c0c0c6)",
      cursor: dlOn ? "pointer" : "not-allowed",
    };
    const saveBtnStyle: CSSProperties = {
      height: 38,
      padding: "0 14px",
      borderRadius: 10,
      fontSize: 13,
      fontWeight: 600,
      transition: ".12s",
      border: "1px solid var(--pdfe-button-border,var(--rbg-border,#e2e2e6))",
      color: dlOn ? "var(--pdfe-button-color,var(--rbg-text,#17171a))" : "var(--rbg-text-faint,#c0c0c6)",
      cursor: dlOn ? "pointer" : "not-allowed",
    };
    const engineMap: Record<EngineStatus, [string, string]> = {
      idle: ["준비 대기", "var(--rbg-text-faint,#c0c0c6)"],
      loading: [s.engineMsg || "불러오는 중", "#f59e0b"],
      ready: ["준비됨", "#16a34a"],
      error: ["AI 처리 실패", "#e0553d"],
    };
    const eng = engineMap[s.engine] || engineMap.idle;
    const modelLabel = MODEL_LABELS[this.props.model || "ormbg"] || "BiRefNet lite";
    const stageCursor = tool === "click" ? "pointer" : tool === "brush" ? "none" : "default";
    const showSelMask = manual && s.manualReady && !s.processing && !s.compareOn;
    const showClickHint = tool === "click" && !s.processing && (!s.resultSrc || s.compareOn);
    const showDone = s.processed && !s.processing && !s.notice && !s.manualError && showingResult;
    const showPrimary = !!s.editorImage && tool === "auto";
    const processMsg = s.engineMsg || (tool === "click" ? "클릭한 객체를 분석하는 중…" : tool === "auto" ? "AI로 배경 분석 중…" : "영역을 처리하는 중…");
    const processSub = tool === "click" ? "처음 사용할 때 객체 선택 모델을 내려받아요" : s.engine === "loading" ? "최초 1회만 모델을 내려받아요 · 수십 초 소요될 수 있어요" : "";

    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ height: 60, flex: "none", borderBottom: "1px solid var(--rbg-border-soft,#ededed)", display: "flex", alignItems: "center", gap: 14, padding: "0 22px" }}>
          <button
            className="rbg-topbar-back"
            onClick={this.goHome}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, fontWeight: 600, color: "var(--pdfe-button-color,var(--rbg-text-muted,#6b6b72))", padding: "7px 10px", borderRadius: 9 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6"></path>
            </svg>
            새 이미지
          </button>
          <div style={{ width: 1, height: 22, background: "var(--rbg-border-soft,#ededed)" }}></div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--rbg-text,#17171a)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 260 }}>
            {s.editorImage ? s.editorImage.name : ""}
          </div>
          <div style={{ flex: 1 }}></div>
          <span style={{ fontSize: 12, color: "var(--rbg-text-faint,#b0b0b8)" }}>Ctrl/Cmd+V로 새 이미지 붙여넣기</span>
          <button className="rbg-dl-btn" onClick={this.downloadCurrent} style={dlBtnStyle}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 4v11"></path>
              <path d="m7.5 10.5 4.5 4.5 4.5-4.5"></path>
              <path d="M5 20h14"></path>
            </svg>
            PNG 다운로드
          </button>
          <button className="rbg-save-btn" onClick={this.saveCurrent} style={saveBtnStyle}>
            보관함에 저장
          </button>
        </div>

        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          <div style={{ width: 222, flex: "none", borderRight: "1px solid var(--rbg-border-soft,#ededed)", padding: "18px 16px", overflowY: "auto", background: "var(--rbg-panel,#fcfcfd)", position: "relative" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--rbg-text-subtle,#a2a2aa)", letterSpacing: ".4px", margin: "2px 4px 12px", fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace" }}>
              선택 도구
            </div>

            <button disabled={s.processing || s.dragging} onClick={() => this.setTool("auto")} style={toolStyle(tool === "auto")}>
              <span
                style={{
                  width: 34,
                  height: 34,
                  flex: "none",
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: icoBg(tool === "auto"),
                  color: icoFg(tool === "auto"),
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3l1.6 4.9L18.5 9.5 13.6 11 12 16l-1.6-5L5.5 9.5l4.9-1.6z"></path>
                  <path d="M18 15l.7 2.1L21 18l-2.3.9L18 21l-.7-2.1L15 18l2.3-.9z"></path>
                </svg>
              </span>
              <span style={{ textAlign: "left" }}>
                <span style={{ display: "block", fontSize: 13.5, fontWeight: 700 }}>AI 자동 제거</span>
                <span style={{ display: "block", fontSize: 11.5, color: "var(--rbg-text-subtle,#9a9aa2)", marginTop: 1 }}>AI가 피사체를 인식</span>
              </span>
            </button>

            {tool === "auto" && (
              <div style={{ display: "flex", alignItems: "center", gap: 7, margin: "0 2px 8px", padding: "7px 10px", borderRadius: 9, background: "var(--rbg-surface-soft,#f5f5f7)", fontSize: 11, color: "var(--rbg-text-subtle,#7a7a82)" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: eng[1], boxShadow: `0 0 0 3px color-mix(in srgb, ${eng[1]} 18%, transparent)` }}></span>
                <span style={{ fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace", fontWeight: 600, color: "var(--rbg-text-muted,#4a4a52)" }}>{modelLabel}</span>
                <span style={{ color: "var(--rbg-text-faint,#c0c0c6)" }}>·</span>
                <span>{eng[0]}</span>
              </div>
            )}

            <button disabled={s.processing || s.dragging} onClick={() => this.setTool("click")} style={toolStyle(tool === "click")}>
              <span
                style={{
                  width: 34,
                  height: 34,
                  flex: "none",
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: icoBg(tool === "click"),
                  color: icoFg(tool === "click"),
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 3v15l3.8-3.8L11.5 21l2.3-1-2.6-6.2H16z"></path>
                </svg>
              </span>
              <span style={{ textAlign: "left" }}>
                <span style={{ display: "block", fontSize: 13.5, fontWeight: 700 }}>객체 선택</span>
                <span style={{ display: "block", fontSize: 11.5, color: "var(--rbg-text-subtle,#9a9aa2)", marginTop: 1 }}>남길 객체를 클릭해 선택</span>
              </span>
            </button>

            <button disabled={s.processing || s.dragging} onClick={() => this.setTool("brush")} style={toolStyle(tool === "brush")}>
              <span
                style={{
                  width: 34,
                  height: 34,
                  flex: "none",
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: icoBg(tool === "brush"),
                  color: icoFg(tool === "brush"),
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"></path>
                  <path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"></path>
                </svg>
              </span>
              <span style={{ textAlign: "left" }}>
                <span style={{ display: "block", fontSize: 13.5, fontWeight: 700 }}>브러시</span>
                <span style={{ display: "block", fontSize: 11.5, color: "var(--rbg-text-subtle,#9a9aa2)", marginTop: 1 }}>칠해서 영역 추가·제거</span>
              </span>
            </button>

            {tool === "brush" && (
              <div style={{ marginTop: 8, padding: 13, border: "1px solid var(--rbg-border,#ececec)", borderRadius: 12, background: "var(--rbg-surface,#fff)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--rbg-text-subtle,#a2a2aa)", marginBottom: 9, fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace" }}>브러시 설정</div>
                <div style={{ display: "flex", gap: 5, marginBottom: 11 }}>
                  <button disabled={manualDisabled} onClick={this.setBrushAdd} style={segStyle(s.brushOp === "add")}>
                    추가 +
                  </button>
                  <button disabled={manualDisabled} onClick={this.setBrushSub} style={segStyle(s.brushOp === "sub")}>
                    제거 −
                  </button>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 9 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--rbg-text-muted,#4a4a52)" }}>브러시 크기</span>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--accent)", fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace" }}>{s.brushSize}px</span>
                </div>
                <input disabled={manualDisabled} type="range" min={10} max={80} step={5} value={s.brushSize} onChange={this.onBrushSize} style={{ width: "100%", accentColor: "var(--accent)" }} />
                <div style={{ fontSize: 11, color: "var(--rbg-text-subtle,#a2a2aa)", marginTop: 9, lineHeight: 1.5 }}>
                  {s.brushOp === "add" ? "원본에서 칠한 영역을 복원해요. 크기를 조절해가며 칠해보세요." : "원본에서 칠한 영역을 결과에서 지워요. 크기를 조절해가며 칠해보세요."}
                </div>
              </div>
            )}

            {tool === "click" && (
              <div style={{ marginTop: 12, padding: 14, border: "1px solid var(--rbg-border,#ececec)", borderRadius: 12, background: "var(--rbg-surface,#fff)" }}>
                <div style={{ fontSize: 12, color: "var(--rbg-text-muted,#4a4a52)", lineHeight: 1.6 }}>SAM으로 남길 객체를 클릭하세요. 다른 객체는 원본과 비교를 켠 뒤 클릭하면 새로 선택돼요. 같은 이미지의 반복 선택은 캐시를 사용해요. 결과는 브러시로 다듬을 수 있어요.</div>
              </div>
            )}

            {manual && (
              <div style={{ marginTop: 12, fontSize: 12, color: "var(--rbg-text-muted,#6b6b72)", lineHeight: 1.6 }} role="status">
                {s.manualError || (s.processing ? "편집 준비·처리 중에는 그릴 수 없어요." : s.compareOn ? "결과 미리보기 중에는 그릴 수 없어요. 미리보기를 끄면 원본에서 계속 편집할 수 있어요." : s.manualReady ? "원본 위에 그리면 결과에 적용돼요. 결과 미리보기로 확인하세요." : "수동 편집 준비가 필요해요.")}
                {!s.processing && !s.manualReady && (
                  <button className="rbg-reset-sel" onClick={this.prepareManual} style={{ marginTop: 8, padding: "7px 12px", border: "1px solid var(--rbg-border)" }}>편집 준비 다시 시도</button>
                )}
              </div>
            )}
            {s.notice && <div role="alert" style={{ marginTop: 12, fontSize: 12, color: "var(--rbg-danger)", lineHeight: 1.6 }}>{s.notice}</div>}
          </div>

          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: "var(--rbg-canvas,#f6f6f7)" }}>
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 32, minHeight: 0, position: "relative" }}>
              <div
                style={{
                  position: "relative",
                  display: "inline-flex",
                  maxWidth: "100%",
                  maxHeight: "100%",
                  borderRadius: 12,
                  overflow: "hidden",
                  boxShadow: "0 12px 40px rgba(0,0,0,.10)",
                  backgroundColor: "var(--rbg-surface,#fff)",
                  backgroundImage: "conic-gradient(var(--rbg-border,#eaecf0) 25%,transparent 0 50%,var(--rbg-border,#eaecf0) 0 75%,transparent 0)",
                  backgroundSize: "22px 22px",
                }}
              >
                <img src={stageSrc} alt="edit" style={{ display: "block", maxWidth: "min(660px,60vw)", maxHeight: "56vh", objectFit: "contain", userSelect: "none", WebkitUserDrag: "none" } as CSSProperties} />

                {showSelMask && (
                  <canvas
                    ref={this.overlayRef}
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", mixBlendMode: "multiply", opacity: 0.42 }}
                  />
                )}

                <div
                  onPointerDown={this.onDown}
                  onPointerMove={this.onMove}
                  onPointerUp={this.onUp}
                  onPointerCancel={this.onCancel}
                  onLostPointerCapture={this.onCancel}
                  style={{ position: "absolute", inset: 0, cursor: stageCursor, touchAction: "none", pointerEvents: overlayActive ? "auto" : "none" }}
                >
                  {tool === "brush" && overlayActive && !!s.cursorPos && this.engine.work && (
                    <div
                      style={{
                        position: "absolute",
                        left: s.cursorPos[0],
                        top: s.cursorPos[1],
                        width: `${s.brushSize / this.engine.work.W * 100}%`,
                        height: `${s.brushSize / this.engine.work.H * 100}%`,
                        transform: "translate(-50%, -50%)",
                        border: "1.5px solid var(--accent)",
                        borderRadius: "50%",
                        pointerEvents: "none",
                        boxShadow: "0 0 0 1px rgba(255,255,255,.6),inset 0 0 0 1px rgba(255,255,255,.4)",
                        background: "color-mix(in srgb, var(--accent) 8%, transparent)",
                        transition: "width .1s,height .1s",
                      }}
                    ></div>
                  )}
                </div>

                {showClickHint && (
                  <div
                    style={{
                      position: "absolute",
                      left: "50%",
                      bottom: 16,
                      transform: "translateX(-50%)",
                      background: "rgba(23,23,26,.86)",
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 500,
                      padding: "8px 14px",
                      borderRadius: 999,
                      pointerEvents: "none",
                      whiteSpace: "nowrap",
                      backdropFilter: "blur(4px)",
                    }}
                  >
                    원본에서 남길 객체를 클릭하세요
                  </div>
                )}

                {s.processing && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "rgba(255,255,255,.78)",
                      backdropFilter: "blur(3px)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 12,
                      padding: 24,
                      textAlign: "center",
                    }}
                  >
                    <div style={{ width: 38, height: 38, border: "3px solid var(--rbg-border,#e4e4e8)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "rbg-spin .7s linear infinite" }}></div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--rbg-text-muted,#4a4a52)" }}>{processMsg}</div>
                    {processSub && <div style={{ fontSize: 11, color: "var(--rbg-text-subtle,#9a9aa2)", maxWidth: 240, lineHeight: 1.4 }}>{processSub}</div>}
                  </div>
                )}
              </div>

              {showDone && (
                <div
                  style={{
                    position: "absolute",
                    top: 9,
                    left: 7,
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    background: "rgba(23,23,26,.82)",
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "5px 10px",
                    borderRadius: 999,
                    animation: "rbg-pop .3s ease",
                    fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace",
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                  편집 결과
                </div>
              )}
            </div>

            <div style={{ flex: "none", borderTop: "1px solid var(--rbg-border,#e6e6ea)", background: "var(--rbg-surface,#fff)", padding: "16px 24px", display: "flex", alignItems: "center", gap: 14, minHeight: 74 }}>
              {showPrimary && (
                <>
                  <button className="rbg-primary-btn" onClick={this.runRemoval} disabled={!primaryEnabled} style={primaryStyle}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3l1.6 4.9L18.5 9.5 13.6 11 12 16l-1.6-5L5.5 9.5l4.9-1.6z"></path>
                    </svg>
                    {primaryLabel}
                  </button>
                  <span style={{ fontSize: 12.5, color: "var(--rbg-text-subtle,#9a9aa2)" }}>{primaryHint}</span>
                </>
              )}

              {s.processed && (
                <>
                  <button
                    className="rbg-dl-btn"
                    onClick={this.downloadCurrent}
                    style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 44, padding: "0 20px", borderRadius: 11, background: "var(--pdfe-button-bg,var(--accent))", color: "var(--pdfe-button-color,#fff)", fontSize: 14, fontWeight: 700 }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 4v11"></path>
                      <path d="m7.5 10.5 4.5 4.5 4.5-4.5"></path>
                      <path d="M5 20h14"></path>
                    </svg>
                    PNG 다운로드
                  </button>
                  <button
                    className="rbg-save-btn"
                    onClick={this.saveCurrent}
                    style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 44, padding: "0 18px", borderRadius: 11, border: "1px solid var(--pdfe-button-border,var(--rbg-border,#e2e2e6))", fontSize: 14, fontWeight: 600, color: "var(--pdfe-button-color,var(--rbg-text,#17171a))" }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="5" y="4" width="14" height="16" rx="2"></rect>
                      <path d="M9 4v6l3-2 3 2V4"></path>
                    </svg>
                    보관함에 저장
                  </button>
                  <div style={{ width: 1, height: 26, background: "var(--rbg-border-soft,#ededed)" }}></div>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: "var(--rbg-text-muted,#6b6b72)", cursor: "pointer", userSelect: "none" }}>
                    <input disabled={s.processing || s.dragging} type="checkbox" checked={s.compareOn} onChange={this.toggleCompare} style={{ accentColor: "var(--accent)", width: 15, height: 15 }} />
                    {manual ? "결과 미리보기" : "원본과 비교"}
                  </label>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  private renderGallery() {
    const s = this.state;
    const filtered = this.filterSaved();
    const tabDefs = [
      { k: "all", label: "전체", count: s.saved.length },
      { k: "fav", label: "즐겨찾기", count: s.saved.filter((i) => i.fav).length },
    ];
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ height: 60, flex: "none", borderBottom: "1px solid var(--rbg-border-soft,#ededed)", display: "flex", alignItems: "center", gap: 12, padding: "0 24px" }}>
          <span style={{ fontSize: 12, color: "var(--rbg-text-subtle,#a2a2aa)", fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace" }}>{s.saved.length} ITEMS</span>
          <div style={{ flex: 1 }}></div>
          <button
            className="rbg-gallery-new-btn"
            onClick={this.goHome}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 38, padding: "0 15px", borderRadius: 10, background: "var(--pdfe-button-bg,var(--accent))", color: "var(--pdfe-button-color,#fff)", fontSize: 13, fontWeight: 700 }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14"></path>
            </svg>
            새 이미지
          </button>
        </div>

        <div style={{ padding: "18px 24px 10px", flex: "none", display: "flex", gap: 8, flexWrap: "wrap", borderBottom: "1px solid var(--rbg-surface-soft,#f2f2f2)" }}>
          {tabDefs.map((t) => (
            <button
              key={t.k}
              onClick={() => this.setState({ filter: t.k })}
              style={{
                height: 34,
                padding: "0 14px",
                borderRadius: 9,
                fontSize: 13,
                fontWeight: 600,
                transition: ".12s",
                background: s.filter === t.k ? "var(--rbg-text,#17171a)" : "var(--rbg-surface-soft,#f4f4f5)",
                color: s.filter === t.k ? "#fff" : "var(--rbg-text-muted,#6b6b72)",
              }}
            >
              {t.label}
              <span style={{ opacity: 0.6, marginLeft: 6, fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace", fontSize: 11 }}>{t.count}</span>
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "22px 24px 40px" }}>
          {filtered.length === 0 && (
            <div style={{ height: "100%", minHeight: 340, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, color: "var(--rbg-text-faint,#b0b0b8)" }}>
              <div style={{ width: 64, height: 64, borderRadius: 18, background: "var(--rbg-surface-soft,#f4f4f5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="4" width="7" height="7" rx="1.5"></rect>
                  <rect x="13" y="4" width="7" height="7" rx="1.5"></rect>
                  <rect x="4" y="13" width="7" height="7" rx="1.5"></rect>
                  <rect x="13" y="13" width="7" height="7" rx="1.5"></rect>
                </svg>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--rbg-text-subtle,#8a8a92)" }}>아직 저장된 항목이 없어요</div>
              <button onClick={this.goHome} style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>
                이미지 오리러 가기 →
              </button>
            </div>
          )}

          {filtered.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))", gap: 16 }}>
              {filtered.map((it) => (
                <div key={it.id} className="rbg-gallery-card" style={{ border: "1px solid var(--rbg-border,#ececec)", borderRadius: 16, overflow: "hidden", background: "var(--rbg-surface,#fff)", animation: "rbg-pop .3s ease both", transition: ".15s" }}>
                  <div
                    style={{
                      position: "relative",
                      aspectRatio: "1",
                      backgroundColor: "var(--rbg-surface,#fff)",
                      backgroundImage: "conic-gradient(var(--rbg-border,#eef0f3) 25%,transparent 0 50%,var(--rbg-border,#eef0f3) 0 75%,transparent 0)",
                      backgroundSize: "18px 18px",
                    }}
                  >
                    <img src={it.src} alt={it.name} style={{ width: "100%", height: "100%", objectFit: "contain", padding: 20, display: "block" }} />
                    <button
                      className="rbg-icon-btn"
                      onClick={() => this.toggleFav(it.id)}
                      title="즐겨찾기"
                      style={{
                        position: "absolute",
                        top: 9,
                        right: 9,
                        width: 30,
                        height: 30,
                        borderRadius: 9,
                        background: "var(--pdfe-button-bg,rgba(255,255,255,.9))",
                        backdropFilter: "blur(4px)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 1px 4px rgba(0,0,0,.1)",
                        color: it.fav ? "var(--accent)" : "var(--pdfe-button-color,var(--rbg-text-faint,#b0b0b8))",
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill={it.fav ? "var(--accent)" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"></path>
                      </svg>
                    </button>
                  </div>
                  <div style={{ padding: "11px 12px 12px" }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.name}</div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginTop: 8 }}>
                      <div style={{ display: "flex", gap: 2 }}>
                        <button
                          className="rbg-icon-btn"
                          onClick={() => this.reeditItem(it)}
                          title="재편집"
                          style={{ width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--pdfe-button-color,var(--rbg-text-subtle,#8a8a92))" }}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M16.5 4.5l3 3L8 19l-4 1 1-4z"></path>
                          </svg>
                        </button>
                        <button
                          className="rbg-icon-btn"
                          onClick={() => this.download(it)}
                          title="다운로드"
                          style={{ width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--pdfe-button-color,var(--rbg-text-subtle,#8a8a92))" }}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 4v11"></path>
                            <path d="m8 11 4 4 4-4"></path>
                            <path d="M5 20h14"></path>
                          </svg>
                        </button>
                        <button
                          className="rbg-icon-btn-danger"
                          onClick={() => this.deleteItem(it.id)}
                          title="삭제"
                          style={{ width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--pdfe-button-color,var(--rbg-text-subtle,#8a8a92))" }}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 7h14M9 7V5h6v2M7 7l1 12h8l1-12"></path>
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  private renderToast() {
    return (
      <div
        style={{
          position: "absolute",
          bottom: 26,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 60,
          background: "var(--rbg-toast-bg,#17171a)",
          color: "#fff",
          fontSize: 13.5,
          fontWeight: 600,
          padding: "12px 20px",
          borderRadius: 12,
          boxShadow: "0 12px 34px rgba(0,0,0,.24)",
          display: "flex",
          alignItems: "center",
          gap: 9,
          animation: "rbg-pop .3s ease",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7f97ff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5"></path>
        </svg>
        {this.state.toast}
      </div>
    );
  }
}

export default RemoveBgTool;
