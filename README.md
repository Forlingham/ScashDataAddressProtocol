# Scash-DAP: Stateless On-chain Data Protocol

### 基于 P2WSH 的无状态 Scash 链上存证协议

**Scash-DAP** 是一种轻量级、无状态、抗审查的链上数据存储协议。它利用比特币（及 Scash）原生 SegWit (P2WSH) 机制，将任意数据伪装成标准的区块链地址，从而实现绕过 `OP_RETURN` 限制的永久数据存证。


## 🚀 背景与动机 (Background)

在 Scash (基于 Bitcoin Core 的分叉链) 网络中，想要将自定义数据（如文本、哈希、备注）写入区块链，通常面临以下挑战：

1.  **OP\_RETURN 限制**：标准节点对 `OP_RETURN` 的数据大小有严格限制（通常为 40-80 字节），且部分节点可能不转发此类交易。
2.  **多重签名 (Bare Multisig) 封杀**：虽然裸多签可以存储更多数据，但因为会造成 UTXO 集膨胀，往往被节点策略（Standardness Rules）禁止。
3.  **交易被拦截**：非标准的脚本格式容易被节点识别并拒绝打包。

**Scash-DAP** 的提出是为了解决上述问题。它不依赖特殊的脚本操作码，而是将数据**伪装成合法的转账接收地址**。对于区块链网络而言，这是一笔标准的转账交易，因此**无法被拦截或审查**。

-----

## 🛠 核心原理 (Core Concept)

本协议利用了 **P2WSH (Pay to Witness Script Hash)** 地址的特性。
P2WSH 地址的本质是一个 32 字节的 SHA256 哈希值。

**Hack 思路：**
通常这 32 字节是某个脚本的哈希，但在 Scash-DAP 中，我们直接将**明文数据**填充进这 32 字节中。
虽然这些地址没有对应的私钥（资金将被永久销毁/燃烧），但数据因此被永久刻录在 UTXO 集中，任何人都无法篡改。

-----

## 📝 协议规范 (Protocol Specification)

### 版本：v3 (Stateless / 无状态版)

为了方便索引器（Indexer）和区块链浏览器进行全网统计，本协议采用**无状态（Stateless）设计**。每一个承载数据的 UTXO 都是独立的、自描述的。

### 1\. 数据结构 (Payload Structure)

每一个数据地址（P2WSH）承载 **32 字节** 的有效载荷，结构如下：

```text
| <--- 32 Bytes P2WSH Hash ---> |
+--------------+----------------+
| Magic Header | Data Content   |
+--------------+----------------+
|   4 Bytes    |    28 Bytes    |
+--------------+----------------+
```

  * **Magic Header (协议头)**: 用于识别该地址是否为 Scash-DAP 数据地址，防止误读普通转账。
  * **Data Content (数据体)**: 实际存储的用户数据。

### 2\. 魔数定义 (Magic Header)

固定为 4 字节的十六进制值：
**`0xAFAFAFAF`**

  * **Hex**: `afafafaf`
  * **碰撞概率**: 1 / 4,294,967,296 (在随机生成的地址中自然出现此开头的概率极低，可忽略不计)。

### 3\. 混合交易支持

一笔 Scash-DAP 交易可以同时包含：

1.  **真实转账** (给朋友转币)
2.  **找零** (回到自己钱包)
3.  **数据备注** (N 个 Scash-DAP 地址)

解析器在读取时，会自动忽略不带 `0xAFAF...` 头的普通地址。

-----

## 💻 实现逻辑

### 编码 (Encoding) / 上链

1.  将原始文本按 **28 字节** 进行分片。
2.  为每个分片头部添加 `0xAFAFAFAF`。
3.  如果最后一片不足 32 字节，使用 `0x00` 补齐。
4.  使用 `bitcoinjs-lib` 将这 32 字节生成为 P2WSH 地址（`scash1` 开头）。
5.  向这些地址各转入微量资金（如 546 sats）。

### 解码 (Decoding) / 读取

1.  获取交易的所有输出（Outputs）。
2.  遍历每一个输出地址，尝试进行 Bech32 解码。
3.  检查解码后的 32 字节数据是否以 `0xAFAFAFAF` 开头。
4.  如果是：提取后 28 字节，拼接到结果缓冲区。
5.  如果不是：视为普通转账或找零，跳过。
6.  对最终结果去除末尾的 `0x00` 补位，转为 UTF-8 文本。

