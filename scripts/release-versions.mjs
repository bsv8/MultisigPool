import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIRECTORY = path.resolve(SCRIPT_DIRECTORY, '..');
export const VERSION_MANIFEST_PATH = 'release/versions.json';

const GENERATED_FILES = Object.freeze({
  go: 'internal/versioninfo/version.go',
  typescript: 'src/version.ts',
  rust: 'rust/src/version.rs',
});

const REPOSITORY_FILES = Object.freeze({
  packageJson: 'package.json',
  packageLock: 'package-lock.json',
  goModule: 'go.mod',
  cargoManifest: 'rust/Cargo.toml',
  cargoLock: 'rust/Cargo.lock',
  rootGoIndex: 'pkg/index.go',
  twoPartyGoIndex: 'pkg/two_party_pool/index.go',
  arbitratedGoIndex: 'pkg/arbitrated_pool/index.go',
  typescriptTypes: 'src/types.ts',
  typescriptIndex: 'src/index.ts',
  rustIndex: 'rust/src/lib.rs',
});

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const CARGO_REPOSITORY = 'https://github.com/bsv8/MultisigPool';

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const describe = (value) => {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? String(value) : serialized;
};

const exactKeys = (value, expectedKeys, location) => {
  if (!isRecord(value)) {
    return [`${location} must be an object`];
  }

  const actualKeys = Object.keys(value);
  return [
    ...expectedKeys
      .filter((key) => !Object.hasOwn(value, key))
      .map((key) => `${location}.${key} is missing`),
    ...actualKeys
      .filter((key) => !expectedKeys.includes(key))
      .map((key) => `${location}.${key} is unknown`),
  ];
};

const requiredInteger = (value, location, expected) => {
  if (!Number.isInteger(value)) {
    return [`${location} expected integer ${expected}, actual ${describe(value)}`];
  }
  if (value !== expected) {
    return [`${location} expected ${expected}, actual ${describe(value)}`];
  }
  return [];
};

const validateSemver = (value, location) => {
  if (typeof value !== 'string') {
    return [`${location} expected a SemVer string, actual ${describe(value)}`];
  }

  const match = value.match(SEMVER_PATTERN);
  if (!match) {
    return [`${location} expected a complete SemVer without a v prefix, actual ${describe(value)}`];
  }

  const prerelease = match[4];
  const build = match[5];
  if (prerelease !== undefined) {
    const identifiers = prerelease.split('.');
    if (identifiers.some((identifier) => identifier.length === 0 || !/^[0-9A-Za-z-]+$/.test(identifier))) {
      return [`${location} contains an invalid SemVer prerelease, actual ${describe(value)}`];
    }
    if (identifiers.some((identifier) => /^0\d+$/.test(identifier))) {
      return [`${location} contains a leading-zero numeric prerelease, actual ${describe(value)}`];
    }
  }

  if (build !== undefined) {
    const identifiers = build.split('.');
    if (identifiers.some((identifier) => identifier.length === 0 || !/^[0-9A-Za-z-]+$/.test(identifier))) {
      return [`${location} contains an invalid SemVer build, actual ${describe(value)}`];
    }
  }

  return [];
};

