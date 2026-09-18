// Canvas-based cutout engine: pure image-processing logic, independent of React.
// RemoveBgTool (the component) owns one instance and drives it from event handlers.

import type { ObjectOp } from "./types";

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


interface SamTensor {
  dims: number[];
  data: Float32Array | Uint8Array | BigInt64Array;
  dispose(): void;
}

interface SamEmbeddings {
  image_embeddings: SamTensor;
  image_positional_embeddings: SamTensor;
}

interface SamImage extends SamEmbeddings {
  src: string;
  W: number;
  H: number;
  original_sizes: number[][];
  reshaped_input_sizes: number[][];
}

interface SamResources {
  model: {
    (inputs: SamEmbeddings & { input_points: SamTensor; input_labels: SamTensor }): Promise<{
      pred_masks: SamTensor;
      iou_scores: SamTensor;
    }>;
    get_image_embeddings(inputs: { pixel_values: SamTensor }): Promise<SamEmbeddings>;
    dispose(): Promise<void>;
  };
  processor: {
    (image: unknown): Promise<{
      pixel_values: SamTensor;
      original_sizes: number[][];
      reshaped_input_sizes: number[][];
    }>;
    post_process_masks(masks: SamTensor, original: number[][], reshaped: number[][]): Promise<SamTensor[]>;
  };
}

function ctx2d(c: HTMLCanvasElement, opts?: CanvasRenderingContext2DSettings) {
  const x = c.getContext("2d", opts);
  if (!x) throw new Error("2d context unavailable");
  return x;
}

export class RemoveBgEngine {
  private _T: any = null;
  private _tp: Promise<any> | null = null;
  private _runtimeAttempt = 0;
  private _pipelines: Partial<Record<ModelKey, Promise<any>>> = {};
  private _sam: Promise<SamResources> | null = null;
  private _samImage: SamImage | null = null;
  private _jobs: Promise<unknown> = Promise.resolve();
  private _disposed = false;
  private _disposePromise: Promise<void> | null = null;
  private _preparation = 0;

  // Working state for the brush, set up by prepBrush().
  private _work: { W: number; H: number } | null = null;
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
    let hex = (h || "#000").replace("#", "");
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

  mkCanvas(img: HTMLImageElement, maxSize = 1200) {
    let W = img.naturalWidth || 480;
    let H = img.naturalHeight || 480;
    const m = Math.max(W, H);
    const s = m > maxSize ? maxSize / m : 1;
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

  private assertActive() {
    if (this._disposed) throw new Error("이미지 엔진이 종료되었습니다.");
  }

  // All inference and cache eviction share one queue: no tensor can be freed
  // while a decoder (or a background-removal pipeline) is still using it.
  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = this._jobs.then(async () => {
      this.assertActive();
      const result = await job();
      this.assertActive();
      return result;
    });
    this._jobs = run.catch(() => undefined);
    return run;
  }

  private releaseSamImage() {
    const image = this._samImage;
    this._samImage = null;
    image?.image_embeddings.dispose();
    image?.image_positional_embeddings.dispose();
  }

