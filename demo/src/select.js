

const { rpcApi } = require('./tool/tool.js');
const { NETWORK } = require('./const.js');
const ScashDAP = require('../../index.js');  

// 初始化ScashDAP
const scashDAP = new ScashDAP(NETWORK);



// ================= 核心解码逻辑 =================

async function select(txid, logger = console) {

  logger.log(`\n🔍 正在查询交易: ${txid}...`);

  const tx = await rpcApi('getrawtransaction', [txid, true]);


  if (!tx) return;
  const outputs = tx.vout;

  const message = scashDAP.parseDapTransaction(outputs);

  // === 输出结果 ===
  logger.log( "解析结果:", message);

}

if (require.main === module) {
    select("1b876886f9654ab4be2b65e74eb06f2eeb2750ebd679d83218ebc3c267023074").catch(console.error);
}

module.exports = {
  select
}