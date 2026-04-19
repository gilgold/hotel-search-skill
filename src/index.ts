#!/usr/bin/env node
import "dotenv/config";
import { z } from "zod";
import { runParallel } from "./util/run-parallel.js";
import { searchBooking } from "./sources/booking.js";
import { searchAgoda } from "./sources/agoda.js";
import type { SearchInput, SearchOutput } from "./types.js";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

const inputSchema = z.object({
  destination: z.string().min(1),
  checkIn: dateStr,
  checkOut: dateStr,
  adults: z.number().int().min(1).default(2),
  children: z.number().int().min(0).default(0),
  childrenAges: z.array(z.number().int().min(0).max(17)).default([]),
  rooms: z.number().int().min(1).default(1),
  currency: z.string().length(3).default("USD"),
});

function parseArgs(argv: string[]): SearchInput {
  const map: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val === undefined || val.startsWith("--")) {
        throw new Error(`Missing value for --${key}`);
      }
      map[key] = val;
      i++;
    }
  }

  const childrenAges = map["children-ages"]
    ? map["children-ages"].split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n))
    : [];

  const raw = {
    destination: map["destination"],
    checkIn: map["check-in"],
    checkOut: map["check-out"],
    adults: map["adults"] ? Number(map["adults"]) : 2,
    children: map["children"] ? Number(map["children"]) : childrenAges.length,
    childrenAges,
    rooms: map["rooms"] ? Number(map["rooms"]) : 1,
    currency: (map["currency"] ?? "USD").toUpperCase(),
  };

  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    throw new Error(`Invalid args: ${msg}`);
  }
  return parsed.data;
}

async function main() {
  let input: SearchInput;
  try {
    input = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(String((err as Error).message) + "\n");
    process.stderr.write(
      "Usage: hotel-search --destination <city> --check-in YYYY-MM-DD --check-out YYYY-MM-DD " +
        "[--adults N] [--children N] [--children-ages 5,12] [--rooms N] [--currency USD]\n",
    );
    process.exit(1);
  }

  const keyMissing = !process.env.RAPIDAPI_KEY;
  const sources = [
    { name: "booking.com" as const, fn: searchBooking },
    { name: "agoda.com" as const, fn: searchAgoda },
  ];

  const outcome = await runParallel(sources, input);

  if (keyMissing) {
    process.stderr.write("warning: RAPIDAPI_KEY not set — booking.com and agoda.com will have failed\n");
  }

  const output: SearchOutput = {
    query: input,
    results: outcome.results,
    errors: outcome.errors,
    timings: outcome.timings,
  };

  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
}

main().catch((err) => {
  process.stderr.write(`fatal: ${(err as Error).message}\n`);
  process.exit(1);
});
