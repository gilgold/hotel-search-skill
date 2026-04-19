---
name: hotel-search
description: Search hotels across Booking.com, Agoda, and (optionally, for Israel) Daka90. Covers international and Israeli destinations. Use when the user asks about hotel prices, availability, or wants to compare options across sites. Booking and Agoda come from a CLI; Daka90 requires the agent's built-in browser because it's behind Imperva WAF.
---

# Hotel Search

Searches hotels across three sources:
- **Booking.com** — via CLI (RapidAPI wrapper). Reliable, fast, global.
- **Agoda** — via CLI (RapidAPI wrapper). Global + good Israel coverage.
- **Daka90 (דקה 90)** — via your built-in browser control (Imperva WAF blocks plain HTTP). Hebrew/Israeli OTA with strong Israel inventory. **Optional.**

## When to use

- User asks for hotel prices or availability for a destination and date range.
- User wants to compare hotel options across multiple sites.
- User wants a booking link for a specific hotel.

## Step 1 — CLI search (Booking + Agoda)

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
- `--children-ages` comma-separated ages, e.g. `5,12`
- `--rooms` (default 1)
- `--currency` 3-letter ISO (default USD)

### CLI output shape

Stdout is JSON matching `SearchOutput`:

```
{
  "query": { ...echoed input... },
  "results": [
    {
      "source": "booking.com" | "agoda.com",
      "name": string,
      "rating": number | null,          // 0-10 normalized
      "ratingScale": "0-5" | "0-10",
      "ratingRaw": number | null,
      "pricePerNight": number | null,
      "priceTotal": number | null,
      "currency": "USD" | "ILS" | ...,
      "orderLink": string,
      "remarks": string | null,
      "address": string | null,
      "city": string | null
    }
  ],
  "errors": [{ "source": string, "message": string }],
  "timings": [{ "source": string, "ms": number }]
}
```

## Step 2 — Daka90 search via browser (optional, Israel only)

The CLI cannot reach Daka90 (Imperva WAF blocks non-browser traffic). If the destination is in Israel and the user wants Israeli-OTA pricing, use your built-in browser to search daka90.co.il.

### Option A — Direct URL when you know the region ID

Israel search URL template:
```
https://www.daka90.co.il/hotels-israel/search-results?searchType=1&regionId={regionId}&checkInDate={DD-MM-YYYY}&checkOutDate={DD-MM-YYYY}&roomOccCode={code}
```

Parameters:
- `searchType=1` — city/region search (always 1 for destination-level searches)
- `regionId` — numeric city/region ID. Known: `76` (verified example). For other cities, use Option B to discover the ID.
- `checkInDate` / `checkOutDate` — **DD-MM-YYYY** format. Note: day-month-year, NOT ISO.
- `roomOccCode` — room occupancy encoded as a string. Confirmed: `200` = 2 adults, 0 children. Format appears to be `{adults_digit}{children_ages_padded}`; `200` is `2` (adults) + `00` (no kids). With one 8-year-old it's likely `208`, with two kids ages 5 and 12 likely `20512`. Verify via the UI if a user passes children ages — the UI may show the constructed URL.

Example (verified working):
```
https://www.daka90.co.il/hotels-israel/search-results?searchType=1&regionId=76&checkInDate=25-04-2026&checkOutDate=26-04-2026&roomOccCode=200
```

### Option B — Navigate the UI

If you don't know the `regionId`:
1. Open `https://www.daka90.co.il/hotels-israel` in your browser.
2. Type the destination (e.g., `אילת`, `תל אביב`, `ירושלים`) into the search box — the autocomplete will offer matches.
3. Pick the dates and occupancy.
4. Submit. You land on a URL that includes the real `regionId` — remember it for future searches to the same city.

### Extracting hotels from the results page

Once the search-results page is rendered (wait for Imperva challenge to resolve — the agent's browser handles this automatically), scrape each hotel card. Fields to capture per hotel:
- Hotel name
- Price per night (ILS)
- Star rating (if shown)
- Booking link (the "Order" / "Book" button href — typically `/HotelsIsrael/HotelsIsraelOrderStep1.aspx?hotelId=...`)
- Any badges like "special price" or "sold out"

Prepend `https://www.daka90.co.il` to relative links. All prices are in ILS.

Treat each Daka90 hotel as a `HotelResult` with `source: "daka90"`. Slot it into the same presentation grouping as Booking/Agoda results.

### When to skip Daka90

- Destination is not in Israel (Daka90 has mostly Israeli inventory).
- User is in a hurry — the browser step adds 5-10s.
- Browser control isn't available in the current environment.

When skipping, just present CLI results and note that Daka90 wasn't checked.

## Presenting results to the user

**Results come from different sources — group them by hotel.**

1. Collect all results from the CLI (`results[]`) and any Daka90 results you scraped.
2. Group by fuzzy-matching `name` + `city`. Example: "Hilton Tel Aviv" ≈ "הילטון תל אביב" — same hotel.
3. For each hotel group, format as:

```
<Hotel Name>
  - booking.com: $<price>/night, <rating>/10, <link>
  - agoda.com: $<price>/night, <rating>/10, <link>
  - daka90: ₪<price>/night, <rating>/5, <link>
```

4. Booking and Agoda rate on 0-10 natively. Daka90 typically shows 0-5 star ratings. Use whichever scale is authentic for the source.
5. If `errors[]` is non-empty (from the CLI), tell the user which sources failed.
6. Sort hotels by best combined rating or by lowest price — pick what fits the user's question.
7. Agoda returns ~10-15 hotels per search (fewer than Booking's ~20) and takes ~5-10s vs Booking's ~3s. If Agoda fails, Booking results still return — tell the user and suggest rerunning.

## Error handling

- If a CLI source fails, the other still returns. `errors[]` records the failure.
- If both CLI sources fail, `results` is empty — tell the user and include the error messages.
- Missing `RAPIDAPI_KEY` → both CLI sources fail with "RAPIDAPI_KEY is not set".
- If the Daka90 browser step fails or the WAF challenge won't resolve, skip it silently (or mention to the user) — the CLI results are still useful on their own.

## Example flow

User: "Find me a hotel in Eilat for May 1-3, 2 adults."

1. Run the CLI:
   ```bash
   node dist/index.js --destination "Eilat" --check-in 2026-05-01 --check-out 2026-05-03 --adults 2 --currency ILS
   ```
2. Parse the JSON output.
3. Because Eilat is in Israel, open the browser and navigate to the Daka90 search URL (find the regionId for Eilat via the UI if not already known).
4. Scrape the Daka90 hotel cards.
5. Merge + group + present:

> **Isrotel Riviera**
>   - booking.com: ₪1,220/night, 8.5/10, https://www.booking.com/hotel/il/43945.html
>   - agoda.com: ₪1,180/night, 8.4/10, https://www.agoda.com/partners/partnersearch.aspx?hid=...
>   - daka90: ₪1,095/night, 4/5, https://www.daka90.co.il/HotelsIsrael/HotelsIsraelOrderStep1.aspx?hotelId=...
>
> **Club Hotel Eilat**
>   - booking.com: ₪1,749/night, 8.2/10, https://www.booking.com/hotel/il/272331.html
>   - agoda.com: ₪1,700/night, 8.0/10, https://www.agoda.com/...
>
> (Daka90 had additional inventory; Agoda and Booking didn't return a match for those.)
