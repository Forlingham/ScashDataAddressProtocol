// ---------------------------------------------------------------------------
// Browser bundle smoke test
// ---------------------------------------------------------------------------
// 目的：在一个隔离的 vm 上下文里加载 dist/scash-dap.js（IIFE 浏览器构建），
//      该上下文里不暴露 Node.js 的 Buffer 全局，以此模拟浏览器环境。
//      如果 buffer polyfill 注入正确，则 ScashDAP 应该能正常工作。
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const bundlePath = path.resolve(__dirname, '../../dist/scash-dap.js');
const code = fs.readFileSync(bundlePath, 'utf8');

console.log('--- 浏览器构建产物 烟雾测试 ---');
console.log(`目标产物: ${bundlePath} (${(code.length / 1024).toFixed(1)} KB)`);

// 构造一个干净的"浏览器式"全局上下文：只暴露 globalThis、console、setTimeout、TextEncoder、TextDecoder、crypto。
// 不提供 Node 的 require / process / Buffer，确保 IIFE 必须依赖自身打包的 polyfill。
const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  TextEncoder,
  TextDecoder,
  // Web Crypto（bitcoinjs-lib v7 内部需要）
  crypto: globalThis.crypto,
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
sandbox.window = sandbox;

vm.createContext(sandbox);

// 校验：sandbox 里没有 Buffer 全局
assert.strictEqual(typeof sandbox.Buffer, 'undefined', 'sandbox 不应该有 Node.js Buffer 全局');

vm.runInContext(code, sandbox, { filename: 'scash-dap.js' });

// IIFE 通过 `var ScashDAP = ...` 暴露到上下文
assert.strictEqual(typeof sandbox.ScashDAP, 'function', 'IIFE 应该把 ScashDAP 暴露到全局');
console.log('[OK] IIFE 加载成功，ScashDAP 已暴露到全局');
console.log(`[OK] 版本: ${sandbox.ScashDAP.version}`);

const NETWORK = {
  messagePrefix: '\x18Scash Signed Message:\n',
  bech32: 'scash',
  bip32: { public: 0x0488b21e, private: 0x0488ade4 },
  pubKeyHash: 0x3c,
  scriptHash: 0x7d,
  wif: 0x80,
};

const dap = new sandbox.ScashDAP(NETWORK);

// 测试 1：短文本 round-trip（RAW 模式）
const text1 = 'Hello, browser bundle!';
const outputs1 = dap.createDapOutputs(text1);
assert.ok(Array.isArray(outputs1) && outputs1.length > 0, 'createDapOutputs 应返回非空数组');
assert.ok(outputs1[0].address.startsWith('scash1'), '地址应使用 scash bech32 前缀');
const parsed1 = dap.parseDapTransaction(outputs1);
assert.strictEqual(parsed1, text1, '短文本 round-trip 失败');
console.log(`[OK] 短文本 round-trip 通过: "${text1}" -> ${outputs1.length} 个输出 -> "${parsed1}"`);

// 测试 2：长文本 round-trip（ZIP 模式）
const text2 = '这是一段比较长的中文文本，用来触发 pako 压缩路径，验证浏览器构建里 pako 也能正常工作。'.repeat(10);
const cost = dap.estimateCost(text2);
assert.strictEqual(cost.mode, 'ZIP', '长重复文本应触发压缩');
const outputs2 = dap.createDapOutputs(text2);
const parsed2 = dap.parseDapTransaction(outputs2);
assert.strictEqual(parsed2, text2, '长文本 round-trip 失败');
console.log(`[OK] 长文本 round-trip (ZIP) 通过: ${text2.length} 字符 -> ${outputs2.length} 个输出`);

// 测试 3：decodeScashAddressToHash 公共方法
const hash = dap.decodeScashAddressToHash(outputs1[0].address);
assert.ok(hash, 'decodeScashAddressToHash 应返回 hash');
assert.strictEqual(hash.length, 32, 'hash 应为 32 字节');
console.log(`[OK] decodeScashAddressToHash 公共方法可用: hash 长度 = ${hash.length}`);

// 测试 4：不合法的地址应返回 null
const badHash = dap.decodeScashAddressToHash('not-a-valid-address');
assert.strictEqual(badHash, null, '非法地址应返回 null');
console.log('[OK] decodeScashAddressToHash 对非法地址返回 null');

// 测试 5：isScashDAPAddress
assert.strictEqual(dap.isScashDAPAddress(outputs1[0].address), true, 'DAP 地址应被识别');
console.log('[OK] isScashDAPAddress 工作正常');

console.log('\n所有浏览器构建烟雾测试通过 ✅');
