import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildReleasePlan,
  classifyRegistryStatus,
  deriveReleaseTags,
  parseReleaseArguments,
  validateCratesRegistryMetadata,
  validateNpmRegistryMetadata,
  validateReleasePreflight,
  validateRustVcsInfo,
} from './release-plan.mjs';

test('正常发布步骤顺序固定', () => {
  const plan = buildReleasePlan({ resumeFrom: null, goVersion: '4.0.0', rustVersion: '4.0.0' });
  assert.deepEqual(plan.steps, ['preflight', 'create-local-tags', 'publish-npm', 'publish-rust', 'push-tags', 'verify']);
  assert.equal(plan.goTag, 'v4.0.0');
  assert.equal(plan.rustTag, 'rust-v4.0.0');
});

test('恢复点只选择施工单规定的后续步骤', () => {
  assert.deepEqual(buildReleasePlan({ resumeFrom: 'rust', goVersion: '4.0.0', rustVersion: '4.0.0' }).steps, [
    'preflight', 'verify-npm', 'publish-rust', 'push-tags', 'verify',
  ]);
  assert.deepEqual(buildReleasePlan({ resumeFrom: 'tags', goVersion: '4.0.0', rustVersion: '4.0.0' }).steps, [
    'preflight', 'verify-registries', 'verify-local-tags', 'push-tags', 'verify',
  ]);
  assert.deepEqual(buildReleasePlan({ resumeFrom: 'verify', goVersion: '4.0.0', rustVersion: '4.0.0' }).steps, [
    'preflight', 'verify-release',
  ]);
});

test('恢复参数、版本和 tag 推导不接受隐式值', () => {
  assert.deepEqual(parseReleaseArguments([]), { resumeFrom: null });
  assert.deepEqual(parseReleaseArguments(['--resume-from', 'rust']), { resumeFrom: 'rust' });
  assert.throws(() => parseReleaseArguments(['--resume-from', 'npm']), /Usage/);
  assert.throws(() => deriveReleaseTags('3', '4.0.0'), /Invalid Go release version/);
  assert.throws(() => buildReleasePlan({ resumeFrom: 'unknown', goVersion: '4.0.0', rustVersion: '4.0.0' }), /Unknown resume point/);
});

test('发布前置条件的纯校验拒绝非 main、脏工作树、未推送 HEAD 和已存在产物', () => {
  const errors = validateReleasePreflight({
    resumeFrom: null,
    branch: 'feature/release',
    workingTreeClean: false,
    headInOriginMain: false,
    localTags: { go: 'current', rust: 'absent' },
    remoteTags: { go: 'other', rust: 'absent' },
    registries: { npm: 'present', rust: 'unavailable' },
  });
  assert.match(errors.join('\n'), /branch main/);
  assert.match(errors.join('\n'), /clean working tree/);
  assert.match(errors.join('\n'), /HEAD is not contained/);
  assert.match(errors.join('\n'), /local tag go/);
  assert.match(errors.join('\n'), /npm registry version/);
  assert.match(errors.join('\n'), /rust registry version/);
});

test('四种发布入口的前置状态分别可被纯校验接受', () => {
  const common = {
    branch: 'main',
    workingTreeClean: true,
    headInOriginMain: true,
  };
  const states = [
    {
      resumeFrom: null,
      localTags: { go: 'absent', rust: 'absent' },
      remoteTags: { go: 'absent', rust: 'absent' },
      registries: { npm: 'absent', rust: 'absent' },
    },
    {
      resumeFrom: 'rust',
      localTags: { go: 'current', rust: 'current' },
      remoteTags: { go: 'absent', rust: 'absent' },
      registries: { npm: 'present', rust: 'absent' },
    },
    {
      resumeFrom: 'tags',
      localTags: { go: 'current', rust: 'current' },
      remoteTags: { go: 'current', rust: 'absent' },
      registries: { npm: 'present', rust: 'present' },
    },
    {
      resumeFrom: 'verify',
      localTags: { go: 'current', rust: 'current' },
      remoteTags: { go: 'current', rust: 'current' },
      registries: { npm: 'present', rust: 'present' },
    },
  ];

  for (const state of states) {
    assert.deepEqual(validateReleasePreflight({ ...common, ...state }), []);
  }
});

test('恢复入口拒绝不匹配的 tag、registry 和未知状态', () => {
  const errors = validateReleasePreflight({
    resumeFrom: 'rust',
    branch: 'main',
    workingTreeClean: true,
    headInOriginMain: true,
    localTags: { go: 'current', rust: 'other' },
    remoteTags: { go: 'absent', rust: 'other' },
    registries: { npm: 'present', rust: 'unavailable' },
  });
  assert.match(errors.join('\n'), /local tag rust/);
  assert.match(errors.join('\n'), /remote tag rust/);
  assert.match(errors.join('\n'), /registry version/);
  assert.match(errors.join('\n'), /Invalid registry state/);
});

test('registry 只有明确的 404 才表示版本不存在', () => {
  assert.equal(classifyRegistryStatus(404, 'npm registry', 'pkg@4.0.0'), 'absent');
  assert.equal(classifyRegistryStatus(200, 'npm registry', 'pkg@4.0.0'), 'present');
  assert.throws(() => classifyRegistryStatus(503, 'npm registry', 'pkg@4.0.0'), /Unexpected npm registry response/);
});

