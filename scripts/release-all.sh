#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

NPM_REGISTRY='https://registry.npmjs.org'
CRATES_REGISTRY='https://crates.io/api/v1/crates'
GO_PROXY='https://proxy.golang.org'
GO_MODULE_PATH='github.com/bsv8/MultisigPool/v3'
GO_PROXY_MODULE_PATH='github.com/bsv8/!multisig!pool/v3'

RESUME_POINT='normal'
if [[ "$#" -eq 0 ]]; then
  RESUME_POINT='normal'
elif [[ "$#" -eq 2 && "$1" == '--resume-from' && ( "$2" == 'rust' || "$2" == 'tags' || "$2" == 'verify' ) ]]; then
  RESUME_POINT="$2"
else
  echo 'ERROR: Usage: scripts/release-all.sh [--resume-from rust|tags|verify]' >&2
  exit 1
fi

NPM_VERSION=''
GO_VERSION=''
RUST_VERSION=''
PACKAGE_NAME=''
RUST_PACKAGE_NAME=''
GO_TAG=''
RUST_TAG=''
HEAD_COMMIT=''
NPM_ARTIFACT=''
RELEASE_USER_AGENT=''
ARTIFACT_DIRECTORY="$ROOT_DIR/release/.artifacts"
RELEASE_STEPS=()

CREATED_GO_TAG=0
CREATED_RUST_TAG=0
EXTERNAL_PUBLISH_SUCCEEDED=0

TEMP_PATHS=()

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

register_temp_path() {
  TEMP_PATHS+=("$1")
}

cleanup() {
  local exit_status="$?"
  local temporary_path
  for temporary_path in "${TEMP_PATHS[@]}"; do
    if [[ -e "$temporary_path" ]]; then
      rm -rf -- "$temporary_path"
    fi
  done

  if [[ "$exit_status" -ne 0 && "$EXTERNAL_PUBLISH_SUCCEEDED" -eq 0 ]]; then
    cleanup_created_tag "$GO_TAG" "$CREATED_GO_TAG"
    cleanup_created_tag "$RUST_TAG" "$CREATED_RUST_TAG"
  fi
  exit "$exit_status"
}
trap cleanup EXIT

cleanup_created_tag() {
  local tag="$1"
  local created="$2"
  local tag_commit
  if [[ "$created" -ne 1 || -z "$tag" ]]; then
    return
  fi
  if tag_commit="$(git rev-parse --verify "refs/tags/$tag^{commit}" 2>/dev/null)"; then
    if [[ "$tag_commit" == "$HEAD_COMMIT" ]]; then
      git tag -d "$tag"
    fi
  fi
}

require_commands() {
  local required_command
  for required_command in bash node npm cargo go git curl openssl base64 sha256sum tar mktemp awk rg; do
    if ! command -v "$required_command" >/dev/null 2>&1; then
      fail "required command is missing: $required_command"
    fi
  done
}

check_repository_state() {
  local current_branch
  local status_output
  current_branch="$(git branch --show-current)"
  if [[ "$current_branch" != 'main' ]]; then
    fail "release must run on branch main; actual branch is ${current_branch:-detached}"
  fi

  status_output="$(git status --porcelain=v1 --untracked-files=all)"
  if [[ -n "$status_output" ]]; then
    fail 'release requires a clean working tree, clean index, and no untracked files'
  fi

  if ! git show-ref --verify --quiet refs/remotes/origin/main; then
    fail 'origin/main is not available locally'
  fi
  if ! git merge-base --is-ancestor HEAD origin/main; then
    fail 'HEAD is not contained in origin/main'
  fi
  HEAD_COMMIT="$(git rev-parse --verify HEAD^{commit})"
}

