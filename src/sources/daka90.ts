/**
 * Daka90 scraper — Israeli OTA (https://www.daka90.co.il)
 *
 * The site is behind Imperva/Incapsula WAF + hCaptcha challenge, so plain
 * HTTP fetch is blocked.  We launch a headless Chromium browser via
 * Playwright, navigate to the destination landing page (which solves the WAF
 * JS challenge automatically), then call the internal JSON API from within
 * the browser session (where the session cookies are already set).
 *
 * API endpoint discovered by network inspection:
 *   GET /HttpHandlers/HotelsIsrael/HotelsIsraelSearchResults.ashx
 *   params: searchType, regionId, checkInDate (DD-MM-YYYY), checkOutDate, roomOccCode, _randomValue
 */

import type { HotelResult, SearchInput, SearchFn } from "../types.js";

const BASE_URL = "https://www.daka90.co.il";
const ASHX_PATH = "/HttpHandlers/HotelsIsrael/HotelsIsraelSearchResults.ashx";

// Mapping of common English/Hebrew destination names to Daka90 regionId values.
// Source: /Include/json/searchEngineCombos_hotelsIsrael.js
const REGION_MAP: Record<string, number> = {
  // English aliases
  eilat: 76,
  "eilat region": 76,
  ashkelon: 84,
  "ashkelon region": 84,
  galilee: 83,
  "upper galilee": 83,
  "golan heights": 83,
  haifa: 81,
  "haifa and galilee": 81,
  tiberias: 82,
  "sea of galilee": 82,
  kinneret: 82,
  "dead sea": 78,
  jerusalem: 79,
  negev: 77,
  netanya: 86,
  herzliya: 86,
  "sharon region": 86,
  "tel aviv": 80,
  "tel-aviv": 80,
  // Hebrew region names (transliterated)
  "אילת": 76,
  "אשקלון": 84,
  "גליל עליון": 83,
  "חיפה": 81,
  "טבריה": 82,
  "ים המלח": 78,
  "ירושלים": 79,
  "נגב": 77,
  "נתניה": 86,
  "תל אביב": 80,
};

function resolveRegionId(destination: string): number {
  const key = destination.trim().toLowerCase();
  if (REGION_MAP[key] !== undefined) return REGION_MAP[key];

  // Try partial match
  for (const [mapKey, id] of Object.entries(REGION_MAP)) {
    if (key.includes(mapKey) || mapKey.includes(key)) return id;
  }

  throw new Error(
    `Daka90: unrecognized destination "${destination}". ` +
      `Supported: ${Object.keys(REGION_MAP).filter(k => !/[\u0590-\u05FF]/.test(k)).join(", ")}`
  );
}

