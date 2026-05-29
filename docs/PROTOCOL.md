# Scash-DAP 协议规范 (Protocol Specification)

**版本**: v1.1.0
**状态**: 正式版
**类型**: 无状态 (Stateless) / UTXO 模型

---

## 1. 概述

Scash-DAP (Data Address Protocol) 是一种利用比特币及 Scash 网络原生 SegWit (P2WSH) 机制进行数据存证的协议。它通过将数据伪装成标准的 P2WSH 地址哈希，绕过了 `OP_RETURN` 的长度限制，并利用 UTXO 集合实现永久存储。

协议采用**两层结构**：

| 层级 | 关注点 | 由谁定义 |
| :--- | :--- | :--- |
| **L1 - 编码层** (Encoding Layer) | 字节流如何在链上分片、压缩、识别 | 协议本体（仅 `RAW` / `ZIP` 两种模式） |
| **L2 - 应用层** (Application Layer) | 字节流的语义（红包、消息、资料、图片…） | 应用层使用 JSON 信封约定 |

这种分层设计让编码层保持稳定与最小化，所有未来扩展都通过 **L2 JSON 信封的 `type` 字段**进行，无需新增 Magic Header。

---

## 2. L1 编码层 - 数据结构

每个 Scash-DAP 数据单元是一个标准的 P2WSH 地址，其背后的 Witness Script Hash (32 字节) 结构如下：

```text
| <------- 32 Bytes Witness Script Hash -------> |
+------------------+-----------------------------+
|   Magic Header   |        Data Payload         |
+------------------+-----------------------------+
|     4 Bytes      |          28 Bytes           |
+------------------+-----------------------------+
```

* **Magic Header (4 字节)**: 用于标识 L1 编码模式（`RAW` 或 `ZIP`）。解析器通过此头部决定读取后续字节的方式。
* **Data Payload (28 字节)**: 实际存储的数据片段。若不足 28 字节，末尾用 `0x00` 补齐。

## 3. L1 编码模式 (Encoding Modes)

> ⚠️ Scash-DAP **只定义** `RAW` 和 `ZIP` 两种 Magic Header。任何新的语义扩展请走 L2 JSON 信封，**不要**新增 Magic Header。

| 模式名称 | Magic Header (Hex) | 描述 | 处理逻辑 |
| :--- | :--- | :--- | :--- |
| **RAW (原文)** | `AF AF AF AF` | 原始 UTF-8 字节流 | 拼接后直接按 UTF-8 解码 |
| **ZIP (压缩)** | `AC AC AC AC` | Zlib 压缩字节流 | 拼接后用 Zlib Inflate 解压，再按 UTF-8 解码 |

**模式选择策略（编码方）**：

编码时，先尝试将原文用 ZLIB 压缩，比较两者长度：
* 若 `压缩长度 < 原文长度`，使用 `ZIP` 模式；
* 否则使用 `RAW` 模式。

**模式识别（解析方）**：

解析时，逐个 P2WSH 地址解码出 32 字节 Hash，前 4 字节匹配上述 Magic Header 即为 Scash-DAP 数据片段；其它 Magic Header **必须忽略**（视为非协议数据，可能是普通转账 / 找零）。

---

## 4. L2 应用层 - JSON 信封 (Application Envelope)

L1 编码层把字节流稳定地写入和读出之后，应用层可以选择两种内容形态：

### 4.1 纯文本形态 (Plain Text)

字节流本身就是一段普通 UTF-8 文本（如留言、签名、文章），应用层直接展示即可，不需要解析。

> 这是最基础的用法，老版本 Scash-DAP 就支持。

### 4.2 类型化 JSON 信封 (Typed JSON Envelope) — 推荐

任何**有结构**的应用数据（红包、对话、资料卡、点赞等），都建议在 L2 使用统一的 JSON 信封：

```json
{
  "type": "XXXX",
  "data": { /* ... 由该 type 定义 ... */ }
}
```

#### 字段语义

| 字段 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `type` | `string` | ✅ | 全大写蛇形命名，如 `RED_PACKET`、`PROFILE`、`THREAD`。建议使用 ASCII 字母、数字、下划线。 |
| `data` | `object` | ✅ | 该 type 对应的具体数据结构，由 type 的注册定义决定。允许为空对象 `{}`。 |
| `v` | `number` | 可选 | 信封版本号，便于同一 type 的数据结构演进。如 `"v": 1`。 |

