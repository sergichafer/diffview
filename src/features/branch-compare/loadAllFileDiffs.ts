import type { FileDiffResult } from "@/shared/types/app";

/** File diff batch size for incremental refresh. */
export const FILE_DIFF_BATCH_SIZE = 20;

/** Concurrent in-flight diff batches during refresh. */
export const FILE_DIFF_BATCH_CONCURRENCY = 2;

export interface LoadAllFileDiffsOptions {
  paths: readonly string[];
  batchSize: number;
  concurrency: number;
  fetchBatch: (paths: string[]) => Promise<FileDiffResult[]>;
  onBatch: (diffs: FileDiffResult[]) => void;
  isStale: () => boolean;
}

function chunkPaths(paths: readonly string[], batchSize: number): string[][] {
  const batches: string[][] = [];
  for (let i = 0; i < paths.length; i += batchSize) {
    batches.push(paths.slice(i, i + batchSize));
  }
  return batches;
}

export async function loadAllFileDiffs({
  paths,
  batchSize,
  concurrency,
  fetchBatch,
  onBatch,
  isStale,
}: LoadAllFileDiffsOptions): Promise<void> {
  if (paths.length === 0) return;

  const batches = chunkPaths(paths, batchSize);
  const workerCount = Math.min(Math.max(1, concurrency), batches.length);

  async function processWave(fromIndex: number): Promise<void> {
    if (isStale() || fromIndex >= batches.length) return;

    const wave = batches.slice(fromIndex, fromIndex + workerCount);
    const results = await Promise.all(wave.map((batch) => fetchBatch(batch)));
    if (isStale()) return;

    for (const diffs of results) {
      onBatch(diffs);
    }

    await processWave(fromIndex + workerCount);
  }

  await processWave(0);
}