export function validateVersionsManifest(value) {
  const rootErrors = exactKeys(value, ['schemaVersion', 'protocol', 'packages'], 'versions.json');
  if (!isRecord(value)) {
    return rootErrors;
  }

  const protocolErrors = exactKeys(value.protocol, ['id', 'version', 'goModuleMajor'], 'versions.json.protocol');
  const packageErrors = exactKeys(value.packages, ['npm', 'go', 'rust'], 'versions.json.packages');
  const protocolFieldErrors = isRecord(value.protocol)
    ? [
        ...(value.protocol.id !== 'bitfs.pool.v3'
          ? [`versions.json.protocol.id expected "bitfs.pool.v3", actual ${describe(value.protocol.id)}`]
          : []),
        ...(Object.hasOwn(value.protocol, 'version')
          ? requiredInteger(value.protocol.version, 'versions.json.protocol.version', 3)
          : []),
        ...(Object.hasOwn(value.protocol, 'goModuleMajor')
          ? requiredInteger(value.protocol.goModuleMajor, 'versions.json.protocol.goModuleMajor', 3)
          : []),
      ]
    : [];
  const packageFieldErrors = isRecord(value.packages)
    ? [
        ...(Object.hasOwn(value.packages, 'npm') ? validateSemver(value.packages.npm, 'versions.json.packages.npm') : []),
        ...(Object.hasOwn(value.packages, 'go') ? validateSemver(value.packages.go, 'versions.json.packages.go') : []),
        ...(Object.hasOwn(value.packages, 'rust') ? validateSemver(value.packages.rust, 'versions.json.packages.rust') : []),
        ...(typeof value.packages.npm === 'string'
          && typeof value.packages.go === 'string'
          && typeof value.packages.rust === 'string'
          && (value.packages.npm !== value.packages.go || value.packages.npm !== value.packages.rust)
          ? [`versions.json package versions must be equal, actual npm=${value.packages.npm}, go=${value.packages.go}, rust=${value.packages.rust}`]
          : []),
      ]
    : [];

  return [...rootErrors, ...protocolErrors, ...packageErrors, ...protocolFieldErrors, ...packageFieldErrors];
}

