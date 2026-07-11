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

## Develop

```bash
npm install
npm run typecheck
npm run build   # tsup -> dist/{index.js,index.cjs,index.d.ts}
```

## Notes

- The "보관함" (saved items) gallery is in-memory only for now — it resets on reload. Add persistence (e.g. `localStorage`) if that's needed downstream.
- This package was rewritten from a generated HTML/JS prototype into real TypeScript/React source (see `src/`); `git log` on this repo predates that rewrite.