load_release_metadata() {
  NPM_VERSION="$(node -p "JSON.parse(require('fs').readFileSync('release/versions.json', 'utf8')).packages.npm")"
  GO_VERSION="$(node -p "JSON.parse(require('fs').readFileSync('release/versions.json', 'utf8')).packages.go")"
  RUST_VERSION="$(node -p "JSON.parse(require('fs').readFileSync('release/versions.json', 'utf8')).packages.rust")"
  PACKAGE_NAME="$(node -p "JSON.parse(require('fs').readFileSync('package.json', 'utf8')).name")"
  RUST_PACKAGE_NAME="$(node --input-type=module -e "import fs from 'node:fs'; const text = fs.readFileSync('rust/Cargo.toml', 'utf8'); const match = text.match(/^\\[package\\][\\s\\S]*?^name = \\\"([^\\\"]+)\\\"/m); if (!match) process.exit(1); process.stdout.write(match[1]);")"
  RELEASE_USER_AGENT="MultisigPool-release/$GO_VERSION (https://github.com/bsv8/MultisigPool)"

  local plan_json
  local steps_text
  plan_json="$(node scripts/release-plan.mjs "$RESUME_POINT" "$GO_VERSION" "$RUST_VERSION")"
  GO_TAG="$(node -e 'const plan = JSON.parse(process.argv[1]); process.stdout.write(plan.goTag);' "$plan_json")"
  RUST_TAG="$(node -e 'const plan = JSON.parse(process.argv[1]); process.stdout.write(plan.rustTag);' "$plan_json")"
  if ! steps_text="$(node -e 'const plan = JSON.parse(process.argv[1]); process.stdout.write(plan.steps.join("\n"));' "$plan_json")"; then
    fail 'release plan steps could not be read'
  fi
  mapfile -t RELEASE_STEPS <<< "$steps_text"
  NPM_ARTIFACT="$ARTIFACT_DIRECTORY/${PACKAGE_NAME}-${NPM_VERSION}-${HEAD_COMMIT}.tgz"
}

run_version_check() {
  echo '运行版本清单检查...'
  node scripts/release-versions.mjs check
}

run_complete_gate() {
  echo '运行三语言完整门禁...'
  bash scripts/run_all_tests.sh
}

validate_npm_pack_info() {
  local pack_info_path="$1"
  node --input-type=module - "$pack_info_path" "$PACKAGE_NAME" "$NPM_VERSION" <<'NODE'
import fs from 'node:fs';

const [packInfoPath, expectedName, expectedVersion] = process.argv.slice(2);
let value;
try {
  value = JSON.parse(fs.readFileSync(packInfoPath, 'utf8'));
} catch (error) {
  throw new Error(`npm pack --dry-run returned invalid JSON: ${error.message}`);
}
if (!Array.isArray(value) || value.length !== 1 || typeof value[0] !== 'object' || value[0] === null) {
  throw new Error('npm pack --dry-run returned an invalid package description');
}
if (value[0].name !== expectedName || value[0].version !== expectedVersion) {
  throw new Error(`npm pack --dry-run returned ${value[0].name}@${value[0].version}, expected ${expectedName}@${expectedVersion}`);
}
if (typeof value[0].filename !== 'string' || !Array.isArray(value[0].files)) {
  throw new Error('npm pack --dry-run package description is incomplete');
}
NODE
}

run_npm_pack_dry_run() {
  local pack_info_path
  pack_info_path="$(mktemp)"
  register_temp_path "$pack_info_path"
  if ! npm pack --dry-run --json > "$pack_info_path"; then
    fail 'npm pack --dry-run failed'
  fi
  validate_npm_pack_info "$pack_info_path"
}

validate_npm_artifact() {
  local artifact_path="$1"
  local package_json_path
  local archive_list_path
  package_json_path="$(mktemp)"
  archive_list_path="$(mktemp)"
  register_temp_path "$package_json_path"
  register_temp_path "$archive_list_path"

  if ! tar -xOf "$artifact_path" package/package.json > "$package_json_path"; then
    fail 'local npm artifact does not contain package/package.json'
  fi
  if ! tar -tzf "$artifact_path" > "$archive_list_path"; then
    fail 'local npm artifact is not a readable tarball'
  fi
  node --input-type=module - "$package_json_path" "$archive_list_path" "$PACKAGE_NAME" "$NPM_VERSION" <<'NODE'
import fs from 'node:fs';

const [packageJsonPath, archiveListPath, expectedName, expectedVersion] = process.argv.slice(2);
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
if (packageJson.name !== expectedName || packageJson.version !== expectedVersion) {
  throw new Error(`local npm artifact contains ${packageJson.name}@${packageJson.version}, expected ${expectedName}@${expectedVersion}`);
}
const files = new Set(fs.readFileSync(archiveListPath, 'utf8').split('\n').filter(Boolean));
for (const requiredFile of ['package/package.json', 'package/README.md', 'package/dist/index.js', 'package/dist/index.mjs', 'package/dist/index.d.ts']) {
  if (!files.has(requiredFile)) {
    throw new Error(`local npm artifact is missing ${requiredFile}`);
  }
}
NODE
}

