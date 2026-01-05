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

## 💻 使用指南

Scash-DAP 支持 Node.js 和 浏览器环境。

### 1. Node.js 环境 (CommonJS)

```javascript
const ScashDAP = require('scash-dap')

// 1. 初始化 (连接到 Scash 主网)
const dap = new ScashDAP({
  messagePrefix: '\x18Scash Signed Message:\n',
  bech32: 'scash',
  bip32: { public: 0x0488b21e, private: 0x0488ade4 },
  pubKeyHash: 0x3c,
  scriptHash: 0x7d,
  wif: 0x80
  // 其他 bitcoinjs-lib 网络参数...
})

// 2. 准备上链数据
const text = 'Hello, Blockchain! This message will live forever.'

// 3. 估算成本 (可选)
const cost = dap.estimateCost(text)
console.log(`需要 ${cost.chunkCount} 个 UTXO，总计 ${cost.totalSats} sats`)

// 4. 生成交易输出
// 返回一组包含 address 和 value 的对象
const outputs = dap.createDapOutputs(text)
console.log(outputs)
/* 
[
  { address: 'scash1...', value: 546 },
  { address: 'scash1...', value: 546 }
]
*/

// ... 后续使用您的钱包库发送交易 ...
```

### 2. 浏览器环境 (ES Module / IIFE)

#### 方式 A: 使用 ES Module (推荐 - Vite/Webpack)

```javascript
import ScashDAP from 'scash-dap/dist/scash-dap.mjs'

const dap = new ScashDAP({
  messagePrefix: '\x18Scash Signed Message:\n',
  bech32: 'scash',
  bip32: { public: 0x0488b21e, private: 0x0488ade4 },
  pubKeyHash: 0x3c,
  scriptHash: 0x7d,
  wif: 0x80
})
// 用法同上
```

#### 方式 B: 直接引入 Script 标签 (传统方式)

```html
<!-- 引入打包好的文件 -->
<script src="./node_modules/scash-dap/dist/scash-dap.js"></script>

<script>
  // 全局变量 ScashDAP 可用
  console.log('Current Version:', ScashDAP.version)

  const dap = new ScashDAP({ bech32: 'scash' })

  // 模拟从链上获取的 outputs 数据
  const mockOutputs = [
    { scriptPubKey: { address: 'scash1...' } }, // 包含数据的地址
    { scriptPubKey: { address: 'scash1...' } }
  ]

  // 解析数据
  const message = dap.parseDapTransaction(mockOutputs)

  // ⚠️ 安全警告：在页面展示时请使用 innerText 防止 XSS
  document.getElementById('content').innerText = message
</script>
```

## 🛠 API 概览

- `new ScashDAP(network, debug)`: 初始化实例。
- `estimateCost(text)`: 估算上链所需的 UTXO 数量和费用。
- `createDapOutputs(text)`: 生成包含数据的转账输出列表。
- `parseDapTransaction(outputs)`: 从交易输出中解析并还原数据。
- `getProtocolType(address)`: 检测地址是否为 DAP 地址及使用的协议模式。

## ⚠️ 安全提示

当您使用 `parseDapTransaction` 读取链上数据并展示在网页上时，请务必注意防范 **XSS (跨站脚本攻击)**。
链上数据是公开且不可控的，攻击者可能会上传恶意 HTML/JS 代码。

**✅ 正确做法:**

```javascript
div.innerText = data // 安全
div.textContent = data // 安全
```

**❌ 危险做法:**

```javascript
div.innerHTML = data // 危险！可能执行恶意脚本
```

## License

MIT