/** Convert YYYY-MM-DD to DD-MM-YYYY (Daka90 format) */
function toDaka90Date(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

/** Build roomOccCode from adults + children.
 *  Format observed: 2 adults = "200", 1 adult = "100", etc.
 *  Children and infants are added as units in the tens/ones digits, but
 *  the simplest confirmed mapping: adults * 100 + children * 10 + infants.
 */
function buildRoomOccCode(adults: number, children: number): string {
  return String(adults * 100 + children * 10);
}

function nights(input: SearchInput): number {
  const a = new Date(input.checkIn + "T00:00:00Z").getTime();
  const b = new Date(input.checkOut + "T00:00:00Z").getTime();
  return Math.max(1, Math.round((b - a) / (1000 * 60 * 60 * 24)));
}

// ---------- Daka90 JSON types ----------

interface Daka90Link {
  url: string;
  uiPageId?: number;
}

interface Daka90MatchingProduct {
  price: number;
  currency: { id: string; symbol: string };
  boardBasis?: { id: string; name: string };
  roomType?: { id: string; name: string };
  isFastOk?: boolean;
  isSpecialPrice?: boolean;
  remark?: string | null;
}

interface Daka90HotelData {
  id: number;
  name: string;
  stars: string;
  address: string;
  city?: { id: number; name: string };
}

interface Daka90DurationData {
  checkInDate: string;
  checkOutDate: string;
  serviceLength: string;
}

interface Daka90ResultItem {
  links: Daka90Link[];
  hotelData: Daka90HotelData;
  durationData: Daka90DurationData;
  matchingProduct: Daka90MatchingProduct;
}

interface Daka90SearchResponse {
  pagerData?: { totalResults: number; pageSize: number; pageSelected: number };
  resultsData?: {
    resultsGroups?: {
      recommendation?: Daka90ResultItem[];
      other?: Daka90ResultItem[];
    };
  };
}

// ---------- Mapper ----------

function mapHotel(item: Daka90ResultItem, input: SearchInput): HotelResult | null {
  const name = item.hotelData?.name?.trim();
  if (!name) return null;

  const product = item.matchingProduct;
  const priceTotal = product?.price ?? null;
  const n = nights(input);
  const pricePerNight = priceTotal !== null ? priceTotal / n : null;

  const starsRaw = parseFloat(item.hotelData?.stars ?? "0");
  // Treat 0 as unrated (not a 0-star hotel) — Daka90 returns 0 when not set
  const ratingRaw = !isNaN(starsRaw) && starsRaw > 0 ? starsRaw : null;
  // Stars 0-5 scale: normalize to 0-10
  const rating = ratingRaw !== null ? ratingRaw * 2 : null;

  const rawUrl = item.links?.[0]?.url ?? "";
  const orderLink = rawUrl
    ? rawUrl.startsWith("http")
      ? rawUrl
      : BASE_URL + rawUrl
    : BASE_URL + "/";

  return {
    source: "daka90",
    name,
    rating,
    ratingScale: "0-5",
    ratingRaw,
    pricePerNight,
    priceTotal,
    currency: "ILS",
    orderLink,
    remarks: product?.boardBasis?.name ?? null,
    address: item.hotelData?.address ?? null,
    city: item.hotelData?.city?.name ?? null,
  };
}

// ---------- Fetch via Playwright ----------

async function fetchDaka90Results(
  regionId: number,
  input: SearchInput
): Promise<Daka90ResultItem[]> {
  const { chromium } = await import("playwright");

  const checkIn = toDaka90Date(input.checkIn);
  const checkOut = toDaka90Date(input.checkOut);
  const roomOccCode = buildRoomOccCode(input.adults, input.children);

  // Landing page URL — navigating here causes the browser to solve the
  // Imperva WAF JS challenge and receive the necessary session cookies.
  const landingUrl =
    `${BASE_URL}/hotels-israel/eilat` +
    `?checkInDate=${checkIn}&checkOutDate=${checkOut}&roomOccCode=${roomOccCode}`;

  // ASHX JSON API URL (called from within the browser to reuse its cookies)
  const apiParams = new URLSearchParams({
    searchType: "1",
    regionId: String(regionId),
    checkInDate: checkIn,
    checkOutDate: checkOut,
    roomOccCode,
    _randomValue: String(Math.floor(Math.random() * 1_000_000)),
  });
  const apiUrl = `${BASE_URL}${ASHX_PATH}?${apiParams.toString()}`;

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      locale: "he-IL",
      extraHTTPHeaders: {
        "Accept-Language": "he,en;q=0.8",
      },
    });

    const page = await context.newPage();

    // Navigate to the landing page — this triggers WAF JS challenge resolution
    await page.goto(landingUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });

    // The hCaptcha challenge appears only for blocked IPs; if presented, click it.
    try {
      const captchaFrame = page.frameLocator('iframe[title*="hCaptcha"]');
      const checkbox = captchaFrame.locator('[id^="checkbox"]');
      if (await checkbox.isVisible({ timeout: 3_000 })) {
        await checkbox.click();
        await page.waitForURL(/daka90\.co\.il\/hotels-israel/, { timeout: 15_000 });
      }
    } catch {
      // No captcha — proceed normally
    }

    // Wait briefly for the page to set all Imperva session cookies
    await page.waitForTimeout(1_500);

    // Call the ASHX JSON API from within the browser context (uses session cookies)
    const jsonData = await page.evaluate(async (url: string) => {
      const res = await fetch(url, {
        headers: {
          Accept: "application/json, text/plain, */*",
          "X-Requested-With": "XMLHttpRequest",
        },
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(`Daka90 ASHX API HTTP ${res.status}`);
      }
      return res.json() as Promise<unknown>;
    }, apiUrl);

    const data = jsonData as Daka90SearchResponse;
    const groups = data?.resultsData?.resultsGroups ?? {};
    const recommendation: Daka90ResultItem[] = groups.recommendation ?? [];
    const other: Daka90ResultItem[] = groups.other ?? [];
    return [...recommendation, ...other];
  } finally {
    await browser.close();
  }
}

// ---------- Exported search function ----------

export const searchDaka90: SearchFn = async (input) => {
  const regionId = resolveRegionId(input.destination);
  const items = await fetchDaka90Results(regionId, input);
  return items
    .map((item) => mapHotel(item, input))
    .filter((r): r is HotelResult => r !== null);
};
