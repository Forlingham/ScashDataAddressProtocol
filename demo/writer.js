
const bitcoin = require('bitcoinjs-lib');
const { ECPairFactory } = require('ecpair');
const tinysecp = require('tiny-secp256k1');
const ECPair = ECPairFactory(tinysecp);
const bip39 = require('bip39');
const { BIP32Factory } = require('bip32');
const bip32 = BIP32Factory(tinysecp);
const { NETWORK } = require('./const.js');
const fs = require('fs');
const ScashDAP = require('./core/ScashDAP.js');
const { rpcApi } = require('./tool/tool.js');

// 初始化ScashDAP
const scashDAP = new ScashDAP();


const SCASH_NETWORK = NETWORK;

// 派生路径
const DERIVATION_PATH = "m/84'/0'/0'/0/0";

/**
 * 主函数
 * @param {string} TEXT_DATA - 要上链的文字数据
 */
async function writer(TEXT_DATA) {
    let envContent = '';
    try {
        envContent = fs.readFileSync(envPath, 'utf8');
    } catch (err) {
        console.log('未找到 MY_MNEMONIC 助记词,请先创建助记词');
        return
    }


    // 检查是否存在现有助记词
    const match = envContent.match(/^MY_MNEMONIC=(.*)$/m);
    const MY_MNEMONIC = match ? match[1].trim() : '';

    if (!MY_MNEMONIC) {
        console.log('未找到 MY_MNEMONIC 助记词,请先创建助记词');
        return
    }
    try {
        console.log("=== 1. 初始化钱包 ===");
        let mnemonic = MY_MNEMONIC;

        // 派生私钥
        const seed = await bip39.mnemonicToSeed(mnemonic);
        const root = bip32.fromSeed(seed, SCASH_NETWORK);
        const child = root.derivePath(DERIVATION_PATH);
        const keyPair = ECPair.fromPrivateKey(child.privateKey, { network: SCASH_NETWORK });

        // 你的钱包地址
        const { address: myAddress } = bitcoin.payments.p2wpkh({
            pubkey: Buffer.from(child.publicKey),
            network: SCASH_NETWORK
        });

        console.log(`- 钱包地址: ${myAddress}`);
        console.log("\n=== 2. 扫描资金 (RPC) ===");
        const scanResult = await rpcApi('scantxoutset', ['start', [{ desc: `addr(${myAddress})` }]]);
        const unspents = scanResult.unspents;

        if (!unspents || unspents.length === 0) {
            console.error(`[错误] 地址 ${myAddress} 没有资金！请先转账。`);
            return;
        }

        const selectedUtxo = unspents.find(u => u.amount > 0.001);
        if (!selectedUtxo) {
            console.error(`[错误] 余额不足支付手续费。`);
            return;
        }

        const utxoValueSat = Math.floor(selectedUtxo.amount * 100000000);
        const utxoScript = Buffer.from(selectedUtxo.scriptPubKey, 'hex');
        console.log(`- 使用资金: ${selectedUtxo.amount} SCASH (${selectedUtxo.txid})`);


        console.log("\n=== 3. 构建伪造地址交易 (PSBT) ===");
        const psbt = new bitcoin.Psbt({ network: SCASH_NETWORK });

        psbt.addInput({
            hash: selectedUtxo.txid,
            index: selectedUtxo.vout,
            witnessUtxo: {
                script: utxoScript,
                value: utxoValueSat,
            },
        });

        // --- [核心修改] 生成伪装地址输出 ---
        const dataOutputs = scashDAP.createDapOutputs(TEXT_DATA);

        let totalBurned = 0;
        dataOutputs.forEach((item, index) => {
            console.log(`- [数据片段 ${index + 1}] 伪装地址: ${item.address}`);
            console.log(`  (对应数据Hex: ${item.dataHex})`);

            psbt.addOutput({
                address: item.address,
                value: item.value,
            });
            totalBurned += item.value;
        });
        // --------------------------------

        // 找零
        const fee = 5000;
        const changeSat = utxoValueSat - totalBurned - fee;

        if (changeSat < 0) throw new Error("资金不足以支付烧币费用和手续费");

        psbt.addOutput({
            address: myAddress,
            value: changeSat,
        });

        console.log("\n=== 4. 签名与广播 ===");

        // 签名修复 (Buffer类型)
        const customSigner = {
            publicKey: Buffer.from(keyPair.publicKey),
            sign: (hash) => Buffer.from(keyPair.sign(hash))
        };
        psbt.signInput(0, customSigner);
        psbt.finalizeAllInputs();

        const signedHex = psbt.extractTransaction().toHex();
        console.log(`- 交易构建完成`);

        const txid = await rpcApi('sendrawtransaction', [signedHex]);

        console.log("\n✅ 上链成功！");
        console.log(`TXID: ${txid}`);
        console.log(`\n说明: 你的文字被拆分并“转账”给了上面打印的 [伪装地址]。`);
        console.log(`这些地址不属于任何人，资金(${totalBurned} sats)将被永久销毁。`);
    } catch (e) {
        console.error("\n❌ 错误:", e);
        if (e.response) console.error("RPC Response:", e.response.data);
    }
}

module.exports = {
    writer
}





