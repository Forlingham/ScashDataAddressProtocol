# Scash-DAP: Stateless On-chain Data Protocol

**Scash-DAP** 是一种轻量级、无状态、抗审查的链上数据存储协议。它利用比特币（及 Scash）原生 SegWit (P2WSH) 机制，将任意数据伪装成标准的区块链地址，从而实现绕过 `OP_RETURN` 限制的永久数据存证。

[![npm version](https://img.shields.io/npm/v/scash-dap.svg)](https://www.npmjs.com/package/scash-dap)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 📚 协议文档

详细的协议规范、Magic Header 定义及数据结构，请参阅：

👉 **[Scash-DAP 协议规范 (Protocol Specification)](./docs/PROTOCOL.md)**

---

## 🚀 安装

通过 npm 安装：

```bash
npm install scash-dap
```

## 📦 打包产物 / 多端使用

| 产物文件 | 格式 | 适用场景 | 包体 | 是否内置依赖 |
| --- | --- | --- | --- | --- |
| `index.js` (源码 CommonJS) | CJS | Node.js `require()` | 源码 | external |
| `dist/scash-dap.mjs` | ESM | Vite / Webpack / Rollup 等打包器 `import` | ~9 KB | external（打包器自行解析 `bech32` / `bitcoinjs-lib` / `pako`） |
| `dist/scash-dap.browser.mjs` | ESM | 浏览器原生 `<script type="module">` | ~344 KB（已 minify） | **内置依赖 + Buffer polyfill** |
| `dist/scash-dap.js` | IIFE | 浏览器 `<script>` 标签 / CDN（unpkg、jsdelivr） | ~344 KB（已 minify） | **内置依赖 + Buffer polyfill** |

> ⚠️ 之前版本的 `dist/scash-dap.js` 因为没有注入 Buffer polyfill，无法在浏览器直接使用。当前版本已通过 esbuild `--inject` 修复。

---

## 💻 使用指南

### 1. Node.js (CommonJS)

```javascript
const ScashDAP = require('scash-dap')

const dap = new ScashDAP({
  messagePrefix: '\x18Scash Signed Message:\n',
  bech32: 'scash',
  bip32: { public: 0x0488b21e, private: 0x0488ade4 },
  pubKeyHash: 0x3c,
  scriptHash: 0x7d,
  wif: 0x80
})

const text = 'Hello, Blockchain! This message will live forever.'
const cost = dap.estimateCost(text)
console.log(`需要 ${cost.chunkCount} 个 UTXO，总计 ${cost.totalSats} sats`)

const outputs = dap.createDapOutputs(text)
// [{ address: 'scash1...', value: 546 }, ...]
```

### 2. 打包器 (Vite / Webpack / Rollup)

```javascript
import ScashDAP from 'scash-dap'

const dap = new ScashDAP({ bech32: 'scash', /* ... */ })
const outputs = dap.createDapOutputs('Hello!')
```

> 这种方式打包器会自动从 `node_modules` 解析 `bech32` / `bitcoinjs-lib` / `pako`，包体最小。

### 3. 浏览器 - `<script>` 标签 (IIFE)

适用于不使用打包器的传统页面，或希望通过 CDN 直接引入的场景：

```html
<!-- 本地 -->
<script src="./node_modules/scash-dap/dist/scash-dap.js"></script>

<!-- 或 CDN -->
<script src="https://unpkg.com/scash-dap/dist/scash-dap.js"></script>
<!-- 或 -->
<script src="https://cdn.jsdelivr.net/npm/scash-dap/dist/scash-dap.js"></script>

<script>
  // 全局变量 ScashDAP 可用
  console.log('Version:', ScashDAP.version)

  const dap = new ScashDAP({
    messagePrefix: '\x18Scash Signed Message:\n',
    bech32: 'scash',
    bip32: { public: 0x0488b21e, private: 0x0488ade4 },
    pubKeyHash: 0x3c, scriptHash: 0x7d, wif: 0x80
  })

  const message = dap.parseDapTransaction(['scash1...', 'scash1...'])

  // ⚠️ 必须用 textContent 防止 XSS
  document.getElementById('content').textContent = message
</script>
```

### 4. 浏览器 - 原生 ESM (`<script type="module">`)

```html
<script type="module">
  import ScashDAP from './node_modules/scash-dap/dist/scash-dap.browser.mjs'
  // 或 CDN（任意支持 ESM 的 CDN）：
  // import ScashDAP from 'https://unpkg.com/scash-dap/dist/scash-dap.browser.mjs'

  const dap = new ScashDAP({ bech32: 'scash', /* ... */ })
  console.log(dap.createDapOutputs('Hello!'))
</script>
```

### 5. 现成 Demo

仓库自带两个 demo：

- **[`demo/browser-demo.html`](./demo/browser-demo.html)** — 纯浏览器 demo，直接 `<script>` 引入 `dist/scash-dap.js`，无需 NW.js / 打包器，适合在普通浏览器中测试编码 / 解码 / 协议识别等所有 API。
- **[`demo/index.html`](./demo/index.html)** — NW.js 桌面 demo，包含助记词、UTXO 扫描、广播交易等完整链上流程（依赖 RPC，需要 `nw .` 启动）。

> 用法：`git clone` 之后在仓库根目录执行 `npm install && npm run build`，然后用浏览器打开 `demo/browser-demo.html` 即可。

---

## 🛠 API 概览

| 方法 | 说明 |
| --- | --- |
| `new ScashDAP(network, debug?)` | 初始化实例。`network` 可以是完整的 bitcoinjs-lib 网络对象，或仅包含 `bech32` 字段的简化对象。 |
| `estimateCost(text)` | 估算上链所需的 UTXO 数量、字节数、烧币 sats。 |
| `createDapOutputs(text)` | 把文本编码成一组 `{ address, value }` 输出（自动在 RAW / ZIP 模式间智能选择）。 |
| `parseDapTransaction(inputs)` | 从地址列表 / RPC outputs 中还原原始文本。支持三种入参格式。 |
| `isScashDAPAddress(address)` | 判断地址是否属于 ScashDAP 协议。 |
| `getProtocolType(address)` | 返回地址使用的协议模式：`'RAW' \| 'ZIP' \| null`。 |
| `decodeScashAddressToHash(address)` | **公开方法**：将 Scash bech32 P2WSH 地址解码为 32 字节 Hash Buffer（前 4 字节为 Magic Header，后 28 字节为分片数据），便于二次开发自定义协议。 |
| `ScashDAP.version` | 静态属性，库版本号。 |

## ⚠️ 安全提示

当您使用 `parseDapTransaction` 读取链上数据并展示在网页上时，请务必注意防范 **XSS (跨站脚本攻击)**。
链上数据是公开且不可控的，攻击者可能会上传恶意 HTML / JS 代码。

**✅ 正确做法:**

```javascript
div.textContent = data // 安全
div.innerText = data   // 安全
```

**❌ 危险做法:**

```javascript
div.innerHTML = data // 危险！可能执行恶意脚本
```

## 🧪 本地开发

```bash
# 安装依赖
npm install

# 一次性构建所有产物（IIFE / 浏览器 ESM / 打包器 ESM）
npm run build

# 跑测试（包含 Node 端测试 + 浏览器构建烟雾测试）
npm test
```

## License

MIT
