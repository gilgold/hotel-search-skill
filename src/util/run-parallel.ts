import type { HotelResult, SearchFn, SearchInput, SourceError, SourceName, SourceTiming } from "../types.js";

const PER_SOURCE_TIMEOUT_MS = 15_000;

type SourceEntry = {
  name: SourceName;
  fn: SearchFn;
};

type Outcome = {
  results: HotelResult[];
  errors: SourceError[];
  timings: SourceTiming[];
};

type Settled =
  | { status: "ok"; name: SourceName; results: HotelResult[]; ms: number }
  | { status: "err"; name: SourceName; error: Error; ms: number };

function withTimeout<T>(promise: Promise<T>, ms: number, source: SourceName): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${source} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export async function runParallel(sources: SourceEntry[], input: SearchInput): Promise<Outcome> {
  const promises: Promise<Settled>[] = sources.map(({ name, fn }) => {
    const startTime = Date.now();
    return withTimeout(fn(input), PER_SOURCE_TIMEOUT_MS, name).then<Settled, Settled>(
      (results) => ({ status: "ok", name, results, ms: Date.now() - startTime }),
      (err) => ({ status: "err", name, error: err as Error, ms: Date.now() - startTime }),
    );
  });

  const settled = await Promise.all(promises);

  const results: HotelResult[] = [];
  const errors: SourceError[] = [];
  const timings: SourceTiming[] = [];

  for (const s of settled) {
    timings.push({ source: s.name, ms: s.ms });
    if (s.status === "ok") {
      results.push(...s.results);
    } else {
      errors.push({ source: s.name, message: s.error.message });
    }
  }

  return { results, errors, timings };
}
