var __getOwnPropNames = Object.getOwnPropertyNames;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// src/core/ScashDAP.js
var require_ScashDAP = __commonJS({
  "src/core/ScashDAP.js"(exports, module) {
    var { bech32 } = __require("bech32");
    var bitcoin = __require("bitcoinjs-lib");
    var pako = __require("pako");
    var ScashDAP = class {
      static get version() {
        return "1.0.4";
      }
      // 定义协议头
      PROTOCOLS = {
        RAW: {
          magic: Buffer.from([175, 175, 175, 175]),
          description: "\u539F\u6587\u6A21\u5F0F - \u76F4\u63A5\u5B58\u50A8UTF8\u6587\u672C"
        },
        ZIP: {
          magic: Buffer.from([172, 172, 172, 172]),
          description: "\u538B\u7F29\u6A21\u5F0F - \u4F7F\u7528Deflate\u7B97\u6CD5\u538B\u7F29"
        }
      };
      CHUNK_PAYLOAD_SIZE = 28;
      // 32 - 4
      NETWORK = "";
      debug = false;
      constructor(network, debug = false) {
        this.NETWORK = network;
        this.debug = debug;
      }
      // --- 内部辅助：准备 Payload (压缩策略) ---
      _preparePayload(text) {
        const rawBuffer = Buffer.from(text, "utf8");
        let finalPayload = rawBuffer;
        let selectedProtocol = this.PROTOCOLS.RAW;
        let mode = "RAW";
        try {
          const compressed = pako.deflate(rawBuffer);
          const compressedBuffer = Buffer.from(compressed);
          if (compressedBuffer.length < rawBuffer.length) {
            finalPayload = compressedBuffer;
            selectedProtocol = this.PROTOCOLS.ZIP;
            mode = "ZIP";
            if (this.debug) {
              console.log(`[Scash-DAP] \u538B\u7F29\u751F\u6548: ${rawBuffer.length} -> ${compressedBuffer.length} bytes`);
            }
          } else {
            if (this.debug) {
              console.log(`[Scash-DAP] \u4FDD\u6301\u539F\u6587: \u538B\u7F29\u672A\u51CF\u5C0F\u4F53\u79EF`);
            }
          }
        } catch (e) {
          console.warn("\u538B\u7F29\u5F02\u5E38\uFF0C\u56DE\u9000\u5230\u539F\u6587\u6A21\u5F0F", e);
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
          originalSize: Buffer.byteLength(text, "utf8")
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
        const hex = hash.toString("hex");
        for (const [key, protocol] of Object.entries(this.PROTOCOLS)) {
          if (hex.startsWith(protocol.magic.toString("hex"))) {
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
          const chunk = Buffer.alloc(32);
          selectedMagic.copy(chunk, 0);
          const end = Math.min(i + this.CHUNK_PAYLOAD_SIZE, finalPayload.length);
          finalPayload.subarray(i, end).copy(chunk, 4);
          const payment = bitcoin.payments.p2wsh({
            hash: chunk,
            network: this.NETWORK
          });
          outputs.push({
            address: payment.address,
            value: 546
            // 最小金额
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
        const MAGIC_HEX_RAW = this.PROTOCOLS.RAW.magic.toString("hex");
        const MAGIC_HEX_ZIP = this.PROTOCOLS.ZIP.magic.toString("hex");
        let fullBuffer = Buffer.alloc(0);
        let isCompressed = false;
        const addresses = [];
        if (Array.isArray(inputs)) {
          for (const item of inputs) {
            if (typeof item === "string") {
              addresses.push(item);
            } else if (typeof item === "object" && item !== null) {
              if (item.address) {
                addresses.push(item.address);
              } else if (item.scriptPubKey) {
                const addr = item.scriptPubKey.address || (item.scriptPubKey.addresses ? item.scriptPubKey.addresses[0] : null);
                if (addr) addresses.push(addr);
              }
            }
          }
        }
        for (const address of addresses) {
          if (!address) continue;
          const hash = this.decodeScashAddressToHash(address);
          if (hash && hash.length === 32) {
            const hex = hash.toString("hex");
            if (hex.startsWith(MAGIC_HEX_RAW)) {
              fullBuffer = Buffer.concat([fullBuffer, hash.subarray(4)]);
            } else if (hex.startsWith(MAGIC_HEX_ZIP)) {
              isCompressed = true;
              fullBuffer = Buffer.concat([fullBuffer, hash.subarray(4)]);
            }
          }
        }
        let clean = fullBuffer;
        while (clean.length > 0 && clean[clean.length - 1] === 0) {
          clean = clean.subarray(0, clean.length - 1);
        }
        if (isCompressed) {
          try {
            const inflated = pako.inflate(clean);
            return Buffer.from(inflated).toString("utf8");
          } catch (e) {
            console.warn("\u89E3\u538B\u5931\u8D25", e);
            return "";
          }
        }
        return clean.toString("utf8");
      }
      /**
       * 检查地址是否属于这个协议
       * @param address 钱包地址
       * @returns 是否属于这个协议的数据地址
       */
      isScashDAPAddress(address) {
        const hash = this.decodeScashAddressToHash(address);
        if (!hash) return false;
        const hex = hash.toString("hex");
        for (const protocol of Object.values(this.PROTOCOLS)) {
          if (hex.startsWith(protocol.magic.toString("hex"))) {
            return true;
          }
        }
        return false;
      }
      /**
       * 将 Scash 地址（bech32 P2WSH）解码为 32 字节 Hash Buffer
       *
       * 公共方法：可用于自定义协议解析、地址校验等高级场景
       *
       * @param {string} address Scash 地址（bech32 编码，前缀由 NETWORK.bech32 决定，默认 'scash'）
       * @returns {Buffer|null} 解码后的 32 字节 Hash Buffer；如果不是合法的 P2WSH 地址或解码失败则返回 null
       */
      decodeScashAddressToHash(address) {
        try {
          const prefix = this.NETWORK && this.NETWORK.bech32 ? this.NETWORK.bech32 : "scash";
          if (!address || !address.startsWith(prefix)) return null;
          const decoded = bech32.decode(address);
          if (decoded.prefix !== prefix) return null;
          const data = bech32.fromWords(decoded.words.slice(1));
          return Buffer.from(data);
        } catch (e) {
          return null;
        }
      }
    };
    module.exports = ScashDAP;
  }
});
export default require_ScashDAP();
