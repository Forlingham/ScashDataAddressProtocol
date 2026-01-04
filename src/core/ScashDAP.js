// --- Scash-DAP 协议实现 ---

const { bech32 } = require('bech32');
const bitcoin = require('bitcoinjs-lib');
const pako = require('pako');

class ScashDAP {
  // 定义协议头
  PROTOCOLS = {
    RAW: {
      magic: Buffer.from([0xAF, 0xAF, 0xAF, 0xAF]),
      description: "原文模式 - 直接存储UTF8文本"
    },
    ZIP: {
      magic: Buffer.from([0xAC, 0xAC, 0xAC, 0xAC]),
      description: "压缩模式 - 使用Deflate算法压缩"
    }
  };
  CHUNK_PAYLOAD_SIZE = 28;// 32 - 4

  NETWORK = ""
  debug = false;

  constructor(network, debug = false) {
    this.NETWORK = network;
    this.debug = debug;
  }

  // --- 核心协议实现, 创建 DAP 输出 ---
  createDapOutputs(text) {
    // 1. 转为 Buffer
    const rawBuffer = Buffer.from(text, 'utf8');

    let finalPayload = rawBuffer;
    let selectedMagic = this.PROTOCOLS.RAW.magic;
    let mode = 'RAW';

    // 2. 尝试压缩 (使用 pako)
    try {
      // pako.deflate 默认生成 Zlib 格式 (RFC 1950)，包含头部校验
      // 这与 Node.js 的 zlib.deflateSync 是一模一样的
      const compressed = pako.deflate(rawBuffer);
      const compressedBuffer = Buffer.from(compressed);

      // 3. 智能决策：哪个小用哪个
      // 只有当压缩后体积确实变小了，才使用压缩模式
      if (compressedBuffer.length < rawBuffer.length) {
        finalPayload = compressedBuffer;
        selectedMagic = this.PROTOCOLS.ZIP.magic;
        mode = 'ZIP';
        if (this.debug) {
          console.log(`[Scash-DAP] 压缩生效: ${rawBuffer.length} -> ${compressedBuffer.length} bytes`);
        }
      } else {
        if (this.debug) {
          console.log(`[Scash-DAP] 保持原文: 压缩未减小体积`);
        }
      }
    } catch (e) {
      console.warn("压缩异常，回退到原文模式", e);
    }



    const outputs = [];

    for (let i = 0; i < finalPayload.length; i += this.CHUNK_PAYLOAD_SIZE) {
      const chunk = Buffer.alloc(32); // 申请32字节空间(自动补0)
      selectedMagic.copy(chunk, 0); // 写入头

      const end = Math.min(i + this.CHUNK_PAYLOAD_SIZE, finalPayload.length);
      finalPayload.subarray(i, end).copy(chunk, 4); // 写入数据

      // 生成 P2WSH 地址
      const payment = bitcoin.payments.p2wsh({
        hash: chunk,
        network: this.NETWORK
      });

      outputs.push({
        address: payment.address,
        value: 546 // 最小金额
      });
    }
    return outputs;
  }


  // --- 核心协议实现, 解析 DAP 交易 ---
  parseDapTransaction(outputs) {
    const MAGIC_HEX_RAW = this.PROTOCOLS.RAW.magic.toString('hex');
    const MAGIC_HEX_ZIP = this.PROTOCOLS.ZIP.magic.toString('hex');
    let fullBuffer = Buffer.alloc(0);
    let isCompressed = false;

    for (const out of outputs) {
      // 1. 解码地址
      const address = out.scriptPubKey.address || (out.scriptPubKey.addresses ? out.scriptPubKey.addresses[0] : null);
      if (!address) continue;
      const hash = this.decodeScashAddressToHash(address);

      // 2. 检查协议头
      if (hash && hash.length === 32) {
        const hex = hash.toString('hex');
        if (hex.startsWith(MAGIC_HEX_RAW)) {
          // 3. 提取数据 (去掉前4字节)
          fullBuffer = Buffer.concat([fullBuffer, hash.subarray(4)]);
        } else if (hex.startsWith(MAGIC_HEX_ZIP)) {
          isCompressed = true;
          fullBuffer = Buffer.concat([fullBuffer, hash.subarray(4)]);
        }
      }
    }

    // 4. 去除补零
    let clean = fullBuffer;
    while (clean.length > 0 && clean[clean.length - 1] === 0) {
      clean = clean.subarray(0, clean.length - 1);
    }

    // 5. 如果是压缩数据，进行解压
    if (isCompressed) {
      try {
        const inflated = pako.inflate(clean);
        return Buffer.from(inflated).toString('utf8');
      } catch (e) {
        console.warn("解压失败", e);
        return "";
      }
    }

    return clean.toString('utf8');
  }

  /**
   * 检查地址是否属于这个协议
   * @param address 钱包地址
   * @returns 是否属于这个协议的数据地址
   */
  isScashDAPAddress(address) {
    const hash = this.decodeScashAddressToHash(address);
    if (!hash) return false;
    const hex = hash.toString('hex');
    for (const protocol of Object.values(this.PROTOCOLS)) {
      if (hex.startsWith(protocol.magic.toString('hex'))) {
        return true;
      }
    }
    return false;
  }

  /**
   * 将 Scash 地址解码为 32字节 Hash Buffer
   * 如果不是 P2WSH (Scash1...) 或解码失败，返回 null
   */
  decodeScashAddressToHash(address) {
    try {
      // 动态获取前缀，默认为 'scash'
      const prefix = (this.NETWORK && this.NETWORK.bech32) ? this.NETWORK.bech32 : 'scash';

      if (!address || !address.startsWith(prefix)) return null;
      const decoded = bech32.decode(address);
      if (decoded.prefix !== prefix) return null;
      // bech32 words -> bytes
      const data = bech32.fromWords(decoded.words.slice(1));
      return Buffer.from(data);
    } catch (e) {
      return null;
    }
  }
}

module.exports = ScashDAP;