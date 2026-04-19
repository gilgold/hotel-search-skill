import type { HotelResult, SearchInput, SearchFn } from "../types.js";

const HOST = "hotels-com6.p.rapidapi.com";
const BASE = `https://${HOST}`;

type AutoCompleteRegion = {
  gaiaId?: string;
  locationId?: string;
  type?: string;
  regionNames?: { fullName?: string; shortName?: string };
};

type LodgingCardBadge = {
  text?: string | null;
};

type LodgingCardPhrasePart = {
  text?: string | null;
};

type LodgingCardPhrase = {
  phraseParts?: LodgingCardPhrasePart[];
};

type LodgingCardRating = {
  badge?: LodgingCardBadge;
  phrases?: LodgingCardPhrase[];
};

type LodgingCardSummarySection = {
  guestRatingSectionV2?: LodgingCardRating | null;
};

type LodgingEnrichedMessage = {
  value?: string;
  state?: string;
};

type PriceDisplayMessage = {
  lineItems?: LodgingEnrichedMessage[];
};

type PropertyPriceOption = {
  formattedDisplayPrice?: string;
  accessibilityLabel?: string;
};

type LodgingCardPriceSummary = {
  displayMessagesV2?: PriceDisplayMessage[];
  optionsV2?: PropertyPriceOption[];
};

type LodgingCardPriceSection = {
  priceSummary?: LodgingCardPriceSummary;
};

type HeadingMessage = {
  text?: string;
};

type HeadingSection = {
  heading?: string;
  messages?: HeadingMessage[];
};

type CardLinkResource = {
  value?: string;
};

type CardLink = {
  resource?: CardLinkResource;
};

type LodgingCard = {
  __typename?: string;
  id?: string;
  headingSection?: HeadingSection;
  summarySections?: LodgingCardSummarySection[];
  priceSection?: LodgingCardPriceSection;
  cardLink?: CardLink;
};

function headers(): Record<string, string> {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) throw new Error("RAPIDAPI_KEY is not set");
  return {
    "X-RapidAPI-Host": HOST,
    "X-RapidAPI-Key": key,
  };
}

async function resolveRegion(destination: string): Promise<AutoCompleteRegion> {
  const url = new URL(`${BASE}/hotels/auto-complete`);
  url.searchParams.set("query", destination);
  url.searchParams.set("domain", "US");
  url.searchParams.set("locale", "en_US");
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`Hotels.com auto-complete HTTP ${res.status}`);
  const body = await res.json() as { data?: { sr?: AutoCompleteRegion[] }; status?: boolean };
  const regions = body.data?.sr ?? [];
  // Prefer CITY type, otherwise take first
  const city = regions.find((r) => r.type === "CITY") ?? regions[0];
  if (!city) throw new Error(`Hotels.com: no region match for "${destination}"`);
  return city;
}

async function fetchHotels(region: AutoCompleteRegion, input: SearchInput): Promise<LodgingCard[]> {
  const locationId = region.locationId ?? region.gaiaId;
  if (!locationId) throw new Error("Hotels.com: no locationId found for region");

  const url = new URL(`${BASE}/hotels/search`);
  url.searchParams.set("locationId", locationId);
  url.searchParams.set("checkinDate", input.checkIn);
  url.searchParams.set("checkoutDate", input.checkOut);
  url.searchParams.set("adults_number", String(input.adults));
  url.searchParams.set("locale", "en_US");
  url.searchParams.set("domain", "US");
  // Note: omitting currency param — including it causes 502 from upstream
  // Prices are returned in USD by default for the US domain

  if (input.childrenAges.length > 0) {
    url.searchParams.set("children_ages", input.childrenAges.join(","));
  } else if (input.children > 0) {
    url.searchParams.set("children_ages", Array(input.children).fill(8).join(","));
  }

  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`Hotels.com hotels/search HTTP ${res.status}`);
  const body = await res.json() as {
    data?: { propertySearchListings?: LodgingCard[] } | null;
    status?: boolean;
    errors?: unknown;
  };
  if (!body.status) {
    throw new Error(`Hotels.com hotels/search error: ${JSON.stringify(body.errors)}`);
  }
  const listings = body.data?.propertySearchListings ?? [];
  return listings.filter((l) => l.__typename === "LodgingCard");
}

