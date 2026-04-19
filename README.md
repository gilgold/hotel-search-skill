# Hotel Search Skill

A Claude Agent Skill that searches hotels across **Booking.com**, **Agoda**, and (for Israel) **Daka90**, returning prices, ratings, and direct booking links.

- CLI handles Booking + Agoda via RapidAPI.
- Daka90 is scraped via the agent's built-in browser (Imperva WAF blocks plain HTTP).
- Any CLI source that fails falls back to the agent's browser hitting the site's public search page.

Full agent-facing contract: see [SKILL.md](SKILL.md).

---

## TL;DR for an agent installing this skill

```bash
# 1. Clone
git clone https://github.com/gilgold/hotel-search-skill.git
cd hotel-search-skill

# 2. Install (requires Node 20+)
npm install

# 3. Get a RapidAPI key and subscribe to the two APIs listed below. Paste key:
cp .env.example .env
echo "RAPIDAPI_KEY=<your-key>" > .env

# 4. Build
npm run build

# 5. Run
node dist/index.js --destination "Paris" --check-in 2026-05-01 --check-out 2026-05-03 --adults 2
```

Output is JSON on stdout. See [SKILL.md](SKILL.md) for the agent's full decision flow (when to use the CLI, when to fall back to browser, when to search Daka90).

---

## Installation

### Prerequisites

- **Node.js ≥ 20** (`node --version` to check)
- A **RapidAPI account** (free) — sign up at https://rapidapi.com
- The agent's environment needs **browser control** (Playwright MCP, Claude in Chrome, or equivalent) — required for Daka90 and for CLI fallbacks. If unavailable, the skill still works via CLI alone.

### RapidAPI subscriptions

The same key covers both. Subscribe to each free tier:

1. **Booking.com** — https://rapidapi.com/DataCrawler/api/booking-com15/pricing
2. **Agoda** — https://rapidapi.com/ntd119/api/agoda-com/pricing

After subscribing, copy your key from the RapidAPI dashboard (**Security** → **Default Application**).

### Clone & install

```bash
git clone https://github.com/gilgold/hotel-search-skill.git
cd hotel-search-skill
npm install
```

### Configure environment

```bash
cp .env.example .env
# edit .env and set RAPIDAPI_KEY=<your-rapidapi-key>
```

`.env` is gitignored. Never commit it.

### Build

```bash
npm run build
```

Produces `dist/index.js`. Re-run after pulling updates or editing source.

---

## Usage

### CLI invocation

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

### Arguments

| Flag | Required | Default | Notes |
|---|---|---|---|
| `--destination` | yes | — | City name, e.g. `"Tel Aviv"`, `"Paris"`, `"Tokyo"` |
| `--check-in` | yes | — | ISO date `YYYY-MM-DD` |
| `--check-out` | yes | — | ISO date `YYYY-MM-DD` |
| `--adults` | no | `2` | Integer ≥ 1 |
| `--children` | no | `0` | Integer ≥ 0 (derived from `--children-ages` length if that is set) |
| `--children-ages` | no | — | Comma-separated ages `5,12`. Passed to sources that support age-based pricing |
| `--rooms` | no | `1` | Integer ≥ 1 |
| `--currency` | no | `USD` | 3-letter ISO code |

### Output format

Stdout is JSON matching `SearchOutput`:

```ts
{
  query: { ...echoed input... },
  results: [
    {
      source: "booking.com" | "agoda.com",
      name: string,
      rating: number | null,          // normalized 0-10
      ratingScale: "0-5" | "0-10",
      ratingRaw: number | null,       // original untransformed value
      pricePerNight: number | null,
      priceTotal: number | null,      // full stay
      currency: string,               // ISO
      orderLink: string,              // direct booking URL
      remarks: string | null,
      address: string | null,
      city: string | null
    },
    ...
  ],
  errors: [{ source: string, message: string }],
  timings: [{ source: string, ms: number }]
}
```

Exit codes:
- `0` — normal (even if all sources errored — check `errors[]`)
- `1` — invalid CLI args (error message on stderr)

### Examples

**International, default (2 adults, 1 room, USD):**
```bash
node dist/index.js --destination "Paris" --check-in 2026-05-01 --check-out 2026-05-03
```

**Israel, family with child, ILS:**
```bash
node dist/index.js --destination "Eilat" --check-in 2026-05-01 --check-out 2026-05-03 --adults 2 --children 1 --children-ages 8 --currency ILS
```

**Solo traveler, Tokyo, JPY:**
```bash
node dist/index.js --destination "Tokyo" --check-in 2026-06-15 --check-out 2026-06-18 --adults 1 --currency JPY
```

---

## For AI agents

**Read [SKILL.md](SKILL.md) before using this skill.** It defines:
- When to invoke the skill (hotel-related user queries).
- The 3-tier strategy: CLI → browser fallback for failed sources → browser for Daka90.
- How to present results to the user (group by hotel, format per-site rows).
- URL templates for browser fallbacks (Booking.com, Agoda, Daka90).
- Error-handling branches.

The CLI is the primary entrypoint. Browser fallbacks are documented in the SKILL.md as textual instructions — the skill doesn't ship browser-driving code because environments differ.

---

## Architecture

```
hotel-search-skill/
├── SKILL.md                  # Agent contract (the important file)
├── README.md                 # This file
├── package.json
├── tsconfig.json
├── .env.example              # Template (real .env is gitignored)
├── src/
│   ├── index.ts              # CLI entry (arg parsing, orchestration, JSON emission)
│   ├── types.ts              # Shared types: SearchInput, HotelResult, SearchOutput
│   ├── sources/
│   │   ├── booking.ts        # Booking.com via RapidAPI booking-com15
│   │   └── agoda.ts          # Agoda via RapidAPI agoda-com
│   └── util/
│       └── run-parallel.ts   # Promise.allSettled-style runner with per-source timeouts
└── dist/                     # Compiled JS (gitignored)
```

- **Parallel execution.** Both CLI sources run in parallel; total latency ≈ slowest source.
- **Per-source 15s timeout.** Exceeding it records an error for that source; others still return.
- **Partial failure is first-class.** If one source throws, the other still contributes; `errors[]` records the failure.
- **No browser code in the skill.** Browser fallbacks are described in SKILL.md; the agent drives its own browser (Playwright MCP, Chrome MCP, etc.).

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `fatal: RAPIDAPI_KEY is not set` in `errors[]` for both sources | `.env` missing or not loaded | Create `.env` with the key; ensure you're running from the project root |
| `Booking searchDestination HTTP 403` | Key not subscribed to `booking-com15` | Subscribe at https://rapidapi.com/DataCrawler/api/booking-com15/pricing |
| `Agoda auto-complete HTTP 403` | Key not subscribed to `agoda-com` | Subscribe at https://rapidapi.com/ntd119/api/agoda-com/pricing |
| `Agoda: no city match for "..."` | Uncommon spelling or non-resolvable name | Try a canonical city name or the English version |
| Very slow / timeout on Agoda | Upstream flakiness (occasional) | Rerun. 15s timeout kicks in; Booking still returns |
| Daka90 returns challenge HTML if scraped directly | Imperva WAF | Use agent browser (per SKILL.md); don't scrape with plain HTTP |
| `Cannot find module './types.js'` | TS not built | `npm run build` |

---

## License

Personal use. No license declared.
