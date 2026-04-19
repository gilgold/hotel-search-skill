---
name: hotel-search
description: Search hotels across Booking.com and Hotels.com in one call. Use when the user asks about hotel prices, availability, or wants to compare options across sites. Returns a flat list of per-site results; agent groups by hotel name when presenting.
---

# Hotel Search

Searches Booking.com and Hotels.com in parallel and returns prices, ratings, and direct booking links.

## When to use

- User asks for hotel prices or availability for a destination and date range.
- User wants to compare hotel options across multiple sites.
- User wants a booking link for a specific hotel.

## How to invoke

Build once, then run from the skill's project directory:

```bash
npm run build   # one-time (or after pulling changes)
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
- `--children-ages` comma-separated ages, e.g. `5,12` — sent to sources that support age-based pricing
- `--rooms` (default 1)
- `--currency` 3-letter ISO (default USD)

## Output shape

Stdout is JSON matching `SearchOutput`:

```
{
  "query": { ...echoed input... },
  "results": [
    {
      "source": "booking.com" | "agoda.com",
      "name": string,
      "rating": number | null,          // 0-10 normalized
      "ratingScale": "0-5" | "0-10",    // original scale
      "ratingRaw": number | null,       // original value
      "pricePerNight": number | null,
      "priceTotal": number | null,
      "currency": "USD" | ...,
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

**Results are a flat list — you must group by hotel.**

1. Group results by fuzzy-matching `name` + `city`. Example: "Hilton Paris Opera" ≈ "Hilton Paris Opera Hotel" — same hotel.
2. For each hotel group, format as:

```
<Hotel Name>
  - booking.com: $<price>/night, <rating>/10, <link>
  - agoda.com: $<price>/night, <rating>/10, <link>
```

3. Both sources here rate on a 0-10 scale natively, so present `rating` as `<N>/10`.
4. If `errors[]` is non-empty, tell the user which sources failed after listing results.
5. Sort hotels by best combined rating or by lowest price — pick what fits the user's question.
6. Hotels.com's upstream API is occasionally flaky (intermittent 400/502). If only Booking results come back, mention that Hotels.com failed and suggest the user rerun if they want both.

## Error handling

- If a source fails, the other still returns. `errors[]` records the failure.
- If both fail, `results` is empty — tell the user and include the error messages.
- Missing `RAPIDAPI_KEY` → both sources fail with "RAPIDAPI_KEY is not set".

## Example

```bash
node dist/index.js --destination "Paris" --check-in 2026-05-01 --check-out 2026-05-03 --adults 2 --children 1 --children-ages 8
```

Then tell the user something like:

> **Hilton Paris Opera**
>   - booking.com: $513/night, 7.6/10, https://www.booking.com/hotel/fr/54642.html
>   - agoda.com: $498/night, 8.0/10, https://www.agoda.com/ho...
>
> **La Demeure Montaigne**
>   - booking.com: $685/night, 9.0/10, https://www.booking.com/hotel/fr/7786014.html
>
> (Hotels.com had 20 additional results but didn't overlap with Booking's list here.)