export function parseVersionsManifest(text, source = VERSION_MANIFEST_PATH) {
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`${source}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  const errors = validateVersionsManifest(value);
  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }
  return value;
}

export function deriveReleaseTags(manifest) {
  const errors = validateVersionsManifest(manifest);
  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }
  return Object.freeze({
    go: `v${manifest.packages.go}`,
    rust: `rust-v${manifest.packages.rust}`,
  });
}

export function renderGoVersionFile(manifest) {
  const errors = validateVersionsManifest(manifest);
  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }
  return [
    '// 由版本同步程序生成，禁止手工修改。',
    'package versioninfo',
    '',
    `const Protocol = "${manifest.protocol.id}"`,
    `const ProtocolVersion uint32 = ${manifest.protocol.version}`,
    `const GoReleaseVersion = "${manifest.packages.go}"`,
    '',
  ].join('\n');
}

export function renderTypeScriptVersionFile(manifest) {
  const errors = validateVersionsManifest(manifest);
  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }
  return [
    '// 由版本同步程序生成，禁止手工修改。',
    `export const Protocol = '${manifest.protocol.id}' as const;`,
    `export const ProtocolVersion = ${manifest.protocol.version} as const;`,
    'export const Version = ProtocolVersion;',
    `export const ReleaseVersion = '${manifest.packages.npm}' as const;`,
    '',
  ].join('\n');
}

export function renderRustVersionFile(manifest) {
  const errors = validateVersionsManifest(manifest);
  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }
  return [
    '// 由版本同步程序生成，禁止手工修改。',
    `pub const PROTOCOL: &str = "${manifest.protocol.id}";`,
    `pub const PROTOCOL_VERSION: u32 = ${manifest.protocol.version};`,
    'pub const VERSION: u32 = PROTOCOL_VERSION;',
    `pub const RELEASE_VERSION: &str = "${manifest.packages.rust}";`,
    '',
  ].join('\n');
}

const parseJson = (text, source) => {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${source}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const requireRootVersion = (value, source) => {
  if (!isRecord(value) || !Object.hasOwn(value, 'version')) {
    throw new Error(`${source}: expected exactly one root version field, found 0`);
  }
  if (typeof value.version !== 'string') {
    throw new Error(`${source}: root version must be a string, actual ${describe(value.version)}`);
  }
};

const countTopLevelVersionFields = (text, source) => {
  const matches = [...text.matchAll(/^  "version"\s*:/gm)];
  if (matches.length !== 1) {
    throw new Error(`${source}: expected exactly one top-level version field, found ${matches.length}`);
  }
};

export function renderPackageJson(text, version, source = 'package.json') {
  const value = parseJson(text, source);
  requireRootVersion(value, source);
  countTopLevelVersionFields(text, source);
  return `${JSON.stringify({ ...value, version }, null, 2)}\n`;
}

export function renderPackageLock(text, version, source = 'package-lock.json') {
  const value = parseJson(text, source);
  requireRootVersion(value, source);
  countTopLevelVersionFields(text, source);
  if (!isRecord(value.packages) || !isRecord(value.packages[''])) {
    throw new Error(`${source}: packages[""] must be an object`);
  }
  if (!Object.hasOwn(value.packages[''], 'version')) {
    throw new Error(`${source}: expected exactly one packages[""] version field, found 0`);
  }
  if (typeof value.packages[''].version !== 'string') {
    throw new Error(`${source}: packages[""] version must be a string, actual ${describe(value.packages[''].version)}`);
  }
  const packages = { ...value.packages, '': { ...value.packages[''], version } };
  return `${JSON.stringify({ ...value, version, packages }, null, 2)}\n`;
}

const cargoPackageSection = (text, source) => {
  const packageHeaders = [...text.matchAll(/^\[package\]\s*$/gm)];
  if (packageHeaders.length !== 1) {
    throw new Error(`${source}: expected exactly one [package] section, found ${packageHeaders.length}`);
  }
  const sectionStart = packageHeaders[0].index;
  const contentStart = sectionStart + packageHeaders[0][0].length;
  const followingSection = text.slice(contentStart).search(/^\[[^\]]+\]\s*$/m);
  const sectionEnd = followingSection < 0 ? text.length : contentStart + followingSection;
  return { sectionStart, contentStart, sectionEnd, text: text.slice(contentStart, sectionEnd) };
};

const cargoPackageVersionMatch = (text, source) => {
  const section = cargoPackageSection(text, source);
  const matches = [...section.text.matchAll(/^[ \t]*version[ \t]*=[ \t]*"([^"\r\n]+)"[ \t]*\r?$/gm)];
  if (matches.length !== 1) {
    throw new Error(`${source}: expected exactly one package version field, found ${matches.length}`);
  }
  return { ...section, match: matches[0], version: matches[0][1] };
};

const cargoPackageRepositoryMatch = (text, source) => {
  const section = cargoPackageSection(text, source);
  const matches = [...section.text.matchAll(/^[ \t]*repository[ \t]*=[ \t]*"([^"\r\n]+)"[ \t]*\r?$/gm)];
  if (matches.length !== 1) {
    throw new Error(`${source}: expected exactly one package repository field, found ${matches.length}`);
  }
  return { ...section, match: matches[0], repository: matches[0][1] };
};

export function renderCargoManifest(text, version, source = 'rust/Cargo.toml') {
  const target = cargoPackageVersionMatch(text, source);
  const replacement = target.match[0].replace(`"${target.version}"`, `"${version}"`);
  const absoluteStart = target.contentStart + target.match.index;
  return `${text.slice(0, absoluteStart)}${replacement}${text.slice(absoluteStart + target.match[0].length)}`;
}

const cargoLockVersionMatches = (text, source) => {
  const matches = [...text.matchAll(/^name[ \t]*=[ \t]*"keymaster-multisig-rust"\s*\r?\nversion[ \t]*=[ \t]*"([^"\r\n]+)"[ \t]*$/gm)];
  if (matches.length !== 1) {
    throw new Error(`${source}: expected exactly one keymaster-multisig-rust package, found ${matches.length}`);
  }
  return matches;
};

export function renderCargoLock(text, version, source = 'rust/Cargo.lock') {
  const matches = cargoLockVersionMatches(text, source);
  const match = matches[0];
  const replacement = match[0].replace(`"${match[1]}"`, `"${version}"`);
  return `${text.slice(0, match.index)}${replacement}${text.slice(match.index + match[0].length)}`;
}

const generatedStructureErrors = (text, source, patterns) => patterns.flatMap(({ name, pattern }) => {
  const matches = [...text.matchAll(pattern)];
  return matches.length === 1
    ? []
    : [`${source}: expected exactly one ${name} field, found ${matches.length}`];
});

const validateGeneratedStructure = (text, source, language) => {
  const patterns = {
    go: [
      { name: 'generated marker', pattern: /^\/\/ 由版本同步程序生成，禁止手工修改。\r?$/gm },
      { name: 'Protocol', pattern: /^const Protocol = "[^"]+"\r?$/gm },
      { name: 'ProtocolVersion', pattern: /^const ProtocolVersion uint32 = \d+\r?$/gm },
      { name: 'GoReleaseVersion', pattern: /^const GoReleaseVersion = "[^"]+"\r?$/gm },
    ],
    typescript: [
      { name: 'generated marker', pattern: /^\/\/ 由版本同步程序生成，禁止手工修改。\r?$/gm },
      { name: 'Protocol', pattern: /^export const Protocol = '[^']+' as const;\r?$/gm },
      { name: 'ProtocolVersion', pattern: /^export const ProtocolVersion = \d+ as const;\r?$/gm },
      { name: 'Version', pattern: /^export const Version = ProtocolVersion;\r?$/gm },
      { name: 'ReleaseVersion', pattern: /^export const ReleaseVersion = '[^']+' as const;\r?$/gm },
    ],
    rust: [
      { name: 'generated marker', pattern: /^\/\/ 由版本同步程序生成，禁止手工修改。\r?$/gm },
      { name: 'PROTOCOL', pattern: /^pub const PROTOCOL: &str = "[^"]+";\r?$/gm },
      { name: 'PROTOCOL_VERSION', pattern: /^pub const PROTOCOL_VERSION: u32 = \d+;\r?$/gm },
      { name: 'VERSION', pattern: /^pub const VERSION: u32 = PROTOCOL_VERSION;\r?$/gm },
      { name: 'RELEASE_VERSION', pattern: /^pub const RELEASE_VERSION: &str = "[^"]+";\r?$/gm },
    ],
  };
  return generatedStructureErrors(text, source, patterns[language]);
};

const readText = (rootDirectory, relativePath) => {
  const absolutePath = path.join(rootDirectory, relativePath);
  try {
    return fs.readFileSync(absolutePath, 'utf8');
  } catch (error) {
    throw new Error(`${relativePath}: cannot read file: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const readJson = (rootDirectory, relativePath) => parseJson(readText(rootDirectory, relativePath), relativePath);

const compareGeneratedFile = (actual, expected, relativePath) => actual === expected
  ? []
  : [`${relativePath}: generated content differs from the expected value`];

const compareGeneratedFields = (actual, relativePath, language, manifest) => {
  const fields = {
    go: [
      { name: 'Protocol', pattern: /^const Protocol = "([^"]+)"\r?$/gm, expected: manifest.protocol.id },
      { name: 'ProtocolVersion', pattern: /^const ProtocolVersion uint32 = (\d+)\r?$/gm, expected: String(manifest.protocol.version) },
      { name: 'GoReleaseVersion', pattern: /^const GoReleaseVersion = "([^"]+)"\r?$/gm, expected: manifest.packages.go },
    ],
    typescript: [
      { name: 'Protocol', pattern: /^export const Protocol = '([^']+)' as const;\r?$/gm, expected: manifest.protocol.id },
      { name: 'ProtocolVersion', pattern: /^export const ProtocolVersion = (\d+) as const;\r?$/gm, expected: String(manifest.protocol.version) },
      { name: 'ReleaseVersion', pattern: /^export const ReleaseVersion = '([^']+)' as const;\r?$/gm, expected: manifest.packages.npm },
    ],
    rust: [
      { name: 'PROTOCOL', pattern: /^pub const PROTOCOL: &str = "([^"]+)";\r?$/gm, expected: manifest.protocol.id },
      { name: 'PROTOCOL_VERSION', pattern: /^pub const PROTOCOL_VERSION: u32 = (\d+);\r?$/gm, expected: String(manifest.protocol.version) },
      { name: 'VERSION', pattern: /^pub const VERSION: u32 = (PROTOCOL_VERSION);\r?$/gm, expected: 'PROTOCOL_VERSION' },
      { name: 'RELEASE_VERSION', pattern: /^pub const RELEASE_VERSION: &str = "([^"]+)";\r?$/gm, expected: manifest.packages.rust },
    ],
  }[language];

  return fields.flatMap(({ name, pattern, expected }) => {
    const matches = [...actual.matchAll(pattern)];
    return matches.length === 1
      ? compareValue([], relativePath, name, expected, matches[0][1])
      : [];
  });
};

