// --- Scash-DAP 协议实现 ---

const { bech32 } = require('bech32');
const { NETWORK } = require('./const.js');
const bitcoin = require('bitcoinjs-lib');

class ScashDAP {
  constructor() { }

  // --- 核心协议实现, 创建 DAP 输出 ---
  createDapOutputs(text) {
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
        network: NETWORK
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
    const MAGIC_HEX = 'afafafaf';
    let fullBuffer = Buffer.alloc(0);

    for (const out of outputs) {
      // 1. 解码地址
      let hash;
      try {
        const decoded = bech32.decode(out.address);
        if (decoded.prefix !== 'scash') continue;
        hash = Buffer.from(bech32.fromWords(decoded.words.slice(1)));
      } catch (e) { continue; }

      // 2. 检查协议头
      if (hash.length === 32 && hash.toString('hex').startsWith(MAGIC_HEX)) {
        // 3. 提取数据 (去掉前4字节)
        fullBuffer = Buffer.concat([fullBuffer, hash.subarray(4)]);
      }
    }

    // 4. 去除补零并转码
    let clean = fullBuffer;
    while (clean.length > 0 && clean[clean.length - 1] === 0) {
      clean = clean.subarray(0, clean.length - 1);
    }

    return clean.toString('utf8');
  }
}

module.exports = ScashDAP;