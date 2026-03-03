#!/usr/bin/env node

const { spawn } = require('child_process');

function runCommand(command, args, cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { 
      cwd,
      stdio: 'pipe',
      shell: true
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });
  });
}

function parseHex(hex) {
  // 解析交易 hex 的关键部分
  const result = {
    version: hex.substring(0, 8),
    inputCount: hex.substring(8, 10),
    inputs: [],
    outputCount: '',
    outputs: []
  };
  
  let pos = 10;
  
  // 解析输入
  const inputCount = parseInt(hex.substring(8, 10), 16);
  for (let i = 0; i < inputCount; i++) {
    const input = {
      txid: hex.substring(pos, pos + 64),
      vout: hex.substring(pos + 64, pos + 72),
      scriptLength: hex.substring(pos + 72, pos + 74),
    };
    
    const scriptLen = parseInt(input.scriptLength, 16);
    input.script = hex.substring(pos + 74, pos + 74 + scriptLen * 2);
    input.sequence = hex.substring(pos + 74 + scriptLen * 2, pos + 74 + scriptLen * 2 + 8);
    
    result.inputs.push(input);
    pos += 74 + scriptLen * 2 + 8;
  }
  
  // 解析输出
  result.outputCount = hex.substring(pos, pos + 2);
  pos += 2;
  
  const outputCount = parseInt(result.outputCount, 16);
  for (let i = 0; i < outputCount; i++) {
    const output = {
      satoshis: hex.substring(pos, pos + 16),
      scriptLength: hex.substring(pos + 16, pos + 18),
    };
    
    const scriptLen = parseInt(output.scriptLength, 16);
    output.script = hex.substring(pos + 18, pos + 18 + scriptLen * 2);
    
    result.outputs.push(output);
    pos += 18 + scriptLen * 2;
  }
  
  result.locktime = hex.substring(pos, pos + 8);
  
  return result;
}

function extractGoResults(stdout) {
  const lines = stdout.split('\n');
  const results = { step1: {}, step2: {} };
  
  for (const line of lines) {
    if (line.includes('Step1 - TxID:')) {
      results.step1.txid = line.split('Step1 - TxID: ')[1].trim();
    } else if (line.includes('Step1 - Hex:')) {
      results.step1.hex = line.split('Step1 - Hex: ')[1].trim();
    } else if (line.includes('Step2 - TxID:')) {
      results.step2.txid = line.split('Step2 - TxID: ')[1].trim();
    } else if (line.includes('Step2 - Hex:')) {
      results.step2.hex = line.split('Step2 - Hex: ')[1].trim();
    }
  }
  
  return results;
}

function extractTypescriptResults(stdout) {
  const lines = stdout.split('\n');
  const results = { step1: {}, step2: {} };
  
  for (const line of lines) {
    if (line.includes('Step1 - TxID:')) {
      results.step1.txid = line.split('Step1 - TxID: ')[1].trim();
    } else if (line.includes('Step1 - Hex:')) {
      results.step1.hex = line.split('Step1 - Hex: ')[1].trim();
    } else if (line.includes('Step2 - TxID:')) {
      results.step2.txid = line.split('Step2 - TxID: ')[1].trim();
    } else if (line.includes('Step2 - Hex:')) {
      results.step2.hex = line.split('Step2 - Hex: ')[1].trim();
    }
  }
  
  return results;
}

function compareTransactionStructure(goHex, tsHex, step) {
  console.log(`\n🔍 详细分析 ${step} 交易结构差异:`);
  
  if (!goHex || !tsHex) {
    console.log('❌ 无法获取交易数据');
    return;
  }
  
  const goTx = parseHex(goHex);
  const tsTx = parseHex(tsHex);
  
  // 比较版本
  if (goTx.version !== tsTx.version) {
    console.log(`  版本不同: Go(${goTx.version}) vs TS(${tsTx.version})`);
  }
  
  // 比较输入
  if (goTx.inputs.length !== tsTx.inputs.length) {
    console.log(`  输入数量不同: Go(${goTx.inputs.length}) vs TS(${tsTx.inputs.length})`);
  } else {
    for (let i = 0; i < goTx.inputs.length; i++) {
      const goInput = goTx.inputs[i];
      const tsInput = tsTx.inputs[i];
      
      if (goInput.txid !== tsInput.txid) {
        console.log(`  输入${i} TXID不同: Go(${goInput.txid}) vs TS(${tsInput.txid})`);
      }
      if (goInput.vout !== tsInput.vout) {
        console.log(`  输入${i} VOUT不同: Go(${goInput.vout}) vs TS(${tsInput.vout})`);
      }
      if (goInput.script !== tsInput.script) {
        console.log(`  输入${i} 脚本不同:`);
        console.log(`    Go: ${goInput.script}`);
        console.log(`    TS: ${tsInput.script}`);
        console.log(`    脚本长度: Go(${goInput.script.length/2}) vs TS(${tsInput.script.length/2})`);
      }
      if (goInput.sequence !== tsInput.sequence) {
        console.log(`  输入${i} 序列号不同: Go(${goInput.sequence}) vs TS(${tsInput.sequence})`);
      }
    }
  }
  
  // 比较输出
  if (goTx.outputs.length !== tsTx.outputs.length) {
    console.log(`  输出数量不同: Go(${goTx.outputs.length}) vs TS(${tsTx.outputs.length})`);
  } else {
    for (let i = 0; i < goTx.outputs.length; i++) {
      const goOutput = goTx.outputs[i];
      const tsOutput = tsTx.outputs[i];
      
      if (goOutput.satoshis !== tsOutput.satoshis) {
        console.log(`  输出${i} 金额不同: Go(${goOutput.satoshis}) vs TS(${tsOutput.satoshis})`);
      }
      if (goOutput.script !== tsOutput.script) {
        console.log(`  输出${i} 脚本不同:`);
        console.log(`    Go: ${goOutput.script}`);
        console.log(`    TS: ${tsOutput.script}`);
      }
    }
  }
  
  // 比较锁定时间
  if (goTx.locktime !== tsTx.locktime) {
    console.log(`  锁定时间不同: Go(${goTx.locktime}) vs TS(${tsTx.locktime})`);
  }
}

async function main() {
  console.log('🔍 详细分析跨语言交易差异...\n');
  
  const rootDir = require('path').resolve(__dirname, '../..');
  const testDir = require('path').resolve(__dirname);
  
  try {
    console.log('1️⃣ 运行 Go 主程序...');
    const goResult = await runCommand('go', ['run', 'main.go'], require('path').resolve(testDir, 'go_runner'));
    const goResults = extractGoResults(goResult.stdout);
    
    console.log('2️⃣ 运行 TypeScript 主程序...');
    const tsResult = await runCommand('npx', ['tsx', 'examples/dual_endpoint/ts_dual_endpoint_main.ts'], rootDir);
    const tsResults = extractTypescriptResults(tsResult.stdout);
    
    console.log('3️⃣ 分析结果...');
    
    // 分析 Step1 交易
    compareTransactionStructure(goResults.step1.hex, tsResults.step1.hex, 'Step1');
    
    // 分析 Step2 交易
    compareTransactionStructure(goResults.step2.hex, tsResults.step2.hex, 'Step2');
    
    console.log('\n📋 总结:');
    console.log('  主要差异可能来自:');
    console.log('  1. 签名算法的随机性');
    console.log('  2. 输入数据的细微差异');
    console.log('  3. 脚本构建方式的不同');
    console.log('  4. 序列化方式的差异');
    
  } catch (error) {
    console.error('❌ 分析失败:', error.message);
    process.exit(1);
  }
}

main(); 
