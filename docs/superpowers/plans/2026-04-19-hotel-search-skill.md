# Hotel Search Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript CLI skill that searches hotels across Booking.com, Hotels.com, and Daka90, returning a flat JSON list of results for consumption by the `openclaw` Claude agent.

**Architecture:** Single Node.js/TypeScript CLI. One entry point orchestrates three source modules in parallel via `Promise.allSettled`. Booking and Hotels use RapidAPI unofficial wrappers; Daka90 is scraped with `cheerio`. Output is a flat `HotelResult[]` — the agent groups hotels by name when presenting.

**Tech Stack:** Node 20+, TypeScript, `cheerio`, `dotenv`, `zod`. No tests (user preference — manual verification only).

**Spec:** [docs/superpowers/specs/2026-04-19-hotel-search-skill-design.md](../specs/2026-04-19-hotel-search-skill-design.md)

> **User instruction override:** The user requested no automated tests. This plan skips the TDD cycle from the writing-plans skill. Each task ends with manual verification (actual CLI run or targeted probe) and a commit, not test runs. This is a deliberate deviation per explicit user instruction.

---

## Prerequisites (Before Task 1)

- Node 20+ installed (`node --version`).
- A RapidAPI account. Sign up at https://rapidapi.com.
- Subscribe to two APIs on RapidAPI (free tier):
  - `booking-com15` by DataCrawler (https://rapidapi.com/DataCrawler/api/booking-com15)
  - `hotels-com-provider` by tipsters (https://rapidapi.com/tipsters/api/hotels-com-provider)
- Copy your RapidAPI key from https://rapidapi.com/developer/security — you'll paste it into `.env` in Task 1.

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `.env` (gitignored)
- Create: `src/` directory

- [ ] **Step 1: Initialize git**

Run:
```bash
cd /Users/gilgo/Projects/hotel-search
git init
```

Expected: `Initialized empty Git repository in /Users/gilgo/Projects/hotel-search/.git/`

- [ ] **Step 2: Create `package.json`**

Write `package.json`:
```json
{
  "name": "hotel-search",
  "version": "0.1.0",
  "description": "AI Skill: search hotels across Booking.com, Hotels.com, and Daka90",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "hotel-search": "dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts"
  },
  "dependencies": {
    "cheerio": "^1.0.0",
    "dotenv": "^16.4.5",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 3: Create `tsconfig.json`**

Write `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Create `.gitignore`**

Write `.gitignore`:
```
node_modules/
dist/
.env
*.log
.DS_Store
```

- [ ] **Step 5: Create `.env.example`**

Write `.env.example`:
```
# RapidAPI key — covers both Booking.com and Hotels.com unofficial wrappers.
# Get one at https://rapidapi.com after subscribing to:
#   - https://rapidapi.com/DataCrawler/api/booking-com15
#   - https://rapidapi.com/tipsters/api/hotels-com-provider
RAPIDAPI_KEY=
```

- [ ] **Step 6: Create `.env` with real key**

Copy `.env.example` to `.env` and paste your actual RapidAPI key in. The `.env` file is gitignored.

Run:
```bash
cp .env.example .env
```

Then open `.env` in an editor and set `RAPIDAPI_KEY=<your-key>`.

- [ ] **Step 7: Install dependencies**

Run:
```bash
npm install
```

Expected: `node_modules/` created, no errors. `package-lock.json` generated.

- [ ] **Step 8: Verify TS compiles an empty project**

Create placeholder `src/index.ts`:
```typescript
console.log("hotel-search skill: setup OK");
```

Run:
```bash
npm run build && node dist/index.js
```

Expected output: `hotel-search skill: setup OK`

- [ ] **Step 9: Commit**

```bash
git add package.json tsconfig.json .gitignore .env.example package-lock.json src/index.ts
git commit -m "chore: scaffold TypeScript project for hotel-search skill"
```

---

## Task 2: Shared Types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Write `src/types.ts`**

Write `src/types.ts`:
```typescript
export type SourceName = "booking.com" | "hotels.com" | "daka90";

export type SearchInput = {
  destination: string;
  checkIn: string;          // YYYY-MM-DD
  checkOut: string;         // YYYY-MM-DD
  adults: number;           // defaults applied upstream
  children: number;
  childrenAges: number[];   // may be empty
  rooms: number;
  currency: string;         // ISO, uppercase (e.g. "USD")
};

export type HotelResult = {
  source: SourceName;
  name: string;
  rating: number | null;        // normalized 0-10
  ratingScale: "0-5" | "0-10";  // original scale hint
  ratingRaw: number | null;     // original, untransformed
  pricePerNight: number | null;
  priceTotal: number | null;
  currency: string;
  orderLink: string;
  remarks: string | null;
  address: string | null;
  city: string | null;
};

export type SourceError = {
  source: SourceName;
  message: string;
};

export type SourceTiming = {
  source: SourceName;
  ms: number;
};

export type SearchOutput = {
  query: SearchInput;
  results: HotelResult[];
  errors: SourceError[];
  timings: SourceTiming[];
};

export type SearchFn = (input: SearchInput) => Promise<HotelResult[]>;
```

- [ ] **Step 2: Verify it compiles**

Run:
```bash
npm run build
```

Expected: exit 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add shared types for hotel-search"
```

---

## Task 3: Parallel Runner Utility

**Files:**
- Create: `src/util/run-parallel.ts`

- [ ] **Step 1: Write `src/util/run-parallel.ts`**

Write `src/util/run-parallel.ts`:
```typescript
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
```

- [ ] **Step 2: Verify it compiles**

Run:
```bash
npm run build
```

Expected: exit 0, no errors.

- [ ] **Step 3: Manually verify with an inline smoke check**

Replace `src/index.ts` temporarily with:
```typescript
import { runParallel } from "./util/run-parallel.js";
import type { SearchInput, HotelResult } from "./types.js";

const input: SearchInput = {
  destination: "Tel Aviv",
  checkIn: "2026-05-01",
  checkOut: "2026-05-03",
  adults: 2,
  children: 0,
  childrenAges: [],
  rooms: 1,
  currency: "USD",
};

const fakeResult = (name: string): HotelResult => ({
  source: "booking.com",
  name,
  rating: 8.5,
  ratingScale: "0-10",
  ratingRaw: 8.5,
  pricePerNight: 100,
  priceTotal: 200,
  currency: "USD",
  orderLink: "https://example.com",
  remarks: null,
  address: null,
  city: null,
});

const outcome = await runParallel(
  [
    { name: "booking.com", fn: async () => [fakeResult("Hotel A")] },
    { name: "hotels.com", fn: async () => { throw new Error("boom"); } },
    { name: "daka90", fn: async () => { await new Promise((r) => setTimeout(r, 50)); return [fakeResult("Hotel B")]; } },
  ],
  input,
);

console.log(JSON.stringify(outcome, null, 2));
```

Run:
```bash
npm run build && node dist/index.js
```

Expected: JSON output with `results` having 2 fake hotels, `errors` having one entry for `hotels.com` with message "boom", and `timings` with 3 entries.

- [ ] **Step 4: Revert `src/index.ts`**

Restore `src/index.ts` to the placeholder:
```typescript
console.log("hotel-search skill: setup OK");
```

(We rewrite it properly in Task 7.)

- [ ] **Step 5: Commit**

```bash
git add src/util/run-parallel.ts src/index.ts
git commit -m "feat: add parallel source runner with per-source timeouts"
```

---

## Task 4: Booking.com Source Module

**Files:**
- Create: `src/sources/booking.ts`

**Reference:** `booking-com15` RapidAPI docs — https://rapidapi.com/DataCrawler/api/booking-com15

- [ ] **Step 1: Write `src/sources/booking.ts`**

Write `src/sources/booking.ts`:
```typescript
import type { HotelResult, SearchInput, SearchFn } from "../types.js";

const HOST = "booking-com15.p.rapidapi.com";
const BASE = `https://${HOST}`;

type DestSearchItem = {
  dest_id: string;
  search_type: string;
  name?: string;
  city_name?: string;
  country?: string;
};

type BookingHotel = {
  hotel_id?: number;
  name?: string;
  review_score?: number;         // 0-10
  min_total_price?: number;
  price_breakdown?: {
    gross_price?: { value?: number; currency?: string };
    all_inclusive_price?: { value?: number };
  };
  composite_price_breakdown?: {
    gross_amount_per_night?: { value?: number; currency?: string };
    gross_amount?: { value?: number; currency?: string };
  };
  url?: string;
  address?: string;
  city?: string;
  currencycode?: string;
  accommodation_type_name?: string;
  ribbon_text?: string;
};

function headers(): HeadersInit {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) throw new Error("RAPIDAPI_KEY is not set");
  return {
    "X-RapidAPI-Host": HOST,
    "X-RapidAPI-Key": key,
  };
}

async function resolveDestination(destination: string): Promise<DestSearchItem> {
  const url = new URL(`${BASE}/api/v1/hotels/searchDestination`);
  url.searchParams.set("query", destination);
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`Booking searchDestination HTTP ${res.status}`);
  const body = await res.json() as { data?: DestSearchItem[] };
  const first = body.data?.[0];
  if (!first) throw new Error(`Booking: no destination match for "${destination}"`);
  return first;
}