#### 编码与解码

```js
// 编码：序列化为 JSON 字符串后，交给 L1 编码层
const envelope = { type: 'RED_PACKET', data: { /* ... */ } };
const text = JSON.stringify(envelope);
const outputs = dap.createDapOutputs(text); // 自动选择 RAW / ZIP

// 解码：从 L1 拿到字符串后，应用层尝试 JSON.parse
const text = dap.parseDapTransaction(inputs);
let envelope = null;
try {
  const parsed = JSON.parse(text);
  if (parsed && typeof parsed === 'object' && typeof parsed.type === 'string') {
    envelope = parsed;
  }
} catch (_) {
  // 不是合法 JSON 信封，按纯文本处理
}

if (envelope) {
  switch (envelope.type) {
    case 'RED_PACKET':
      handleRedPacket(envelope.data);
      break;
    // ... 其它 type 分发
    default:
      // 未知 type：保留原始 envelope 即可，不要丢弃
      break;
  }
} else {
  // 纯文本展示（注意 XSS）
}
```

> 💡 由于 JSON 字符串通常含有大量重复字符（字段名、引号、括号），`ZIP` 模式几乎总会被选中，从而显著降低上链成本。

#### 兼容性约束

* 解析方收到 **未知的 `type`** 时，**不应**报错或丢弃，应保留原 envelope 待后续应用支持（forward-compatible）。
* 解析方收到 **`type` 字段缺失或不是字符串**的 JSON 时，应降级按纯文本处理。
* 同一 `type` 下增加新字段时，应保证旧版客户端忽略新字段后仍可正常工作；如需破坏性变更，请通过 `v` 字段升级版本。

---

## 5. 类型注册表 (Type Registry)

下表登记 Scash-DAP 社区已知的应用类型。新增类型请通过仓库 PR 提案。

| `type` | 状态 | 用途 | 数据结构 (`data`) |
| :--- | :--- | :--- | :--- |
| `RED_PACKET` | 草案 (Draft) | 链上红包：发送方公开发布一个可被其他用户领取的资金/积分包 | 见 §5.1 |

> 当前仅登记 `RED_PACKET`。后续如 `PROFILE`、`THREAD`、`REPLY`、`IMAGE` 等扩展，请新增条目并补充字段定义。

### 5.1 `RED_PACKET` (Draft)

> ⚠️ **状态：草案**。以下字段为**非规范性参考**，最终结构以应用方实现为准；待社区确认后转为正式版。

**示例：**

```json
{
  "type": "RED_PACKET",
  "v": 1,
  "data": {
    "title": "新年快乐",
    "message": "恭喜发财，大吉大利",
    "token": "SCASH",
    "totalAmount": "1.0",
    "count": 10,
    "mode": "RANDOM",
    "expiry": 1735689599,
    "issuer": "scash1qxxxxxx..."
  }
}
```

**字段（参考）：**

| 字段 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `title` | `string` | 可选 | 红包标题 |
| `message` | `string` | 可选 | 祝福语 |
| `token` | `string` | ✅ | 资产符号，如 `SCASH` |
| `totalAmount` | `string` | ✅ | 总金额，使用字符串避免 JS 浮点误差 |
| `count` | `number` | ✅ | 总份数 |
| `mode` | `'RANDOM' \| 'EQUAL'` | ✅ | 拆分模式：随机 / 平均 |
| `expiry` | `number` | 可选 | UNIX 时间戳，过期时间 |
| `issuer` | `string` | ✅ | 发包人 Scash 地址 |

> 如果你正在实现的 RED_PACKET 与上述结构不一致，请在本 PR 中改写本节，以你的实际结构为准。

---

## 6. 压缩算法规范 (Compression Spec)

为了统一各语言的实现，Scash-DAP 严格规定了 `ZIP` 模式的压缩格式。

* **算法**: **Deflate** (RFC 1951)
* **容器格式**: **ZLIB** (RFC 1950)
* **特征**: 包含 ZLIB Header（通常以 `0x78` 开头）和 Adler-32 校验和。

### 跨语言实现指南

在实现 `ZIP` 模式时，请确保使用支持 **ZLIB** 格式的库，而不是纯 Deflate 或 Gzip。

#### Node.js / JavaScript

