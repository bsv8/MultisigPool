import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ROOT_DIRECTORY,
  collectRepositoryErrors,
  parseVersionsManifest,
  renderCargoLock,
  renderCargoManifest,
  renderPackageJson,
  renderPackageLock,
  renderGoVersionFile,
  renderRustVersionFile,
  renderTypeScriptVersionFile,
  syncRepository,
  validateVersionsManifest,
} from './release-versions.mjs';

const validManifest = Object.freeze({
  schemaVersion: 1,
  protocol: Object.freeze({ id: 'bitfs.pool.v3', version: 3, goModuleMajor: 3 }),
  packages: Object.freeze({ npm: '3.0.0', go: '3.0.0', rust: '0.2.0' }),
});

const fixtureFiles = Object.freeze([
  'release/versions.json',
  'package.json',
  'package-lock.json',
  'go.mod',
  'rust/Cargo.toml',
  'rust/Cargo.lock',
  'internal/versioninfo/version.go',
  'src/version.ts',
  'rust/src/version.rs',
  'pkg/index.go',
  'pkg/two_party_pool/index.go',
  'pkg/arbitrated_pool/index.go',
  'src/types.ts',
  'src/index.ts',
  'rust/src/lib.rs',
  'scripts/release-all.sh',
]);

const createFixture = () => {
  const rootDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'multisigpool-release-'));
  for (const relativePath of fixtureFiles) {
    const source = path.join(ROOT_DIRECTORY, relativePath);
    const target = path.join(rootDirectory, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
  fs.chmodSync(path.join(rootDirectory, 'scripts/release-all.sh'), 0o755);
  return rootDirectory;
};

const fileSnapshot = (rootDirectory) => Object.fromEntries(fixtureFiles.map((relativePath) => {
  const content = fs.readFileSync(path.join(rootDirectory, relativePath));
  return [relativePath, crypto.createHash('sha256').update(content).digest('hex')];
}));

const withFixture = (callback) => {
  const rootDirectory = createFixture();
  try {
    return callback(rootDirectory);
  } finally {
    fs.rmSync(rootDirectory, { recursive: true, force: true });
  }
};

test('合法清单可生成确定的三语言内容', () => {
  assert.deepEqual(validateVersionsManifest(validManifest), []);
  assert.equal(renderGoVersionFile(validManifest), renderGoVersionFile(validManifest));
  assert.equal(renderTypeScriptVersionFile(validManifest), renderTypeScriptVersionFile(validManifest));
  assert.equal(renderRustVersionFile(validManifest), renderRustVersionFile(validManifest));
});

test('缺失字段和未知字段都会失败', () => {
  const missing = structuredClone(validManifest);
  delete missing.protocol.goModuleMajor;
  assert.throws(() => parseVersionsManifest(JSON.stringify(missing)), /goModuleMajor is missing/);

  const unknown = structuredClone(validManifest);
  unknown.packages.extra = '3.0.0';
  assert.throws(() => parseVersionsManifest(JSON.stringify(unknown)), /packages\.extra is unknown/);
});

test('协议字段和包版本必须使用施工单规定的类型与格式', () => {
  const invalidProtocol = structuredClone(validManifest);
  invalidProtocol.protocol.version = '3';
  assert.throws(() => parseVersionsManifest(JSON.stringify(invalidProtocol)), /expected integer 3/);

  const invalidPackage = structuredClone(validManifest);
  invalidPackage.packages.npm = 'v3.0.0';
  assert.throws(() => parseVersionsManifest(JSON.stringify(invalidPackage)), /complete SemVer/);

  const splitVersionLine = structuredClone(validManifest);
  splitVersionLine.packages.go = '3.0';
  assert.throws(() => parseVersionsManifest(JSON.stringify(splitVersionLine)), /complete SemVer/);
});

test('npm 和 Go 版本线必须相同', () => {
  const invalid = structuredClone(validManifest);
  invalid.packages.go = '3.0.1';
  assert.throws(() => parseVersionsManifest(JSON.stringify(invalid)), /must be equal/);
});

test('解析错误消息使用英文', () => {
  assert.throws(() => parseVersionsManifest('{'), (error) => {
    assert.match(error.message, /invalid JSON/);
    assert.doesNotMatch(error.message, /[\u4e00-\u9fff]/);
    return true;
  });
});

test('check 能发现镜像文件被篡改', () => {
  withFixture((rootDirectory) => {
    const packagePath = path.join(rootDirectory, 'package.json');
    const packageText = fs.readFileSync(packagePath, 'utf8');
    fs.writeFileSync(packagePath, packageText.replace('  "version": "3.0.0",', '  "version": "9.9.9",'));
    assert.match(collectRepositoryErrors(rootDirectory).join('\n'), /package\.json: version expected "3\.0\.0", actual "9\.9\.9"/);
  });
});

test('check 拒绝 Cargo manifest 的占位 repository', () => {
  withFixture((rootDirectory) => {
    const cargoPath = path.join(rootDirectory, 'rust/Cargo.toml');
    const cargoText = fs.readFileSync(cargoPath, 'utf8');
    fs.writeFileSync(cargoPath, cargoText.replace('https://github.com/bsv8/MultisigPool', 'https://github.com/your-org/MultisigPool'));
    assert.match(collectRepositoryErrors(rootDirectory).join('\n'), /rust\/Cargo\.toml: package\.repository expected "https:\/\/github\.com\/bsv8\/MultisigPool", actual "https:\/\/github\.com\/your-org\/MultisigPool"/);
  });
});

test('check 只读并且不改变任何镜像文件', () => {
  withFixture((rootDirectory) => {
    const before = fileSnapshot(rootDirectory);
    assert.deepEqual(collectRepositoryErrors(rootDirectory), []);
    assert.deepEqual(fileSnapshot(rootDirectory), before);
  });
});

test('sync 连续执行两次结果完全幂等', () => {
  withFixture((rootDirectory) => {
    syncRepository(rootDirectory);
    const afterFirstSync = fileSnapshot(rootDirectory);
    syncRepository(rootDirectory);
    assert.deepEqual(fileSnapshot(rootDirectory), afterFirstSync);
    assert.deepEqual(collectRepositoryErrors(rootDirectory), []);
  });
});

test('版本目标字段为零次或多次时都会失败', () => {
  const packageText = fs.readFileSync(path.join(ROOT_DIRECTORY, 'package.json'), 'utf8');
  assert.throws(
    () => renderPackageJson(packageText.replace('  "version": "3.0.0",\n', ''), '3.0.1'),
    /expected exactly one (?:root|top-level) version field, found 0/,
  );
  assert.throws(
    () => renderPackageJson(packageText.replace('  "version": "3.0.0",\n', '  "version": "3.0.0",\n  "version": "3.0.0",\n'), '3.0.1'),
    /expected exactly one top-level version field, found 2/,
  );

  const cargoText = fs.readFileSync(path.join(ROOT_DIRECTORY, 'rust/Cargo.toml'), 'utf8');
  assert.throws(
    () => renderCargoManifest(cargoText.replace('version = "0.2.0"\n', ''), '0.2.1'),
    /expected exactly one package version field, found 0/,
  );
  assert.throws(
    () => renderCargoManifest(cargoText.replace('version = "0.2.0"\n', 'version = "0.2.0"\nversion = "0.2.0"\n'), '0.2.1'),
    /expected exactly one package version field, found 2/,
  );

  const lockText = fs.readFileSync(path.join(ROOT_DIRECTORY, 'rust/Cargo.lock'), 'utf8');
  assert.throws(
    () => renderCargoLock(lockText.replace(/name = "keymaster-multisig-rust"\nversion = "0\.2\.0"\n/, ''), '0.2.1'),
    /expected exactly one keymaster-multisig-rust package, found 0/,
  );
  assert.throws(
    () => renderCargoLock(`${lockText}\n${lockText.match(/name = "keymaster-multisig-rust"\nversion = "0\.2\.0"\n/)[0]}`, '0.2.1'),
    /expected exactly one keymaster-multisig-rust package, found 2/,
  );
});