async function fetchHotels(
  dest: DestSearchItem,
  input: SearchInput,
): Promise<BookingHotel[]> {
  const url = new URL(`${BASE}/api/v1/hotels/searchHotels`);
  url.searchParams.set("dest_id", dest.dest_id);
  url.searchParams.set("search_type", dest.search_type);
  url.searchParams.set("arrival_date", input.checkIn);
  url.searchParams.set("departure_date", input.checkOut);
  url.searchParams.set("adults", String(input.adults));
  url.searchParams.set("room_qty", String(input.rooms));
  url.searchParams.set("currency_code", input.currency);
  if (input.childrenAges.length > 0) {
    url.searchParams.set("children_age", input.childrenAges.join(","));
  } else if (input.children > 0) {
    // unknown ages — use 8 as a reasonable default for "child" bucket
    url.searchParams.set("children_age", Array(input.children).fill(8).join(","));
  }

  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`Booking searchHotels HTTP ${res.status}`);
  const body = await res.json() as { data?: { hotels?: BookingHotel[] } };
  return body.data?.hotels ?? [];
}

function nights(input: SearchInput): number {
  const a = new Date(input.checkIn + "T00:00:00Z").getTime();
  const b = new Date(input.checkOut + "T00:00:00Z").getTime();
  return Math.max(1, Math.round((b - a) / (1000 * 60 * 60 * 24)));
}