使用 `pako`（浏览器/通用）或 `zlib`（Node.js 原生）：

```javascript
const pako = require('pako');
const compressed = pako.deflate(data); // 默认输出 ZLIB 格式
const restored = pako.inflate(compressed);
```

#### Python

使用标准库 `zlib`：

```python
import zlib
compressed = zlib.compress(data.encode('utf-8'))
restored = zlib.decompress(compressed).decode('utf-8')
```

#### Go (Golang)

使用 `compress/zlib` 包：

```go
import (
    "bytes"
    "compress/zlib"
    "io"
)

func Compress(data []byte) []byte {
    var b bytes.Buffer
    w := zlib.NewWriter(&b)
    w.Write(data)
    w.Close()
    return b.Bytes()
}

func Decompress(data []byte) ([]byte, error) {
    b := bytes.NewReader(data)
    r, err := zlib.NewReader(b)
    if err != nil { return nil, err }
    return io.ReadAll(r)
}
```

#### Rust

使用 `flate2` crate 的 `ZlibEncoder` / `ZlibDecoder`：

```rust
use flate2::write::ZlibEncoder;
use flate2::read::ZlibDecoder;
use flate2::Compression;
use std::io::prelude::*;

let mut e = ZlibEncoder::new(Vec::new(), Compression::default());
e.write_all(data.as_bytes())?;
let compressed = e.finish()?;

let mut d = ZlibDecoder::new(&compressed[..]);
let mut s = String::new();
d.read_to_string(&mut s)?;
```

---

## 7. 编码流程详解 (Encoding)

1. **应用层准备数据**：
   * 纯文本：直接使用原始字符串。
   * 类型化数据：构造 `{ type, data, v? }` 信封并 `JSON.stringify`。
2. **L1 智能压缩**：
   * 调用 ZLIB 压缩方法。
   * 比较 `Buffer.byteLength(原文)` 与 `Buffer.byteLength(压缩)`，取小者；对应 Magic Header 为 `RAW` 或 `ZIP`。
3. **分片 (Chunking)**：将选定 Payload 按 **28 字节**为单位切割。
4. **构建 Witness Script Hash**：
   * 每个分片申请 32 字节 Buffer。
   * 前 4 字节写入 Magic Header（如 `0xACACACAC`）。
   * 后 28 字节写入数据分片，不足补 `0x00`。
5. **生成地址**：将 32 字节 Hash 通过 bech32 编码为 P2WSH 地址（如 `scash1...`）。
6. **构造交易**：向生成的每个地址发送 Dust Limit（默认 546 sats）。

## 8. 解码流程详解 (Decoding)

1. **提取候选地址**：从交易输出 (Outputs) 中按顺序提取所有接收地址。
2. **L1 验证与过滤**：
   * 对每个地址进行 bech32 解码，还原为 32 字节 Hash。
   * 检查前 4 字节是否匹配 `RAW` 或 `ZIP` 的 Magic Header。
   * 不匹配则**跳过**（普通转账 / 找零）。
3. **数据流重组**：按 Output Index 顺序，提取每个有效 Hash 的后 28 字节并拼接。
4. **去除 Padding**：从 Buffer 末尾移除连续的 `0x00`。
5. **L1 还原**：
   * `ZIP`：调用 ZLIB Inflate。
   * `RAW`：直接转 UTF-8。
6. **L2 解析**（应用层）：
   * 尝试 `JSON.parse`。
   * 若得到对象且 `type` 字段为字符串 → 按 §5 类型注册表分发处理。
   * 否则按纯文本处理（注意 XSS，使用 `textContent` 而非 `innerHTML`）。

## 9. 安全性与不可篡改性

* **永久性**：数据作为 UTXO 存在，由于无人持有对应 Witness Script 的私钥，UTXO 实际上无法花费，数据将永久保留在 UTXO 集中。
* **抗审查**：对于网络节点，这只是一笔普通的转账交易，符合标准共识规则，无法被特定拦截。
* **内容安全**：协议层只负责字节流的还原，**不**负责清洗内容。展示链上数据时，应用层必须：
  * 使用 `textContent` / `innerText`，**禁止**直接 `innerHTML`。
  * 对未知 `type` 的 JSON 信封，仅展示其元信息或安全降级。
  * 对图片/媒体类 type，注意大小、来源校验，避免 DoS。
