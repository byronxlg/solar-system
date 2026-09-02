// MediaPipe's wasm runtime ships inside node_modules, which a static build
// cannot serve. Copy it into public/wasm (gitignored) before dev and build so
// the same path works on the dev server and on GitHub Pages.
import fs from "node:fs";
import path from "node:path";

const src = path.resolve("node_modules/@mediapipe/tasks-vision/wasm");
const dst = path.resolve("public/wasm");
fs.mkdirSync(dst, { recursive: true });
for (const file of fs.readdirSync(src)) fs.copyFileSync(path.join(src, file), path.join(dst, file));
console.log(`copied ${fs.readdirSync(src).length} wasm files to public/wasm`);