function mapHotel(h: BookingHotel, input: SearchInput): HotelResult | null {
  const name = h.name ?? "";
  if (!name) return null;

  const totalFromPriceBreakdown =
    h.composite_price_breakdown?.gross_amount?.value ??
    h.price_breakdown?.gross_price?.value ??
    h.min_total_price ??
    null;

  const perNightFromPriceBreakdown =
    h.composite_price_breakdown?.gross_amount_per_night?.value ??
    (totalFromPriceBreakdown !== null ? totalFromPriceBreakdown / nights(input) : null);

  const currency =
    h.composite_price_breakdown?.gross_amount_per_night?.currency ??
    h.composite_price_breakdown?.gross_amount?.currency ??
    h.price_breakdown?.gross_price?.currency ??
    h.currencycode ??
    input.currency;

  const orderLink = h.url ?? (h.hotel_id ? `https://www.booking.com/hotel/${h.hotel_id}.html` : "https://www.booking.com/");

  return {
    source: "booking.com",
    name,
    rating: h.review_score ?? null,
    ratingScale: "0-10",
    ratingRaw: h.review_score ?? null,
    pricePerNight: perNightFromPriceBreakdown,
    priceTotal: totalFromPriceBreakdown,
    currency,
    orderLink,
    remarks: h.ribbon_text ?? h.accommodation_type_name ?? null,
    address: h.address ?? null,
    city: h.city ?? null,
  };
}

export const searchBooking: SearchFn = async (input) => {
  const dest = await resolveDestination(input.destination);
  const hotels = await fetchHotels(dest, input);
  return hotels.map((h) => mapHotel(h, input)).filter((r): r is HotelResult => r !== null);
};
```

- [ ] **Step 2: Verify it compiles**

Run:
```bash
npm run build
```

Expected: exit 0, no errors.

- [ ] **Step 3: Smoke test against the live API**

Create temporary `src/smoke-booking.ts`:
```typescript
import "dotenv/config";
import { searchBooking } from "./sources/booking.js";

const results = await searchBooking({
  destination: "Tel Aviv",
  checkIn: "2026-05-01",
  checkOut: "2026-05-03",
  adults: 2,
  children: 0,
  childrenAges: [],
  rooms: 1,
  currency: "USD",
});
console.log(`Got ${results.length} hotels. First:`);
console.log(JSON.stringify(results[0], null, 2));
```

Run:
```bash
npx tsx src/smoke-booking.ts
```

Expected: prints a hotel count > 0 and the first result with non-null `name`, `pricePerNight`, `orderLink`. If any field comes back null that shouldn't be, inspect the raw API response and tweak `mapHotel`.

**If the API response shape differs from expected** (field names changed, nested structure moved), adjust `BookingHotel` type + `mapHotel` accordingly. Print the raw response with `console.log(JSON.stringify(body, null, 2))` to inspect.

- [ ] **Step 4: Delete the smoke file**

Run:
```bash
rm src/smoke-booking.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/sources/booking.ts
git commit -m "feat: add Booking.com source via RapidAPI wrapper"
```

---

## Task 5: Hotels.com Source Module

**Files:**
- Create: `src/sources/hotels.ts`

**Reference:** `hotels-com-provider` RapidAPI docs — https://rapidapi.com/tipsters/api/hotels-com-provider

- [ ] **Step 1: Write `src/sources/hotels.ts`**

Write `src/sources/hotels.ts`:
```typescript
import type { HotelResult, SearchInput, SearchFn } from "../types.js";

