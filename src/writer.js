
const { ECPairFactory } = require('ecpair');
const tinysecp = require('tiny-secp256k1');
const bip39 = require('bip39');
const { BIP32Factory } = require('bip32');
const axios = require('axios');

// 初始化库
const ECPair = ECPairFactory(tinysecp);
const bip32 = BIP32Factory(tinysecp);




