// Canvas-based cutout engine: pure image-processing logic, independent of React.
// RemoveBgTool (the component) owns one instance and drives it from event handlers.

export type ModelKey = "BiRefNet_lite" | "ormbg" | "RMBG-1.4";

export const MODEL_IDS: Record<ModelKey, string> = {
  BiRefNet_lite: "onnx-community/BiRefNet_lite-ONNX",
  ormbg: "onnx-community/ormbg-ONNX",
  "RMBG-1.4": "briaai/RMBG-1.4",
};

export const MODEL_LABELS: Record<ModelKey, string> = {
  BiRefNet_lite: "BiRefNet lite",
  ormbg: "ORMBG",
  "RMBG-1.4": "RMBG-1.4",
};

// dtype per model: fp16 halves memory vs fp32. BiRefNet_lite has no q4
// variant, so fp16 is the lightest option. ormbg has q4 (44MB) which is
// the safest for memory-constrained browsers. RMBG-1.4 uses fp16.
export const MODEL_DTYPES: Record<ModelKey, string> = {
  BiRefNet_lite: "fp16",
  ormbg: "q4",
  "RMBG-1.4": "fp16",
};

export type EngineStatus = "idle" | "loading" | "ready" | "error";

export interface Point {
  0: number;
  1: number;
  length: 2;
}

export type Pt = [number, number];

export interface RectSel {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LassoResult {
  mask: HTMLCanvasElement;
  zone: HTMLCanvasElement;
  op: "new" | "add" | "sub";
  recognized: boolean;
}

function ctx2d(c: HTMLCanvasElement, opts?: CanvasRenderingContext2DSettings) {
  const x = c.getContext("2d", opts);
  if (!x) throw new Error("2d context unavailable");
  return x;
}

export class RemoveBgEngine {
  private _T: any = null;
  private _tp: Promise<any> | null = null;
  private _tt: ReturnType<typeof setTimeout> | null = null;
  private _pipelines: Partial<Record<ModelKey, any>> = {};

  // working state for the lasso/brush tools, set up by prepLasso()
  private _work: { W: number; H: number } | null = null;
  private _raster: HTMLCanvasElement | null = null;
  private _origRaster: HTMLCanvasElement | null = null;
  private _selCanvas: HTMLCanvasElement | null = null;
  private _selCtx: CanvasRenderingContext2D | null = null;

  get work() {
    return this._work;
  }
  get selCtx() {
    return this._selCtx;
  }

  hexToRgb(h: string | undefined): [number, number, number] {
    let hex = (h || "#3d5afe").replace("#", "");
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((res, rej) => {
      const i = new Image();
      i.crossOrigin = "anonymous";
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = src;
    });
  }

  mkCanvas(img: HTMLImageElement) {
    let W = img.naturalWidth || 480;
    let H = img.naturalHeight || 480;
    const m = Math.max(W, H);
    const s = m > 1200 ? 1200 / m : 1;
    W = Math.max(1, Math.round(W * s));
    H = Math.max(1, Math.round(H * s));
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const x = ctx2d(c, { willReadFrequently: true });
    x.drawImage(img, 0, 0, W, H);
    return { c, x, W, H };
  }

  corners(x: CanvasRenderingContext2D, W: number, H: number): [number, number, number] {
    const g = (X: number, Y: number) => {
      const d = x.getImageData(X, Y, 1, 1).data;
      return [d[0], d[1], d[2]];
    };
    const cs = [g(0, 0), g(W - 1, 0), g(0, H - 1), g(W - 1, H - 1)];
    return [0, 1, 2].map((k) => cs.reduce((a, v) => a + v[k], 0) / 4) as [number, number, number];
  }

  keyOut(x: CanvasRenderingContext2D, W: number, H: number, r: number, g: number, b: number, tol: number) {
    const d = x.getImageData(0, 0, W, H);
    const p = d.data;
    const f = 34;
    for (let i = 0; i < p.length; i += 4) {
      if (p[i + 3] === 0) continue;
      const dist = Math.sqrt((p[i] - r) ** 2 + (p[i + 1] - g) ** 2 + (p[i + 2] - b) ** 2);
      if (dist < tol) p[i + 3] = 0;
      else if (dist < tol + f) p[i + 3] = Math.min(p[i + 3], Math.round((255 * (dist - tol)) / f));
    }
    x.putImageData(d, 0, 0);
  }

  autoRemove(img: HTMLImageElement, tol: number) {
    const { c, x, W, H } = this.mkCanvas(img);
    const [r, g, b] = this.corners(x, W, H);
    this.keyOut(x, W, H, r, g, b, tol);
    return c.toDataURL("image/png");
  }

  wandRemove(img: HTMLImageElement, pt: Pt, tol: number) {
    const { c, x, W, H } = this.mkCanvas(img);
    const px = Math.max(0, Math.min(W - 1, Math.round(pt[0] * W)));
    const py = Math.max(0, Math.min(H - 1, Math.round(pt[1] * H)));
    const d = x.getImageData(px, py, 1, 1).data;
    this.keyOut(x, W, H, d[0], d[1], d[2], tol + 12);
    return c.toDataURL("image/png");
  }

