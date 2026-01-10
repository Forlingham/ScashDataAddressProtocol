// --- Scash-DAP 协议实现 ---

const { bech32 } = require('bech32');
const bitcoin = require('bitcoinjs-lib');
const pako = require('pako');

class ScashDAP {
  static get version() {
    return '1.0.4';
  }

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

  // --- 内部辅助：准备 Payload (压缩策略) ---
  _preparePayload(text) {
    // 1. 转为 Buffer
    const rawBuffer = Buffer.from(text, 'utf8');

    let finalPayload = rawBuffer;
    let selectedProtocol = this.PROTOCOLS.RAW;
    let mode = 'RAW';

    // 2. 尝试压缩 (使用 pako)
    try {
      const compressed = pako.deflate(rawBuffer);
      const compressedBuffer = Buffer.from(compressed);

      // 3. 智能决策：哪个小用哪个
      if (compressedBuffer.length < rawBuffer.length) {
        finalPayload = compressedBuffer;
        selectedProtocol = this.PROTOCOLS.ZIP;
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

    return { payload: finalPayload, protocol: selectedProtocol, mode };
  }

  /**
   * 估算上链成本
   * @param {string} text 要上链的文本
   * @returns {object} 包含分片数量、总金额(sats)、使用模式等信息
   */
  estimateCost(text) {
    const { payload, mode } = this._preparePayload(text);
    const chunkCount = Math.ceil(payload.length / this.CHUNK_PAYLOAD_SIZE);
    
    return {
      mode,
      payloadSize: payload.length,
      chunkCount,
      totalSats: chunkCount * 546,
      originalSize: Buffer.byteLength(text, 'utf8')
    };
  }

  /**
   * 获取地址使用的协议类型
   * @param {string} address 
   * @returns {string|null} 返回 'RAW', 'ZIP' 或 null
   */
  getProtocolType(address) {
    const hash = this.decodeScashAddressToHash(address);
    if (!hash) return null;
    
    const hex = hash.toString('hex');
    for (const [key, protocol] of Object.entries(this.PROTOCOLS)) {
      if (hex.startsWith(protocol.magic.toString('hex'))) {
        return key;
      }
    }
    return null;
  }

  // --- 核心协议实现, 创建 DAP 输出 ---
  createDapOutputs(text) {
    const { payload: finalPayload, protocol: selectedProtocol } = this._preparePayload(text);
    const selectedMagic = selectedProtocol.magic;

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
  /**
   * 解析 DAP 交易
   * 从交易输出中还原文本数据
   * 
   * @security 安全警告：
   * 此方法返回原始文本数据，不包含任何清洗或转义。
   * 如果返回的字符串包含恶意脚本（如 <script>），直接在浏览器中使用 innerHTML 渲染会导致 XSS 攻击。
   * 请务必使用 document.innerText / textContent 展示，或使用 DOMPurify 等库进行过滤。
   * 
   * @param {Array<string>|Array<object>} inputs 输入数组，支持以下格式：
   * 1. 字符串数组: ['scash1...', 'scash1...']
   * 2. 对象数组 (标准): [{ address: 'scash1...' }, { address: 'scash1...' }]
   * 3. 对象数组 (Electrum/RPC): [{ scriptPubKey: { address: '...' } }]
   * @returns {string} 还原后的文本数据
   */
  parseDapTransaction(inputs) {
    const MAGIC_HEX_RAW = this.PROTOCOLS.RAW.magic.toString('hex');
    const MAGIC_HEX_ZIP = this.PROTOCOLS.ZIP.magic.toString('hex');
    let fullBuffer = Buffer.alloc(0);
    let isCompressed = false;

    // 归一化输入为地址字符串数组
    const addresses = [];
    if (Array.isArray(inputs)) {
      for (const item of inputs) {
        if (typeof item === 'string') {
          // Case 1: 纯字符串数组 ['scash1...', 'scash1...']
          addresses.push(item);
        } else if (typeof item === 'object' && item !== null) {
          if (item.address) {
             // Case 2: 简单对象 { address: '...' }
            addresses.push(item.address);
          } else if (item.scriptPubKey) {
            // Case 3: 嵌套对象 (RPC/Electrum) { scriptPubKey: { address: '...' } }
            const addr = item.scriptPubKey.address || (item.scriptPubKey.addresses ? item.scriptPubKey.addresses[0] : null);
            if (addr) addresses.push(addr);
          }
        }
      }
    }

    for (const address of addresses) {
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