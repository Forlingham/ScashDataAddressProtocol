

const { rpcApi } = require('./tool/tool.js');
const ScashDAP = require('../index.js');
const { NETWORK } = require('./const.js');

// 初始化ScashDAP
const scashDAP = new ScashDAP(NETWORK);



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
select("1b876886f9654ab4be2b65e74eb06f2eeb2750ebd679d83218ebc3c267023074")
module.exports = {
  select
}