  rectKeep(img: HTMLImageElement, sel: RectSel, tol: number) {
    const { c: src, W, H } = this.mkCanvas(img);
    const rx = Math.round(sel.x * W);
    const ry = Math.round(sel.y * H);
    const rw = Math.max(1, Math.round(sel.w * W));
    const rh = Math.max(1, Math.round(sel.h * H));
    const c = document.createElement("canvas");
    c.width = rw;
    c.height = rh;
    const x = ctx2d(c, { willReadFrequently: true });
    x.drawImage(src, rx, ry, rw, rh, 0, 0, rw, rh);
    const [r, g, b] = this.corners(x, rw, rh);
    this.keyOut(x, rw, rh, r, g, b, tol);
    return c.toDataURL("image/png");
  }

  // ---------- AI background removal (transformers.js pipeline) ----------
  private loadT(): Promise<any> {
    if (this._T) return Promise.resolve(this._T);
    if ((window as any).__nkT) {
      this._T = (window as any).__nkT;
      return Promise.resolve(this._T);
    }
    if (this._tp) return this._tp;
    this._tp = new Promise((res, rej) => {
      const done = () => {
        if ((window as any).__nkT) {
          this._T = (window as any).__nkT;
          res(this._T);
        } else rej(new Error("load"));
      };
      window.addEventListener("__nkTready", done, { once: true });
      window.addEventListener("__nkTfail", () => rej(new Error("fail")), { once: true });
      const s = document.createElement("script");
      s.type = "module";
      s.textContent =
        "import * as T from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1';window.__nkT=T;window.dispatchEvent(new Event('__nkTready'));";
      s.onerror = () => window.dispatchEvent(new Event("__nkTfail"));
      document.head.appendChild(s);
      this._tt = setTimeout(() => window.dispatchEvent(new Event("__nkTfail")), 60000);
    });
    return this._tp;
  }

  // Cache one pipeline per model name so switching models doesn't re-download
  // the same model if the user switches back.
  async ensureModel(modelKey: ModelKey, onProgress: (msg: string) => void) {
    const modelId = MODEL_IDS[modelKey] || MODEL_IDS.BiRefNet_lite;
    if (this._pipelines[modelKey]) return true;
    const T = await this.loadT();
    try {
      T.env.allowLocalModels = false;
    } catch {
      // best effort
    }
    const cb = (p: any) => {
      if (p && p.status === "progress" && p.progress != null) {
        onProgress("모델 다운로드 " + Math.round(p.progress) + "%");
      }
    };
    const dtype = MODEL_DTYPES[modelKey] || "fp16";
    const segmenter = await T.pipeline("background-removal", modelId, {
      dtype,
      device: "wasm",
      progress_callback: cb,
    });
    this._pipelines[modelKey] = segmenter;
    return true;
  }

  async rmbgRemove(src: string, modelKey: ModelKey) {
    const T = this._T;
    const segmenter = this._pipelines[modelKey];
    const el = await this.loadImage(src);
    const { c: raster, W, H } = this.mkCanvas(el);
    // The background-removal pipeline returns an array of RawImage results.
    // Each result already has the background removed (alpha applied).
    const results = await segmenter(raster.toDataURL("image/png"));
    const out = results[0];
    // Robustly convert the result to a dataURL. The pipeline may return a
    // RawImage (with toCanvas) or a canvas-like object. Handle both.
    let canvas: any;
    if (out.toCanvas) {
      canvas = out.toCanvas();
    } else if (out instanceof HTMLCanvasElement) {
      canvas = out;
    } else {
      canvas = document.createElement("canvas");
      canvas.width = out.width || W;
      canvas.height = out.height || H;
      const octx = canvas.getContext("2d");
      const imgData = octx.createImageData(canvas.width, canvas.height);
      if (out.data) {
        imgData.data.set(out.data);
        octx.putImageData(imgData, 0, 0);
      } else {
        octx.drawImage(raster, 0, 0);
      }
    }
    if (!canvas.toDataURL) {
      const tmp = document.createElement("canvas");
      tmp.width = canvas.width || W;
      tmp.height = canvas.height || H;
      tmp.getContext("2d")!.drawImage(canvas, 0, 0);
      canvas = tmp;
    }
    void T;
    return canvas.toDataURL("image/png") as string;
  }

