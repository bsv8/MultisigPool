import { pathToFileURL } from 'node:url';

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export const RESUME_POINTS = Object.freeze(['rust', 'tags', 'verify']);

const RELEASE_TAG_STATES = Object.freeze(['absent', 'current', 'other']);
const RELEASE_REGISTRY_STATES = Object.freeze(['absent', 'present']);

export function parseReleaseArguments(args) {
  if (args.length === 0) {
    return Object.freeze({ resumeFrom: null });
  }
  if (args.length === 2 && args[0] === '--resume-from' && RESUME_POINTS.includes(args[1])) {
    return Object.freeze({ resumeFrom: args[1] });
  }
  throw new Error('Usage: scripts/release-all.sh [--resume-from rust|tags|verify]');
}

export function deriveReleaseTags(goVersion, rustVersion) {
  if (typeof goVersion !== 'string' || !SEMVER_PATTERN.test(goVersion)) {
    throw new Error(`Invalid Go release version: ${String(goVersion)}`);
  }
  if (typeof rustVersion !== 'string' || !SEMVER_PATTERN.test(rustVersion)) {
    throw new Error(`Invalid Rust release version: ${String(rustVersion)}`);
  }
  return Object.freeze({ goTag: `v${goVersion}`, rustTag: `rust-v${rustVersion}` });
}

export function classifyRegistryStatus(status, registryName, target) {
  if (status === 404) {
    return 'absent';
  }
  if (status === 200) {
    return 'present';
  }
  throw new Error(`Unexpected ${registryName} response for ${target}: HTTP ${status}`);
}

export function validateReleasePreflight({
  resumeFrom = null,
  branch,
  workingTreeClean,
  headInOriginMain,
  localTags,
  remoteTags,
  registries,
}) {
  const errors = [];
  if (resumeFrom !== null && !RESUME_POINTS.includes(resumeFrom)) {
    errors.push(`Invalid resume point: ${String(resumeFrom)}`);
  }
  errors.push(...[
    ...(branch === 'main' ? [] : [`release must run on branch main; actual branch is ${String(branch)}`]),
    ...(workingTreeClean === true ? [] : ['release requires a clean working tree, clean index, and no untracked files']),
    ...(headInOriginMain === true ? [] : ['HEAD is not contained in origin/main']),
  ]);

  const requiredTagNames = ['go', 'rust'];
  const requiredRegistryNames = ['npm', 'rust'];
  const readState = (values, name, location, allowedStates) => {
    if (values === null || typeof values !== 'object' || Array.isArray(values)) {
      errors.push(`${location} must be an object`);
      return undefined;
    }
    if (!Object.hasOwn(values, name)) {
      errors.push(`${location}.${name} is missing`);
      return undefined;
    }
    const state = values[name];
    if (!allowedStates.includes(state)) {
      errors.push(`Invalid ${location}.${name} state: ${String(state)}`);
    }
    return state;
  };

  const localTagStates = Object.fromEntries(requiredTagNames.map((name) => [
    name,
    readState(localTags, name, 'localTags', RELEASE_TAG_STATES),
  ]));
  const remoteTagStates = Object.fromEntries(requiredTagNames.map((name) => [
    name,
    readState(remoteTags, name, 'remoteTags', RELEASE_TAG_STATES),
  ]));
  const registryStates = Object.fromEntries(requiredRegistryNames.map((name) => [
    name,
    readState(registries, name, 'registries', RELEASE_REGISTRY_STATES),
  ]));

  for (const [name, state] of Object.entries(localTags ?? {})) {
    if (!RELEASE_TAG_STATES.includes(state)) {
      errors.push(`Invalid local tag state for ${name}: ${String(state)}`);
    }
  }
  for (const [name, state] of Object.entries(remoteTags ?? {})) {
    if (!RELEASE_TAG_STATES.includes(state)) {
      errors.push(`Invalid remote tag state for ${name}: ${String(state)}`);
    }
  }
  for (const [name, state] of Object.entries(registries ?? {})) {
    if (!RELEASE_REGISTRY_STATES.includes(state)) {
      errors.push(`Invalid registry state for ${name}: ${String(state)}`);
    }
  }

  const expectedStates = resumeFrom === null
    ? {
        localTags: { go: ['absent'], rust: ['absent'] },
        remoteTags: { go: ['absent'], rust: ['absent'] },
        registries: { npm: ['absent'], rust: ['absent'] },
      }
    : resumeFrom === 'rust'
      ? {
          localTags: { go: ['current'], rust: ['current'] },
          remoteTags: { go: ['absent'], rust: ['absent'] },
          registries: { npm: ['present'], rust: ['absent'] },
        }
      : resumeFrom === 'tags'
        ? {
            localTags: { go: ['current'], rust: ['current'] },
            remoteTags: { go: ['absent', 'current'], rust: ['absent', 'current'] },
            registries: { npm: ['present'], rust: ['present'] },
          }
        : {
            localTags: { go: ['current'], rust: ['current'] },
            remoteTags: { go: ['current'], rust: ['current'] },
            registries: { npm: ['present'], rust: ['present'] },
          };

  for (const [name, allowed] of Object.entries(expectedStates.localTags)) {
    if (localTagStates[name] !== undefined && !allowed.includes(localTagStates[name])) {
      errors.push(`${resumeFrom ?? 'normal'} release requires local tag ${name} to be ${allowed.join(' or ')}`);
    }
  }
  for (const [name, allowed] of Object.entries(expectedStates.remoteTags)) {
    if (remoteTagStates[name] !== undefined && !allowed.includes(remoteTagStates[name])) {
      errors.push(`${resumeFrom ?? 'normal'} release requires remote tag ${name} to be ${allowed.join(' or ')}`);
    }
  }
  for (const [name, allowed] of Object.entries(expectedStates.registries)) {
    if (registryStates[name] !== undefined && !allowed.includes(registryStates[name])) {
      errors.push(`${resumeFrom ?? 'normal'} release requires the ${name} registry version to be ${allowed.join(' or ')}`);
    }
  }
  return errors;
}