const HOST = "hotels-com-provider.p.rapidapi.com";
const BASE = `https://${HOST}`;

type Region = {
  gaiaId?: string;
  geoId?: string;
  regionNames?: { fullName?: string };
  type?: string;
};

type HotelsHotel = {
  id?: string;
  name?: string;
  reviews?: { score?: number; total?: number };
  price?: {
    lead?: { amount?: number; currency?: string };
    displayMessages?: { lineItems?: { value?: string }[] }[];
  };
  neighborhood?: { name?: string };
  address?: { countryName?: string; locality?: string };
  star?: number;
  messages?: string[];
};

function headers(): HeadersInit {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) throw new Error("RAPIDAPI_KEY is not set");
  return {
    "X-RapidAPI-Host": HOST,
    "X-RapidAPI-Key": key,
  };
}

async function resolveRegion(destination: string, locale = "en_US"): Promise<Region> {
  const url = new URL(`${BASE}/v2/regions`);
  url.searchParams.set("query", destination);
  url.searchParams.set("domain", "US");
  url.searchParams.set("locale", locale);
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`Hotels.com regions HTTP ${res.status}`);
  const body = await res.json() as { data?: Region[] };
  const region = body.data?.find((r) => r.gaiaId || r.geoId);
  if (!region) throw new Error(`Hotels.com: no region match for "${destination}"`);
  return region;
}

async function fetchHotels(
  region: Region,
  input: SearchInput,
): Promise<HotelsHotel[]> {
  const url = new URL(`${BASE}/v2/hotels/search`);
  const regionId = region.gaiaId ?? region.geoId ?? "";
  url.searchParams.set("region_id", regionId);
  url.searchParams.set("locale", "en_US");
  url.searchParams.set("domain", "US");
  url.searchParams.set("checkin_date", input.checkIn);
  url.searchParams.set("checkout_date", input.checkOut);
  url.searchParams.set("adults_number", String(input.adults));
  url.searchParams.set("lodging_type", "HOTEL");
  url.searchParams.set("currency", input.currency);
  if (input.childrenAges.length > 0) {
    url.searchParams.set("children_ages", input.childrenAges.join(","));
  }

  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`Hotels.com search HTTP ${res.status}`);
  const body = await res.json() as { properties?: HotelsHotel[] };
  return body.properties ?? [];
}

function nights(input: SearchInput): number {
  const a = new Date(input.checkIn + "T00:00:00Z").getTime();
  const b = new Date(input.checkOut + "T00:00:00Z").getTime();
  return Math.max(1, Math.round((b - a) / (1000 * 60 * 60 * 24)));
}

function extractRemarks(h: HotelsHotel): string | null {
  const lines: string[] = [];
  for (const dm of h.price?.displayMessages ?? []) {
    for (const li of dm.lineItems ?? []) {
      if (li.value) lines.push(li.value);
    }
  }
  for (const m of h.messages ?? []) {
    if (m) lines.push(m);
  }
  const joined = lines.filter(Boolean).join("; ");
  return joined || null;
}

function mapHotel(h: HotelsHotel, input: SearchInput): HotelResult | null {
  const name = h.name ?? "";
  if (!name) return null;

  const pricePerNight = h.price?.lead?.amount ?? null;
  const priceTotal = pricePerNight !== null ? pricePerNight * nights(input) : null;
  const currency = h.price?.lead?.currency ?? input.currency;
  const ratingRaw = h.reviews?.score ?? null;
  const rating = ratingRaw !== null ? Math.round(ratingRaw * 20) / 10 : null; // 0-5 → 0-10 (×2)

  const id = h.id ?? "";
  const orderLink = id
    ? `https://www.hotels.com/ho${id}/?q-check-in=${input.checkIn}&q-check-out=${input.checkOut}&q-rooms=${input.rooms}&q-room-0-adults=${input.adults}`
    : "https://www.hotels.com/";

  return {
    source: "hotels.com",
    name,
    rating,
    ratingScale: "0-5",
    ratingRaw,
    pricePerNight,
    priceTotal,
    currency,
    orderLink,
    remarks: extractRemarks(h),
    address: h.neighborhood?.name ?? h.address?.locality ?? null,
    city: h.address?.locality ?? null,
  };
}

export const searchHotelsCom: SearchFn = async (input) => {
  const region = await resolveRegion(input.destination);
  const hotels = await fetchHotels(region, input);
  return hotels.map((h) => mapHotel(h, input)).filter((r): r is HotelResult => r !== null);
};
```

- [ ] **Step 2: Verify it compiles**

Run:
```bash
npm run build
```

Expected: exit 0, no errors.

- [ ] **Step 3: Smoke test against the live API**

Create temporary `src/smoke-hotels.ts`:
```typescript
import "dotenv/config";
import { searchHotelsCom } from "./sources/hotels.js";

