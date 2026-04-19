export type SourceName = "booking.com" | "hotels.com";

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
