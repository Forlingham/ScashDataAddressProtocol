

const { rpcApi } = require('./tool/tool.js');
const ScashDAP = require('./core/ScashDAP.js');

// 初始化ScashDAP
const scashDAP = new ScashDAP();





// ================= 核心解码逻辑 =================

async function select(txid) {
  console.log(`\n🔍 正在查询交易: ${txid}...`);

  const tx = await rpcApi('getrawtransaction', [txid, true]);

  
  if (!tx) return;
  const outputs = tx.vout;

  const message = scashDAP.parseDapTransaction(outputs);

  // === 输出结果 ===
  console.log("\n================ 解析结果================");
  console.log(message);

}
select("f09b5717c26dbf8642957904a1b7c9c0cd3b65bc6723ab5d4744faca8f87e73c")
module.exports = {
  select
}