const results = await searchHotelsCom({
  destination: "Tel Aviv",
  checkIn: "2026-05-01",
  checkOut: "2026-05-03",
  adults: 2,
  children: 0,
  childrenAges: [],
  rooms: 1,
  currency: "USD",
});
console.log(`Got ${results.length} hotels. First:`);
console.log(JSON.stringify(results[0], null, 2));
```

Run:
```bash
npx tsx src/smoke-hotels.ts
```

Expected: prints `hotels count > 0` and a populated first result. If shape differs, inspect raw body and adjust the `HotelsHotel` type + mapping. The `hotels-com-provider` response shape changes occasionally — verify all paths resolve.

- [ ] **Step 4: Delete the smoke file**

Run:
```bash
rm src/smoke-hotels.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/sources/hotels.ts
git commit -m "feat: add Hotels.com source via RapidAPI wrapper"
```

---

## Task 6: Daka90 Scraper Module

**Files:**
- Create: `src/sources/daka90.ts`

**Reference:** Daka90 website — https://www.daka90.co.il. No public API; HTML scraping only.

> **Reverse-engineering step:** Daka90's exact search URL parameters and HTML structure need confirmation against the live site. This task includes an exploration step before implementation. If the site structure differs significantly from what the implementation assumes, adjust the selectors and URL building to match.

- [ ] **Step 1: Probe Daka90's search URL and HTML structure**

Manually open Daka90 in a browser:
1. Go to https://www.daka90.co.il.
2. Search for "אילת" (Eilat), check-in 2026-05-01, check-out 2026-05-03, 2 adults.
3. On the results page, open DevTools → Network, reload.
4. Capture:
   - The final results URL (path and query string)
   - The request method (GET or POST)
   - A sample of the results HTML — specifically the selector that wraps each hotel card (e.g. `.hotel-item`, `div[data-hotel-id]`)
   - Which fields are in the card: name, price, rating, link
5. Also try a non-Israel destination like "Athens" on `/HotelsAbroad/…` and capture the same.

Record findings in a scratch note — they'll drive the exact selectors below.

**Expected findings (based on spec research, confirm these):**
- Israel search URL: `https://www.daka90.co.il/HotelsIsrael/HotelsIsraelHome.aspx` with POST form data, OR a GET URL with `checkInDate=DD-MM-YYYY&checkOutDate=DD-MM-YYYY&roomOccCode=...`
- Abroad search URL: `/HotelsAbroad/HotelsAbroadHome.aspx` pattern
- `roomOccCode` format: `2<age1><age2>...` where children's ages are appended

- [ ] **Step 2: Write `src/sources/daka90.ts`**

Using the findings from Step 1, write `src/sources/daka90.ts`. If the real URLs/selectors differ, adjust the strings and selectors accordingly.

