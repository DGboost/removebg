# removebg (누끼컷)

Client-side AI background removal, as a real React component (no iframe, no injected runtime). Background removal runs in the browser via [`@huggingface/transformers`](https://github.com/huggingface/transformers.js), loaded lazily from a CDN on first use — no server round-trip for the image.

## Usage

```bash
npm install github:DGboost/removebg#main
```

```tsx
import { RemoveBgTool } from "removebg";

<RemoveBgTool accent="#3d5afe" appName="누끼컷" model="ormbg" />
```

`react` and `react-dom` (>=18) are peer dependencies — the host app's own React instance is used.

### Props

| Prop      | Type                                        | Default    | Description                                  |
| --------- | -------------------------------------------- | ---------- | --------------------------------------------- |
| `accent`  | `string`                                     | `#3d5afe`  | Brand accent color                            |
| `appName` | `string`                                     | `누끼컷`   | Shown as the brand mark's tooltip             |
| `autoTol` | `number`                                     | `30`       | Default tolerance for the click-eraser tool   |
| `model`   | `"BiRefNet_lite" \| "ormbg" \| "RMBG-1.4"`   | `ormbg`    | Which ONNX background-removal model to use    |

## Tools

- **AI 자동 제거** — one-click background removal via an ONNX segmentation model (transformers.js, WASM).
- **클릭 지우개** — click a background pixel to key out similar colors.
- **사각형 선택** — drag a rectangle to keep only that region.
- **스마트 올가미** — draw a rough loop; a magnetic-lasso heuristic snaps it to the real object edge using local color segmentation.
- **브러시** — paint to add back or erase parts of the current result.

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
