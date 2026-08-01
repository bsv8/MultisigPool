import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  buildReleasePlan,
  classifyRegistryStatus,
  deriveReleaseTags,
  parseReleaseArguments,
  validateReleasePreflight,
} from './release-plan.mjs';

test('正常发布步骤顺序固定', () => {
  const plan = buildReleasePlan({ resumeFrom: null, goVersion: '3.0.0', rustVersion: '0.2.0' });
  assert.deepEqual(plan.steps, ['preflight', 'create-local-tags', 'publish-npm', 'publish-rust', 'push-tags', 'verify']);
  assert.equal(plan.goTag, 'v3.0.0');
  assert.equal(plan.rustTag, 'rust-v0.2.0');
});

test('恢复点只选择施工单规定的后续步骤', () => {
  assert.deepEqual(buildReleasePlan({ resumeFrom: 'rust', goVersion: '3.0.0', rustVersion: '0.2.0' }).steps, [
    'preflight', 'verify-npm', 'publish-rust', 'push-tags', 'verify',
  ]);
  assert.deepEqual(buildReleasePlan({ resumeFrom: 'tags', goVersion: '3.0.0', rustVersion: '0.2.0' }).steps, [
    'preflight', 'verify-registries', 'verify-local-tags', 'push-tags', 'verify',
  ]);
  assert.deepEqual(buildReleasePlan({ resumeFrom: 'verify', goVersion: '3.0.0', rustVersion: '0.2.0' }).steps, [
    'preflight', 'verify-release',
  ]);
});

test('恢复参数、版本和 tag 推导不接受隐式值', () => {
  assert.deepEqual(parseReleaseArguments([]), { resumeFrom: null });
  assert.deepEqual(parseReleaseArguments(['--resume-from', 'rust']), { resumeFrom: 'rust' });
  assert.throws(() => parseReleaseArguments(['--resume-from', 'npm']), /Usage/);
  assert.throws(() => deriveReleaseTags('3', '0.2.0'), /Invalid Go release version/);
  assert.throws(() => buildReleasePlan({ resumeFrom: 'unknown', goVersion: '3.0.0', rustVersion: '0.2.0' }), /Unknown resume point/);
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
  assert.equal(classifyRegistryStatus(404, 'npm registry', 'pkg@3.0.0'), 'absent');
  assert.equal(classifyRegistryStatus(200, 'npm registry', 'pkg@3.0.0'), 'present');
  assert.throws(() => classifyRegistryStatus(503, 'npm registry', 'pkg@3.0.0'), /Unexpected npm registry response/);
});

test('统一发布脚本不会吞掉 registry 异常并使用 Go Proxy 转义路径', () => {
  const script = fs.readFileSync(new URL('./release-all.sh', import.meta.url), 'utf8');
  assert.doesNotMatch(script, /case\s+"\$\(classify_registry_status/);
  assert.match(script, /if ! registry_state="\$\(classify_registry_status/);
  assert.match(script, /GO_PROXY_MODULE_PATH='github\.com\/bsv8\/!multisig!pool\/v3'/);
  assert.match(script, /--user-agent "\$RELEASE_USER_AGENT"/);
  assert.match(script, /\.cargo_vcs_info\.json/);
});
