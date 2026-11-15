import { spawn } from 'node:child_process';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const CHECK = fileURLToPath(new URL('./check-test-run-leftovers.ts', import.meta.url));

/** The label core's test support puts on every container of a run. */
const TEST_RUN_LABEL = 'aeolus-fleet.test-run';

/** The check waits up to 30 seconds for a sweeper, so a failing run takes that long. */
const FAILING_RUN_TIMEOUT_MS = 60_000;

/** The `filters` query of a Docker Engine list call: each filter name with its values. */
const FILTERS = z.record(z.string(), z.array(z.string()));

interface FakeContainer {
  Id: string;
  Image: string;
  State: string;
  Labels: Record<string, string>;
}

interface FakeVolume {
  Name: string;
  /** The containers that use the volume; none makes it dangling. */
  usedBy: string[];
}

/** A container runtime's Docker Engine API, faked over HTTP: the check runs as it does in CI, against it. */
interface FakeRuntime {
  /** The DOCKER_HOST the check reads. */
  readonly host: string;
  readonly containers: FakeContainer[];
  readonly volumes: FakeVolume[];
  /** How many times the check listed containers so far. */
  readonly containerListings: number;
  /** Runs before each container listing, with its number: a test changes what the runtime answers here. */
  beforeContainerListing: (listing: number) => void;
  close: () => Promise<void>;
}

function aLeftoverContainer(): FakeContainer {
  return {
    Id: 'c0ffee0000000000000000000000000000000000000000000000000000000001',
    Image: 'postgres:17',
    State: 'exited',
    Labels: { [TEST_RUN_LABEL]: 'run-1' },
  };
}

function aDanglingVolume(): FakeVolume {
  return { Name: 'aeolus-fleet-data', usedBy: [] };
}

/** A label filter is `key` or `key=value`, as the Docker Engine API reads it. */
function hasLabels(labels: Record<string, string>, filters: string[]): boolean {
  return filters.every((filter) => {
    const [key, value] = filter.split('=');
    return key !== undefined && key in labels && (value === undefined || labels[key] === value);
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

async function startFakeRuntime(containers: FakeContainer[], volumes: FakeVolume[]): Promise<FakeRuntime> {
  let containerListings = 0;

  const answer = (request: IncomingMessage, response: ServerResponse): void => {
    const url = new URL(request.url ?? '/', 'http://fake-runtime');
    const path = url.pathname.replace(/^\/v[\d.]+/, '');
    const filters = FILTERS.parse(JSON.parse(url.searchParams.get('filters') ?? '{}'));
    const json = (status: number, body: unknown): void => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(body));
    };

    if (path === '/_ping') {
      response.writeHead(200, { 'Content-Type': 'text/plain' });
      response.end('OK');
    } else if (path === '/version') {
      json(200, { ApiVersion: '1.47', MinAPIVersion: '1.24', Version: 'fake' });
    } else if (path === '/info') {
      json(200, { Name: 'fake', OperatingSystem: 'fake', Driver: 'fake' });
    } else if (path === '/containers/json') {
      containerListings += 1;
      runtime.beforeContainerListing(containerListings);
      json(200, runtime.containers.filter((container) => hasLabels(container.Labels, filters.label ?? [])));
    } else if (path === '/volumes') {
      const hasDanglingFilter = filters.dangling?.includes('true') ?? false;
      const listed = runtime.volumes.filter((volume) => !hasDanglingFilter || volume.usedBy.length === 0);
      json(200, { Volumes: listed.map((volume) => ({ Name: volume.Name })), Warnings: null });
    } else {
      json(404, { message: `the fake runtime answers no ${path}` });
    }
  };

  const server = createServer(answer);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('the fake runtime listens on no port');
  }

  const runtime: FakeRuntime = {
    host: `tcp://127.0.0.1:${String(address.port)}`,
    containers,
    volumes,
    get containerListings() {
      return containerListings;
    },
    beforeContainerListing: () => {
      // Nothing changes until a test sets it.
    },
    close: () => closeServer(server),
  };
  return runtime;
}

/** Runs the check as CI does, against the runtime's DOCKER_HOST and without the test environment's Testcontainers settings. */
function runCheck(host: string): Promise<{ code: number | null; output: string }> {
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !key.startsWith('TESTCONTAINERS_') && key !== 'DOCKER_TLS_VERIFY' && key !== 'DOCKER_CERT_PATH',
    ),
  );
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CHECK], {
      env: { ...inherited, DOCKER_HOST: host },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, output });
    });
  });
}

describe('the test-run leftovers check', () => {
  it('passes when the sweeper removes the leftover container late, within its wait', async () => {
    const runtime = await startFakeRuntime([aLeftoverContainer()], []);
    try {
      runtime.beforeContainerListing = (listing) => {
        if (listing === 2) {
          runtime.containers.splice(0);
        }
      };

      const { code, output } = await runCheck(runtime.host);

      expect(runtime.containerListings).toBeGreaterThanOrEqual(2);
      expect(output).toContain('The test run left no container and no volume behind.');
      expect(code).toBe(0);
    } finally {
      await runtime.close();
    }
  }, FAILING_RUN_TIMEOUT_MS);

  it.concurrent(
    'fails on a labelled container the test run left behind',
    async () => {
      const runtime = await startFakeRuntime([aLeftoverContainer()], []);
      try {
        const { code, output } = await runCheck(runtime.host);

        expect(code).toBe(1);
        expect(output).toContain('The test run left 1 behind:');
        expect(output).toContain(`- container ${aLeftoverContainer().Id} (postgres:17, exited) of test run run-1`);
      } finally {
        await runtime.close();
      }
    },
    FAILING_RUN_TIMEOUT_MS,
  );

  it.concurrent(
    'fails on a dangling volume the test run left behind',
    async () => {
      const runtime = await startFakeRuntime([], [aDanglingVolume()]);
      try {
        const { code, output } = await runCheck(runtime.host);

        expect(code).toBe(1);
        expect(output).toContain('The test run left 1 behind:');
        expect(output).toContain('- volume aeolus-fleet-data, used by no container');
      } finally {
        await runtime.close();
      }
    },
    FAILING_RUN_TIMEOUT_MS,
  );
});