-----

## ⚡ 快速开始 (Quick Start)

提供了基于 Node.js 的参考实现，包含数据上链（Writer）和数据读取（Reader）。

### 1\. 安装依赖

```bash
npm install bitcoinjs-lib tiny-secp256k1 ecpair bip39 bip32 axios bech32
```

### 2\. 数据上链 (Writer Demo)

`writer.js` - 用于发送带文字的交易。

```javascript
const bitcoin = require('bitcoinjs-lib');
const { ECPairFactory } = require('ecpair');
const tinysecp = require('tiny-secp256k1');
const bip39 = require('bip39');
const { BIP32Factory } = require('bip32');
const axios = require('axios');

// 初始化库
const ECPair = ECPairFactory(tinysecp);
const bip32 = BIP32Factory(tinysecp);

// --- 配置 ---
const CONFIG = {
    rpc: 'https://explorer.scash.network/api/rpc', // RPC 地址
    user: 'scash',
    pass: 'scash',
    network: {
        messagePrefix: '\x18Scash Signed Message:\n',
        bech32: 'scash',
        bip32: { public: 0x0488b21e, private: 0x0488ade4 },
        pubKeyHash: 0x3c, scriptHash: 0x7d, wif: 0x80
    }
};

// --- 核心协议实现 ---
function createDapOutputs(text) {
    const MAGIC = Buffer.from([0xAF, 0xAF, 0xAF, 0xAF]); // 协议头
    const CHUNK_DATA_SIZE = 28; // 32 - 4
    
    const buffer = Buffer.from(text, 'utf8');
    const outputs = [];

    for (let i = 0; i < buffer.length; i += CHUNK_DATA_SIZE) {
        const chunk = Buffer.alloc(32); // 申请32字节空间(自动补0)
        MAGIC.copy(chunk, 0); // 写入头
        
        const end = Math.min(i + CHUNK_DATA_SIZE, buffer.length);
        buffer.subarray(i, end).copy(chunk, 4); // 写入数据

        // 生成 P2WSH 地址
        const payment = bitcoin.payments.p2wsh({ 
            hash: chunk, 
            network: CONFIG.network 
        });
        
        outputs.push({
            address: payment.address,
            value: 546 // Dust Limit
        });
    }
    return outputs;
}

```

### 3\. 数据读取 (Reader Demo)

`reader.js` - 用于解析交易中的文字。

```javascript
const { bech32 } = require('bech32');

function parseDapTransaction(outputs) {
    const MAGIC_HEX = 'afafafaf';
    let fullBuffer = Buffer.alloc(0);

    for (const out of outputs) {
        // 1. 解码地址
        let hash;
        try {
            const decoded = bech32.decode(out.address);
            if (decoded.prefix !== 'scash') continue;
            hash = Buffer.from(bech32.fromWords(decoded.words.slice(1)));
        } catch(e) { continue; }

        // 2. 检查协议头
        if (hash.length === 32 && hash.toString('hex').startsWith(MAGIC_HEX)) {
            // 3. 提取数据 (去掉前4字节)
            fullBuffer = Buffer.concat([fullBuffer, hash.subarray(4)]);
        }
    }

    // 4. 去除补零并转码
    let clean = fullBuffer;
    while (clean.length > 0 && clean[clean.length-1] === 0) {
        clean = clean.subarray(0, clean.length-1);
    }
    
    return clean.toString('utf8');
}
```

-----

## ❓ FAQ

**Q: 这些生成的数据地址，我拥有私钥吗？**
A: **没有**。这些地址是通过数据哈希生成的，没人知道对应的解锁脚本（Preimage）。因此，转入这些地址的资金（如 546 sats）将被**永久销毁（Burned）**。请务必只转入最小金额（Dust）。

**Q: 为什么不使用 OP\_RETURN？**
A: OP\_RETURN 容量有限（通常 80 字节），且容易被节点修剪或丢弃。Scash-DAP 伪装成普通 UTXO，享有与资金同等的安全性及持久性。

**Q: 这种方式贵吗？**
A: 成本取决于数据长度。每 28 字节数据需要消耗一个 UTXO 的金额（546 sats）加上交易手续费。这是为了获得“永久不可篡改性”所付出的代价。

-----

### License

MIT