const compareValue = (errors, relativePath, field, expected, actual) => [
  ...errors,
  ...(expected === actual ? [] : [`${relativePath}: ${field} expected ${describe(expected)}, actual ${describe(actual)}`]),
];

const checkJsonMirrors = (rootDirectory, manifest) => {
  const errors = [];
  let packageJson;
  let packageLock;
  try {
    const packageText = readText(rootDirectory, REPOSITORY_FILES.packageJson);
    packageJson = parseJson(packageText, REPOSITORY_FILES.packageJson);
    requireRootVersion(packageJson, REPOSITORY_FILES.packageJson);
    countTopLevelVersionFields(packageText, REPOSITORY_FILES.packageJson);
    errors.push(...compareValue([], REPOSITORY_FILES.packageJson, 'version', manifest.packages.npm, packageJson.version));
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  try {
    const lockText = readText(rootDirectory, REPOSITORY_FILES.packageLock);
    packageLock = parseJson(lockText, REPOSITORY_FILES.packageLock);
    requireRootVersion(packageLock, REPOSITORY_FILES.packageLock);
    countTopLevelVersionFields(lockText, REPOSITORY_FILES.packageLock);
    errors.push(...compareValue([], REPOSITORY_FILES.packageLock, 'version', manifest.packages.npm, packageLock.version));
    if (!isRecord(packageLock.packages) || !isRecord(packageLock.packages[''])) {
      errors.push(`${REPOSITORY_FILES.packageLock}: packages[""] must be an object`);
    } else {
      errors.push(...compareValue([], REPOSITORY_FILES.packageLock, 'packages[""].version', manifest.packages.npm, packageLock.packages[''].version));
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  return errors;
};

const checkCargoMirrors = (rootDirectory, manifest) => {
  const errors = [];
  try {
    const cargoText = readText(rootDirectory, REPOSITORY_FILES.cargoManifest);
    const target = cargoPackageVersionMatch(cargoText, REPOSITORY_FILES.cargoManifest);
    const repository = cargoPackageRepositoryMatch(cargoText, REPOSITORY_FILES.cargoManifest);
    errors.push(...compareValue([], REPOSITORY_FILES.cargoManifest, 'package.version', manifest.packages.rust, target.version));
    errors.push(...compareValue([], REPOSITORY_FILES.cargoManifest, 'package.repository', CARGO_REPOSITORY, repository.repository));
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  try {
    const lockText = readText(rootDirectory, REPOSITORY_FILES.cargoLock);
    const matches = cargoLockVersionMatches(lockText, REPOSITORY_FILES.cargoLock);
    errors.push(...compareValue([], REPOSITORY_FILES.cargoLock, 'keymaster-multisig-rust version', manifest.packages.rust, matches[0][1]));
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  return errors;
};

const checkGeneratedMirrors = (rootDirectory, manifest) => Object.entries({
  [GENERATED_FILES.go]: renderGoVersionFile(manifest),
  [GENERATED_FILES.typescript]: renderTypeScriptVersionFile(manifest),
  [GENERATED_FILES.rust]: renderRustVersionFile(manifest),
}).flatMap(([relativePath, expected]) => {
  try {
    const actual = readText(rootDirectory, relativePath);
    return [
      ...validateGeneratedStructure(actual, relativePath, relativePath === GENERATED_FILES.go ? 'go' : relativePath === GENERATED_FILES.typescript ? 'typescript' : 'rust'),
      ...compareGeneratedFields(actual, relativePath, relativePath === GENERATED_FILES.go ? 'go' : relativePath === GENERATED_FILES.typescript ? 'typescript' : 'rust', manifest),
      ...compareGeneratedFile(actual, expected, relativePath),
    ];
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
});

const checkGoModule = (rootDirectory, manifest) => {
  try {
    const text = readText(rootDirectory, REPOSITORY_FILES.goModule);
    const matches = [...text.matchAll(/^module[ \t]+([^\s]+)[ \t]*\r?$/gm)];
    if (matches.length !== 1) {
      return [`${REPOSITORY_FILES.goModule}: expected exactly one module declaration, found ${matches.length}`];
    }
    const expected = `github.com/bsv8/MultisigPool/v${manifest.protocol.goModuleMajor}`;
    return compareValue([], REPOSITORY_FILES.goModule, 'module path', expected, matches[0][1]);
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
};

const checkPublicVersionImports = (rootDirectory) => {
  const checks = [
    [REPOSITORY_FILES.rootGoIndex, /ProtocolVersion = versioninfo\.ProtocolVersion/, 'ProtocolVersion alias'],
    [REPOSITORY_FILES.rootGoIndex, /ReleaseVersion\s+= versioninfo\.GoReleaseVersion/, 'ReleaseVersion alias'],
    [REPOSITORY_FILES.rootGoIndex, /Version\s+= ProtocolVersion/, 'Version alias'],
    [REPOSITORY_FILES.rootGoIndex, /Protocol\s+= versioninfo\.Protocol/, 'Protocol alias'],
    [REPOSITORY_FILES.twoPartyGoIndex, /Protocol = versioninfo\.Protocol/, 'Protocol alias'],
    [REPOSITORY_FILES.twoPartyGoIndex, /Version\s+= versioninfo\.ProtocolVersion/, 'Version alias'],
    [REPOSITORY_FILES.arbitratedGoIndex, /Protocol = versioninfo\.Protocol/, 'Protocol alias'],
    [REPOSITORY_FILES.arbitratedGoIndex, /Version\s+= versioninfo\.ProtocolVersion/, 'Version alias'],
    [REPOSITORY_FILES.typescriptTypes, /import \{ Protocol, Version \} from ['"]\.\/version['"];/, 'version import'],
    [REPOSITORY_FILES.typescriptTypes, /export \{ Protocol, ProtocolVersion, Version, ReleaseVersion \} from ['"]\.\/version['"];/, 'version re-export'],
    [REPOSITORY_FILES.typescriptIndex, /export \{ Protocol, ProtocolVersion, Version, ReleaseVersion \} from ['"]\.\/version['"];/, 'public version export'],
    [REPOSITORY_FILES.rustIndex, /mod version;/, 'version module'],
    [REPOSITORY_FILES.rustIndex, /pub use version::\{PROTOCOL, PROTOCOL_VERSION, RELEASE_VERSION, VERSION\};/, 'version re-export'],
  ];

  return checks.flatMap(([relativePath, pattern, field]) => {
    try {
      const text = readText(rootDirectory, relativePath);
      const matches = [...text.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`))];
      return matches.length === 1 ? [] : [`${relativePath}: expected exactly one ${field} declaration, found ${matches.length}`];
    } catch (error) {
      return [error instanceof Error ? error.message : String(error)];
    }
  });
};

const checkPackageScripts = (rootDirectory) => {
  try {
    const packageJson = readJson(rootDirectory, REPOSITORY_FILES.packageJson);
    if (!isRecord(packageJson.scripts)) {
      return [`${REPOSITORY_FILES.packageJson}: scripts must be an object`];
    }
    const errors = packageJson.scripts.release === './scripts/release-all.sh'
      ? []
      : [`${REPOSITORY_FILES.packageJson}: scripts.release expected "./scripts/release-all.sh", actual ${describe(packageJson.scripts.release)}`];
    return [
      ...errors,
      ...['publish:npm', 'publish:go', 'publish:all'].filter((name) => Object.hasOwn(packageJson.scripts, name)).map((name) => `${REPOSITORY_FILES.packageJson}: forbidden script ${name}`),
    ];
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
};

const checkReleaseEntrypoints = (rootDirectory) => {
  const releasePath = path.join(rootDirectory, 'scripts/release-all.sh');
  const forbiddenPaths = ['scripts/publish-npm.sh', 'scripts/publish-go.sh', 'scripts/publish-all.sh'];
  const errors = [];
  try {
    const mode = fs.statSync(releasePath).mode;
    if ((mode & 0o111) === 0) {
      errors.push('scripts/release-all.sh: file is not executable');
    }
  } catch (error) {
    errors.push(`scripts/release-all.sh: cannot read file: ${error instanceof Error ? error.message : String(error)}`);
  }
  return [
    ...errors,
    ...forbiddenPaths
      .filter((relativePath) => fs.existsSync(path.join(rootDirectory, relativePath)))
      .map((relativePath) => `${relativePath}: forbidden release entrypoint exists`),
  ];
};

export function collectRepositoryErrors(rootDirectory = ROOT_DIRECTORY) {
  let manifest;
  try {
    manifest = parseVersionsManifest(readText(rootDirectory, VERSION_MANIFEST_PATH));
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }

  return [
    ...checkGeneratedMirrors(rootDirectory, manifest),
    ...checkJsonMirrors(rootDirectory, manifest),
    ...checkCargoMirrors(rootDirectory, manifest),
    ...checkGoModule(rootDirectory, manifest),
    ...checkPublicVersionImports(rootDirectory),
    ...checkPackageScripts(rootDirectory),
    ...checkReleaseEntrypoints(rootDirectory),
  ];
}

const syncStructureErrors = (rootDirectory) => {
  const checks = [
    [GENERATED_FILES.go, 'go'],
    [GENERATED_FILES.typescript, 'typescript'],
    [GENERATED_FILES.rust, 'rust'],
  ];
  const generatedErrors = checks.flatMap(([relativePath, language]) => {
    try {
      return validateGeneratedStructure(readText(rootDirectory, relativePath), relativePath, language);
    } catch (error) {
      return [error instanceof Error ? error.message : String(error)];
    }
  });

  const jsonErrors = [];
  for (const relativePath of [REPOSITORY_FILES.packageJson, REPOSITORY_FILES.packageLock]) {
    try {
      const text = readText(rootDirectory, relativePath);
      const value = parseJson(text, relativePath);
      requireRootVersion(value, relativePath);
      countTopLevelVersionFields(text, relativePath);
      if (relativePath === REPOSITORY_FILES.packageLock && (!isRecord(value.packages) || !isRecord(value.packages['']))) {
        jsonErrors.push(`${relativePath}: packages[""] must be an object`);
      }
    } catch (error) {
      jsonErrors.push(error instanceof Error ? error.message : String(error));
    }
  }

  const cargoErrors = [];
  try {
    const cargoText = readText(rootDirectory, REPOSITORY_FILES.cargoManifest);
    cargoPackageVersionMatch(cargoText, REPOSITORY_FILES.cargoManifest);
    cargoPackageRepositoryMatch(cargoText, REPOSITORY_FILES.cargoManifest);
  } catch (error) {
    cargoErrors.push(error instanceof Error ? error.message : String(error));
  }
  try {
    cargoLockVersionMatches(readText(rootDirectory, REPOSITORY_FILES.cargoLock), REPOSITORY_FILES.cargoLock);
  } catch (error) {
    cargoErrors.push(error instanceof Error ? error.message : String(error));
  }

  return [...generatedErrors, ...jsonErrors, ...cargoErrors, ...checkGoModule(rootDirectory, {
    protocol: { goModuleMajor: 3 },
  }), ...checkPublicVersionImports(rootDirectory)];
};

const atomicWrite = (absolutePath, content) => {
  const directory = path.dirname(absolutePath);
  const basename = path.basename(absolutePath);
  let temporaryPath;
  let fileDescriptor;
  try {
    temporaryPath = path.join(directory, `.${basename}.${process.pid}.tmp`);
    fileDescriptor = fs.openSync(temporaryPath, 'wx', 0o644);
    fs.writeFileSync(fileDescriptor, content, 'utf8');
    fs.fsyncSync(fileDescriptor);
    fs.closeSync(fileDescriptor);
    fileDescriptor = undefined;
    fs.renameSync(temporaryPath, absolutePath);
    temporaryPath = undefined;
  } catch (error) {
    const cleanupErrors = [];
    if (fileDescriptor !== undefined) {
      try {
        fs.closeSync(fileDescriptor);
      } catch (closeError) {
        cleanupErrors.push(`close failed: ${closeError instanceof Error ? closeError.message : String(closeError)}`);
      }
    }
    if (temporaryPath !== undefined) {
      try {
        fs.unlinkSync(temporaryPath);
      } catch (unlinkError) {
        cleanupErrors.push(`temporary-file cleanup failed: ${unlinkError instanceof Error ? unlinkError.message : String(unlinkError)}`);
      }
    }
    const failure = `${absolutePath}: atomic write failed: ${error instanceof Error ? error.message : String(error)}`;
    throw new Error(cleanupErrors.length === 0 ? failure : `${failure}; ${cleanupErrors.join('; ')}`);
  }
};

export function syncRepository(rootDirectory = ROOT_DIRECTORY) {
  const manifest = parseVersionsManifest(readText(rootDirectory, VERSION_MANIFEST_PATH));
  const structureErrors = syncStructureErrors(rootDirectory);
  if (structureErrors.length > 0) {
    throw new Error(structureErrors.join('\n'));
  }

  const updates = new Map([
    [GENERATED_FILES.go, renderGoVersionFile(manifest)],
    [GENERATED_FILES.typescript, renderTypeScriptVersionFile(manifest)],
    [GENERATED_FILES.rust, renderRustVersionFile(manifest)],
    [REPOSITORY_FILES.packageJson, renderPackageJson(readText(rootDirectory, REPOSITORY_FILES.packageJson), manifest.packages.npm)],
    [REPOSITORY_FILES.packageLock, renderPackageLock(readText(rootDirectory, REPOSITORY_FILES.packageLock), manifest.packages.npm)],
    [REPOSITORY_FILES.cargoManifest, renderCargoManifest(readText(rootDirectory, REPOSITORY_FILES.cargoManifest), manifest.packages.rust)],
    [REPOSITORY_FILES.cargoLock, renderCargoLock(readText(rootDirectory, REPOSITORY_FILES.cargoLock), manifest.packages.rust)],
  ]);

  for (const [relativePath, content] of updates) {
    atomicWrite(path.join(rootDirectory, relativePath), content);
  }

  const errors = collectRepositoryErrors(rootDirectory);
  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }
}

const run = (action, rootDirectory = ROOT_DIRECTORY) => {
  if (action === 'check') {
    const errors = collectRepositoryErrors(rootDirectory);
    if (errors.length > 0) {
      throw new Error(errors.join('\n'));
    }
    console.log('版本清单检查通过。');
    return;
  }
  if (action === 'sync') {
    syncRepository(rootDirectory);
    console.log('版本镜像同步完成，检查通过。');
    return;
  }
  throw new Error('Usage: node scripts/release-versions.mjs <check|sync>');
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.length !== 3) {
    console.error('Usage: node scripts/release-versions.mjs <check|sync>');
    process.exitCode = 1;
  } else {
    try {
      run(process.argv[2]);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