```typescript
import * as cheerio from "cheerio";
import type { HotelResult, SearchInput, SearchFn } from "../types.js";

const BASE = "https://www.daka90.co.il";

// Built-in fallback map of common cities → Daka90 destination slugs.
// Used when autocomplete fails or isn't available. Extend over time.
const CITY_SLUGS: Record<string, { scope: "israel" | "abroad"; slug: string }> = {
  "tel aviv": { scope: "israel", slug: "tel-aviv" },
  "תל אביב": { scope: "israel", slug: "tel-aviv" },
  "eilat": { scope: "israel", slug: "eilat" },
  "אילת": { scope: "israel", slug: "eilat" },
  "jerusalem": { scope: "israel", slug: "jerusalem" },
  "ירושלים": { scope: "israel", slug: "jerusalem" },
  "dead sea": { scope: "israel", slug: "dead-sea" },
  "ים המלח": { scope: "israel", slug: "dead-sea" },
  "paris": { scope: "abroad", slug: "paris" },
  "פריז": { scope: "abroad", slug: "paris" },
  "london": { scope: "abroad", slug: "london" },
  "לונדון": { scope: "abroad", slug: "london" },
  "rome": { scope: "abroad", slug: "rome" },
  "athens": { scope: "abroad", slug: "athens" },
  "new york": { scope: "abroad", slug: "new-york" },
};

function formatDateDMY(iso: string): string {
  // iso: YYYY-MM-DD → DD-MM-YYYY
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

function roomOccCode(adults: number, childrenAges: number[]): string {
  // Format confirmed from reverse-engineering in Step 1.
  // Provisional: "<adults><age1><age2>..." — e.g. "2" for 2 adults,
  // "205" for 2 adults + one 5-year-old, "20512" for 2 adults + 5yo + 12yo.
  return `${adults}${childrenAges.map((a) => (a < 10 ? `0${a}` : String(a))).join("")}`;
}

function resolveCity(destination: string): { scope: "israel" | "abroad"; slug: string } {
  const key = destination.trim().toLowerCase();
  const hit = CITY_SLUGS[key] ?? CITY_SLUGS[destination.trim()];
  if (hit) return hit;
  // Default guess: treat as abroad destination, use destination as-is slugged.
  return {
    scope: "abroad",
    slug: key.replace(/\s+/g, "-"),
  };
}

function buildSearchUrl(input: SearchInput): string {
  const { scope, slug } = resolveCity(input.destination);
  const path = scope === "israel" ? `/hotels-israel/${slug}` : `/packages/${slug}`;
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("checkInDate", formatDateDMY(input.checkIn));
  url.searchParams.set("checkOutDate", formatDateDMY(input.checkOut));
  url.searchParams.set("roomOccCode", roomOccCode(input.adults, input.childrenAges));
  return url.toString();
}

function parseHotels(html: string, input: SearchInput): HotelResult[] {
  const $ = cheerio.load(html);
  const results: HotelResult[] = [];

  // Selectors confirmed from reverse-engineering in Step 1.
  // Provisional (update if the real structure differs):
  //   card: ".hotel-result-item" or "[data-hotel-id]"
  //   name: ".hotel-name"
  //   price: ".hotel-price" (strip currency symbol, parse number)
  //   rating: ".hotel-rating" or data attribute (0-5)
  //   link:  "a.hotel-link"

  $(".hotel-result-item, [data-hotel-id]").each((_, el) => {
    const $el = $(el);
    const name = $el.find(".hotel-name").first().text().trim();
    if (!name) return;

    const priceText = $el.find(".hotel-price").first().text().replace(/[^\d.]/g, "");
    const pricePerNightRaw = priceText ? Number(priceText) : NaN;
    const pricePerNight = Number.isFinite(pricePerNightRaw) ? pricePerNightRaw : null;

    const ratingText = $el.find(".hotel-rating").first().text().replace(/[^\d.]/g, "");
    const ratingRaw = ratingText ? Number(ratingText) : NaN;
    const ratingRawOrNull = Number.isFinite(ratingRaw) ? ratingRaw : null;
    const rating = ratingRawOrNull !== null ? Math.round(ratingRawOrNull * 20) / 10 : null;

    const href = $el.find("a.hotel-link, a[href*='hotelId']").first().attr("href") ?? "";
    const orderLink = href.startsWith("http") ? href : `${BASE}${href || "/"}`;

    const remarks = $el.find(".hotel-remarks, .hotel-features").first().text().trim() || null;
    const address = $el.find(".hotel-address").first().text().trim() || null;

    const nights = Math.max(
      1,
      Math.round(
        (new Date(input.checkOut + "T00:00:00Z").getTime() -
          new Date(input.checkIn + "T00:00:00Z").getTime()) /
          (1000 * 60 * 60 * 24),
      ),
    );

    results.push({
      source: "daka90",
      name,
      rating,
      ratingScale: "0-5",
      ratingRaw: ratingRawOrNull,
      pricePerNight,
      priceTotal: pricePerNight !== null ? pricePerNight * nights : null,
      currency: "ILS",
      orderLink,
      remarks,
      address,
      city: input.destination,
    });
  });

  return results;
}

export const searchDaka90: SearchFn = async (input) => {
  const url = buildSearchUrl(input);
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      "Accept-Language": "he,en;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`Daka90 HTTP ${res.status} for ${url}`);
  const html = await res.text();
  const results = parseHotels(html, input);
  if (results.length === 0) {
    throw new Error(`Daka90: no results parsed from ${url} — selectors may be stale`);
  }
  return results;
};
```

- [ ] **Step 3: Verify it compiles**

Run:
```bash
npm run build
```

Expected: exit 0, no errors.

- [ ] **Step 4: Smoke test against the live site**

Create temporary `src/smoke-daka90.ts`:
```typescript
import { searchDaka90 } from "./sources/daka90.js";

const results = await searchDaka90({
  destination: "Eilat",
  checkIn: "2026-05-01",
  checkOut: "2026-05-03",
  adults: 2,
  children: 0,
  childrenAges: [],
  rooms: 1,
  currency: "ILS",
});
console.log(`Got ${results.length} hotels. First:`);
console.log(JSON.stringify(results[0], null, 2));
```

Run:
```bash
npx tsx src/smoke-daka90.ts
```

