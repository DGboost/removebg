import React, { type CSSProperties } from "react";
import { RemoveBgEngine, MODEL_LABELS, type EngineStatus } from "./engine";
import { getQuickScenes } from "./scenes";
import type {
  RemoveBgToolProps,
  EditorImage,
  SavedItem,
  Tool,
  View,
  LassoOp,
  BrushOp,
  RectSel,
} from "./types";

type Pt = [number, number];

interface State {
  view: View;
  editorImage: EditorImage | null;
  tool: Tool;
  processed: boolean;
  processing: boolean;
  resultSrc: string | null;
  sel: RectSel | null;
  lassoPts: Pt[];
  wandPt: Pt | null;
  dragging: boolean;
  compareOn: boolean;
  tol: number;
  tolTouched: boolean;
  saved: SavedItem[];
  filter: string;
  saveFolder: string;
  toast: string;
  engine: EngineStatus;
  engineMsg: string;
  lassoOp: LassoOp;
  magnetic: boolean;
  selMaskUrl: string | null;
  hasLassoSel: boolean;
  brushPts: Pt[];
  brushSize: number;
  brushOp: BrushOp;
  cursorPos: [number, number] | null;
  dropActive: boolean;
}

const FOLDERS = ["제품", "소품", "기타"];

const GLOBAL_CSS = `
.rbg-root *{box-sizing:border-box}
.rbg-root{height:100%;font-family:'Pretendard',system-ui,-apple-system,sans-serif;color:#17171a;background:#fff;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
.rbg-root a{color:var(--accent,#3d5afe);text-decoration:none}
.rbg-root a:hover{opacity:.82}
.rbg-root ::selection{background:color-mix(in srgb,var(--accent,#3d5afe) 20%,#fff)}
.rbg-root input{font-family:inherit}
.rbg-root input:focus{outline:none}
.rbg-root button{font-family:inherit;cursor:pointer;border:none;background:none;color:inherit}
@keyframes rbg-spin{to{transform:rotate(360deg)}}
@keyframes rbg-pop{0%{transform:translateY(10px) scale(.98);opacity:0}100%{transform:none;opacity:1}}
.rbg-root ::-webkit-scrollbar{width:11px;height:11px}
.rbg-root ::-webkit-scrollbar-thumb{background:#e4e4e8;border-radius:10px;border:3px solid #fff}
.rbg-root ::-webkit-scrollbar-thumb:hover{background:#d4d4d9}
.rbg-quickscene:hover{border-color:var(--accent,#3d5afe);transform:translateY(-2px)}
.rbg-recent-card:hover{border-color:#d7d7dd;transform:translateY(-2px)}
.rbg-topbar-back:hover{background:#f4f4f5;color:#17171a}
.rbg-reset-sel:hover{border-color:#d7d7dd;color:#17171a}
.rbg-dl-btn:hover{filter:brightness(1.06)}
.rbg-save-btn:hover{border-color:#c9c9d0}
.rbg-gallery-new-btn:hover{filter:brightness(1.06)}
.rbg-gallery-card:hover{box-shadow:0 10px 28px rgba(0,0,0,.08);border-color:#e2e2e6}
.rbg-icon-btn:hover{background:#f4f4f5;color:#17171a}
.rbg-icon-btn-danger:hover{background:#fdeceb;color:#e0553d}
`;

export class RemoveBgTool extends React.Component<RemoveBgToolProps, State> {
  static defaultProps: Partial<RemoveBgToolProps> = {
    accent: "#3d5afe",
    appName: "누끼컷",
    autoTol: 30,
    model: "ormbg",
  };

  private engine = new RemoveBgEngine();
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private strokeMask: HTMLCanvasElement | null = null;
  private strokeZone: HTMLCanvasElement | null = null;
  private strokeOp: LassoOp = "new";
  private dragStart: { fx: number; fy: number } | null = null;

  state: State = {
    view: "home",
    editorImage: null,
    tool: "auto",
    processed: false,
    processing: false,
    resultSrc: null,
    sel: null,
    lassoPts: [],
    wandPt: null,
    dragging: false,
    compareOn: false,
    tol: 60,
    tolTouched: false,
    saved: [],
    filter: "all",
    saveFolder: "제품",
    toast: "",
    engine: "idle",
    engineMsg: "",
    lassoOp: "new",
    magnetic: true,
    selMaskUrl: null,
    hasLassoSel: false,
    brushPts: [],
    brushSize: 30,
    brushOp: "add",
    cursorPos: null,
    dropActive: false,
  };

  componentDidMount() {
    document.addEventListener("paste", this.onPaste);
    void this.seed();
  }

  componentWillUnmount() {
    document.removeEventListener("paste", this.onPaste);
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }

  componentDidUpdate(prevProps: RemoveBgToolProps) {
    if (prevProps.model !== this.props.model) {
      this.setState({ engine: "idle", engineMsg: "" });
    }
  }

