// --- 配置 ---
const RPC = {
  rpc: 'https://explorer.scash.network/api/rpc',
  user: 'scash',
  pass: 'scash',
};

const NETWORK = {
  messagePrefix: '\x18Scash Signed Message:\n',
  bech32: 'scash',
  bip32: { public: 0x0488b21e, private: 0x0488ade4 },
  pubKeyHash: 0x3c, scriptHash: 0x7d, wif: 0x80
}

module.exports = {
  RPC,
  NETWORK
}