  // ---------- smart lasso / brush setup ----------
  // When a result already exists (from click eraser, auto, or an earlier
  // lasso pass), use THAT as the working raster — it carries real
  // transparency from the prior cut, which is exactly what the alpha-based
  // fast path in refineLassoMask/refineAddMask needs to recognize object
  // boundaries. Using the original photo (no alpha) here was why magnetic
  // lasso fell back to the raw drawn shape every time after click eraser.
  async prepLasso(photo: string, resultSrc: string | null) {
    try {
      const rasterSrc = resultSrc || photo;
      const img = await this.loadImage(rasterSrc);
      const { c, W, H } = this.mkCanvas(img);
      this._work = { W, H };
      this._raster = c;
      // keep the original photo around too — revealFromOriginal needs it to
      // recover real pixel colors when adding areas that were previously cut.
      if (resultSrc) {
        const origImg = await this.loadImage(photo);
        const { c: origC } = this.mkCanvas(origImg);
        this._origRaster = origC;
      } else {
        this._origRaster = c;
      }
      const sc2 = document.createElement("canvas");
      sc2.width = W;
      sc2.height = H;
      this._selCanvas = sc2;
      this._selCtx = ctx2d(sc2, { willReadFrequently: true });
      // touching up a result from another tool (or an earlier lasso stroke)?
      // seed the selection preview with whatever's already kept, so the
      // highlight reads as one combined selection immediately, not just
      // whatever gets drawn from here — it should show the whole current
      // object, and grow/shrink from there as strokes are added.
      if (resultSrc) {
        const cur = await this.loadImage(resultSrc);
        this._selCtx.drawImage(cur, 0, 0, W, H);
        return this.buildSelOverlay("#3d5afe");
      }
      return { url: null, has: false };
    } catch {
      this._raster = null;
      return { url: null, has: false };
    }
  }

  clearSelection() {
    if (this._selCtx && this._work) this._selCtx.clearRect(0, 0, this._work.W, this._work.H);
  }

