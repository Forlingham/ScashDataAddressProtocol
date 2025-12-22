#!/usr/bin/env node

const { Command } = require('commander');
const inquirer = require('inquirer');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs');

// Import modules
// We use try-catch to provide a helpful error if modules are missing
let createWallet, writer, select;
try {
  createWallet = require('./src/createWallet').createWallet;
  writer = require('./src/writer').writer;
  select = require('./src/select').select;
} catch (err) {
  console.error(chalk.red('Error loading modules:'), err.message);
  process.exit(1);
}

const program = new Command();

// Custom logger to pass to modules
const logger = {
  log: (...args) => console.log(chalk.green('INFO:'), ...args),
  error: (...args) => console.error(chalk.red('ERROR:'), ...args),
  warn: (...args) => console.warn(chalk.yellow('WARN:'), ...args),
};

program
  .name('scash-dap')
  .description('CLI for ScashDataAddressProtocol Demo')
  .version('1.0.0');

program
  .command('wallet')
  .description('Create or view current wallet')
  .action(async () => {
    try {
      console.log(chalk.blue('=== Wallet Management ==='));
      await createWallet(logger);
    } catch (error) {
      logger.error(error);
    }
  });

program
  .command('write')
  .description('Write data to Scash blockchain')
  .argument('[text]', 'Text to write')
  .action(async (text) => {
    try {
      if (!text) {
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'text',
            message: 'Enter text to write:',
            validate: input => input.length > 0 ? true : 'Text cannot be empty'
          }
        ]);
        text = answers.text;
      }
      console.log(chalk.blue(`=== Writing Data: "${text}" ===`));
      await writer(text, logger);
    } catch (error) {
      logger.error(error);
    }
  });

program
  .command('select')
  .description('Query data from Scash blockchain by TXID')
  .argument('[txid]', 'Transaction Hash (TXID)')
  .action(async (txid) => {
    try {
      if (!txid) {
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'txid',
            message: 'Enter TXID:',
            validate: input => input.length > 0 ? true : 'TXID cannot be empty'
          }
        ]);
        txid = answers.txid;
      }
      console.log(chalk.blue(`=== Querying TXID: ${txid} ===`));
      await select(txid, logger);
    } catch (error) {
      logger.error(error);
    }
  });

// Check if there are any arguments (excluding node and script path)
if (!process.argv.slice(2).length) {
  startInteractiveMode();
} else {
  program.parse(process.argv);
}

async function startInteractiveMode() {
  console.clear();
  console.log(chalk.cyan('========================================='));
  console.log(chalk.cyan('     Welcome to ScashDAP CLI Demo'));
  console.log(chalk.cyan('========================================='));
  
  while (true) {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Please select an action:',
        choices: [
          { name: 'Wallet Management (Create/View)', value: 'wallet' },
          { name: 'Write Data (Writer)', value: 'write' },
          { name: 'Query Data (Select)', value: 'select' },
          new inquirer.Separator(),
          { name: 'Exit', value: 'exit' }
        ]
      }
    ]);

    if (action === 'exit') {
      console.log(chalk.gray('Goodbye!'));
      process.exit(0);
    }

    try {
      if (action === 'wallet') {
        console.log(chalk.blue('\n=== Wallet Management ==='));
        await createWallet(logger);
      } else if (action === 'write') {
        const { text } = await inquirer.prompt([{
            type: 'input',
            name: 'text',
            message: 'Enter text to write:',
            validate: input => input.length > 0 ? true : 'Text cannot be empty'
        }]);
        console.log(chalk.blue(`\n=== Writing Data: "${text}" ===`));
        await writer(text, logger);
      } else if (action === 'select') {
        const { txid } = await inquirer.prompt([{
            type: 'input',
            name: 'txid',
            message: 'Enter TXID to query:',
            validate: input => input.length > 0 ? true : 'TXID cannot be empty'
        }]);
        console.log(chalk.blue(`\n=== Querying TXID: ${txid} ===`));
        await select(txid, logger);
      }
      
      console.log('\n'); // Add some spacing
      await inquirer.prompt([{type: 'input', name: 'continue', message: 'Press Enter to return to menu...'}]);
      console.clear();
      
    } catch (error) {
      logger.error(error);
      await inquirer.prompt([{type: 'input', name: 'continue', message: 'Press Enter to return to menu...'}]);
    }
  }
}
