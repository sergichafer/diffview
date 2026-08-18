import { describe, expect, test } from "bun:test";

/**
 * Startup-seed refresh vs Strict Mode remount: cleanup bumps gen, then the
 * effect starts again. Loading must clear from the live run.
 *
 * refreshInFlight early-return left loading stuck after cleanup invalidated
 * the only in-flight request and blocked the remount start.
 */
async function runRefreshProtocol(opts: {
  useInFlightGuard: boolean;
}): Promise<{ loading: boolean; overview: string | null }> {
  let gen = 0;
  let inFlight = false;
  let loading = false;
  let overview: string | null = null;

  async function refresh(fetchOverview: () => Promise<string>) {
    if (opts.useInFlightGuard) {
      if (inFlight) return;
      inFlight = true;
    }
    const myGen = ++gen;
    loading = true;
    try {
      const result = await fetchOverview();
      if (myGen !== gen) return;
      overview = result;
    } finally {
      if (myGen === gen) {
        loading = false;
      }
      if (opts.useInFlightGuard) {
        inFlight = false;
      }
    }
  }

  let resolveFirst!: (value: string) => void;
  const first = new Promise<string>((resolve) => {
    resolveFirst = resolve;
  });
  const p1 = refresh(() => first);

  // Strict Mode remount / dep cleanup: bump gen so the first run is stale.
  gen += 1;

  let resolveSecond!: (value: string) => void;
  const second = new Promise<string>((resolve) => {
    resolveSecond = resolve;
  });
  const p2 = refresh(() => second);

  resolveFirst("stale");
  await p1;
  resolveSecond("live");
  await p2;

  return { loading, overview };
}

describe("startup refresh remount protocol", () => {
  test("inFlight guard leaves loading stuck after cleanup (bug)", async () => {
    const result = await runRefreshProtocol({ useInFlightGuard: true });
    expect(result.loading).toBe(true);
    expect(result.overview).toBeNull();
  });

  test("without inFlight guard, remount clears loading (fix)", async () => {
    const result = await runRefreshProtocol({ useInFlightGuard: false });
    expect(result.loading).toBe(false);
    expect(result.overview).toBe("live");
  });
});