**If zero results or parsing errors:**
- Download the actual HTML: `curl -H "User-Agent: Mozilla/5.0" "<the-url-from-buildSearchUrl>" > /tmp/daka90.html`
- Open `/tmp/daka90.html` in a browser to see the rendered structure.
- Update the selectors in `parseHotels()` to match actual class names.
- Re-run.

**If the wrong URL is being hit** (404, redirect to home page), adjust `buildSearchUrl()` — maybe Israel search is on `.aspx` rather than the slug path, or abroad needs `/HotelsAbroad/...`.

- [ ] **Step 5: Delete the smoke file**

Run:
```bash
rm src/smoke-daka90.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/sources/daka90.ts
git commit -m "feat: add Daka90 scraper source"
```

---

## Task 7: CLI Orchestrator

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Write `src/index.ts`**

Overwrite `src/index.ts`:
```typescript
#!/usr/bin/env node
import "dotenv/config";
import { z } from "zod";
import { runParallel } from "./util/run-parallel.js";
import { searchBooking } from "./sources/booking.js";
import { searchHotelsCom } from "./sources/hotels.js";
import { searchDaka90 } from "./sources/daka90.js";
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
  // simple long-flag parser; each flag expects exactly one value
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
    { name: "hotels.com" as const, fn: searchHotelsCom },
    { name: "daka90" as const, fn: searchDaka90 },
  ];

  const outcome = await runParallel(sources, input);

  if (keyMissing) {
    process.stderr.write("warning: RAPIDAPI_KEY not set — booking.com and hotels.com will have failed\n");
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
```

- [ ] **Step 2: Verify it compiles**

Run:
```bash
npm run build
```

Expected: exit 0, no errors.

- [ ] **Step 3: Run end-to-end**

Run:
```bash
node dist/index.js --destination "Tel Aviv" --check-in 2026-05-01 --check-out 2026-05-03 --adults 2 --rooms 1
```

Expected: JSON output with populated `results` from booking.com and hotels.com, daka90 may or may not return depending on whether Tel Aviv is in its slug map. `errors` may be populated if any source failed. Exit code 0.

- [ ] **Step 4: Run with an Israel destination to exercise Daka90**

Run:
```bash
node dist/index.js --destination "Eilat" --check-in 2026-05-01 --check-out 2026-05-03 --adults 2 --children 1 --children-ages 8
```

Expected: all three sources return results. Inspect the output and confirm the shape matches the `SearchOutput` contract.

- [ ] **Step 5: Test error path — bad args**

Run:
```bash
node dist/index.js --destination "Tel Aviv" --check-in not-a-date --check-out 2026-05-03
```

Expected: exit 1, stderr shows "Invalid args: checkIn: expected YYYY-MM-DD", stdout empty.

- [ ] **Step 6: Commit**

```bash
git add src/index.ts
git commit -m "feat: add CLI orchestrator for hotel-search"
```

---

## Task 8: SKILL.md

**Files:**
- Create: `SKILL.md`

- [ ] **Step 1: Write `SKILL.md`**

Write `SKILL.md`:
````markdown
---
name: hotel-search
description: Search hotels across Booking.com, Hotels.com, and Daka90 in one call. Use when the user asks about hotel prices, availability, or wants to compare options across sites. Returns a flat list of per-site results; agent groups by hotel name when presenting.
---

# Hotel Search

Searches Booking.com, Hotels.com, and Daka90 (דקה 90) in parallel and returns prices, ratings, and direct booking links.

## When to use

- User asks for hotel prices or availability for a destination and date range.
- User wants to compare hotel options across multiple sites.
- User wants a booking link to a specific hotel.

## How to invoke

Run from the skill's project directory:

```bash
node dist/index.js \
  --destination "<city>" \
  --check-in YYYY-MM-DD \
  --check-out YYYY-MM-DD \
  [--adults N] \
  [--children N] \
  [--children-ages 5,12] \
  [--rooms N] \
  [--currency USD]
```

**Required:** `--destination`, `--check-in`, `--check-out`.

**Optional:**
- `--adults` (default 2)
- `--children` (default 0)
- `--children-ages` comma-separated ages (sent to sites that support age-based pricing)
- `--rooms` (default 1)
- `--currency` 3-letter ISO (default USD; Daka90 always returns ILS)

## Output shape

Stdout is JSON matching `SearchOutput`:

```
{
  "query": { ...echoed input... },
  "results": [
    {
      "source": "booking.com" | "hotels.com" | "daka90",
      "name": string,
      "rating": number | null,          // 0-10 normalized
      "ratingScale": "0-5" | "0-10",    // original scale
      "ratingRaw": number | null,       // original value
      "pricePerNight": number | null,
      "priceTotal": number | null,
      "currency": "USD" | "ILS" | ...,
      "orderLink": string,              // direct booking URL
      "remarks": string | null,
      "address": string | null,
      "city": string | null
    }
  ],
  "errors": [{ "source": string, "message": string }],
  "timings": [{ "source": string, "ms": number }]
}
```

