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

type BookingHotelProperty = {
  name?: string;
  reviewScore?: number;
  reviewScoreWord?: string;
  reviewCount?: number;
  priceBreakdown?: {
    grossPrice?: { value?: number; currency?: string };
    strikethroughPrice?: { value?: number; currency?: string };
  };
  countryCode?: string;
  currency?: string;
  latitude?: number;
  longitude?: number;
  checkinDate?: string;
  checkoutDate?: string;
  ufi?: number;
};

type BookingHotel = {
  hotel_id?: number;
  property?: BookingHotelProperty;
  accessibilityLabel?: string;
};

function headers(): Record<string, string> {
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
  const prop = h.property;
  const name = prop?.name ?? "";
  if (!name) return null;

  const hotelId = h.hotel_id ?? prop?.ufi;
  const grossPrice = prop?.priceBreakdown?.grossPrice;
  const priceTotal = grossPrice?.value ?? null;
  const n = nights(input);
  const pricePerNight = priceTotal !== null ? priceTotal / n : null;

  const currency =
    grossPrice?.currency ??
    prop?.currency ??
    input.currency;

  const orderLink = hotelId
    ? `https://www.booking.com/hotel/xx/${hotelId}.html`
    : "https://www.booking.com/";

  return {
    source: "booking.com",
    name,
    rating: prop?.reviewScore ?? null,
    ratingScale: "0-10",
    ratingRaw: prop?.reviewScore ?? null,
    pricePerNight,
    priceTotal,
    currency,
    orderLink,
    remarks: prop?.reviewScoreWord ?? null,
    address: null,
    city: null,
  };
}

export const searchBooking: SearchFn = async (input) => {
  const dest = await resolveDestination(input.destination);
  const hotels = await fetchHotels(dest, input);
  return hotels.map((h) => mapHotel(h, input)).filter((r): r is HotelResult => r !== null);
};