  // plain filled polygon, exactly what the user drew
  rawLassoMask(pts: Pt[]) {
    const { W, H } = this._work!;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d")!;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const X = p[0] * W;
      const Y = p[1] * H;
      i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
    });
    ctx.closePath();
    ctx.fillStyle = "#fff";
    ctx.fill();
    return c;
  }

  // the drawn loop is treated as a rough boundary: within it (plus a margin),
  // sample the surrounding background color and recognize which pixels belong
  // to the object, then rebuild the selection to hug that object's edges.
  // Returns { mask, zone }: mask = the recognized object pixels; zone = the
  // padded bbox that was actually analyzed (so callers can locally replace
  // just that area without disturbing unrelated parts of the image), and
  // `recognized` (false when we had to fall back to the literal drawn shape
  // because there was nothing reliable to compare against).
  refineLassoMask(pts: Pt[], tol: number) {
    const { W, H } = this._work!;
    const rough = this.rawLassoMask(pts);
    const fallback = { mask: rough, zone: rough, recognized: false };
    if (!this._raster) return fallback;
    let bx0 = W,
      by0 = H,
      bx1 = 0,
      by1 = 0;
    pts.forEach((p) => {
      const X = p[0] * W,
        Y = p[1] * H;
      bx0 = Math.min(bx0, X);
      by0 = Math.min(by0, Y);
      bx1 = Math.max(bx1, X);
      by1 = Math.max(by1, Y);
    });
    const loopW = Math.max(1, bx1 - bx0),
      loopH = Math.max(1, by1 - by0);

    // classify the loop against a ring of margin around it at a given pad
    // ratio. Returns null (not mask/zone) when that ring isn't a reliable,
    // contrasting background to compare against — the caller then tries a
    // wider ring instead of giving up outright.
    const attempt = (ratio: number) => {
      const padX = Math.max(8, loopW * ratio),
        padY = Math.max(8, loopH * ratio);
      const minX = Math.max(0, Math.floor(bx0 - padX)),
        minY = Math.max(0, Math.floor(by0 - padY));
      const maxX = Math.min(W, Math.ceil(bx1 + padX)),
        maxY = Math.min(H, Math.ceil(by1 + padY));
      const bw = Math.max(1, Math.round(maxX - minX)),
        bh = Math.max(1, Math.round(maxY - minY));

      const dil = document.createElement("canvas");
      dil.width = bw;
      dil.height = bh;
      const dctx = dil.getContext("2d")!;
      dctx.filter = "blur(4px)";
      dctx.drawImage(rough, minX, minY, bw, bh, 0, 0, bw, bh);
      dctx.filter = "none";
      const dilData = dctx.getImageData(0, 0, bw, bh).data;

      const crop = document.createElement("canvas");
      crop.width = bw;
      crop.height = bh;
      const cctx = crop.getContext("2d", { willReadFrequently: true })!;
      cctx.drawImage(this._raster!, minX, minY, bw, bh, 0, 0, bw, bh);
      const px = cctx.getImageData(0, 0, bw, bh);
      const total = bw * bh;

      // when the SOURCE image already carries real transparency here (e.g. the
      // user pasted in an already-cut-out photo to touch it up further), that
      // alpha channel already *is* the true object/background boundary —
      // far more reliable than re-guessing it from color.
      let lowA = 0,
        highA = 0;
      for (let i = 0; i < total; i++) {
        const a = px.data[i * 4 + 3];
        if (a < 30) lowA++;
        else if (a > 220) highA++;
      }
      if (lowA > total * 0.03 && highA > total * 0.03 && (lowA + highA) / total > 0.6) {
        const od0 = cctx.createImageData(bw, bh);
        for (let i = 0; i < total; i++) {
          const inZone = dilData[i * 4 + 3] > 40;
          od0.data[i * 4] = 255;
          od0.data[i * 4 + 1] = 255;
          od0.data[i * 4 + 2] = 255;
          od0.data[i * 4 + 3] = inZone && px.data[i * 4 + 3] > 127 ? 255 : 0;
        }
        const tmp0 = document.createElement("canvas");
        tmp0.width = bw;
        tmp0.height = bh;
        tmp0.getContext("2d")!.putImageData(od0, 0, 0);
        const out0 = document.createElement("canvas");
        out0.width = W;
        out0.height = H;
        out0.getContext("2d")!.drawImage(tmp0, minX, minY);
        const zone0 = document.createElement("canvas");
        zone0.width = W;
        zone0.height = H;
        const zctx0 = zone0.getContext("2d")!;
        zctx0.fillStyle = "#fff";
        zctx0.fillRect(minX, minY, bw, bh);
        return { mask: out0, zone: zone0, recognized: true };
      }

      // background estimate = a ROBUST average color of the margin (inside the
      // crop, outside the dilated loop) — the area the user framed as
      // "background" by leaving room around the object. Start from the full
      // average, then repeatedly drop the farthest-off fraction of samples and
      // re-average the rest — converges on the majority background tone and
      // discards a minority contaminating patch near the edge.
      const marginIdx: number[] = [];
      for (let i = 0; i < bw * bh; i++) {
        if (dilData[i * 4 + 3] <= 40) marginIdx.push(i);
      }
      if (marginIdx.length < Math.max(20, bw * bh * 0.02)) return null;

      const stepN = Math.max(1, Math.floor(marginIdx.length / 600));
      const samples: [number, number, number][] = [];
      for (let k = 0; k < marginIdx.length; k += stepN) {
        const i = marginIdx[k];
        samples.push([px.data[i * 4], px.data[i * 4 + 1], px.data[i * 4 + 2]]);
      }
      let br = 0,
        bg = 0,
        bb = 0;
      for (const s of samples) {
        br += s[0];
        bg += s[1];
        bb += s[2];
      }
      br /= samples.length;
      bg /= samples.length;
      bb /= samples.length;
      let pool = samples;
      for (let iter = 0; iter < 3; iter++) {
        const ranked = pool
          .map((s) => ({ s, d: (s[0] - br) ** 2 + (s[1] - bg) ** 2 + (s[2] - bb) ** 2 }))
          .sort((a, b) => a.d - b.d);
        const keepN = Math.max(8, Math.floor(ranked.length * 0.65));
        pool = ranked.slice(0, keepN).map((w) => w.s);
        br = 0;
        bg = 0;
        bb = 0;
        for (const s of pool) {
          br += s[0];
          bg += s[1];
          bb += s[2];
        }
        br /= pool.length;
        bg /= pool.length;
        bb /= pool.length;
      }

      // reliability check: is the margin actually mostly a consistent
      // background tone once that trimming is applied? Deliberately loose —
      // real photos have soft gradients, grain and JPEG noise even across a
      // plain backdrop; this only needs to rule out a margin that landed on
      // genuinely different material.
      let close = 0;
      for (const i of marginIdx) {
        const rr = px.data[i * 4],
          gg = px.data[i * 4 + 1],
          bv = px.data[i * 4 + 2];
        if (Math.sqrt((rr - br) ** 2 + (gg - bg) ** 2 + (bv - bb) ** 2) < 55) close++;
      }
      if (close / marginIdx.length < 0.45) return null;

      // second guard: a flat, evenly-lit patch of the object itself can look
      // just as "uniform" as real background. The margin only means something
      // if it actually contrasts with what's inside the loop.
      let ir = 0,
        ig = 0,
        ib = 0,
        iN = 0;
      for (let i = 0; i < bw * bh; i++) {
        if (dilData[i * 4 + 3] <= 40) continue;
        ir += px.data[i * 4];
        ig += px.data[i * 4 + 1];
        ib += px.data[i * 4 + 2];
        iN++;
      }
      if (iN > 0) {
        ir /= iN;
        ig /= iN;
        ib /= iN;
        const contrast = Math.sqrt((ir - br) ** 2 + (ig - bg) ** 2 + (ib - bb) ** 2);
        if (contrast < 18) return null;
      }

      const od = cctx.createImageData(bw, bh);
      for (let i = 0; i < bw * bh; i++) {
        const rr = px.data[i * 4],
          gg = px.data[i * 4 + 1],
          bv = px.data[i * 4 + 2];
        const dist = Math.sqrt((rr - br) ** 2 + (gg - bg) ** 2 + (bv - bb) ** 2);
        const inZone = dilData[i * 4 + 3] > 40;
        od.data[i * 4] = 255;
        od.data[i * 4 + 1] = 255;
        od.data[i * 4 + 2] = 255;
        od.data[i * 4 + 3] = inZone && dist > tol ? 255 : 0;
      }
      const tmp = document.createElement("canvas");
      tmp.width = bw;
      tmp.height = bh;
      tmp.getContext("2d")!.putImageData(od, 0, 0);

      const out = document.createElement("canvas");
      out.width = W;
      out.height = H;
      out.getContext("2d")!.drawImage(tmp, minX, minY);

      const zone = document.createElement("canvas");
      zone.width = W;
      zone.height = H;
      const zctx = zone.getContext("2d")!;
      zctx.fillStyle = "#fff";
      zctx.fillRect(minX, minY, bw, bh);
      return { mask: out, zone, recognized: true };
    };

    // a big 'new' loop drawn around a whole object carries generous background
    // margin at even a tight ratio, so it succeeds on the first, tightest ring.
    // small +/- touch-up strokes frame far less background per pixel of margin
    // at that same tight ratio — widen the ring a few times so those strokes
    // get a real chance to reach the actual edge too.
    for (const ratio of [0.08, 0.25, 0.55, 1.1]) {
      const r = attempt(ratio);
      if (r) return r;
    }
    return fallback;
  }

  buildSelOverlay(accent: string | undefined) {
    if (!this._work || !this._selCtx) return { url: null as string | null, has: false };
    const { W, H } = this._work;
    const md = this._selCtx.getImageData(0, 0, W, H).data;
    const o = document.createElement("canvas");
    o.width = W;
    o.height = H;
    const octx = o.getContext("2d")!;
    const od = octx.createImageData(W, H);
    const [ar, ag, ab] = this.hexToRgb(accent);
    let has = false;
    for (let i = 0; i < W * H; i++) {
      if (md[i * 4 + 3] > 12) {
        has = true;
        od.data[i * 4] = ar;
        od.data[i * 4 + 1] = ag;
        od.data[i * 4 + 2] = ab;
        od.data[i * 4 + 3] = 96;
      } else {
        od.data[i * 4] = 255;
        od.data[i * 4 + 1] = 255;
        od.data[i * 4 + 2] = 255;
        od.data[i * 4 + 3] = 0;
      }
    }
    octx.putImageData(od, 0, 0);
    return { url: o.toDataURL(), has };
  }

  // ---- shared local object/background segmentation for add & exclude ----
  // Within the drawn loop (plus a surrounding margin) label every pixel as
  // object or background, so a stroke can add the object side or erase the
  // background side while snapping to the real edge. Two independent signals
  // drive this, and crucially NEITHER is the loop-interior alpha (that's the
  // very thing being corrected, so it can't be trusted inside the loop):
  //   • COLOUR comes from the ORIGINAL photo (_origRaster) — reliable
  //     everywhere, including where the result raster blanked removed pixels.
  //   • The current cut's ALPHA (_raster), sampled only in the MARGIN outside
  //     the loop, tells us which nearby colours are known-object (opaque) vs
  //     known-background (transparent). Those seed two colour models; every
  //     in-loop pixel is then assigned to whichever model it's closer to.
  // Returns null when there's nothing reliable to compare against (caller then
  // falls back to the literal drawn shape so a stroke is never wasted).
  private segmentLoop(pts: Pt[], padRatio: number, tol: number) {
    const { W, H } = this._work!;
    if (!this._raster) return null;
    const colorSrc = this._origRaster || this._raster;
    let bx0 = W,
      by0 = H,
      bx1 = 0,
      by1 = 0;
    pts.forEach((p) => {
      const X = p[0] * W,
        Y = p[1] * H;
      bx0 = Math.min(bx0, X);
      by0 = Math.min(by0, Y);
      bx1 = Math.max(bx1, X);
      by1 = Math.max(by1, Y);
    });
    const loopW = Math.max(1, bx1 - bx0),
      loopH = Math.max(1, by1 - by0);
    const padX = Math.max(12, loopW * padRatio),
      padY = Math.max(12, loopH * padRatio);
    const minX = Math.max(0, Math.floor(bx0 - padX)),
      minY = Math.max(0, Math.floor(by0 - padY));
    const maxX = Math.min(W, Math.ceil(bx1 + padX)),
      maxY = Math.min(H, Math.ceil(by1 + padY));
    const bw = Math.max(1, Math.round(maxX - minX)),
      bh = Math.max(1, Math.round(maxY - minY));
    const total = bw * bh;

    const rawC = document.createElement("canvas");
    rawC.width = bw;
    rawC.height = bh;
    const rctx = rawC.getContext("2d", { willReadFrequently: true })!;
    rctx.beginPath();
    pts.forEach((p, i) => {
      const X = p[0] * W - minX,
        Y = p[1] * H - minY;
      i ? rctx.lineTo(X, Y) : rctx.moveTo(X, Y);
    });
    rctx.closePath();
    rctx.fillStyle = "#fff";
    rctx.fill();
    const inA = rctx.getImageData(0, 0, bw, bh).data;
    const inLoop = new Uint8Array(total);
    for (let i = 0; i < total; i++) inLoop[i] = inA[i * 4 + 3] > 40 ? 1 : 0;

    const colC = document.createElement("canvas");
    colC.width = bw;
    colC.height = bh;
    const colCtx = colC.getContext("2d", { willReadFrequently: true })!;
    colCtx.drawImage(colorSrc, minX, minY, bw, bh, 0, 0, bw, bh);
    const col = colCtx.getImageData(0, 0, bw, bh).data;
    const alC = document.createElement("canvas");
    alC.width = bw;
    alC.height = bh;
    const alCtx = alC.getContext("2d", { willReadFrequently: true })!;
    alCtx.drawImage(this._raster, minX, minY, bw, bh, 0, 0, bw, bh);
    const al = alCtx.getImageData(0, 0, bw, bh).data;

    let lowA = 0,
      highA = 0;
    for (let i = 0; i < total; i++) {
      const a = al[i * 4 + 3];
      if (a < 40) lowA++;
      else if (a > 200) highA++;
    }
    const hasAlpha = lowA > total * 0.02 && highA > total * 0.02;

    // robust trimmed-average colour over a set of pixel indices
    const trimmedAvg = (idx: number[]): [number, number, number] | null => {
      if (idx.length < 8) return null;
      const step = Math.max(1, Math.floor(idx.length / 800));
      const s: [number, number, number][] = [];
      for (let k = 0; k < idx.length; k += step) {
        const i = idx[k];
        s.push([col[i * 4], col[i * 4 + 1], col[i * 4 + 2]]);
      }
      let r = 0,
        g = 0,
        b = 0;
      for (const v of s) {
        r += v[0];
        g += v[1];
        b += v[2];
      }
      r /= s.length;
      g /= s.length;
      b /= s.length;
      let pool = s;
      for (let it = 0; it < 3; it++) {
        const rk = pool
          .map((v) => ({ v, d: (v[0] - r) ** 2 + (v[1] - g) ** 2 + (v[2] - b) ** 2 }))
          .sort((a, b2) => a.d - b2.d);
        pool = rk.slice(0, Math.max(6, Math.floor(rk.length * 0.7))).map((w) => w.v);
        r = 0;
        g = 0;
        b = 0;
        for (const v of pool) {
          r += v[0];
          g += v[1];
          b += v[2];
        }
        r /= pool.length;
        g /= pool.length;
        b /= pool.length;
      }
      return [r, g, b];
    };

    // seed colour models from the MARGIN only (outside the loop), where the
    // current alpha can still be trusted: transparent -> background sample,
    // opaque -> object sample. With no alpha here, the whole margin is treated
    // as background (the user framed it by leaving room around the object).
    const bgIdx: number[] = [],
      fgIdx: number[] = [];
    for (let i = 0; i < total; i++) {
      if (inLoop[i]) continue;
      if (!hasAlpha) {
        bgIdx.push(i);
        continue;
      }
      const a = al[i * 4 + 3];
      if (a < 40) bgIdx.push(i);
      else if (a > 200) fgIdx.push(i);
    }
    const need = Math.max(20, total * 0.01);
    const bg = bgIdx.length >= need ? trimmedAvg(bgIdx) : null;
    const fg = hasAlpha && fgIdx.length >= need ? trimmedAvg(fgIdx) : null;
    if (!bg && !fg) return null;

    const t = Math.max(tol, 40); // floor so the tight default tol still admits noise/AA
    const isObj = new Uint8Array(total);
    for (let i = 0; i < total; i++) {
      const r = col[i * 4],
        g = col[i * 4 + 1],
        b = col[i * 4 + 2];
      const dB = bg ? Math.sqrt((r - bg[0]) ** 2 + (g - bg[1]) ** 2 + (b - bg[2]) ** 2) : Infinity;
      const dF = fg ? Math.sqrt((r - fg[0]) ** 2 + (g - fg[1]) ** 2 + (b - fg[2]) ** 2) : Infinity;
      let obj: boolean;
      if (fg && bg) obj = dF <= dB;
      else if (bg) obj = dB > t;
      else obj = dF <= t;
      isObj[i] = obj ? 1 : 0;
    }

    let reliable = true;
    if (fg && bg) {
      const c = Math.sqrt((fg[0] - bg[0]) ** 2 + (fg[1] - bg[1]) ** 2 + (fg[2] - bg[2]) ** 2);
      if (c < 20) reliable = false;
    } else if (bg) {
      let io = 0,
        iN = 0;
      for (let i = 0; i < total; i++) {
        if (!inLoop[i]) continue;
        iN++;
        if (isObj[i]) io++;
      }
      if (iN > 0 && io / iN < 0.05) reliable = false;
    }

    return { minX, minY, bw, bh, inLoop, isObj, reliable };
  }

  // paint a crop-sized on/off mask onto a full WxH white mask canvas.
  private paintMask(minX: number, minY: number, bw: number, bh: number, on: Uint8Array) {
    const tmp = document.createElement("canvas");
    tmp.width = bw;
    tmp.height = bh;
    const tctx = tmp.getContext("2d")!;
    const od = tctx.createImageData(bw, bh);
    for (let i = 0; i < bw * bh; i++) {
      od.data[i * 4] = 255;
      od.data[i * 4 + 1] = 255;
      od.data[i * 4 + 2] = 255;
      od.data[i * 4 + 3] = on[i] ? 255 : 0;
    }
    tctx.putImageData(od, 0, 0);
    const { W, H } = this._work!;
    const out = document.createElement("canvas");
    out.width = W;
    out.height = H;
    out.getContext("2d")!.drawImage(tmp, minX, minY);
    return out;
  }

  // ADD: the user circled a region to bring BACK into the object. Object =
  // classified object (segmentLoop) OR a background-coloured pocket that's
  // walled off from the outside by object (e.g. a light belly enclosed by a
  // darker body) — found by flood-filling background inward from the crop
  // border and keeping whatever it can't reach.
  refineAddMask(pts: Pt[], magnetic: boolean, tol: number) {
    const raw = this.rawLassoMask(pts);
    if (!this._raster || !magnetic) return { mask: raw, recognized: false };
    for (const ratio of [0.18, 0.4, 0.85]) {
      const S = this.segmentLoop(pts, ratio, tol);
      if (!S || !S.reliable) continue;
      const { minX, minY, bw, bh, inLoop, isObj } = S;
      const total = bw * bh;
      const reach = new Uint8Array(total);
      const stack: number[] = [];
      const seed = (i: number) => {
        if (!isObj[i] && !reach[i]) {
          reach[i] = 1;
          stack.push(i);
        }
      };
      for (let x = 0; x < bw; x++) {
        seed(x);
        seed((bh - 1) * bw + x);
      }
      for (let y = 0; y < bh; y++) {
        seed(y * bw);
        seed(y * bw + bw - 1);
      }
      while (stack.length) {
        const i = stack.pop()!,
          x = i % bw,
          y = (i / bw) | 0;
        if (x > 0) seed(i - 1);
        if (x < bw - 1) seed(i + 1);
        if (y > 0) seed(i - bw);
        if (y < bh - 1) seed(i + bw);
      }
      const on = new Uint8Array(total);
      let kept = 0,
        loopN = 0;
      for (let i = 0; i < total; i++) {
        if (!inLoop[i]) continue;
        loopN++;
        if (isObj[i] || !reach[i]) {
          on[i] = 1;
          kept++;
        }
      }
      if (loopN > 0 && kept / loopN < 0.12) continue; // added almost nothing: widen, then fall back
      return { mask: this.paintMask(minX, minY, bw, bh, on), recognized: true };
    }
    return { mask: raw, recognized: false };
  }

  // EXCLUDE: the user circled a region to trim. Erase the background side
  // inside the loop, keeping object pixels intact. If the loop is essentially
  // all object there's no background sliver to clean — erase the drawn shape
  // as-is (the user means "remove this whole chunk").
  refineSubMask(pts: Pt[], magnetic: boolean, tol: number) {
    const raw = this.rawLassoMask(pts);
    if (!this._raster || !magnetic) return { mask: raw, recognized: false };
    for (const ratio of [0.18, 0.4, 0.85]) {
      const S = this.segmentLoop(pts, ratio, tol);
      if (!S || !S.reliable) continue;
      const { minX, minY, bw, bh, inLoop, isObj } = S;
      const total = bw * bh;
      const on = new Uint8Array(total);
      let erase = 0,
        loopN = 0;
      for (let i = 0; i < total; i++) {
        if (!inLoop[i]) continue;
        loopN++;
        if (!isObj[i]) {
          on[i] = 1;
          erase++;
        }
      }
      if (loopN > 0 && erase / loopN < 0.12) continue;
      return { mask: this.paintMask(minX, minY, bw, bh, on), recognized: true };
    }
    return { mask: raw, recognized: false };
  }

  drawLassoStroke(mask: HTMLCanvasElement, op: "new" | "add" | "sub") {
    const ctx = this._selCtx!;
    if (op === "sub") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.drawImage(mask, 0, 0);
      ctx.globalCompositeOperation = "source-over";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(mask, 0, 0);
    }
  }

  async lassoApplyRun(
    baseSrc: string,
    mask: HTMLCanvasElement,
    zone: HTMLCanvasElement,
    op: "new" | "add" | "sub",
    hadPriorResult: boolean,
  ) {
    const baseImg = await this.loadImage(baseSrc);
    const { c, x, W, H } = this.mkCanvas(baseImg);
    const revealFromOriginal = async () => {
      // _origRaster is always the original photo (set in prepLasso), even when
      // _raster is the current result with transparency.
      const oc = this._origRaster || this._raster;
      if (!oc) return;
      const reveal = document.createElement("canvas");
      reveal.width = W;
      reveal.height = H;
      const rctx = reveal.getContext("2d")!;
      rctx.drawImage(oc, 0, 0, W, H);
      rctx.globalCompositeOperation = "destination-in";
      rctx.drawImage(mask, 0, 0, W, H);
      x.drawImage(reveal, 0, 0);
      // the ORIGINAL photo can have no real data here either (e.g. an
      // already-imperfect web cutout) — close whatever's still missing with
      // its nearest surrounding color instead of leaving a permanent hole.
      this.inpaintRemainingHoles(x, W, H, mask);
    };
    if (op === "sub") {
      x.globalCompositeOperation = "destination-out";
      x.drawImage(mask, 0, 0, W, H);
      x.globalCompositeOperation = "source-over";
    } else if (op === "new" && !hadPriorResult) {
      x.globalCompositeOperation = "destination-in";
      x.drawImage(mask, 0, 0, W, H);
      x.globalCompositeOperation = "source-over";
    } else if (op === "new") {
      x.globalCompositeOperation = "destination-out";
      x.drawImage(zone, 0, 0, W, H);
      x.globalCompositeOperation = "source-over";
      await revealFromOriginal();
    } else {
      await revealFromOriginal();
    }
    return c.toDataURL("image/png");
  }

  // last-resort fill for pixels the mask says should now be visible but that
  // are STILL transparent after revealing from the original (i.e. the
  // original had nothing there either) — grows the nearest opaque color
  // inward, ring by ring, until the gap is closed. Cheap stand-in for
  // inpainting; skipped for anything larger than a small touch-up area.
  private inpaintRemainingHoles(ctx: CanvasRenderingContext2D, W: number, H: number, maskCanvas: HTMLCanvasElement) {
    const maskData = maskCanvas.getContext("2d")!.getImageData(0, 0, W, H).data;
    const id = ctx.getImageData(0, 0, W, H);
    const data = id.data;
    let remaining: number[] = [];
    for (let i = 0; i < W * H; i++) {
      if (maskData[i * 4 + 3] > 40 && data[i * 4 + 3] < 40) remaining.push(i);
    }
    if (!remaining.length || remaining.length > 60000) return false;
    const dirs = [-1, 1, -W, W, -W - 1, -W + 1, W - 1, W + 1];
    for (let pass = 0; pass < 400 && remaining.length; pass++) {
      const next: number[] = [];
      let progressed = false;
      for (const i of remaining) {
        if (data[i * 4 + 3] >= 40) continue;
        const x2 = i % W;
        let found = -1;
        for (const d of dirs) {
          const j = i + d;
          if (j < 0 || j >= W * H) continue;
          if (Math.abs((j % W) - x2) > 1) continue;
          if (data[j * 4 + 3] >= 200) {
            found = j;
            break;
          }
        }
        if (found >= 0) {
          data[i * 4] = data[found * 4];
          data[i * 4 + 1] = data[found * 4 + 1];
          data[i * 4 + 2] = data[found * 4 + 2];
          data[i * 4 + 3] = 255;
          progressed = true;
        } else next.push(i);
      }
      remaining = next;
      if (!progressed) break;
    }
    ctx.putImageData(id, 0, 0);
    return true;
  }

  // ---------- brush ----------
  // Build a mask from brush strokes: each point becomes a filled circle of
  // brushSize radius.
  brushMask(pts: Pt[], brushSize: number) {
    const { W, H } = this._work!;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p[0] * W, p[1] * H, brushSize, 0, Math.PI * 2);
      ctx.fill();
    }
    return c;
  }

  // live preview while dragging: paint directly onto the selection overlay
  paintBrushDot(p: Pt, brushSize: number, op: "add" | "sub", last: Pt | null) {
    if (!this._selCtx || !this._work) return;
    const { W, H } = this._work;
    this._selCtx.globalCompositeOperation = op === "sub" ? "destination-out" : "source-over";
    if (last) {
      this._selCtx.strokeStyle = "#fff";
      this._selCtx.lineWidth = brushSize * 2;
      this._selCtx.lineCap = "round";
      this._selCtx.lineJoin = "round";
      this._selCtx.beginPath();
      this._selCtx.moveTo(last[0] * W, last[1] * H);
      this._selCtx.lineTo(p[0] * W, p[1] * H);
      this._selCtx.stroke();
    }
    this._selCtx.beginPath();
    this._selCtx.arc(p[0] * W, p[1] * H, brushSize, 0, Math.PI * 2);
    this._selCtx.fillStyle = "#fff";
    this._selCtx.fill();
    this._selCtx.globalCompositeOperation = "source-over";
  }

  // Apply brush stroke: add reveals object from original, sub erases.
  async brushApplyRun(baseSrc: string, mask: HTMLCanvasElement, op: "add" | "sub") {
    const { c, x, W, H } = this.mkCanvas(await this.loadImage(baseSrc));
    if (op === "sub") {
      x.globalCompositeOperation = "destination-out";
      x.drawImage(mask, 0, 0, W, H);
      x.globalCompositeOperation = "source-over";
    } else {
      const oc = this._origRaster || this._raster;
      if (oc) {
        const reveal = document.createElement("canvas");
        reveal.width = W;
        reveal.height = H;
        const rctx = reveal.getContext("2d")!;
        rctx.drawImage(oc, 0, 0, W, H);
        rctx.globalCompositeOperation = "destination-in";
        rctx.drawImage(mask, 0, 0, W, H);
        x.drawImage(reveal, 0, 0);
        this.inpaintRemainingHoles(x, W, H, mask);
      }
    }
    return c.toDataURL("image/png");
  }
}
