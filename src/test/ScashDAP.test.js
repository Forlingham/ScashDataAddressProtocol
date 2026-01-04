
const assert = require('assert');
const ScashDAP = require('../core/ScashDAP');

// Mock network object if needed, or use a string if the class accepts it.
// The class uses `this.NETWORK` in `bitcoin.payments.p2wsh`.
// bitcoinjs-lib usually expects a network object (bitcoin.networks.bitcoin, etc.)
// Let's check how ScashDAP uses it.
// Line 63: network: this.NETWORK
// We can pass bitcoin.networks.regtest for testing.

const bitcoin = require('bitcoinjs-lib');

async function runTests() {
  console.log('--- 开始 ScashDAP 测试 ---');

  const network = bitcoin.networks.regtest;
  const dap = new ScashDAP(network);

  // 测试用例 1: 短文本 (无压缩)
  {
    console.log('\n[测试 1] 短文本 (无压缩模式)');
    const text = "Hello Scash DAP";
    const outputs = dap.createDapOutputs(text);
    
    console.log(`生成了 ${outputs.length} 个输出`);
    assert(outputs.length > 0, '应该生成至少一个输出');

    // 模拟交易输出结构 (parseDapTransaction 需要 outputs 数组，每个元素有 scriptPubKey.address)
    // createDapOutputs 返回 { address, value }
    // parseDapTransaction 读取 out.scriptPubKey.address
    // 我们需要适配一下结构
    const txOutputs = outputs.map(o => ({
      scriptPubKey: { address: o.address }
    }));

    const decoded = dap.parseDapTransaction(txOutputs);
    console.log(`解码结果: "${decoded}"`);
    
    assert.strictEqual(decoded, text, '解码后的文本应与原文一致');
    console.log('✅ 测试 1 通过');
  }

  // 测试用例 2: 长文本 (触发压缩)
  {
    console.log('\n[测试 2] 长文本 (压缩模式)');
    // 生成长重复文本以确保压缩率
    const text = "ScashDAP ".repeat(100); 
    console.log(`原始文本长度: ${text}`);
    const outputs = dap.createDapOutputs(text);
    console.log(outputs);

    
    // 验证是否触发了压缩逻辑 (可以通过 console log 观察，或者检查 magic bytes)
    // 但作为黑盒测试，主要验证解码是否正确
    
    const txOutputs = outputs.map(o => ({
      scriptPubKey: { address: o.address }
    }));

    try {
        const decoded = dap.parseDapTransaction(txOutputs);
        console.log(`解码结果长度: ${decoded.length}`);
        
        if (decoded !== text) {
            console.error('❌ 解码内容不匹配');
            console.error(`期望长度: ${text.length}, 实际长度: ${decoded.length}`);
            // 如果是因为没有解压，可能会看到乱码或者压缩数据
        }
        assert.strictEqual(decoded, text, '解码后的文本应与原文一致');
        console.log('✅ 测试 2 通过');
    } catch (err) {
        console.error('❌ 测试 2 失败:', err.message);
        // 不抛出错误，以便继续执行或显示总结，或者直接抛出
        throw err;
    }
  }
  
  console.log('\n所有测试完成!');
}

runTests().catch(err => {
  console.error('\n测试运行失败:', err);
  process.exit(1);
});
