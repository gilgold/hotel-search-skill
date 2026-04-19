# Hotel Search Skill — Design

**Date:** 2026-04-19
**Author:** gilgo@wix.com
**Status:** Approved (brainstorming phase)

## Purpose

An AI Skill for the `openclaw` personal agent that searches hotels across three sources — Booking.com, Hotels.com, and Daka90 (דקה 90) — and returns price, rating, and a direct booking link for each hotel found on each site. Personal use only; not production.

## Scope

**In scope:**
- Destination + date + occupancy search across all three sites.
- Unified output shape per result; agent groups by hotel name when presenting.
- Partial-failure tolerance (one source down ≠ skill fails).
- Children-age pass-through when the source supports it.

**Out of scope:**
- Booking execution — we return links, user books manually in browser.
- Caching / persistence — every call hits the sources live.
- Price history / analytics.
- Tests — manual verification only.
- Fancy matching/dedup — agent (Claude) handles grouping.

## Architecture

Single Node.js / TypeScript CLI orchestrator. One entry point, fans out to three source modules in parallel.

```
hotel-search/
├── SKILL.md               # agent-facing instructions
├── package.json
├── tsconfig.json
├── .env.example           # template for API keys
├── .gitignore
├── src/
│   ├── index.ts           # CLI entry, parses args, emits JSON
│   ├── types.ts           # HotelResult, SearchInput, SearchOutput
│   ├── sources/
│   │   ├── booking.ts     # RapidAPI Booking.com client
│   │   ├── hotels.ts      # RapidAPI Hotels.com client
│   │   └── daka90.ts      # Daka90 HTML scraper (cheerio)
│   └── util/
│       └── run-parallel.ts # Promise.allSettled with partial-failure handling
└── dist/                  # compiled JS (gitignored)
```

### Invocation

```
node dist/index.js --destination "Tel Aviv" --check-in 2026-05-01 --check-out 2026-05-03 --adults 2 --rooms 1
```

- Stdout = JSON (the `SearchOutput`).
- Stderr = diagnostic logs.
- Exit code: `0` for any result (including empty with errors); `1` only for invalid args or crash.

### Why this shape

- One command for the agent to run — simpler than orchestrating three.
- Parallel execution means slowest source sets latency (~Daka90 scrape, 3–8 s).
- Partial failure is first-class: if Daka90 times out, Booking + Hotels still return.
- Source isolation: each site lives in one file, easy to fix when selectors or APIs change.

## Data Contract

### Input

```ts
type SearchInput = {
  destination: string;      // "Tel Aviv", "Paris", "אילת" — passed through as-is
  checkIn: string;          // YYYY-MM-DD
  checkOut: string;         // YYYY-MM-DD
  adults?: number;          // default 2
  children?: number;        // default 0 (derivable from childrenAges.length)
  childrenAges?: number[];  // optional, e.g. [5, 12] — passed to sources that support it
  rooms?: number;           // default 1
  currency?: string;        // ISO code, default "USD"; Daka90 returns ILS regardless
}
```

CLI args mirror the type: `--destination`, `--check-in`, `--check-out`, `--adults`, `--children`, `--children-ages "5,12"`, `--rooms`, `--currency`.

### Output

```ts
type SearchOutput = {
  query: SearchInput;                              // echoed back (with defaults filled in)
  results: HotelResult[];                          // flat list, NOT grouped
  errors: { source: string; message: string }[];  // per-source failures
  timings: { source: string; ms: number }[];      // for debugging
}

type HotelResult = {
  source: "booking.com" | "hotels.com" | "daka90";
  name: string;                 // as returned by source
  rating: number | null;        // normalized to 0-10 scale; null if missing
  ratingScale: "0-5" | "0-10";  // original scale hint for the agent
  ratingRaw: number | null;     // original rating value, untransformed
  pricePerNight: number | null;
  priceTotal: number | null;    // whole-stay price
  currency: string;             // ISO: "USD", "ILS", etc.
  orderLink: string;            // deep link to booking page
  remarks: string | null;       // "breakfast included, free cancellation"
  address: string | null;
  city: string | null;
}
```

### Design rationale for the output shape

- **Flat, not grouped:** the agent (Claude) is better at fuzzy matching "Hilton Tel Aviv" across three inconsistent naming conventions than code would be. Skill stays simple.
- **Always-present `errors`:** the agent sees which sources failed and can mention it to the user.
- **Ratings normalized to 0-10** with `ratingScale` + `ratingRaw` preserved — the agent can present in either scale without losing information.
- **Prices as numbers**, not strings — trivial to compare across sources; agent formats for display.

## Source Integrations

### Booking.com — via RapidAPI

- **Provider:** `booking-com15` by DataCrawler. Fallback: `apidojo/booking-com`.
- **Auth:** single header `X-RapidAPI-Key` from env `RAPIDAPI_KEY`.
- **Calls:**
  1. `GET /searchDestination?query=<destination>` → `dest_id` + `search_type`.
  2. `GET /searchHotels?dest_id=...&search_type=...&arrival_date=...&departure_date=...&adults=...&children_age=<comma-separated>&room_qty=...&currency_code=...`
- **Rating:** native 0-10; passed through to `rating`, `ratingScale: "0-10"`, `ratingRaw` same as `rating`.
- **Link:** affiliate URL from response; fallback to `https://www.booking.com/hotel/<country>/<slug>.html?checkin=...&checkout=...`.

### Hotels.com — via RapidAPI

