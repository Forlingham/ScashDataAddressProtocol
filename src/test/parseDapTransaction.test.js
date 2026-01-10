const assert = require('assert');
const ScashDAP = require('../core/ScashDAP');
const fs = require('fs');
const path = require('path');


const dataTest = fs.readFileSync(path.join(__dirname, 'data.json'), 'utf8');
const data = JSON.parse(dataTest);


const NETWORK = {
  messagePrefix: '\x18Scash Signed Message:\n',
  bech32: 'scash',
  bip32: { public: 0x0488b21e, private: 0x0488ade4 },
  pubKeyHash: 0x3c, scriptHash: 0x7d, wif: 0x80
}

const scashDAP = new ScashDAP(NETWORK, true);


const text = scashDAP.parseDapTransaction(data);

console.log(text);

