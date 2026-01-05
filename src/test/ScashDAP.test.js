
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
  const dap = new ScashDAP(network, true);

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

    // 测试 1: 验证地址是否为 ScashDAP 地址
    const isDapAddress = dap.isScashDAPAddress(outputs[0].address);
    assert(isDapAddress, '第一个输出地址应是 ScashDAP 地址');
    console.log(`第一个输出地址: ${outputs[0].address}`);
    console.log('✅ 测试 1.1 通过');
  }

  // 测试用例 2: 长文本 (触发压缩)
  {
    console.log('\n[测试 2] 长文本 (压缩模式)');
    // 生成长重复文本以确保压缩率
    const text = `
    等摩尔比反应生成的复合物可提高氯化偏苯三酸酐与硼酸双甘油酯的反应活性，避免副反应发生；
反应在N,N-二甲基甲酰胺（DMF）溶剂中进行，确保反应物充分溶解。
（三）阻燃单体合成（酰化取代反应）
反应物
硼酸双甘油酯（C6H13BO6）、偏苯三酸酐三乙胺复合物
产物
含硼-磷协同阻燃单体（C15H13BO12）、三乙胺（C6H15N）
反应方程式
C6H13BO6+[C9H3O3·(C6H15N)3]55−65℃, 2−4h氮气保护C15H13BO12+3C6H15N
反应说明
硼酸双甘油酯的羟基与偏苯三酸酐的酰氯基团发生亲核取代，形成稳定的酯键结构；
产物含硼元素，为后续固相成炭提供基础，反应后经过滤、65-75℃真空干燥得到阻燃单体。
    `
    const estimateCost = dap.estimateCost(text);
    console.log(`估算成本: ${JSON.stringify(estimateCost)}`);


    // console.log(`原始文本长度: ${text}`);
    const outputs = dap.createDapOutputs(text);
    console.log(`生成了 ${outputs.length} 个输出`);

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
