#!/usr/bin/env node

/**
 * 一键执行所有单元测试与示例。
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const goCacheDir = path.join(rootDir, '.gocache');
const baseEnv = { ...process.env };

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
};

const ensureGoEnv = () => ({ ...baseEnv, GOCACHE: goCacheDir });

const runCommand = ({ name, command, cwd = rootDir, env = baseEnv }) => {
  console.log(`\n▶️ ${name}`);
  const result = spawnSync(command[0], command.slice(1), {
    cwd,
    env,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    console.error(`❌ ${name} 失败 (exit ${result.status})`);
    return { name, status: 'failed', code: result.status };
  }

  console.log(`✅ ${name} 完成`);
  return { name, status: 'passed' };
};

const summarize = (results) => {
  const groups = results.reduce(
    (memo, item) => ({
      ...memo,
      [item.status]: [...(memo[item.status] || []), item],
    }),
    {}
  );

  console.log('\n================ 执行汇总 ================');
  if (groups.passed?.length) {
    console.log('\n通过:');
    groups.passed.forEach((item) => console.log(`- ${item.name}`));
  }
  if (groups.failed?.length) {
    console.log('\n失败:');
    groups.failed.forEach((item) => console.log(`- ${item.name} (exit ${item.code})`));
  }

  return Boolean(groups.failed?.length);
};

const main = () => {
  ensureDir(goCacheDir);
  const goEnv = ensureGoEnv();

  const tasks = [
    { name: 'TypeScript 测试 (npm test)', command: ['npm', 'test'], env: baseEnv },
    { name: 'Go 测试 (go test ./...)', command: ['go', 'test', './...'], env: goEnv },

    { name: 'Go 示例 dual_endpoint/go_runner', command: ['go', 'run', 'examples/dual_endpoint/go_runner/main.go'], env: goEnv },
    { name: 'Go 示例 offline_dual_test/go_runner', command: ['go', 'run', 'examples/offline_dual_test/go_runner/main.go'], env: goEnv },
    { name: 'Go 示例 offline_dual_test/comparison.go', command: ['go', 'run', 'examples/offline_dual_test/comparison.go'], env: goEnv },
    { name: 'Go 示例 offline_triple_test/main.go', command: ['go', 'run', 'examples/offline_triple_test/main.go'], env: goEnv },
    { name: 'Go 示例 online_dual_test/main.go', command: ['go', 'run', 'examples/online_dual_test/main.go'], env: goEnv },
    { name: 'Go 示例 online_triple_test/main.go', command: ['go', 'run', 'examples/online_triple_test/main.go'], env: goEnv },
    { name: 'Go 示例 txtest/go_runner', command: ['go', 'run', 'examples/txtest/go_runner/main.go'], env: goEnv },
    { name: 'Go 示例 txtest/compare.go', command: ['go', 'run', 'examples/txtest/compare.go'], env: goEnv },
    { name: 'Go 示例 triplextest/go_runner', command: ['go', 'run', 'examples/triplextest/go_runner/main.go'], env: goEnv },
    { name: 'Go 示例 triplextest/compare.go', command: ['go', 'run', 'examples/triplextest/compare.go'], env: goEnv },
    { name: 'Go 示例 multisig/go_generate.go', command: ['go', 'run', 'examples/multisig/go_generate.go'], env: goEnv },
    { name: 'Go+TS 多签校验 (管道)', command: ['bash', '-lc', 'go run examples/multisig/go_generate.go | npx tsx examples/multisig/ts_check.ts'], env: goEnv },

    { name: 'TS 示例 dual_endpoint/ts_dual_endpoint_main.ts', command: ['npx', 'tsx', 'examples/dual_endpoint/ts_dual_endpoint_main.ts'], env: baseEnv },
    { name: 'TS 示例 offline_dual_test/main.ts', command: ['npx', 'tsx', 'examples/offline_dual_test/main.ts'], env: baseEnv },
    { name: 'TS 示例 offline_triple_test/main.ts', command: ['npx', 'tsx', 'examples/offline_triple_test/main.ts'], env: baseEnv },
    { name: 'TS 示例 txtest/ts_runner.ts', command: ['npx', 'tsx', 'examples/txtest/ts_runner.ts'], env: baseEnv },
    { name: 'TS 示例 triplextest/ts_runner_refactor.ts', command: ['npx', 'tsx', 'examples/triplextest/ts_runner_refactor.ts'], env: baseEnv },

    { name: '差异分析 dual_endpoint/analyze_differences.js', command: ['node', 'examples/dual_endpoint/analyze_differences.js'], env: goEnv },
  ];

  const results = tasks.map(({ name, command, env }) => runCommand({ name, command, env }));
  const hasFailure = summarize(results);
  process.exit(hasFailure ? 1 : 0);
};

main();