prepare_npm_artifact() {
  mkdir -p "$ARTIFACT_DIRECTORY"
  if [[ -f "$NPM_ARTIFACT" ]]; then
    validate_npm_artifact "$NPM_ARTIFACT"
    return
  fi

  local pack_info_path
  local packed_basename
  local packed_path
  pack_info_path="$(mktemp)"
  register_temp_path "$pack_info_path"
  if ! npm pack --json --pack-destination "$ARTIFACT_DIRECTORY" > "$pack_info_path"; then
    fail 'npm pack failed while preparing the release artifact'
  fi
  packed_basename="$(node --input-type=module - "$pack_info_path" <<'NODE'
import fs from 'node:fs';
import path from 'node:path';

const value = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!Array.isArray(value) || value.length !== 1 || typeof value[0].filename !== 'string') {
  throw new Error('npm pack returned an invalid package description');
}
process.stdout.write(path.basename(value[0].filename));
NODE
)"
  packed_path="$ARTIFACT_DIRECTORY/$packed_basename"
  if [[ ! -f "$packed_path" ]]; then
    fail "npm pack did not create the expected artifact: $packed_path"
  fi
  if [[ "$packed_path" != "$NPM_ARTIFACT" ]]; then
    if [[ -e "$NPM_ARTIFACT" ]]; then
      fail "release artifact already exists: $NPM_ARTIFACT"
    fi
    mv -- "$packed_path" "$NPM_ARTIFACT"
  fi
  validate_npm_artifact "$NPM_ARTIFACT"
}

npm_artifact_integrity() {
  openssl dgst -sha512 -binary "$NPM_ARTIFACT" | base64 -w0
}

verify_npm_registry() {
  local metadata_path
  local expected_integrity
  metadata_path="$(mktemp)"
  register_temp_path "$metadata_path"
  if ! npm view "$PACKAGE_NAME@$NPM_VERSION" name version gitHead dist.integrity --json --registry "$NPM_REGISTRY" > "$metadata_path"; then
    fail "npm registry metadata is unavailable for $PACKAGE_NAME@$NPM_VERSION"
  fi
  expected_integrity="$(npm_artifact_integrity)"
  node --input-type=module - "$metadata_path" "$PACKAGE_NAME" "$NPM_VERSION" "$HEAD_COMMIT" "sha512-$expected_integrity" <<'NODE'
import fs from 'node:fs';
import { validateNpmRegistryMetadata } from './scripts/release-plan.mjs';

const [metadataPath, expectedName, expectedVersion, expectedCommit, expectedIntegrity] = process.argv.slice(2);
const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
validateNpmRegistryMetadata({ metadata, expectedName, expectedVersion, expectedCommit, expectedIntegrity });
NODE
}

registry_http_status() {
  local url="$1"
  local body_path="$2"
  local status
  if ! status="$(curl --silent --show-error --location --user-agent "$RELEASE_USER_AGENT" --output "$body_path" --write-out '%{http_code}' "$url")"; then
    fail "registry request failed: $url"
  fi
  printf '%s' "$status"
}

classify_registry_status() {
  local status="$1"
  local registry_name="$2"
  local target="$3"
  node --input-type=module -e "import { classifyRegistryStatus } from './scripts/release-plan.mjs'; process.stdout.write(classifyRegistryStatus(Number(process.argv[1]), process.argv[2], process.argv[3]));" "$status" "$registry_name" "$target"
}

registry_version_state() {
  local url="$1"
  local registry_name="$2"
  local target="$3"
  local body_path
  local status
  local registry_state
  body_path="$(mktemp)"
  register_temp_path "$body_path"
  status="$(registry_http_status "$url" "$body_path")"
  if ! registry_state="$(classify_registry_status "$status" "$registry_name" "$target")"; then
    fail "unexpected $registry_name response for $target: HTTP $status"
  fi
  case "$registry_state" in
    absent|present) printf '%s' "$registry_state" ;;
    *) fail "unexpected $registry_name state for $target: $registry_state" ;;
  esac
}

