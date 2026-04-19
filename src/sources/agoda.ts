import type { HotelResult, SearchInput, SearchFn } from "../types.js";

const HOST = "agoda-com.p.rapidapi.com";
const BASE = `https://${HOST}`;

type AutoCompletePlace = {
  id?: number;
  name?: string;
  typeName?: string;
  searchType?: number;
  city?: { id?: number; name?: string };
  country?: { id?: number; name?: string };
};

type AgodaPrice = {
  currency?: string;
  price?: {
    perRoomPerNight?: { inclusive?: { display?: number }; exclusive?: { display?: number } };
    perBook?: { inclusive?: { display?: number }; exclusive?: { display?: number } };
  };
};

type AgodaRoom = { pricing?: AgodaPrice[] };
type AgodaRoomOffer = { room?: AgodaRoom };
type AgodaOffer = { roomOffers?: AgodaRoomOffer[] };

type AgodaProperty = {
  propertyId?: number;
  content?: {
    informationSummary?: {
      localeName?: string;
      defaultName?: string;
      rating?: number;
      address?: {
        country?: { name?: string };
        city?: { name?: string };
        area?: { name?: string };
      };
      hotelCharacter?: { hotelTag?: { name?: string } };
    };
    reviews?: { cumulative?: { score?: number; reviewCount?: number } };
  };
  pricing?: { offers?: AgodaOffer[] };
  enrichment?: { roomInformation?: { cheapestRoomName?: string } };
};

function headers(): Record<string, string> {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) throw new Error("RAPIDAPI_KEY is not set");
  return { "X-RapidAPI-Host": HOST, "X-RapidAPI-Key": key };
}

async function resolveCity(destination: string): Promise<AutoCompletePlace> {
  const url = new URL(`${BASE}/hotels/auto-complete`);
  url.searchParams.set("query", destination);
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`Agoda auto-complete HTTP ${res.status}`);
  const body = await res.json() as { places?: AutoCompletePlace[] };
  const places = body.places ?? [];
  const city = places.find((p) => p.typeName === "City" && p.searchType === 1);
  if (!city || typeof city.id !== "number") {
    throw new Error(`Agoda: no city match for "${destination}"`);
  }
  return city;
}

async function fetchHotels(city: AutoCompletePlace, input: SearchInput): Promise<AgodaProperty[]> {
  const url = new URL(`${BASE}/hotels/search-overnight`);
  url.searchParams.set("id", `1_${city.id}`);
  url.searchParams.set("checkinDate", input.checkIn);
  url.searchParams.set("checkoutDate", input.checkOut);
  url.searchParams.set("adults", String(input.adults));
  url.searchParams.set("rooms", String(input.rooms));
  url.searchParams.set("currency", input.currency);
  url.searchParams.set("locale", "en-us");
  if (input.childrenAges.length > 0) {
    url.searchParams.set("children", String(input.childrenAges.length));
    url.searchParams.set("childrenAges", input.childrenAges.join(","));
  } else if (input.children > 0) {
    url.searchParams.set("children", String(input.children));
  }

  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`Agoda search-overnight HTTP ${res.status}`);
  const body = await res.json() as { data?: { citySearch?: { properties?: AgodaProperty[] } }; status?: boolean; errors?: unknown };
  if (body.status === false) {
    throw new Error(`Agoda search-overnight error: ${JSON.stringify(body.errors)}`);
  }
  return body.data?.citySearch?.properties ?? [];
}

function mapProperty(p: AgodaProperty, input: SearchInput): HotelResult | null {
  const info = p.content?.informationSummary;
  const name = info?.localeName ?? info?.defaultName ?? "";
  if (!name) return null;

  const price0 = p.pricing?.offers?.[0]?.roomOffers?.[0]?.room?.pricing?.[0];
  const perNightInclusive = price0?.price?.perRoomPerNight?.inclusive?.display ?? null;
  const perNightExclusive = price0?.price?.perRoomPerNight?.exclusive?.display ?? null;
  const totalInclusive = price0?.price?.perBook?.inclusive?.display ?? null;
  const totalExclusive = price0?.price?.perBook?.exclusive?.display ?? null;
  const pricePerNight = perNightInclusive ?? perNightExclusive;
  const priceTotal = totalInclusive ?? totalExclusive;
  const currency = price0?.currency ?? input.currency;

  const reviewScore = p.content?.reviews?.cumulative?.score ?? null;

  const orderLink = p.propertyId
    ? `https://www.agoda.com/partners/partnersearch.aspx?cid=1833981&hid=${p.propertyId}&checkIn=${input.checkIn}&checkOut=${input.checkOut}&rooms=${input.rooms}&adults=${input.adults}`
    : "https://www.agoda.com/";

  const remarks =
    info?.hotelCharacter?.hotelTag?.name ??
    p.enrichment?.roomInformation?.cheapestRoomName ??
    null;

  const areaName = info?.address?.area?.name ?? null;
  const cityName = info?.address?.city?.name ?? null;
  const countryName = info?.address?.country?.name ?? null;
  const address = [areaName, cityName, countryName].filter(Boolean).join(", ") || null;

  return {
    source: "agoda.com",
    name,
    rating: reviewScore,
    ratingScale: "0-10",
    ratingRaw: reviewScore,
    pricePerNight,
    priceTotal,
    currency,
    orderLink,
    remarks,
    address,
    city: cityName,
  };
}

export const searchAgoda: SearchFn = async (input) => {
  const city = await resolveCity(input.destination);
  const properties = await fetchHotels(city, input);
  return properties.map((p) => mapProperty(p, input)).filter((r): r is HotelResult => r !== null);
};