  dispose(): Promise<void> {
    if (this._disposePromise) return this._disposePromise;
    this._disposed = true;
    this.invalidatePreparation();
    this._disposePromise = this._jobs.then(async () => {
      this.releaseSamImage();
      const resources = await Promise.allSettled([
        ...Object.values(this._pipelines).map(async (pipeline) => (await pipeline).dispose()),
        ...(this._sam ? [this._sam.then(({ model }) => model.dispose())] : []),
      ]);
      this._pipelines = {};
      this._sam = null;
      this._T = null;
      this._tp = null;
      const failure = resources.find((result) => result.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
    });
    return this._disposePromise;
  }

  private loadT(): Promise<any> {
    this.assertActive();
    if (this._T) return Promise.resolve(this._T);
    if (!this._tp) {
      const attempt = this._runtimeAttempt++;
      const url = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1" +
        (attempt ? `?retry=${attempt}` : "");
      this._tp = import(/* @vite-ignore */ url).then((T) => {
        this.assertActive();
        T.env.allowLocalModels = false;
        this._T = T;
        return T;
      }).catch((error) => {
        this._tp = null;
        throw error;
      });
    }
    return this._tp;
  }

  private getSam(onProgress: (msg: string) => void): Promise<SamResources> {
    if (!this._sam) {
      this._sam = (async () => {
        const T = await this.loadT();
        const modelId = "Xenova/slimsam-77-uniform";
        const progress_callback = (p: { status: string; progress?: number }) => {
          if (!this._disposed && p.status === "progress" && p.progress != null) {
            onProgress("객체 모델 다운로드 " + Math.round(p.progress) + "%");
          }
        };
        const processor = await T.AutoProcessor.from_pretrained(modelId, { progress_callback });
        this.assertActive();
        const model = await T.SamModel.from_pretrained(modelId, {
          dtype: "q8", device: "wasm", progress_callback,
        });
        if (this._disposed) {
          await model.dispose();
          this.assertActive();
        }
        return { model, processor };
      })().catch((error) => {
        this._sam = null;
        throw error;
      });
    }
    return this._sam;
  }

  private async samImage(src: string, resources: SamResources): Promise<SamImage> {
    if (this._samImage?.src === src) return this._samImage;
    this.releaseSamImage();
    const { c, W, H } = this.mkCanvas(await this.loadImage(src));
    this.assertActive();
    const inputs = await resources.processor(this._T.RawImage.fromCanvas(c));
    try {
      this.assertActive();
      const embeddings = await resources.model.get_image_embeddings(inputs);
      if (this._disposed) {
        embeddings.image_embeddings.dispose();
        embeddings.image_positional_embeddings.dispose();
        this.assertActive();
      }
      this._samImage = {
        src, W, H, ...embeddings,
        original_sizes: inputs.original_sizes,
        reshaped_input_sizes: inputs.reshaped_input_sizes,
      };
      return this._samImage;
    } finally {
      inputs.pixel_values.dispose();
    }
  }

  private async recognize(
    image: SamImage, resources: SamResources, point: Pt,
  ): Promise<HTMLCanvasElement> {
    const { W, H } = image;
    const [resizedH, resizedW] = image.reshaped_input_sizes[0];
    // Tensor coordinates are x,y; processor size metadata is height,width.
    const coordinates = new Float32Array([point[0] * resizedW / W, point[1] * resizedH / H]);
    const input_points: SamTensor = new this._T.Tensor("float32", coordinates, [1, 1, 1, 2]);
    const input_labels: SamTensor = new this._T.Tensor("int64", new BigInt64Array([1n]), [1, 1, 1]);
    let outputs: Awaited<ReturnType<SamResources["model"]>> | undefined;
    let masks: SamTensor[] = [];
    try {
      outputs = await resources.model({
        image_embeddings: image.image_embeddings,
        image_positional_embeddings: image.image_positional_embeddings,
        input_points, input_labels,
      });
      masks = await resources.processor.post_process_masks(
        outputs.pred_masks, image.original_sizes, image.reshaped_input_sizes,
      );
      this.assertActive();
      const mask = masks[0];
      const scores = outputs.iou_scores;
      const pixels = W * H;
      if (!mask || mask.dims.length !== 4 || mask.dims[0] !== 1 ||
          mask.dims[2] !== H || mask.dims[3] !== W ||
          scores.dims.length !== 3 || scores.dims[0] !== 1 ||
          scores.dims[1] !== 1 || scores.dims[2] !== mask.dims[1] ||
          scores.data.length !== mask.dims[1] ||
          mask.data.length !== scores.data.length * pixels) {
        throw new Error("객체 모델이 올바른 마스크를 반환하지 않았습니다.");
      }
      let selected = -1;
      let best = -Infinity;
      for (let candidate = 0; candidate < scores.data.length; candidate++) {
        const score = Number(scores.data[candidate]);
        const offset = candidate * pixels;
        if (!Number.isFinite(score) || score <= 0 ||
            !mask.data[offset + Math.floor(point[1]) * W + Math.floor(point[0])]) continue;
        if (score > best) {
          best = score;
          selected = candidate;
        }
      }
      if (selected < 0) throw new Error("신뢰할 수 있는 객체를 찾지 못했습니다. 객체 안의 다른 지점을 클릭해 주세요.");
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const x = ctx2d(c);
      const data = x.createImageData(W, H);
      for (let i = 0; i < pixels; i++) {
        data.data[i * 4] = data.data[i * 4 + 1] = data.data[i * 4 + 2] = 255;
        data.data[i * 4 + 3] = mask.data[selected * pixels + i] ? 255 : 0;
      }
      x.putImageData(data, 0, 0);
      return c;
    } finally {
      input_points.dispose();
      input_labels.dispose();
      for (const mask of masks) mask.dispose();
      outputs?.pred_masks.dispose();
      outputs?.iou_scores.dispose();
    }
  }

  clickKeep(
    src: string, pt: Pt, currentSrc: string | null, op: ObjectOp, onProgress: (msg: string) => void,
  ): Promise<string> {
    return this.enqueue(async () => {
      if (op === "sub" && !currentSrc) throw new Error("제거할 선택이 없습니다. 먼저 객체를 선택해 주세요.");
      const operation = currentSrc ? op : "new";
      onProgress("클릭 객체 모델 준비 중…");
      const resources = await this.getSam(onProgress);
      const image = await this.samImage(src, resources);
      const point: Pt = [
        Math.max(0, Math.min(image.W - 1, Math.floor(pt[0] * image.W))),
        Math.max(0, Math.min(image.H - 1, Math.floor(pt[1] * image.H))),
      ];
      onProgress("클릭한 객체 인식 중…");
      const mask = await this.recognize(image, resources, point);
      const { c } = this.mkCanvas(await this.loadImage(src), Infinity);
      const base = operation === "new" ? c : await this.loadImage(currentSrc!);
      return this.composite(c, base, mask, operation);
    });
  }

  // Cache in-flight initialization as well as ready pipelines.
  private getPipeline(modelKey: ModelKey, onProgress: (msg: string) => void): Promise<any> {
    if (!this._pipelines[modelKey]) {
      this._pipelines[modelKey] = (async () => {
        const T = await this.loadT();
        const pipeline = await T.pipeline("background-removal", MODEL_IDS[modelKey], {
          dtype: MODEL_DTYPES[modelKey], device: "wasm",
          progress_callback: (p: { status: string; progress?: number }) => {
            if (!this._disposed && p.status === "progress" && p.progress != null) {
              onProgress("모델 다운로드 " + Math.round(p.progress) + "%");
            }
          },
        });
        if (this._disposed) {
          await pipeline.dispose();
          this.assertActive();
        }
        return pipeline;
      })().catch((error) => {
        delete this._pipelines[modelKey];
        throw error;
      });
    }
    return this._pipelines[modelKey]!;
  }

  ensureModel(modelKey: ModelKey, onProgress: (msg: string) => void) {
    return this.enqueue(async () => {
      await this.getPipeline(modelKey, onProgress);
      return true;
    });
  }

  rmbgRemove(photo: string, modelKey: ModelKey, currentSrc: string | null = null): Promise<string> {
    return this.enqueue(async () => {
      const segmenter = await this.getPipeline(modelKey, () => undefined);
      const original = await this.loadImage(photo);
      const { c: raster } = this.mkCanvas(original);
      const results = await segmenter(raster.toDataURL("image/png"));
      const out = results?.[0];
      if (!out || out.channels !== 4 || !Number.isInteger(out.width) || !Number.isInteger(out.height) ||
          out.width <= 0 || out.height <= 0 || out.width !== raster.width || out.height !== raster.height ||
          !(out.data instanceof Uint8Array || out.data instanceof Uint8ClampedArray) ||
          out.data.length !== out.width * out.height * 4 || typeof out.toCanvas !== "function") {
        throw new Error("배경 제거 모델이 올바른 RGBA 이미지를 반환하지 않았습니다.");
      }
      const { c, x, W, H } = this.mkCanvas(original, Infinity);
      const result = x.getImageData(0, 0, W, H);
      const predicted = this.scaledPixels(out.toCanvas(), W, H);
      const current = currentSrc ? this.scaledPixels(await this.loadImage(currentSrc), W, H) : result.data;
      for (let i = 3; i < result.data.length; i += 4) {
        result.data[i] = Math.min(result.data[i], current[i], predicted[i]);
      }
      x.putImageData(result, 0, 0);
      return c.toDataURL("image/png");
    });
  }

  invalidatePreparation() {
    this._preparation++;
    this._work = null;
    this._origRaster = null;
    this._selCanvas = null;
    this._selCtx = null;
  }

  async prepBrush(photo: string, resultSrc: string | null): Promise<void> {
    this.assertActive();
    this.invalidatePreparation();
    const generation = this._preparation;
    const [original, current] = await Promise.all([
      this.loadImage(photo), resultSrc ? this.loadImage(resultSrc) : Promise.resolve(null),
    ]);
    this.assertActive();
    if (generation !== this._preparation) throw new Error("이전 이미지 준비가 취소되었습니다.");
    const { c: originalRaster } = this.mkCanvas(original, Infinity);
    const scale = Math.min(1, 1200 / Math.max(originalRaster.width, originalRaster.height));
    const W = Math.max(1, Math.round(originalRaster.width * scale));
    const H = Math.max(1, Math.round(originalRaster.height * scale));
    const selection = document.createElement("canvas");
    selection.width = W;
    selection.height = H;
    const selectionCtx = ctx2d(selection, { willReadFrequently: true });
    if (current) selectionCtx.drawImage(current, 0, 0, W, H);
    this._origRaster = originalRaster;
    this._work = { W, H };
    this._selCanvas = selection;
    this._selCtx = selectionCtx;
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


  // Render the current selection (_selCanvas, white-alpha) into a visible DOM
  // overlay canvas, tinted to the accent color. This is deliberately cheap —
  // two drawImage calls, no getImageData / no toDataURL — so it can run on
  // every pointer move during a brush stroke without janking. The caller sizes
  // it over the image and softens it with CSS opacity.
  renderSelOverlay(dom: HTMLCanvasElement, accent: string) {
    if (!this._work || !this._selCanvas) return;
    const { W, H } = this._work;
    if (dom.width !== W) dom.width = W;
    if (dom.height !== H) dom.height = H;
    const x = dom.getContext("2d");
    if (!x) return;
    x.globalCompositeOperation = "source-over";
    x.clearRect(0, 0, W, H);
    x.fillStyle = accent;
    x.fillRect(0, 0, W, H);
    // keep the accent only where the selection has alpha
    x.globalCompositeOperation = "destination-in";
    x.drawImage(this._selCanvas, 0, 0);
    x.globalCompositeOperation = "source-over";
  }

  private scaledPixels(source: CanvasImageSource, W: number, H: number, mask = false) {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const x = ctx2d(c);
    // Keep the brush mask's bounded-work footprint. Image/prediction alpha
    // uses interpolation.
    x.imageSmoothingEnabled = !mask;
    x.drawImage(source, 0, 0, W, H);
    return x.getImageData(0, 0, W, H).data;
  }

  private composite(
    original: HTMLCanvasElement, base: CanvasImageSource,
    mask: HTMLCanvasElement, op: ObjectOp,
  ): string {
    const W = original.width, H = original.height;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const x = ctx2d(c);
    x.drawImage(original, 0, 0);
    const output = x.getImageData(0, 0, W, H);
    const current = op === "new" ? output.data : this.scaledPixels(base, W, H);
    const coverage = this.scaledPixels(mask, W, H, true);
    for (let i = 3; i < output.data.length; i += 4) {
      const originalAlpha = output.data[i];
      const currentAlpha = Math.min(originalAlpha, current[i]);
      const m = coverage[i] / 255;
      let alpha: number;
      if (op === "sub") alpha = currentAlpha * (1 - m);
      else if (op === "add") alpha = Math.max(currentAlpha, originalAlpha * m);
      else alpha = originalAlpha * m;
      output.data[i] = Math.min(originalAlpha, Math.round(alpha));
    }
    x.putImageData(output, 0, 0);
    return c.toDataURL("image/png");
  }

  // ---------- brush ----------
  // Build a mask from a brush stroke. brushSize is the brush DIAMETER (the same
  // footprint the on-screen cursor ring shows), so the radius is brushSize/2.
  // Consecutive points are joined with a round-capped stroke of that diameter —
  // NOT just discrete dots — otherwise a fast drag (whose sampled points are
  // spaced far apart) leaves gaps and the committed result looks broken even
  // though the live preview (which is stroked) looked continuous.
  brushMask(pts: Pt[], brushSize: number) {
    const { W, H } = this._work!;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d")!;
    const r = brushSize / 2;
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = brushSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (pts.length === 1) {
      const p = pts[0];
      ctx.beginPath();
      ctx.arc(p[0] * W, p[1] * H, r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      pts.forEach((p, i) => {
        const X = p[0] * W,
          Y = p[1] * H;
        i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
      });
      ctx.stroke();
    }
    return c;
  }

  // live preview while dragging: paint directly onto the selection overlay.
  // Sizing matches brushMask (radius = brushSize/2, stroke width = brushSize)
  // so the preview and the committed result are identical.
  paintBrushDot(p: Pt, brushSize: number, op: "add" | "sub", last: Pt | null) {
    if (!this._selCtx || !this._work) return;
    const { W, H } = this._work;
    const r = brushSize / 2;
    this._selCtx.globalCompositeOperation = op === "sub" ? "destination-out" : "source-over";
    if (last) {
      this._selCtx.strokeStyle = "#fff";
      this._selCtx.lineWidth = brushSize;
      this._selCtx.lineCap = "round";
      this._selCtx.lineJoin = "round";
      this._selCtx.beginPath();
      this._selCtx.moveTo(last[0] * W, last[1] * H);
      this._selCtx.lineTo(p[0] * W, p[1] * H);
      this._selCtx.stroke();
    }
    this._selCtx.beginPath();
    this._selCtx.arc(p[0] * W, p[1] * H, r, 0, Math.PI * 2);
    this._selCtx.fillStyle = "#fff";
    this._selCtx.fill();
    this._selCtx.globalCompositeOperation = "source-over";
  }

  // Apply brush stroke at original resolution; brush diameter remains in work pixels.
  async brushApplyRun(baseSrc: string, mask: HTMLCanvasElement, op: "add" | "sub") {
    this.assertActive();
    const original = this._origRaster;
    const generation = this._preparation;
    if (!original) throw new Error("이미지를 먼저 준비하세요.");
    const base = await this.loadImage(baseSrc);
    this.assertActive();
    if (generation !== this._preparation) throw new Error("이미지가 변경되어 편집을 취소했습니다.");
    return this.composite(original, base, mask, op);
  }
}