verify_crates_registry() {
  local body_path
  local status
  local registry_state
  local expected_checksum
  local archive_path
  local actual_checksum
  local vcs_info_path
  body_path="$(mktemp)"
  register_temp_path "$body_path"
  status="$(registry_http_status "$CRATES_REGISTRY/$RUST_PACKAGE_NAME/$RUST_VERSION" "$body_path")"
  if ! registry_state="$(classify_registry_status "$status" 'crates.io' "$RUST_PACKAGE_NAME@$RUST_VERSION")"; then
    fail "unexpected crates.io response for $RUST_PACKAGE_NAME@$RUST_VERSION: HTTP $status"
  fi
  if [[ "$registry_state" != 'present' ]]; then
    fail "crates.io version is not available: $RUST_PACKAGE_NAME@$RUST_VERSION (HTTP $status)"
  fi
  expected_checksum="$(node --input-type=module - "$body_path" "$RUST_PACKAGE_NAME" "$RUST_VERSION" <<'NODE'
import fs from 'node:fs';
import { validateCratesRegistryMetadata } from './scripts/release-plan.mjs';

const [bodyPath, expectedName, expectedVersion] = process.argv.slice(2);
const value = JSON.parse(fs.readFileSync(bodyPath, 'utf8'));
process.stdout.write(validateCratesRegistryMetadata({ metadata: value, expectedName, expectedVersion }));
NODE
  )"
  archive_path="$(mktemp)"
  register_temp_path "$archive_path"
  if ! curl --silent --show-error --fail --location --user-agent "$RELEASE_USER_AGENT" \
    --output "$archive_path" "$CRATES_REGISTRY/$RUST_PACKAGE_NAME/$RUST_VERSION/download"; then
    fail "cannot download Rust crate archive: $RUST_PACKAGE_NAME@$RUST_VERSION"
  fi
  actual_checksum="$(sha256sum "$archive_path" | awk '{print $1}')"
  if [[ "$actual_checksum" != "$expected_checksum" ]]; then
    fail "Rust crate checksum is $actual_checksum, expected $expected_checksum"
  fi
  vcs_info_path="$(mktemp)"
  register_temp_path "$vcs_info_path"
  if ! tar -xOf "$archive_path" "$RUST_PACKAGE_NAME-$RUST_VERSION/.cargo_vcs_info.json" > "$vcs_info_path"; then
    fail 'Rust crate does not contain .cargo_vcs_info.json'
  fi
  node --input-type=module - "$vcs_info_path" "$HEAD_COMMIT" <<'NODE'
import fs from 'node:fs';
import { validateRustVcsInfo } from './scripts/release-plan.mjs';

const [vcsInfoPath, expectedCommit] = process.argv.slice(2);
const value = JSON.parse(fs.readFileSync(vcsInfoPath, 'utf8'));
validateRustVcsInfo({ value, expectedCommit });
NODE
}

remote_tag_commit() {
  local tag="$1"
  local direct_output
  local peeled_output
  if ! direct_output="$(git ls-remote origin "refs/tags/$tag")"; then
    fail "cannot query remote Git tag: $tag"
  fi
  if ! peeled_output="$(git ls-remote origin "refs/tags/$tag^{}")"; then
    fail "cannot query remote Git tag: $tag"
  fi
  if [[ -n "$peeled_output" ]]; then
    printf '%s\n' "$peeled_output" | awk 'NR == 1 { print $1; exit }'
  elif [[ -n "$direct_output" ]]; then
    printf '%s\n' "$direct_output" | awk 'NR == 1 { print $1; exit }'
  fi
}

local_tag_state() {
  local tag="$1"
  local tag_commit
  if ! tag_commit="$(git rev-parse --verify "refs/tags/$tag^{commit}" 2>/dev/null)"; then
    printf 'absent'
  elif [[ "$tag_commit" == "$HEAD_COMMIT" ]]; then
    printf 'current'
  else
    printf 'other'
  fi
}

remote_tag_state() {
  local tag="$1"
  local tag_commit
  tag_commit="$(remote_tag_commit "$tag")"
  if [[ -z "$tag_commit" ]]; then
    printf 'absent'
  elif [[ "$tag_commit" == "$HEAD_COMMIT" ]]; then
    printf 'current'
  else
    printf 'other'
  fi
}

check_local_tag_exact() {
  local tag="$1"
  local tag_commit
  if ! tag_commit="$(git rev-parse --verify "refs/tags/$tag^{commit}")"; then
    fail "local tag is missing: $tag"
  fi
  if [[ "$tag_commit" != "$HEAD_COMMIT" ]]; then
    fail "local tag $tag points to $tag_commit, expected $HEAD_COMMIT"
  fi
}