/**
 * Parse a formatted price string like "$1,802" or "€806" into a number.
 * Returns null if parsing fails.
 */
function parsePriceString(formatted: string | undefined | null): number | null {
  if (!formatted) return null;
  // Remove currency symbols, commas, spaces — keep digits and decimal point
  const cleaned = formatted.replace(/[^0-9.]/g, "");
  const val = parseFloat(cleaned);
  return isNaN(val) ? null : val;
}

function nights(input: SearchInput): number {
  const a = new Date(input.checkIn + "T00:00:00Z").getTime();
  const b = new Date(input.checkOut + "T00:00:00Z").getTime();
  return Math.max(1, Math.round((b - a) / (1000 * 60 * 60 * 24)));
}

function mapHotel(h: LodgingCard, input: SearchInput): HotelResult | null {
  const name = h.headingSection?.heading ?? "";
  if (!name) return null;

  // City from first heading message
  const city = h.headingSection?.messages?.[0]?.text ?? null;

  // Rating from first summary section — Hotels.com rates 0-10 natively
  const summarySection = h.summarySections?.[0];
  const grs = summarySection?.guestRatingSectionV2;
  const ratingText = grs?.badge?.text ?? null;
  const ratingRaw = ratingText ? parseFloat(ratingText) : null;
  const ratingNormalized = ratingRaw !== null && !isNaN(ratingRaw) ? ratingRaw : null;

  // Remarks from first phrase part
  const phrases = grs?.phrases ?? [];
  const remarks = phrases[0]?.phraseParts?.[0]?.text ?? null;

  // Price — prefer nightly from displayMessagesV2, fallback to total / nights
  const priceSummary = h.priceSection?.priceSummary;
  const displayMsgs = priceSummary?.displayMessagesV2 ?? [];

  let nightlyStr: string | null = null;
  for (const dm of displayMsgs) {
    for (const li of dm.lineItems ?? []) {
      const val = li.value ?? "";
      if (val.toLowerCase().includes("nightly")) {
        nightlyStr = val;
        break;
      }
    }
    if (nightlyStr) break;
  }

  const opts = priceSummary?.optionsV2 ?? [];
  const totalStr = opts[0]?.formattedDisplayPrice ?? null;
  const priceTotal = parsePriceString(totalStr);
  const n = nights(input);

  let pricePerNight: number | null = null;
  if (nightlyStr) {
    pricePerNight = parsePriceString(nightlyStr);
  } else if (priceTotal !== null) {
    pricePerNight = priceTotal / n;
  }

  // Currency comes from input (prices displayed in requested currency for US domain)
  const currency = input.currency;

  // Order link — use the real hotels.com URL from cardLink, keeping only booking params
  const rawUrl = h.cardLink?.resource?.value ?? "";
  let orderLink = "https://www.hotels.com/";
  if (rawUrl && rawUrl.startsWith("https://")) {
    try {
      const parsed = new URL(rawUrl);
      // Keep only essential booking params, strip tracking
      const keep = ["chkin", "chkout", "rm1"];
      const newParams = new URLSearchParams();
      for (const k of keep) {
        const v = parsed.searchParams.get(k);
        if (v) newParams.set(k, v);
      }
      orderLink = `${parsed.origin}${parsed.pathname}?${newParams.toString()}`;
    } catch {
      orderLink = rawUrl.split("?")[0] ?? "https://www.hotels.com/";
    }
  }

  return {
    source: "hotels.com",
    name,
    rating: ratingNormalized,
    ratingScale: "0-10",
    ratingRaw,
    pricePerNight,
    priceTotal,
    currency,
    orderLink,
    remarks: remarks ?? null,
    address: null,
    city,
  };
}

export const searchHotelsCom: SearchFn = async (input) => {
  const region = await resolveRegion(input.destination);
  const hotels = await fetchHotels(region, input);
  return hotels
    .map((h) => mapHotel(h, input))
    .filter((r): r is HotelResult => r !== null);
};