- **Provider:** `tipsters/hotels-com-provider`. Fallback: `apidojo/hotels4`.
- **Auth:** same `X-RapidAPI-Key`.
- **Calls:**
  1. `GET /v2/locations/search?query=<destination>` → `geoId` / `gaiaId`.
  2. `GET /v2/hotels/search?geoId=...&checkIn=...&checkOut=...&adults=...&children=...&rooms=...&currency=...`
- **Rating:** native 0-5; converted to 0-10 for `rating`, `ratingScale: "0-5"`, original kept in `ratingRaw`.
- **Link:** deep link from response.

### Daka90 — HTML scraper

- **Auth:** none.
- **Approach (two stages):**
  1. **Destination resolution:** probe Daka90's autocomplete endpoint (to be reverse-engineered during implementation — expected `/api/autocomplete?q=<destination>` or similar). Fallback: built-in map of common cities → Daka90 destination IDs.
  2. **Search:** hit `/HotelsIsrael/…` or `/HotelsAbroad/…` with `checkInDate=DD-MM-YYYY`, `checkOutDate=DD-MM-YYYY`, `roomOccCode=<encoded-composition>`.
- **Parser:** `cheerio` (lightweight jQuery-like HTML parsing). Page is server-rendered per research.
- **`roomOccCode` encoding:** form `2<ages...>` for a room with 2 adults and children of given ages (0-2 infants, 2-12 child per typical Israeli OTA convention). Exact format confirmed during implementation against the live site.
- **Rating:** typically 0-5 on Daka90; same handling as Hotels.com.
- **Fragility note:** this is the most fragile integration. Isolated to one file so fixes are surgical. Parser errors include the failing CSS selector in the error message for fast debugging.

### Shared Interface

Every source module exports:

```ts
async function search(input: SearchInput): Promise<HotelResult[]>
```

The orchestrator (`src/index.ts`) calls all three via `Promise.allSettled`. **Per-source timeout: 15 s.** Timeout → recorded in `errors`, other sources still return.

## Config & Keys

- **Single env var:** `RAPIDAPI_KEY` (covers Booking + Hotels).
- **Daka90:** no auth.
- `.env.example` committed to repo as a template. Real `.env` is gitignored.
- Loaded via `dotenv` at startup.
- **Missing key:** skill runs Daka90 only, reports Booking and Hotels in `errors[]` with a "missing RAPIDAPI_KEY" message. Doesn't crash.
- **How to obtain `RAPIDAPI_KEY`:** sign up at rapidapi.com, subscribe to the chosen Booking and Hotels APIs (free tier ~500 req/month each is sufficient for personal use), copy the API key from dashboard.

## Error Handling

Partial failure is the norm, not the exception.

| Situation | Behavior |
|---|---|
| Invalid CLI args (bad date, missing destination) | Exit 1, message to stderr, no stdout output |
| One source fails (network, API error, parse error) | Record in `errors[]`, other sources still return, exit 0 |
| All three sources fail | Exit 0, empty `results`, populated `errors[]` |
| Zero results from a source but no error | Not an error. Source appears in `timings[]` with no contribution to `results[]` |
| Missing `RAPIDAPI_KEY` | Booking + Hotels → `errors[]` with "missing key" message. Daka90 still runs |

## SKILL.md (agent-facing)

The skill's README-for-the-agent. Contents:

- **When to invoke** — hotel price/availability questions from the user.
- **Required args:** destination, check-in, check-out.
- **Optional args:** adults, children, childrenAges, rooms, currency.
- **Output interpretation:**
  - Results are a flat list — **agent must group by hotel name + city when presenting**.
  - When grouping, use fuzzy matching (e.g. "Hilton Tel Aviv" ≈ "Hilton Tel Aviv Hotel" ≈ "הילטון תל אביב").
  - If `errors[]` is non-empty, mention which sources failed.
- **Output presentation format the user wants:**
  ```
  Hilton Tel Aviv
    - booking.com: $220/night, 8.9/10, link
    - hotels.com: $215/night, 4.3/5, link
    - daka90: ₪750/night, 4.5/5, link
  ```
- **One worked example** of a full CLI invocation and expected output.

## Dependencies

- `typescript` (dev)
- `ts-node` or `tsx` for dev running
- `dotenv` — env loading
- `cheerio` — Daka90 HTML parsing
- `node-fetch` or use Node 20+ built-in `fetch`
- `zod` — CLI arg + response validation
- `commander` or native `process.argv` parser for CLI

No frameworks. Keep it small.

## Open Questions Deferred to Implementation

1. Exact encoding of Daka90's `roomOccCode` with varying child ages — confirmed live against site.
2. Daka90's autocomplete endpoint (if any) — reverse-engineered during implementation.
3. Final choice between `booking-com15` vs `apidojo/booking-com` — pick whichever is cheaper/more reliable when actually signing up on RapidAPI.
4. Final choice between `hotels-com-provider` vs `apidojo/hotels4` — same.

## Risks

1. **Daka90 HTML changes** → scraper breaks. Mitigation: isolated module, clear selector-level error messages.
2. **RapidAPI wrapper shutdown** → switch to fallback wrapper (each source has a documented fallback). Updating means one file touched.
3. **Rate limits on RapidAPI free tier** — 500 req/month each. Personal use should comfortably stay under.
4. **Booking.com ToS concerns** using unofficial wrappers — acceptable given personal-use scope; reassess if ever shared publicly.
