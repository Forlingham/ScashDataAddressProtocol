const fs = require('fs');
const path = require('path');
const bip39 = require('bip39');
const { mnemonicToAddressAndPrivateKey } = require('./tool/tool.js');

const envPath = process.pkg ? path.resolve(process.execPath, '../.env') : path.resolve(__dirname, '../.env');


async function main(logger = console) {
  let envContent = '';
  try {
    envContent = fs.readFileSync(envPath, 'utf8');
  } catch (err) {
    logger.log('.env 文件不存在，将创建新文件');
  }

  // 检查是否存在现有助记词
  const match = envContent.match(/^MY_MNEMONIC=(.*)$/m);
  const existingMnemonic = match ? match[1].trim() : '';

  if (existingMnemonic) {
    logger.log('环境变量文件已存在助记词，跳过创建');
    logger.log('当前助记词:', existingMnemonic);
    try {
      const { address } = await mnemonicToAddressAndPrivateKey(existingMnemonic);
      logger.log('对应的地址:', address);
    } catch (error) {
      logger.error('现有助记词无效或生成地址失败:', error.message);
    }
  } else {
    logger.log('环境变量文件不存在助记词，开始创建');
    const mnemonic = bip39.generateMnemonic();
    logger.log('生成的助记词:', mnemonic);
    
    const { address } = await mnemonicToAddressAndPrivateKey(mnemonic);
    logger.log('生成的地址:', address);

    // 更新 .env 文件
    let newEnvContent = envContent;
    if (match) {
        // 替换现有的行
        newEnvContent = envContent.replace(/^MY_MNEMONIC=.*$/m, `MY_MNEMONIC=${mnemonic}`);
    } else {
        // 如果未找到，则追加到文件末尾
        if (newEnvContent && !newEnvContent.endsWith('\n')) newEnvContent += '\n';
        newEnvContent += `MY_MNEMONIC=${mnemonic}\n`;
    }
    
    fs.writeFileSync(envPath, newEnvContent, 'utf8');
    logger.log(`助记词已写入 ${envPath}`);
  }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    createWallet: main
};