test('统一发布脚本不会吞掉 registry 异常并使用 Go Proxy 转义路径', () => {
  const script = fs.readFileSync(new URL('./release-all.sh', import.meta.url), 'utf8');
  assert.doesNotMatch(script, /case\s+"\$\(classify_registry_status/);
  assert.match(script, /if ! registry_state="\$\(classify_registry_status/);
  assert.match(script, /GO_PROXY_MODULE_PATH='github\.com\/bsv8\/!multisig!pool\/v4'/);
  assert.match(script, /import pool \\\"\$GO_MODULE_PATH\/pkg\\\"/);
  assert.match(script, /GOWORK=off go mod tidy && GOWORK=off go build -buildvcs=false/);
  assert.match(script, /--user-agent "\$RELEASE_USER_AGENT"/);
  assert.match(script, /\.cargo_vcs_info\.json/);
  assert.match(script, /npm publish \. --access public --ignore-scripts --registry "\$NPM_REGISTRY"/);
  assert.match(script, /cargo publish --dry-run --registry crates-io --manifest-path rust\/Cargo\.toml/);
  assert.match(script, /cargo publish --registry crates-io --manifest-path rust\/Cargo\.toml/);
});

test('npm registry 必须提供当前 commit 的 gitHead 并匹配产物 integrity', () => {
  const common = {
    expectedName: 'keymaster-multisig-pool',
    expectedVersion: '4.0.0',
    expectedCommit: 'fbde8f15da1c5d9e715e8c3d46d0b3c97c6e0041',
    expectedIntegrity: 'sha512-local-artifact',
  };
  assert.doesNotThrow(() => validateNpmRegistryMetadata({
    ...common,
    metadata: { name: common.expectedName, version: common.expectedVersion, gitHead: common.expectedCommit, 'dist.integrity': common.expectedIntegrity },
  }));
  assert.throws(() => validateNpmRegistryMetadata({
    ...common,
    metadata: { name: common.expectedName, version: common.expectedVersion, dist: { integrity: common.expectedIntegrity } },
  }), /gitHead undefined/);
  assert.throws(() => validateNpmRegistryMetadata({
    ...common,
    metadata: { name: common.expectedName, version: common.expectedVersion, gitHead: 'other-commit', 'dist.integrity': common.expectedIntegrity },
  }), /gitHead other-commit/);
  assert.throws(() => validateNpmRegistryMetadata({
    ...common,
    metadata: { name: common.expectedName, version: common.expectedVersion, gitHead: common.expectedCommit, 'dist.integrity': 'sha512-other-artifact' },
  }), /integrity does not match/);
});

test('crates.io registry 必须使用当前版本响应结构并提供合法 checksum', () => {
  const expectedName = 'keymaster-multisig-rust';
  const expectedVersion = '4.0.0';
  const checksum = 'a'.repeat(64);
  const common = { expectedName, expectedVersion };

  assert.equal(validateCratesRegistryMetadata({
    ...common,
    metadata: { version: { crate: expectedName, num: expectedVersion, checksum } },
  }), checksum);
  assert.throws(() => validateCratesRegistryMetadata({
    ...common,
    metadata: { crate: { id: expectedName }, version: { num: expectedVersion, checksum } },
  }), /unexpected package: undefined@4\.0\.0/);
  assert.throws(() => validateCratesRegistryMetadata({
    ...common,
    metadata: { version: { crate: 'other-crate', num: expectedVersion, checksum } },
  }), /unexpected package: other-crate@4\.0\.0/);
  assert.throws(() => validateCratesRegistryMetadata({
    ...common,
    metadata: { version: { crate: expectedName, num: expectedVersion, checksum: 'invalid' } },
  }), /valid crate checksum/);
});

test('从目录发布时 npm 会把当前 Git commit 放入 registry metadata', async () => {
  const requests = [];
  const repositoryDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const expectedCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryDirectory, encoding: 'utf8' }).trim();
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      requests.push({ method: request.method, body: Buffer.concat(chunks).toString('utf8') });
      response.statusCode = 201;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ ok: true, rev: 'local-test' }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const registry = `http://127.0.0.1:${address.port}`;
  const environment = {
    ...process.env,
    NPM_CONFIG_USERCONFIG: '/dev/null',
    NPM_CONFIG_LOGLEVEL: 'error',
  };
  environment[`npm_config_//127.0.0.1:${address.port}/:_authToken`] = 'local-test-token';

  try {
    const child = spawn('npm', ['publish', '.', '--access', 'public', '--ignore-scripts', '--registry', registry], {
      cwd: repositoryDirectory,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const exitCode = await new Promise((resolve) => child.on('close', resolve));
    assert.equal(exitCode, 0, `${stderr}\n${stdout}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  const publishRequest = requests.find(({ method }) => method === 'PUT');
  assert.ok(publishRequest, 'npm did not send a publish request');
  const payload = JSON.parse(publishRequest.body);
  assert.equal(payload.versions?.['4.0.0']?.gitHead, expectedCommit);
  assert.match(payload.versions?.['4.0.0']?.dist?.integrity ?? '', /^sha512-/);
});

test('Cargo VCS 元数据省略 dirty 时表示干净产物', () => {
  const expectedCommit = 'fbde8f15da1c5d9e715e8c3d46d0b3c97c6e0041';
  assert.doesNotThrow(() => validateRustVcsInfo({ value: { git: { sha1: expectedCommit }, path_in_vcs: 'rust' }, expectedCommit }));
  assert.doesNotThrow(() => validateRustVcsInfo({ value: { git: { sha1: expectedCommit, dirty: false } }, expectedCommit }));
  assert.throws(() => validateRustVcsInfo({ value: { git: { sha1: expectedCommit, dirty: true } }, expectedCommit }), /clean Git commit/);
  assert.throws(() => validateRustVcsInfo({ value: { git: { sha1: 'other-commit' } }, expectedCommit }), /git commit other-commit/);
});
