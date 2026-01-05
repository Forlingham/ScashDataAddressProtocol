# Scash-DAP 协议规范 (Protocol Specification)

**版本**: v1.0.3  
**状态**: 正式版  
**类型**: 无状态 (Stateless) / UTXO 模型

---

## 1. 概述

Scash-DAP (Data Address Protocol) 是一种利用比特币及 Scash 网络原生 SegWit (P2WSH) 机制进行数据存证的协议。它通过将数据伪装成标准的 P2WSH 地址哈希，绕过了 `OP_RETURN` 的长度限制，并利用 UTXO 集合实现永久存储。

## 2. 数据结构

每个 Scash-DAP 数据单元是一个标准的 P2WSH 地址，其背后的 Script Hash (32字节) 结构如下：

```text
| <------- 32 Bytes Witness Script Hash -------> |
+------------------+-----------------------------+
|   Magic Header   |        Data Payload         |
+------------------+-----------------------------+
|     4 Bytes      |          28 Bytes           |
+------------------+-----------------------------+
```

*   **Magic Header (4字节)**: 用于标识协议类型及编码模式。解析器通过此头部识别数据类型。
*   **Data Payload (28字节)**: 实际存储的数据片段。若不足 28 字节，末尾用 `0x00` 补齐。

## 3. 协议模式与扩展性 (Protocols & Extensions)

Scash-DAP 采用 **Magic Header** 来区分不同的数据类型。这为未来协议扩展提供了极大的灵活性。任何符合 P2WSH 格式且带有特定 Magic Header 的 UTXO 都被视为该协议的一部分。

### 3.1 基础数据协议 (Basic Data)

用于通用的文本或二进制数据存储。

| 模式名称 | Magic Header (Hex) | 描述 | 处理逻辑 |
| :--- | :--- | :--- | :--- |
| **RAW (原文)** | `AF AF AF AF` | 原始 UTF-8 文本 | 直接拼接读取 |
| **ZIP (压缩)** | `AC AC AC AC` | Zlib 压缩数据 | 拼接后解压读取 |

### 3.2 扩展协议规划 (Future Extensions)

开发者可以通过定义新的 Magic Header 来扩展 Scash-DAP 的功能，以支持特定的应用场景。解析器遇到无法识别的 Magic Header 时，**必须忽略**该数据片段，以保证向后兼容性。

**潜在扩展示例 (RFC):**

| 扩展类型 | 建议 Magic (示例) | 用途 |
| :--- | :--- | :--- |
| **Thread** | `AF 01 00 01` | 论坛主题帖 (Title + Body) |
| **Reply** | `AF 01 00 02` | 论坛回复 (Ref TXID + Body) |
| **Image** | `AF 02 00 01` | 图片数据 (PNG/JPG Stream) |
| **Profile** | `AF 03 00 01` | 用户资料 (Avatar, Bio) |

> 注意：为了避免冲突，建议新协议扩展在社区提案中进行注册。

---

## 4. 压缩算法规范 (Compression Spec)

为了统一各语言的实现，Scash-DAP 严格规定了压缩数据的格式。

*   **算法**: **Deflate** (RFC 1951)
*   **容器格式**: **ZLIB** (RFC 1950)
*   **特征**: 包含 ZLIB Header (通常以 `0x78` 开头) 和 Adler-32 校验和。

### 跨语言实现指南

在实现 ZIP 模式时，请确保使用支持 **ZLIB** 格式的库，而不是纯 Deflate 或 Gzip。

#### Node.js / JavaScript
使用 `pako` (浏览器/通用) 或 `zlib` (Node.js 原生)。
```javascript
// 压缩
const pako = require('pako');
const compressed = pako.deflate(data); // 默认输出 ZLIB 格式

// 解压
const restored = pako.inflate(compressed);
```

#### Python
使用标准库 `zlib`。
```python
import zlib

# 压缩
compressed = zlib.compress(data.encode('utf-8'))

# 解压
restored = zlib.decompress(compressed).decode('utf-8')
```

