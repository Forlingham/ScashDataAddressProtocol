// ---------------------------------------------------------------------------
// Buffer polyfill shim
// ---------------------------------------------------------------------------
// 用途：在浏览器构建中通过 esbuild 的 --inject 参数注入，把 Node.js 的
//      `Buffer` 全局替换为 `buffer` npm 包提供的实现。
//
// 工作原理：
//   - esbuild 在打包时遇到任何对 `Buffer` 标识符的引用，都会插入一句
//     `import { Buffer } from "<本文件>"`，从而保证 ScashDAP 源码以及
//     bitcoinjs-lib、pako 等依赖里所有的 Buffer 用法都能在浏览器环境工作。
//   - 这样我们无需修改任何业务代码即可让现有 CJS 实现跑在浏览器里。
//
// 注意：仅用于浏览器构建（dist/scash-dap.js 与 dist/scash-dap.browser.mjs）。
//       Node.js 环境天然有 Buffer，因此不需要这个 shim。
// ---------------------------------------------------------------------------

import { Buffer } from 'buffer';

export { Buffer };
