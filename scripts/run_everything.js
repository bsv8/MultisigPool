#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

const commands = [
  ['完整发布门禁', ['bash', 'scripts/run_all_tests.sh']],
];

for (const [name, command] of commands) {
  console.log(`\n▶ ${name}`);
  const result = spawnSync(command[0], command.slice(1), { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