#### Go (Golang)
使用 `compress/zlib` 包。
```go
import (
    "bytes"
    "compress/zlib"
    "io"
)

// 压缩
func Compress(data []byte) []byte {
    var b bytes.Buffer
    w := zlib.NewWriter(&b)
    w.Write(data)
    w.Close()
    return b.Bytes()
}

// 解压
func Decompress(data []byte) ([]byte, error) {
    b := bytes.NewReader(data)
    r, err := zlib.NewReader(b)
    if err != nil { return nil, err }
    return io.ReadAll(r)
}
```

#### Rust
使用 `flate2` crate 的 `ZlibEncoder` / `ZlibDecoder`。
```rust
use flate2::write::ZlibEncoder;
use flate2::read::ZlibDecoder;
use flate2::Compression;
use std::io::prelude::*;

// 压缩
let mut e = ZlibEncoder::new(Vec::new(), Compression::default());
e.write_all(data.as_bytes())?;
let compressed = e.finish()?;

// 解压
let mut d = ZlibDecoder::new(&compressed[..]);
let mut s = String::new();
d.read_to_string(&mut s)?;
```

---

## 5. 编码流程详解 (Encoding)

1.  **准备数据**: 将输入文本转换为 UTF-8 Buffer。
2.  **智能压缩**:
    *   调用上述 ZLIB 压缩方法。
    *   比较 `Buffer.byteLength(原始数据)` 与 `Buffer.byteLength(压缩数据)`。
    *   **决策**: 若 `压缩数据` 更小，则标记模式为 `ZIP`，否则保持 `RAW`。
3.  **分片 (Chunking)**:
    *   将选定的 Payload 按 **28 字节** 为单位进行切割。
4.  **构建 Payload**:
    *   对于每个分片，申请 32 字节 Buffer。
    *   **写入头**: 前 4 字节写入对应的 Magic Header (如 `0xACACACAC`)。
    *   **写入体**: 后 28 字节写入数据分片。
    *   **Padding**: 若分片不足 28 字节，剩余位填充 `0x00`。
5.  **生成地址**:
    *   将这 32 字节 Payload 作为 Witness Script Hash。
    *   使用 `bech32` 编码生成 P2WSH 地址 (如 `scash1...`)。
6.  **构造交易**:
    *   向生成的每个地址发送微量金额 (Dust Limit，通常为 546 sats)。

## 6. 解码流程详解 (Decoding)

1.  **提取候选地址**: 从交易输出 (Outputs) 中提取所有接收地址。
2.  **验证与过滤**:
    *   对每个地址进行 Bech32 解码，还原为 32 字节 Hash。
    *   检查前 4 字节是否匹配已知的 Magic Header (`RAW` 或 `ZIP` 或其他扩展 Magic)。
    *   若不匹配，**跳过**该输出 (可能是普通转账或找零)。
3.  **数据流重组**:
    *   按交易输出索引 (Output Index) 顺序，提取每个有效 Hash 的后 28 字节。
    *   将所有片段拼接成一个完整的 Buffer。
4.  **去除 Padding**:
    *   从 Buffer 末尾开始，移除所有的连续 `0x00` 字节。
    *   *注意：如果原始数据本身以 0x00 结尾（如二进制文件），这里的去重逻辑可能需要依靠额外的长度头协议（未来扩展），但在纯文本模式下通常安全。*
5.  **还原内容**:
    *   根据步骤 2 识别的 Magic Header 类型进行处理。
    *   **ZIP**: 调用 ZLIB Inflate 解压。
    *   **RAW**: 直接转换为 UTF-8 字符串。
    *   **Unknown**: 如果应用层不支持该 Magic，则提示无法解析或显示原始内容。

## 7. 安全性与不可篡改性

*   **永久性**: 数据作为 UTXO 存在，只要不被花费（因为没有私钥，实际上无法花费），数据将永久存在于 UTXO 集中。
*   **抗审查**: 对于网络节点，这只是一笔普通的转账交易，符合标准共识规则，无法被特定拦截。
*   **安全性**: 读取端应注意防范 XSS 攻击。协议层只负责还原原始数据，**不负责** 内容的清洗。应用层展示数据时必须进行转义处理。