check_remote_tag_exact() {
  local tag="$1"
  local tag_commit
  tag_commit="$(remote_tag_commit "$tag")"
  if [[ -z "$tag_commit" ]]; then
    fail "remote tag is missing: $tag"
  fi
  if [[ "$tag_commit" != "$HEAD_COMMIT" ]]; then
    fail "remote tag $tag points to $tag_commit, expected $HEAD_COMMIT"
  fi
}

verify_local_release_tags() {
  check_local_tag_exact "$GO_TAG"
  check_local_tag_exact "$RUST_TAG"
}

check_npm_authentication() {
  if ! npm whoami --registry "$NPM_REGISTRY" >/dev/null; then
    fail 'npm authentication is unavailable'
  fi
}

check_cargo_authentication() {
  local cargo_home
  local credentials_path
  cargo_home="${CARGO_HOME:-$HOME/.cargo}"
  credentials_path="$cargo_home/credentials.toml"
  if [[ ! -f "$credentials_path" ]]; then
    credentials_path="$cargo_home/credentials"
  fi
  if [[ -n "${CARGO_REGISTRY_TOKEN:-}" ]]; then
    return
  fi
  if [[ ! -f "$credentials_path" ]]; then
    fail 'cargo authentication credentials are unavailable'
  fi
  if ! rg -q 'token[[:space:]]*=' "$credentials_path"; then
    fail 'cargo authentication token is unavailable'
  fi
}

check_atomic_tag_push() {
  if ! git push --dry-run --porcelain --atomic origin "HEAD:refs/tags/$GO_TAG" "HEAD:refs/tags/$RUST_TAG" >/dev/null; then
    fail 'remote does not support an authenticated atomic push for both release tags'
  fi
}

check_go_module_consumer() {
  local consumer_directory
  consumer_directory="$(mktemp -d)"
  register_temp_path "$consumer_directory"
  printf '%s\n' \
    'module release-consumer' \
    '' \
    'go 1.24.3' \
    '' \
    "require $GO_MODULE_PATH $GO_TAG" \
    '' \
    "replace $GO_MODULE_PATH => $ROOT_DIR" > "$consumer_directory/go.mod"
  printf '%s\n' \
    'package main' \
    '' \
    "import pool \"$GO_MODULE_PATH/pkg\"" \
    '' \
    'func main() {' \
    '    _ = pool.Protocol' \
    '}' > "$consumer_directory/main.go"
  if ! (cd "$consumer_directory" && GOWORK=off go mod tidy && GOWORK=off go build -buildvcs=false ./...); then
    fail 'Go module consumer compilation failed'
  fi
}

verify_go_proxy() {
  local body_path
  local status
  local registry_state
  body_path="$(mktemp)"
  register_temp_path "$body_path"
  status="$(registry_http_status "$GO_PROXY/$GO_PROXY_MODULE_PATH/@v/$GO_TAG.info" "$body_path")"
  if ! registry_state="$(classify_registry_status "$status" 'Go proxy' "$GO_MODULE_PATH@$GO_TAG")"; then
    fail "unexpected Go proxy response for $GO_MODULE_PATH@$GO_TAG: HTTP $status"
  fi
  if [[ "$registry_state" != 'present' ]]; then
    fail "Go proxy version is not available: $GO_MODULE_PATH@$GO_TAG (HTTP $status)"
  fi
  node --input-type=module - "$body_path" "$GO_TAG" "$HEAD_COMMIT" <<'NODE'
import fs from 'node:fs';

const [bodyPath, expectedVersion, expectedCommit] = process.argv.slice(2);
const value = JSON.parse(fs.readFileSync(bodyPath, 'utf8'));
if (value.Version !== expectedVersion) {
  throw new Error(`Go proxy returned version ${value.Version}, expected ${expectedVersion}`);
}
if (typeof value.Origin?.Hash !== 'string') {
  throw new Error('Go proxy response does not contain the source commit');
}
if (value.Origin.Hash !== expectedCommit) {
  throw new Error(`Go proxy returned commit ${value.Origin.Hash}, expected ${expectedCommit}`);
}
NODE
}

