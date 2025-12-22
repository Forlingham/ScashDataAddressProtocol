const { execSync } = require('child_process');
const packageJson = require('./package.json');
const fs = require('fs');
const path = require('path');

const version = packageJson.version;
const targets = {
    win: 'node18-win-x64',
    linux: 'node18-linux-x64'
};

const outputDir = 'dist';
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

const platforms = process.argv.slice(2);
const buildAll = platforms.length === 0;

if (buildAll || platforms.includes('win')) {
    console.log(`Building for Windows (v${version})...`);
    const outputFile = path.join(outputDir, `scash-dap-cli-v${version}-win.exe`);
    try {
        execSync(`pkg cli.js --target ${targets.win} --output ${outputFile}`, { stdio: 'inherit' });
        console.log(`Created: ${outputFile}`);
    } catch (e) {
        console.error('Windows build failed');
        process.exit(1);
    }
}

if (buildAll || platforms.includes('linux')) {
    console.log(`Building for Linux (v${version})...`);
    const outputFile = path.join(outputDir, `scash-dap-cli-v${version}-linux`);
    try {
        execSync(`pkg cli.js --target ${targets.linux} --output ${outputFile}`, { stdio: 'inherit' });
        console.log(`Created: ${outputFile}`);
    } catch (e) {
        console.error('Linux build failed');
        process.exit(1);
    }
}
