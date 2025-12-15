const tinysecp = require('tiny-secp256k1');
const { ECPairFactory } = require('ecpair');
const ECPair = ECPairFactory(tinysecp);
const bip39 = require('bip39');
const { BIP32Factory } = require('bip32');
const bip32 = BIP32Factory(tinysecp);
const bitcoin = require('bitcoinjs-lib');
const { NETWORK, RPC } = require('../const.js');
const axios = require('axios');

const SCASH_NETWORK = NETWORK;
const DERIVATION_PATH = "m/84'/0'/0'/0/0"; // Defaulting to Native SegWit path

// 使用助记词生成私钥和地址
async function mnemonicToAddressAndPrivateKey(mnemonic) {
  const seed = await bip39.mnemonicToSeed(mnemonic);
  const root = bip32.fromSeed(seed, SCASH_NETWORK);
  const child = root.derivePath(DERIVATION_PATH);
  // 私钥
  const keyPair = ECPair.fromPrivateKey(child.privateKey, { network: SCASH_NETWORK });

  // 你的钱包地址
  const { address } = bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(child.publicKey),
    network: SCASH_NETWORK
  });

  return {
    privateKey: keyPair,
    address
  }
}



async function rpcApi(method, params = []) {
  try {
    const response = await axios.post(RPC.rpc, {
      jsonrpc: '2.0', id: Date.now(), method, params
    }, { auth: { username: RPC.user, password: RPC.pass } });
    if (response.data.error) throw response.data.error;
    return response.data.result;
  } catch (error) {
    console.error("RPC Error:", error.response?.data || error.message);
    return null;
  }
}

module.exports = {
  mnemonicToAddressAndPrivateKey,
  rpcApi
}