run_external_preflight() {
  local local_go_state
  local local_rust_state
  local remote_go_state
  local remote_rust_state
  local npm_registry_state
  local rust_registry_state
  local preflight_json

  run_npm_pack_dry_run
  prepare_npm_artifact
  echo '运行 Rust crate dry-run...'
  cargo publish --dry-run --registry crates-io --manifest-path rust/Cargo.toml
  echo '验证 Go module 消费者编译...'
  check_go_module_consumer

  local_go_state="$(local_tag_state "$GO_TAG")"
  local_rust_state="$(local_tag_state "$RUST_TAG")"
  remote_go_state="$(remote_tag_state "$GO_TAG")"
  remote_rust_state="$(remote_tag_state "$RUST_TAG")"
  npm_registry_state="$(registry_version_state "$NPM_REGISTRY/$PACKAGE_NAME/$NPM_VERSION" 'npm registry' "$PACKAGE_NAME@$NPM_VERSION")"
  rust_registry_state="$(registry_version_state "$CRATES_REGISTRY/$RUST_PACKAGE_NAME/$RUST_VERSION" 'crates.io' "$RUST_PACKAGE_NAME@$RUST_VERSION")"

  preflight_json="$(node -e '
const [resumeFrom, localGo, localRust, remoteGo, remoteRust, npm, rust] = process.argv.slice(1);
console.log(JSON.stringify({
  resumeFrom: resumeFrom === "normal" ? null : resumeFrom,
  branch: "main",
  workingTreeClean: true,
  headInOriginMain: true,
  localTags: { go: localGo, rust: localRust },
  remoteTags: { go: remoteGo, rust: remoteRust },
  registries: { npm, rust },
}));
' "$RESUME_POINT" "$local_go_state" "$local_rust_state" "$remote_go_state" "$remote_rust_state" "$npm_registry_state" "$rust_registry_state")"
  if ! node scripts/release-plan.mjs validate "$preflight_json" >/dev/null; then
    fail 'release preflight state validation failed'
  fi

  if [[ "$RESUME_POINT" != 'verify' ]]; then
    check_atomic_tag_push
  fi
  check_npm_authentication
  check_cargo_authentication
}

create_local_tags() {
  echo "创建本地 Go tag $GO_TAG..."
  git tag "$GO_TAG" "$HEAD_COMMIT"
  CREATED_GO_TAG=1
  echo "创建本地 Rust tag $RUST_TAG..."
  git tag "$RUST_TAG" "$HEAD_COMMIT"
  CREATED_RUST_TAG=1
}

push_release_tags() {
  echo '原子推送 Go 与 Rust tag...'
  git push --atomic origin "$GO_TAG" "$RUST_TAG"
}

verify_release() {
  verify_npm_registry
  verify_crates_registry
  check_remote_tag_exact "$GO_TAG"
  check_remote_tag_exact "$RUST_TAG"
  verify_go_proxy
}

execute_release_step() {
  local step="$1"
  case "$step" in
    preflight)
      run_external_preflight
      ;;
    create-local-tags)
      create_local_tags
      ;;
    publish-npm)
      echo "发布 npm 包 $PACKAGE_NAME@$NPM_VERSION..."
      npm publish . --access public --ignore-scripts --registry "$NPM_REGISTRY"
      EXTERNAL_PUBLISH_SUCCEEDED=1
      ;;
    verify-npm)
      verify_npm_registry
      ;;
    publish-rust)
      echo "发布 Rust crate $RUST_PACKAGE_NAME@$RUST_VERSION..."
      cargo publish --registry crates-io --manifest-path rust/Cargo.toml
      EXTERNAL_PUBLISH_SUCCEEDED=1
      ;;
    verify-registries)
      verify_npm_registry
      verify_crates_registry
      ;;
    verify-local-tags)
      verify_local_release_tags
      ;;
    push-tags)
      push_release_tags
      ;;
    verify|verify-release)
      verify_release
      ;;
    *)
      fail "unknown release plan step: $step"
      ;;
  esac
}

run_release() {
  local step
  for step in "${RELEASE_STEPS[@]}"; do
    execute_release_step "$step"
  done

  echo '三语言发布完成。'
  echo "  npm: $PACKAGE_NAME@$NPM_VERSION"
  echo "  Go: $GO_MODULE_PATH@$GO_TAG"
  echo "  Rust: $RUST_PACKAGE_NAME@$RUST_VERSION"
  echo "  Go tag: $GO_TAG"
  echo "  Rust tag: $RUST_TAG"
  echo "  commit: $HEAD_COMMIT"
}

require_commands
check_repository_state
run_version_check
load_release_metadata
run_complete_gate
run_release