export function buildReleasePlan({ resumeFrom, goVersion, rustVersion }) {
  if (resumeFrom !== null && !RESUME_POINTS.includes(resumeFrom)) {
    throw new Error(`Unknown resume point: ${String(resumeFrom)}`);
  }
  const tags = deriveReleaseTags(goVersion, rustVersion);
  const steps = resumeFrom === null
    ? ['preflight', 'create-local-tags', 'publish-npm', 'publish-rust', 'push-tags', 'verify']
    : resumeFrom === 'rust'
      ? ['preflight', 'verify-npm', 'publish-rust', 'push-tags', 'verify']
      : resumeFrom === 'tags'
        ? ['preflight', 'verify-registries', 'verify-local-tags', 'push-tags', 'verify']
        : ['preflight', 'verify-release'];
  return Object.freeze({ resumeFrom, ...tags, steps: Object.freeze(steps) });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv[2] === 'validate') {
      if (process.argv.length !== 4) {
        throw new Error('Usage: node scripts/release-plan.mjs validate <preflight-json>');
      }
      let state;
      try {
        state = JSON.parse(process.argv[3]);
      } catch (error) {
        throw new Error(`Invalid preflight JSON: ${error instanceof Error ? error.message : String(error)}`);
      }
      const errors = validateReleasePreflight(state);
      if (errors.length > 0) {
        throw new Error(errors.join('\n'));
      }
      console.log('ok');
    } else {
      if (process.argv.length !== 5) {
        throw new Error('Usage: node scripts/release-plan.mjs <normal|rust|tags|verify> <go-version> <rust-version>');
      }
      const resumeFrom = process.argv[2] === 'normal' ? null : process.argv[2];
      const plan = buildReleasePlan({ resumeFrom, goVersion: process.argv[3], rustVersion: process.argv[4] });
      console.log(JSON.stringify(plan));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