## Presenting results to the user

**Results are a flat list — the agent must group by hotel.**

1. Group results by fuzzy-matching `name` + `city`. Example: "Hilton Tel Aviv" ≈ "Hilton Tel Aviv Hotel" ≈ "הילטון תל אביב" — all the same hotel.
2. For each hotel group, format as:

```
<Hotel Name>
  - booking.com: $<price>/night, <rating>/10, <link>
  - hotels.com: $<price>/night, <rating>/5, <link>
  - daka90: ₪<price>/night, <rating>/5, <link>
```

3. Use `ratingScale` to decide whether to show `/10` or `/5`. Prefer the original scale the user will recognize.
4. If `errors[]` is non-empty, tell the user which sources failed after listing results.
5. Sort hotels by best combined rating or by lowest price — pick what fits the user's question.

## Error handling

- If a source fails, other sources still return. `errors[]` records the failure.
- If all three fail, `results` is empty — tell the user and include the error messages.
- Missing `RAPIDAPI_KEY` → Booking + Hotels fail with "RAPIDAPI_KEY is not set"; Daka90 still runs.

## Example

```bash
node dist/index.js --destination "Eilat" --check-in 2026-05-01 --check-out 2026-05-03 --adults 2 --children 1 --children-ages 8
```

Then the agent groups the results and tells the user:

> **Isrotel King Solomon**
>   - booking.com: $180/night, 8.3/10, https://...
>   - hotels.com: $175/night, 4.2/5, https://...
>   - daka90: ₪620/night, 4.0/5, https://...
>
> **Herods Palace**
>   - booking.com: $245/night, 8.7/10, https://...
>   - hotels.com: $240/night, 4.4/5, https://...
>
> Daka90 didn't return results for this destination.
````

- [ ] **Step 2: Commit**

```bash
git add SKILL.md
git commit -m "docs: add SKILL.md for agent invocation"
```

---

## Task 9: Final Verification

- [ ] **Step 1: Clean build**

Run:
```bash
rm -rf dist
npm run build
```

Expected: exit 0, `dist/` populated.

- [ ] **Step 2: End-to-end run with all sources exercised**

Run:
```bash
node dist/index.js --destination "Eilat" --check-in 2026-05-01 --check-out 2026-05-03 --adults 2
```

Expected: JSON stdout. Confirm:
- `results` contains hotels from all three sources (look at `source` field diversity).
- `errors` is empty (or only contains entries you expect).
- `timings` shows three entries, each under 15000ms.
- At least one result has `name`, `pricePerNight`, `orderLink` all populated per source.

- [ ] **Step 3: End-to-end run with children + ages**

Run:
```bash
node dist/index.js --destination "Tel Aviv" --check-in 2026-06-01 --check-out 2026-06-04 --adults 2 --children 2 --children-ages 5,10 --rooms 1
```

Expected: similar valid output. Inspect that children ages were passed through (response shape won't prove it, but no errors should occur).

- [ ] **Step 4: Failure mode — missing API key**

Temporarily rename `.env` and run the CLI:

```bash
mv .env .env.bak
node dist/index.js --destination "Eilat" --check-in 2026-05-01 --check-out 2026-05-03
```

Expected: Daka90 returns results; booking.com and hotels.com appear in `errors[]` with "RAPIDAPI_KEY is not set". Exit code 0. Stderr shows the warning.

Restore:
```bash
mv .env.bak .env
```

- [ ] **Step 5: Commit any remaining changes**

If nothing changed, skip. Otherwise:
```bash
git status
git add -A
git commit -m "chore: final verification tweaks"
```

- [ ] **Step 6: Tag the first working version**

```bash
git tag v0.1.0
```

---

## Done

The skill is now runnable end-to-end. The agent can call it via the invocation shown in SKILL.md, and the output is ready for Claude to group and present.

**Operational notes for future maintenance:**

- If RapidAPI response shapes change, adjust the type + `mapHotel` function in the affected source file. Each source is self-contained in `src/sources/*.ts`.
- If Daka90 breaks, first check whether the selectors in `parseHotels()` still match the live HTML. Reverse-engineering steps are documented in Task 6.
- `CITY_SLUGS` in `daka90.ts` is a hand-maintained map. Extend it as you use new destinations.
- Consider swapping to the fallback RapidAPI providers (`apidojo/booking-com`, `apidojo/hotels4`) if the primary ones get deprecated — only the `HOST` constant and a few field paths change.
