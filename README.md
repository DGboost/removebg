# removebg (누끼컷)

Client-side AI background removal, as a real React component (no iframe, no injected runtime). Background removal runs in the browser via [`@huggingface/transformers`](https://github.com/huggingface/transformers.js), loaded lazily from a CDN on first use — no server round-trip for the image.

## Usage

```bash
npm install github:DGboost/removebg#main
```

```tsx
import { RemoveBgTool } from "removebg";

<RemoveBgTool accent="#000" appName="누끼컷" model="ormbg" />
```

`react` and `react-dom` (>=18) are peer dependencies — the host app's own React instance is used.

### Props

| Prop      | Type                                        | Default    | Description                                  |
| --------- | -------------------------------------------- | ---------- | --------------------------------------------- |
| `accent`  | `string`                                     | `#000`     | Brand accent color                            |
| `appName` | `string`                                     | `누끼컷`   | Shown as the brand mark's tooltip             |
| `model`   | `"BiRefNet_lite" \| "ormbg" \| "RMBG-1.4"`   | `ormbg`    | Which ONNX background-removal model to use    |

## Tools

- **AI 자동 제거** — analyzes the original photo with an ONNX segmentation model (transformers.js, WASM), while preserving transparency from the current edit. Failures leave the current image unchanged and allow retry; no automatic color-key fallback.
- **객체 선택** — click an object to keep it using `Xenova/slimsam-77-uniform` (q8, WASM). Each click makes a fresh selection from the original. Enable **원본과 비교** to select a different object, then refine with the brush. A single-image embedding cache lets repeated selections reuse the image encoding after the initial model load and encoding.
- **브러시** — paint to restore original pixels or erase parts of the current result. Restoration does not invent pixels where the original is transparent or repeatedly increase original opacity.

Brush editing displays the original photo with a selection overlay before, during, and after each stroke. Enable **결과 미리보기** to inspect the cutout; drawing is disabled in this preview. Disable it to continue editing on the original. Downloads and gallery saves always use the edited result.

All editing tools export at the original image dimensions and use original RGB. Analysis and manual masks remain capped at a 1200px longest edge; preserving output dimensions does not create finer mask detail. Browser canvas limits still apply. Manual tools wait for image preparation before accepting strokes, and stale operations cannot replace a newly opened image. Owned models and cached embeddings are released on unmount.

`autoTol` is no longer supported; remove this prop from host integrations.

## Run locally

```bash
./start.sh [포트]   # 기본 5173. 의존성 없으면 자동 설치 후 백그라운드로 vite 기동
./stop.sh [포트]    # 시작할 때 쓴 포트로 종료 (인자 생략 시 마지막 시작 포트 사용)
```

or directly via npm:

```bash
npm install
npm run dev   # vite dev server on http://localhost:5173, mounts <RemoveBgTool /> standalone
```

`demo/` is a minimal Vite harness for previewing the component in a browser on its own — it's dev-only and not part of the published package (see `package.json` "files"). `start.sh`/`stop.sh` track the server by the port it's bound to (not by PID) — `npm run dev` hands off to a `vite` subprocess, and killing by parent PID misses it once `npm` exits.

## Develop

```bash
npm install
npm run typecheck
npm run build   # tsup -> dist/{index.js,index.cjs,index.d.ts}
```

## Persistence (보관함)

By default the gallery is in-memory (demo seed on mount). Pass a `storage` adapter to persist items:

```tsx
import { RemoveBgTool, type RemoveBgStorage } from "removebg";

const storage: RemoveBgStorage = {
  load: () => api.list(),
  save: (item) => api.save(item),   // may receive data-URL src/photo
  update: (id, patch) => api.patch(id, patch),
  remove: (id) => api.delete(id),
};

<RemoveBgTool storage={storage} />
```

When `storage` is set, the demo seed is skipped and load/save/fav/delete go through the adapter.

## Notes

- This package was rewritten from a generated HTML/JS prototype into real TypeScript/React source (see `src/`); `git log` on this repo predates that rewrite.