  private async seed() {
    try {
      const scenes = getQuickScenes();
      const plan: [ReturnType<typeof getQuickScenes>[number], string, boolean][] = [
        [scenes[0], "제품", true],
        [scenes[4], "제품", false],
        [scenes[1], "소품", false],
        [scenes[3], "소품", true],
      ];
      const items: SavedItem[] = [];
      for (const [sc, folder, fav] of plan) {
        const img = await this.engine.loadImage(sc.photo);
        items.push({
          id: "seed_" + sc.id,
          name: sc.name,
          src: this.engine.autoRemove(img, 60),
          photo: sc.photo,
          fav,
          folder,
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
    const rd = new FileReader();
    rd.onload = () =>
      this.openEditor({
        id: "img_" + Date.now(),
        name: (name || "이미지").replace(/\.[^.]+$/, ""),
        photo: rd.result as string,
      });
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
    this.flash("이미지를 불러오는 중…");
    try {
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      if (!blob.type.startsWith("image/")) throw new Error("not an image");
      this.blobToEditor(blob, decodeURIComponent(url.split("/").pop() || "이미지"));
    } catch {
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
  private goHome = () => this.setState({ view: "home" });
  private goGallery = () => this.setState({ view: "gallery" });
  private openEditor = (sc: EditorImage) =>
    this.setState({
      view: "editor",
      editorImage: sc,
      processed: false,
      processing: false,
      resultSrc: null,
      sel: null,
      lassoPts: [],
      wandPt: null,
      brushPts: [],
      tool: "auto",
      compareOn: false,
      selMaskUrl: null,
      hasLassoSel: false,
      lassoOp: "new",
    });

  private onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    this.blobToEditor(f, f.name);
    e.target.value = "";
  };

  // ---------- tools ----------
  // ALL tools share one result stream: each tool works on top of the current
  // result via baseSrc(), so switching tools never loses progress.
  private baseSrc() {
    return this.state.resultSrc || (this.state.editorImage && this.state.editorImage.photo) || "";
  }
  private effTol() {
    return this.state.tolTouched ? this.state.tol : this.props.autoTol ?? 60;
  }
  private setTool = (t: Tool) => {
    this.setState({
      tool: t,
      sel: null,
      lassoPts: [],
      wandPt: null,
      compareOn: false,
      selMaskUrl: null,
      hasLassoSel: false,
      lassoOp: "new",
      brushPts: [],
      cursorPos: null,
    });
    // lasso/brush need prepLasso to set up the working raster
    if (t === "lasso" || t === "brush") {
      const img = this.state.editorImage;
      if (img) {
        void this.engine.prepLasso(img.photo, this.state.resultSrc).then(({ url, has }) => {
          this.setState({ selMaskUrl: url, hasLassoSel: has });
        });
      }
    }
  };
  private resetSel = () => {
    this.engine.clearSelection();
    this.setState({ sel: null, lassoPts: [], wandPt: null, brushPts: [], selMaskUrl: null, hasLassoSel: false, lassoOp: "new" });
  };
  private onTol = (e: React.ChangeEvent<HTMLInputElement>) => this.setState({ tol: +e.target.value, tolTouched: true });
  private toggleCompare = (e: React.ChangeEvent<HTMLInputElement>) => this.setState({ compareOn: !!e.target.checked });
  private setOp = (op: LassoOp) => this.setState({ lassoOp: op });
  private toggleMagnetic = (e: React.ChangeEvent<HTMLInputElement>) => this.setState({ magnetic: !!e.target.checked });
  private setBrushAdd = () => this.setState({ brushOp: "add" });
  private setBrushSub = () => this.setState({ brushOp: "sub" });
  private onBrushSize = (e: React.ChangeEvent<HTMLInputElement>) => this.setState({ brushSize: +e.target.value });

  private runRemoval = async () => {
    const sc = this.state.editorImage;
    if (!sc) return;
    this.setState({ processing: true });
    const t0 = Date.now();
    let out: string;
    try {
      const tool = this.state.tool;
      const tol = this.effTol();
      const base = this.baseSrc();
      if (tool === "auto") {
        try {
          const modelKey = this.props.model || "ormbg";
          this.setState({ engine: "loading", engineMsg: "AI 엔진 불러오는 중…" });
          await this.engine.ensureModel(modelKey, (msg) => this.setState({ engineMsg: msg }));
          this.setState({ engine: "ready", engineMsg: "" });
          out = await this.engine.rmbgRemove(base, modelKey);
        } catch (e) {
          console.error("[AI bg-remove] fallback:", e);
          const img = await this.engine.loadImage(base);
          out = this.engine.autoRemove(img, tol);
          this.setState({ engine: "error", engineMsg: "" });
          this.flash("AI 엔진을 불러오지 못해 기본 엔진으로 처리했어요");
        }
      } else if (tool === "rect" && this.state.sel && this.state.sel.w > 0.02) {
        const img = await this.engine.loadImage(base);
        out = this.engine.rectKeep(img, this.state.sel, tol);
      } else if (tool === "lasso" && this.strokeMask) {
        const hadPriorResult = !!this.state.resultSrc;
        out = await this.engine.lassoApplyRun(base, this.strokeMask, this.strokeZone!, this.strokeOp, hadPriorResult);
        this.strokeMask = null;
      } else if (tool === "brush" && this.strokeMask) {
        out = await this.engine.brushApplyRun(base, this.strokeMask, this.strokeOp as BrushOp);
        this.strokeMask = null;
      } else if (tool === "click" && this.state.wandPt) {
        const img = await this.engine.loadImage(base);
        out = this.engine.wandRemove(img, this.state.wandPt, tol);
      } else {
        const img = await this.engine.loadImage(base);
        out = this.engine.autoRemove(img, tol);
      }
    } catch {
      this.setState({ processing: false });
      this.flash("이미지를 처리할 수 없습니다");
      return;
    }
    const wait = Math.max(0, 350 - (Date.now() - t0));
    setTimeout(() => this.setState({ processing: false, processed: true, resultSrc: out, compareOn: false }), wait);
  };

  // ---------- pointer ----------
  private frac(e: React.PointerEvent): Pt {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  }

  private onDown = (e: React.PointerEvent) => {
    if (this.state.processing) return;
    const t = this.state.tool;
    const [fx, fy] = this.frac(e);
    if (t === "rect") {
      this.dragStart = { fx, fy };
      this.setState({ dragging: true, processed: false, sel: { x: fx, y: fy, w: 0, h: 0 }, lassoPts: [] });
    } else if (t === "lasso") {
      this.setState({ dragging: true, processed: false, lassoPts: [[fx, fy]] });
    } else if (t === "brush") {
      this.setState({ dragging: true, processed: false, brushPts: [[fx, fy]] });
      // draw first dot immediately for instant feedback
      this.engine.paintBrushDot([fx, fy], this.state.brushSize, this.state.brushOp, null);
      const { url } = this.engine.buildSelOverlay(this.props.accent);
      this.setState({ selMaskUrl: url });
    } else if (t === "click") {
      this.setState({ wandPt: [fx, fy] }, () => void this.runRemoval());
    }
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // pointer capture is best-effort
    }
  };

  private onMove = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const px = e.clientX - r.left,
      py = e.clientY - r.top;
    const t = this.state.tool;
    if (t === "brush" && !this.state.dragging) {
      this.setState({ cursorPos: [px, py] });
      return;
    }
    if (!this.state.dragging) return;
    const [fx, fy] = this.frac(e);
    if (t === "rect") {
      const d = this.dragStart!;
      this.setState({ sel: { x: Math.min(d.fx, fx), y: Math.min(d.fy, fy), w: Math.abs(fx - d.fx), h: Math.abs(fy - d.fy) } });
    } else if (t === "lasso") {
      const p: Pt = [fx, fy];
      const pts = this.state.lassoPts.slice();
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.006) {
        pts.push(p);
        this.setState({ lassoPts: pts });
      }
    } else if (t === "brush") {
      const p: Pt = [fx, fy];
      const pts = this.state.brushPts.slice();
      const last = pts[pts.length - 1] ?? null;
      if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.004) {
        pts.push(p);
        // real-time preview: draw the brush dot immediately so the user sees
        // where they're painting as they paint.
        this.engine.paintBrushDot(p, this.state.brushSize, this.state.brushOp, last);
        this.setState({ brushPts: pts, cursorPos: [px, py] });
        const { url } = this.engine.buildSelOverlay(this.props.accent);
        this.setState({ selMaskUrl: url });
      }
    }
  };

  private onUp = () => {
    if (this.state.tool === "lasso" && this.state.dragging) this.commitLasso();
    if (this.state.tool === "brush" && this.state.dragging) this.commitBrush();
    this.setState({ dragging: false });
  };

  private commitLasso() {
    const pts = this.state.lassoPts;
    if (pts.length < 3 || !this.engine.work) {
      this.setState({ lassoPts: [] });
      return;
    }
    const op = this.state.lassoOp;
    const tol = this.effTol();
    let mask: HTMLCanvasElement, zone: HTMLCanvasElement, recognized: boolean;
    if (op === "add") {
      const r = this.engine.refineAddMask(pts, this.state.magnetic, tol);
      mask = zone = r.mask;
      recognized = r.recognized;
    } else if (op === "sub") {
      const r = this.engine.refineSubMask(pts, this.state.magnetic, tol);
      mask = r.mask;
      zone = mask;
      recognized = r.recognized;
    } else if (this.state.magnetic) {
      const r = this.engine.refineLassoMask(pts, tol);
      mask = r.mask;
      zone = r.zone;
      recognized = r.recognized;
    } else {
      mask = zone = this.engine.rawLassoMask(pts);
      recognized = false;
    }
    void recognized;
    this.strokeMask = mask;
    this.strokeZone = zone;
    this.strokeOp = op;
    this.engine.drawLassoStroke(mask, op);
    const { url, has } = this.engine.buildSelOverlay(this.props.accent);
    this.setState(
      { lassoPts: [], selMaskUrl: url, hasLassoSel: has, lassoOp: op === "new" ? "add" : op },
      () => void this.runRemoval(),
    );
  }

  private commitBrush() {
    const pts = this.state.brushPts;
    if (pts.length < 1 || !this.engine.work) {
      this.setState({ brushPts: [] });
      return;
    }
    // Build the mask from brushPts directly (not from the selection overlay
    // canvas) — when "sub" is used, destination-out modifies that overlay
    // itself, so it can't double as the erase mask.
    const mask = this.engine.brushMask(pts, this.state.brushSize);
    const op = this.state.brushOp;
    this.strokeMask = mask;
    this.strokeZone = mask;
    this.strokeOp = op;
    const { url, has } = this.engine.buildSelOverlay(this.props.accent);
    this.setState({ brushPts: [], selMaskUrl: url, hasLassoSel: has }, () => void this.runRemoval());
  }

  // ---------- gallery / save ----------
  private flash = (m: string) => {
    this.setState({ toast: m });
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.setState({ toast: "" }), 2200);
  };
  private onFolder = (e: React.ChangeEvent<HTMLSelectElement>) => this.setState({ saveFolder: e.target.value });
  private saveCurrent = () => {
    if (!this.state.resultSrc) return;
    const sc = this.state.editorImage!;
    const item: SavedItem = {
      id: "g_" + Date.now(),
      name: sc.name || "누끼 이미지",
      src: this.state.resultSrc,
      photo: sc.photo,
      fav: false,
      folder: this.state.saveFolder,
      ts: Date.now(),
    };
    this.setState((s) => ({ saved: [item, ...s.saved] }));
    this.flash("보관함에 저장했어요");
  };
  private download = (item: { src: string; name: string }) => {
    const a = document.createElement("a");
    a.href = item.src;
    a.download = (item.name || "cutout") + ".png";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  private downloadCurrent = () => {
    if (!this.state.resultSrc) return;
    this.download({ src: this.state.resultSrc, name: (this.state.editorImage && this.state.editorImage.name) || "cutout" });
    this.flash("PNG를 다운로드했어요");
  };
  private toggleFav = (id: string) => this.setState((s) => ({ saved: s.saved.map((i) => (i.id === id ? { ...i, fav: !i.fav } : i)) }));
  private deleteItem = (id: string) => this.setState((s) => ({ saved: s.saved.filter((i) => i.id !== id) }));
  private reeditItem = (it: SavedItem) => this.openEditor({ id: it.id, name: it.name, photo: it.photo });
  private filterSaved() {
    const { saved, filter } = this.state;
    if (filter === "all") return saved;
    if (filter === "fav") return saved.filter((i) => i.fav);
    return saved.filter((i) => i.folder === filter);
  }

  render() {
    const accent = this.props.accent || "#3d5afe";
    return (
      <div className="rbg-root" style={{ ["--accent" as string]: accent } as CSSProperties}>
        <style>{GLOBAL_CSS}</style>
        <div style={{ display: "flex", height: "100vh", width: "100%", overflow: "hidden", background: "#fff" }}>
          {this.renderRail()}
          <div style={{ flex: 1, minWidth: 0, height: "100%", position: "relative", display: "flex", flexDirection: "column", background: "#fff" }}>
            {this.state.view === "home" && this.renderHome()}
            {this.state.view === "editor" && this.renderEditor()}
            {this.state.view === "gallery" && this.renderGallery()}
            {this.state.toast && this.renderToast()}
          </div>
        </div>
      </div>
    );
  }

  private renderRail() {
    const s = this.state;
    const railBase: CSSProperties = {
      width: 52,
      height: 52,
      borderRadius: 13,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 3,
      transition: ".12s",
    };
    const railOn: CSSProperties = { ...railBase, background: "color-mix(in srgb, var(--accent) 12%, #fff)", color: "var(--accent)" };
    const railOff: CSSProperties = { ...railBase, color: "#8a8a92" };
    return (
      <div
        style={{
          width: 78,
          flex: "none",
          height: "100%",
          background: "#fafafa",
          borderRight: "1px solid #ededed",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "18px 0 16px",
          gap: 6,
        }}
      >
        <div
          onClick={this.goHome}
          title={this.props.appName}
          style={{
            width: 42,
            height: 42,
            borderRadius: 13,
            background: "var(--accent)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            marginBottom: 14,
            boxShadow: "0 4px 14px color-mix(in srgb, var(--accent) 40%, transparent)",
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 4v11a2 2 0 0 0 2 2h11"></path>
            <path d="M4 8h11a2 2 0 0 1 2 2v11"></path>
          </svg>
        </div>

        <button onClick={this.goHome} style={s.view === "home" ? railOn : railOff}>
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 4l0 9"></path>
            <path d="M8.5 7.5 12 4l3.5 3.5"></path>
            <path d="M4 19h16"></path>
          </svg>
          <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "-.2px" }}>홈</span>
        </button>

        <button onClick={this.goGallery} style={s.view === "gallery" ? railOn : railOff}>
          <span style={{ position: "relative", display: "flex" }}>
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="4" width="7" height="7" rx="1.5"></rect>
              <rect x="13" y="4" width="7" height="7" rx="1.5"></rect>
              <rect x="4" y="13" width="7" height="7" rx="1.5"></rect>
              <rect x="13" y="13" width="7" height="7" rx="1.5"></rect>
            </svg>
            {s.saved.length > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: -6,
                  right: -8,
                  minWidth: 15,
                  height: 15,
                  padding: "0 3px",
                  borderRadius: 8,
                  background: "var(--accent)",
                  color: "#fff",
                  fontSize: 9,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "'Spline Sans Mono',monospace",
                }}
              >
                {s.saved.length}
              </span>
            )}
          </span>
          <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "-.2px" }}>보관함</span>
        </button>
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
        <div style={{ maxWidth: 940, margin: "0 auto", padding: "64px 40px 80px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "5px 11px",
              border: "1px solid #ececec",
              borderRadius: 999,
              fontSize: 11.5,
              color: "#7a7a82",
              marginBottom: 22,
              fontFamily: "'Spline Sans Mono',monospace",
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
          <p style={{ fontSize: 16, color: "#6b6b72", margin: "0 0 34px", maxWidth: 520, lineHeight: 1.55 }}>
            사진을 첨부하거나 복사한 이미지를 붙여넣으세요. <b style={{ color: "#17171a", fontWeight: 600 }}>AI</b>가 피사체를 인식해{" "}
            <b style={{ color: "#17171a", fontWeight: 600 }}>투명 PNG</b>로 오려 드립니다.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16, marginBottom: 44 }}>
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
                padding: "44px 24px",
                borderRadius: 18,
                cursor: "pointer",
                transition: ".15s",
                border: s.dropActive ? "1.5px solid var(--accent)" : "1.5px dashed #d7d7dd",
                background: s.dropActive ? "color-mix(in srgb, var(--accent) 7%, #fff)" : "#fcfcfd",
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
                <div style={{ fontSize: 12.5, color: "#9a9aa2", lineHeight: 1.5 }}>
                  클릭해서 업로드 · 웹 이미지를 드래그하거나
                  <br />
                  복사한 이미지는 어디서나 <b style={{ color: "#6b6b72" }}>Ctrl/Cmd+V</b>로 붙여넣기
                </div>
              </div>
              <input id="rbg-file-input" type="file" accept="image/*" onChange={this.onUpload} style={{ display: "none" }} />
            </label>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                justifyContent: "space-between",
                padding: 24,
                border: "1px solid #ececec",
                borderRadius: 18,
                background: "#fff",
              }}
            >
              <div style={{ width: 44, height: 44, borderRadius: 13, background: "#f3f3f5", display: "flex", alignItems: "center", justifyContent: "center", color: "#17171a" }}>
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="4" width="14" height="16" rx="2"></rect>
                  <path d="M9 4v6l3-2 3 2V4"></path>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>붙여넣기로 가져오기</div>
                <div style={{ fontSize: 12.5, color: "#9a9aa2", lineHeight: 1.45 }}>
                  웹에서 이미지를 복사한 뒤
                  <br />
                  <b style={{ color: "#6b6b72" }}>Ctrl/Cmd+V</b>로 바로 붙여넣기
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, letterSpacing: "-.3px" }}>빠른 시작 · 예시 이미지</h2>
            <span style={{ fontSize: 12, color: "#a2a2aa" }}>클릭하면 편집기로 이동해요</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 12 }}>
            {scenes.map((sc) => (
              <button
                key={sc.id}
                className="rbg-quickscene"
                onClick={() => this.openEditor(sc)}
                style={{ aspectRatio: "1", borderRadius: 14, border: "1px solid #ececec", overflow: "hidden", padding: 0, background: "#f7f7f8", transition: ".15s" }}
              >
                <img src={sc.photo} alt={sc.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              </button>
            ))}
          </div>

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
                      border: "1px solid #ececec",
                      overflow: "hidden",
                      padding: 0,
                      backgroundColor: "#fff",
                      backgroundImage: "conic-gradient(#eef0f3 25%,transparent 0 50%,#eef0f3 0 75%,transparent 0)",
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
    const hasRect = !!(s.sel && s.sel.w > 0.02 && s.sel.h > 0.02);
    const hasSelection = tool === "rect" ? hasRect : tool === "lasso" ? s.hasLassoSel : false;
    const overlayActive = !!s.editorImage && !s.processing && (tool === "rect" || tool === "lasso" || tool === "click" || tool === "brush");
    const stageSrc = s.processed && !s.compareOn && s.resultSrc ? s.resultSrc : s.editorImage ? s.editorImage.photo : "";
    const primaryEnabled = tool === "auto" ? true : hasSelection;
    const primaryLabel = tool === "rect" ? "선택 영역 추출" : tool === "lasso" ? "올가미 영역 추출" : "AI로 배경 제거";
    const primaryHint =
      tool === "rect"
        ? hasRect
          ? ""
          : "이미지 위에서 영역을 드래그하세요"
        : tool === "lasso"
        ? s.hasLassoSel
          ? "추가(+)·제외(−)로 더 다듬을 수 있어요"
          : "외곽선을 따라 천천히 그려보세요"
        : "AI가 피사체를 인식해 배경만 지워요";

    const toolStyle = (on: boolean): CSSProperties => ({
      width: "100%",
      display: "flex",
      alignItems: "center",
      gap: 11,
      padding: 9,
      borderRadius: 12,
      marginBottom: 6,
      transition: ".12s",
      border: "1px solid " + (on ? "color-mix(in srgb, var(--accent) 40%, #fff)" : "transparent"),
      background: on ? "color-mix(in srgb, var(--accent) 7%, #fff)" : "transparent",
    });
    const icoBg = (on: boolean) => (on ? "var(--accent)" : "#f0f0f2");
    const icoFg = (on: boolean) => (on ? "#fff" : "#9a9aa2");
    const segStyle = (on: boolean): CSSProperties => ({
      flex: 1,
      height: 32,
      borderRadius: 8,
      fontSize: 12,
      fontWeight: 600,
      transition: ".12s",
      border: "1px solid " + (on ? "var(--accent)" : "#e6e6ea"),
      background: on ? "var(--accent)" : "#f7f7f8",
      color: on ? "#fff" : "#6b6b72",
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
      background: primaryEnabled ? "var(--accent)" : "#ececed",
      color: primaryEnabled ? "#fff" : "#b0b0b8",
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
      background: dlOn ? "var(--accent)" : "#f2f2f3",
      color: dlOn ? "#fff" : "#c0c0c6",
      cursor: dlOn ? "pointer" : "not-allowed",
    };
    const saveBtnStyle: CSSProperties = {
      height: 38,
      padding: "0 14px",
      borderRadius: 10,
      fontSize: 13,
      fontWeight: 600,
      transition: ".12s",
      border: "1px solid #e2e2e6",
      color: dlOn ? "#17171a" : "#c0c0c6",
      cursor: dlOn ? "pointer" : "not-allowed",
    };
    const engineMap: Record<EngineStatus, [string, string]> = {
      idle: ["준비 대기", "#c0c0c6"],
      loading: [s.engineMsg || "불러오는 중", "#f59e0b"],
      ready: ["준비됨", "#16a34a"],
      error: ["오프라인 · 기본 엔진", "#e0553d"],
    };
    const eng = engineMap[s.engine] || engineMap.idle;
    const modelLabel = MODEL_LABELS[this.props.model || "ormbg"] || "BiRefNet lite";
    const stageCursor = tool === "click" ? "pointer" : tool === "brush" ? "none" : tool === "rect" || tool === "lasso" ? "crosshair" : "default";
    const lassoStr = s.lassoPts.map((p) => (p[0] * 100).toFixed(2) + "," + (p[1] * 100).toFixed(2)).join(" ");
    const showRect = tool === "rect" && !!s.sel && s.sel.w > 0;
    const showLasso = tool === "lasso" && s.lassoPts.length > 1;
    const showSelMask = (tool === "lasso" || tool === "brush") && !!s.selMaskUrl && !s.processing;
    const showClickHint = tool === "click" && !s.processing && !s.processed;
    const showDone = s.processed && !s.processing && !s.compareOn;
    const showPrimary = !!s.editorImage && !s.processed && tool !== "click" && tool !== "brush";
    const processMsg = s.engine === "loading" ? s.engineMsg || "AI 엔진 불러오는 중…" : tool === "auto" ? "AI로 배경 분석 중…" : "영역을 처리하는 중…";
    const processSub = s.engine === "loading" ? "최초 1회만 모델을 내려받아요 · 수십 초 소요될 수 있어요" : "";

    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ height: 60, flex: "none", borderBottom: "1px solid #ededed", display: "flex", alignItems: "center", gap: 14, padding: "0 22px" }}>
          <button
            className="rbg-topbar-back"
            onClick={this.goHome}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, fontWeight: 600, color: "#6b6b72", padding: "7px 10px", borderRadius: 9 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6"></path>
            </svg>
            새 이미지
          </button>
          <div style={{ width: 1, height: 22, background: "#ededed" }}></div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#17171a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 260 }}>
            {s.editorImage ? s.editorImage.name : ""}
          </div>
          <div style={{ flex: 1 }}></div>
          <span style={{ fontSize: 12, color: "#b0b0b8" }}>Ctrl/Cmd+V로 새 이미지 붙여넣기</span>
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
          <div style={{ width: 222, flex: "none", borderRight: "1px solid #ededed", padding: "18px 16px", overflowY: "auto", background: "#fcfcfd", position: "relative" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#a2a2aa", letterSpacing: ".4px", margin: "2px 4px 12px", fontFamily: "'Spline Sans Mono',monospace" }}>
              선택 도구
            </div>

            <button onClick={() => this.setTool("auto")} style={toolStyle(tool === "auto")}>
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
                <span style={{ display: "block", fontSize: 11.5, color: "#9a9aa2", marginTop: 1 }}>AI가 피사체를 인식</span>
              </span>
            </button>

            {tool === "auto" && (
              <div style={{ display: "flex", alignItems: "center", gap: 7, margin: "0 2px 8px", padding: "7px 10px", borderRadius: 9, background: "#f5f5f7", fontSize: 11, color: "#7a7a82" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: eng[1], boxShadow: `0 0 0 3px color-mix(in srgb, ${eng[1]} 18%, transparent)` }}></span>
                <span style={{ fontFamily: "'Spline Sans Mono',monospace", fontWeight: 600, color: "#4a4a52" }}>{modelLabel}</span>
                <span style={{ color: "#c0c0c6" }}>·</span>
                <span>{eng[0]}</span>
              </div>
            )}

            <button onClick={() => this.setTool("click")} style={toolStyle(tool === "click")}>
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
                <span style={{ display: "block", fontSize: 13.5, fontWeight: 700 }}>클릭 지우개</span>
                <span style={{ display: "block", fontSize: 11.5, color: "#9a9aa2", marginTop: 1 }}>배경을 콕 찍어 삭제</span>
              </span>
            </button>

            <button onClick={() => this.setTool("rect")} style={toolStyle(tool === "rect")}>
              <span
                style={{
                  width: 34,
                  height: 34,
                  flex: "none",
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: icoBg(tool === "rect"),
                  color: icoFg(tool === "rect"),
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="3 2.5">
                  <rect x="4" y="5" width="16" height="14" rx="2"></rect>
                </svg>
              </span>
              <span style={{ textAlign: "left" }}>
                <span style={{ display: "block", fontSize: 13.5, fontWeight: 700 }}>사각형 선택</span>
                <span style={{ display: "block", fontSize: 11.5, color: "#9a9aa2", marginTop: 1 }}>영역을 드래그해 추출</span>
              </span>
            </button>

            <button onClick={() => this.setTool("lasso")} style={toolStyle(tool === "lasso")}>
              <span
                style={{
                  width: 34,
                  height: 34,
                  flex: "none",
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: icoBg(tool === "lasso"),
                  color: icoFg(tool === "lasso"),
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 4c4.4 0 8 2.7 8 6 0 3.3-3.6 6-8 6-1 0-2-.1-2.9-.4"></path>
                  <path d="M9 15.6c-2.4-1-4-2.9-4-5C5 6.7 8 4.2 12 4"></path>
                  <path d="M8 16c0 1.6.4 3 .4 3"></path>
                  <path d="M6.4 19a1.4 1.4 0 1 0 2.8 0 1.4 1.4 0 0 0-2.8 0"></path>
                </svg>
              </span>
              <span style={{ textAlign: "left" }}>
                <span style={{ display: "block", fontSize: 13.5, fontWeight: 700 }}>스마트 올가미</span>
                <span style={{ display: "block", fontSize: 11.5, color: "#9a9aa2", marginTop: 1 }}>영역을 그리면 객체를 인식해요</span>
              </span>
            </button>

            <button onClick={() => this.setTool("brush")} style={toolStyle(tool === "brush")}>
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
                <span style={{ display: "block", fontSize: 11.5, color: "#9a9aa2", marginTop: 1 }}>칠해서 영역 추가·제거</span>
              </span>
            </button>

            {tool === "brush" && (
              <div style={{ marginTop: 8, padding: 13, border: "1px solid #ececec", borderRadius: 12, background: "#fff" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#a2a2aa", marginBottom: 9, fontFamily: "'Spline Sans Mono',monospace" }}>브러시 설정</div>
                <div style={{ display: "flex", gap: 5, marginBottom: 11 }}>
                  <button onClick={this.setBrushAdd} style={segStyle(s.brushOp === "add")}>
                    추가 +
                  </button>
                  <button onClick={this.setBrushSub} style={segStyle(s.brushOp === "sub")}>
                    제거 −
                  </button>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 9 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#4a4a52" }}>브러시 크기</span>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--accent)", fontFamily: "'Spline Sans Mono',monospace" }}>{s.brushSize}px</span>
                </div>
                <input type="range" min={10} max={80} step={5} value={s.brushSize} onChange={this.onBrushSize} style={{ width: "100%", accentColor: "var(--accent)" }} />
                <div style={{ fontSize: 11, color: "#a2a2aa", marginTop: 9, lineHeight: 1.5 }}>
                  {s.brushOp === "add" ? "칠한 영역의 객체를 복원해요. 크기를 조절해가며 칠해보세요." : "칠한 영역을 지워요. 크기를 조절해가며 칠해보세요."}
                </div>
              </div>
            )}

            {tool === "lasso" && (
              <div style={{ marginTop: 8, padding: 13, border: "1px solid #ececec", borderRadius: 12, background: "#fff" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#a2a2aa", marginBottom: 9, fontFamily: "'Spline Sans Mono',monospace" }}>올가미 다듬기</div>
                <div style={{ display: "flex", gap: 5, marginBottom: 11 }}>
                  <button onClick={() => this.setOp("new")} style={segStyle(s.lassoOp === "new")}>
                    새 영역
                  </button>
                  <button onClick={() => this.setOp("add")} style={segStyle(s.lassoOp === "add")}>
                    추가 +
                  </button>
                  <button onClick={() => this.setOp("sub")} style={segStyle(s.lassoOp === "sub")}>
                    제외 −
                  </button>
                </div>
                <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12.5, color: "#4a4a52", cursor: "pointer", userSelect: "none" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3l1.6 4.9L18.5 9.5 13.6 11 12 16l-1.6-5L5.5 9.5l4.9-1.6z"></path>
                    </svg>
                    객체 인식 보정
                  </span>
                  <input type="checkbox" checked={s.magnetic} onChange={this.toggleMagnetic} style={{ accentColor: "var(--accent)", width: 15, height: 15 }} />
                </label>
                <div style={{ fontSize: 11, color: "#a2a2aa", marginTop: 9, lineHeight: 1.5 }}>
                  {s.magnetic
                    ? "여백을 두고 그리면 그 안에서 배경과 물체를 구분해 올가미를 자동으로 맞춰요. 물체 안쪽만 그리면 그린 그대로 추가·제외돼요."
                    : "그린 영역을 그대로 선택 영역으로 사용해요."}
                </div>
              </div>
            )}

            {tool === "click" && (
              <div style={{ marginTop: 12, padding: 14, border: "1px solid #ececec", borderRadius: 12, background: "#fff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 9 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#4a4a52" }}>인식 강도</span>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--accent)", fontFamily: "'Spline Sans Mono',monospace" }}>{this.effTol()}</span>
                </div>
                <input type="range" min={20} max={130} step={5} value={this.effTol()} onChange={this.onTol} onInput={this.onTol} style={{ width: "100%", accentColor: "var(--accent)" }} />
                <div style={{ fontSize: 11, color: "#a2a2aa", marginTop: 7, lineHeight: 1.4 }}>배경과 인접한 색을 얼마나 넓게 지울지 정해요.</div>
              </div>
            )}

            {hasSelection && (
              <button className="rbg-reset-sel" onClick={this.resetSel} style={{ marginTop: 12, width: "100%", padding: 9, borderRadius: 10, border: "1px solid #ececec", fontSize: 12.5, fontWeight: 600, color: "#6b6b72" }}>
                선택 초기화
              </button>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: "#f6f6f7" }}>
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
                  backgroundColor: "#fff",
                  backgroundImage: "conic-gradient(#eaecf0 25%,transparent 0 50%,#eaecf0 0 75%,transparent 0)",
                  backgroundSize: "22px 22px",
                }}
              >
                <img src={stageSrc} alt="edit" style={{ display: "block", maxWidth: "min(660px,60vw)", maxHeight: "56vh", objectFit: "contain", userSelect: "none", WebkitUserDrag: "none" } as CSSProperties} />

                {showSelMask && (
                  <img
                    src={s.selMaskUrl!}
                    alt="selection"
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill", pointerEvents: "none", mixBlendMode: "multiply" }}
                  />
                )}

                <div
                  onPointerDown={this.onDown}
                  onPointerMove={this.onMove}
                  onPointerUp={this.onUp}
                  style={{ position: "absolute", inset: 0, cursor: stageCursor, touchAction: "none", pointerEvents: overlayActive ? "auto" : "none" }}
                >
                  {tool === "brush" && !s.processing && !!s.cursorPos && (
                    <div
                      style={{
                        position: "absolute",
                        left: s.cursorPos[0],
                        top: s.cursorPos[1],
                        width: s.brushSize,
                        height: s.brushSize,
                        marginLeft: -s.brushSize / 2,
                        marginTop: -s.brushSize / 2,
                        border: "1.5px solid var(--accent)",
                        borderRadius: "50%",
                        pointerEvents: "none",
                        boxShadow: "0 0 0 1px rgba(255,255,255,.6),inset 0 0 0 1px rgba(255,255,255,.4)",
                        background: "color-mix(in srgb, var(--accent) 8%, transparent)",
                        transition: "width .1s,height .1s",
                      }}
                    ></div>
                  )}
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
                    {showRect && (
                      <rect
                        x={s.sel!.x * 100}
                        y={s.sel!.y * 100}
                        width={s.sel!.w * 100}
                        height={s.sel!.h * 100}
                        fill="color-mix(in srgb, var(--accent) 14%, transparent)"
                        stroke="var(--accent)"
                        strokeWidth={1.6}
                        vectorEffect="non-scaling-stroke"
                        strokeDasharray="5 3"
                      ></rect>
                    )}
                    {showLasso && (
                      <polyline points={lassoStr} fill="none" stroke="var(--accent)" strokeWidth={1.8} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round"></polyline>
                    )}
                  </svg>
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
                    지우고 싶은 배경을 클릭하세요
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
                    <div style={{ width: 38, height: 38, border: "3px solid #e4e4e8", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "rbg-spin .7s linear infinite" }}></div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#4a4a52" }}>{processMsg}</div>
                    {processSub && <div style={{ fontSize: 11, color: "#9a9aa2", maxWidth: 240, lineHeight: 1.4 }}>{processSub}</div>}
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
                    fontFamily: "'Spline Sans Mono',monospace",
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5"></path>
                  </svg>
                  {tool === "auto" ? "AI 배경 제거 완료" : "배경 제거 완료"}
                </div>
              )}
            </div>

            <div style={{ flex: "none", borderTop: "1px solid #e6e6ea", background: "#fff", padding: "16px 24px", display: "flex", alignItems: "center", gap: 14, minHeight: 74 }}>
              {showPrimary && (
                <>
                  <button onClick={this.runRemoval} disabled={!primaryEnabled} style={primaryStyle}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3l1.6 4.9L18.5 9.5 13.6 11 12 16l-1.6-5L5.5 9.5l4.9-1.6z"></path>
                    </svg>
                    {primaryLabel}
                  </button>
                  <span style={{ fontSize: 12.5, color: "#9a9aa2" }}>{primaryHint}</span>
                </>
              )}

              {s.processed && (
                <>
                  <button
                    className="rbg-dl-btn"
                    onClick={this.downloadCurrent}
                    style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 44, padding: "0 20px", borderRadius: 11, background: "var(--accent)", color: "#fff", fontSize: 14, fontWeight: 700 }}
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
                    style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 44, padding: "0 18px", borderRadius: 11, border: "1px solid #e2e2e6", fontSize: 14, fontWeight: 600, color: "#17171a" }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="5" y="4" width="14" height="16" rx="2"></rect>
                      <path d="M9 4v6l3-2 3 2V4"></path>
                    </svg>
                    보관함에 저장
                  </button>
                  <div style={{ width: 1, height: 26, background: "#ededed" }}></div>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: "#6b6b72", cursor: "pointer", userSelect: "none" }}>
                    <input type="checkbox" checked={s.compareOn} onChange={this.toggleCompare} style={{ accentColor: "var(--accent)", width: 15, height: 15 }} />
                    원본과 비교
                  </label>
                  <div style={{ flex: 1 }}></div>
                  <select value={s.saveFolder} onChange={this.onFolder} style={{ height: 38, padding: "0 12px", border: "1px solid #e2e2e6", borderRadius: 10, fontSize: 13, color: "#4a4a52", background: "#fff", cursor: "pointer" }}>
                    {FOLDERS.map((f) => (
                      <option key={f} value={f}>
                        폴더 · {f}
                      </option>
                    ))}
                  </select>
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
      ...FOLDERS.map((f) => ({ k: f, label: f, count: s.saved.filter((i) => i.folder === f).length })),
    ];
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ height: 60, flex: "none", borderBottom: "1px solid #ededed", display: "flex", alignItems: "center", gap: 12, padding: "0 24px" }}>
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-.4px" }}>보관함</div>
          <span style={{ fontSize: 12, color: "#a2a2aa", fontFamily: "'Spline Sans Mono',monospace" }}>{s.saved.length} ITEMS</span>
          <div style={{ flex: 1 }}></div>
          <button
            className="rbg-gallery-new-btn"
            onClick={this.goHome}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 38, padding: "0 15px", borderRadius: 10, background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 700 }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14"></path>
            </svg>
            새 이미지
          </button>
        </div>

        <div style={{ padding: "18px 24px 10px", flex: "none", display: "flex", gap: 8, flexWrap: "wrap", borderBottom: "1px solid #f2f2f2" }}>
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
                background: s.filter === t.k ? "#17171a" : "#f4f4f5",
                color: s.filter === t.k ? "#fff" : "#6b6b72",
              }}
            >
              {t.label}
              <span style={{ opacity: 0.6, marginLeft: 6, fontFamily: "'Spline Sans Mono',monospace", fontSize: 11 }}>{t.count}</span>
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "22px 24px 40px" }}>
          {filtered.length === 0 && (
            <div style={{ height: "100%", minHeight: 340, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, color: "#b0b0b8" }}>
              <div style={{ width: 64, height: 64, borderRadius: 18, background: "#f4f4f5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="4" width="7" height="7" rx="1.5"></rect>
                  <rect x="13" y="4" width="7" height="7" rx="1.5"></rect>
                  <rect x="4" y="13" width="7" height="7" rx="1.5"></rect>
                  <rect x="13" y="13" width="7" height="7" rx="1.5"></rect>
                </svg>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#8a8a92" }}>아직 저장된 항목이 없어요</div>
              <button onClick={this.goHome} style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>
                이미지 오리러 가기 →
              </button>
            </div>
          )}

          {filtered.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))", gap: 16 }}>
              {filtered.map((it) => (
                <div key={it.id} className="rbg-gallery-card" style={{ border: "1px solid #ececec", borderRadius: 16, overflow: "hidden", background: "#fff", animation: "rbg-pop .3s ease both", transition: ".15s" }}>
                  <div
                    style={{
                      position: "relative",
                      aspectRatio: "1",
                      backgroundColor: "#fff",
                      backgroundImage: "conic-gradient(#eef0f3 25%,transparent 0 50%,#eef0f3 0 75%,transparent 0)",
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
                        background: "rgba(255,255,255,.9)",
                        backdropFilter: "blur(4px)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 1px 4px rgba(0,0,0,.1)",
                        color: it.fav ? "var(--accent)" : "#b0b0b8",
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill={it.fav ? "var(--accent)" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"></path>
                      </svg>
                    </button>
                  </div>
                  <div style={{ padding: "11px 12px 12px" }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.name}</div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                      <span style={{ fontSize: 11, color: "#9a9aa2", background: "#f4f4f5", padding: "3px 8px", borderRadius: 6 }}>{it.folder}</span>
                      <div style={{ display: "flex", gap: 2 }}>
                        <button
                          className="rbg-icon-btn"
                          onClick={() => this.reeditItem(it)}
                          title="재편집"
                          style={{ width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#8a8a92" }}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M16.5 4.5l3 3L8 19l-4 1 1-4z"></path>
                          </svg>
                        </button>
                        <button
                          className="rbg-icon-btn"
                          onClick={() => this.download(it)}
                          title="다운로드"
                          style={{ width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#8a8a92" }}
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
                          style={{ width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#8a8a92" }}
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
          background: "#17171a",
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
