export type SearchItem = {
  title: string;
  description: string;
  url: string;
  image?: string;
  source: string;
};

export async function searchWikipedia(query: string): Promise<SearchItem[]> {
  const response = await fetch("https://en.wikipedia.org/w/rest.php/v1/search/page?q=" + encodeURIComponent(query) + "&limit=8");
  if (!response.ok) throw new Error("Wikipedia search is unavailable right now.");
  const data = await response.json();
  return (data.pages || []).map((item: any) => ({
    title: item.title,
    description: item.description || item.excerpt?.replace(/<[^>]*>/g, "") || "Open this topic to explore more.",
    url: "https://en.wikipedia.org/wiki/" + encodeURIComponent(item.key),
    image: item.thumbnail?.url,
    source: "Wikipedia"
  }));
}

export async function searchHackerNews(query: string): Promise<SearchItem[]> {
  const response = await fetch("https://hn.algolia.com/api/v1/search?query=" + encodeURIComponent(query) + "&tags=story");
  if (!response.ok) throw new Error("Hacker News search is unavailable right now.");
  const data = await response.json();
  return (data.hits || []).slice(0, 8).map((item: any) => ({
    title: item.title || "Untitled discussion",
    description: item.story_text || item.author || "Community discussion",
    url: item.url || "https://news.ycombinator.com/item?id=" + item.objectID,
    source: "Hacker News"
  }));
}

export async function searchCommonsImages(query: string): Promise<SearchItem[]> {
  const params = new URLSearchParams({ action: "query", generator: "search", gsrsearch: query + " filetype:bitmap", gsrnamespace: "6", gsrlimit: "18", prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: "640", format: "json", origin: "*" });
  const response = await fetch("https://commons.wikimedia.org/w/api.php?" + params.toString());
  if (!response.ok) throw new Error("Image discovery is unavailable right now.");
  const data = await response.json();
  return Object.values(data.query?.pages || {}).map((page: any) => ({
    title: page.title?.replace(/^File:/, "") || "Untitled image",
    description: page.imageinfo?.[0]?.extmetadata?.ImageDescription?.value?.replace(/<[^>]*>/g, "").slice(0, 220) || "Open the original Wikimedia Commons file for details and licensing.",
    url: page.imageinfo?.[0]?.descriptionurl || "https://commons.wikimedia.org/wiki/" + encodeURIComponent(page.title),
    image: page.imageinfo?.[0]?.thumburl || page.imageinfo?.[0]?.url,
    source: "Wikimedia Commons"
  }));
}

export async function searchArchiveVideos(query: string): Promise<SearchItem[]> {
  const params = new URLSearchParams({ q: query + " AND mediatype:movies", fl: ["identifier", "title", "description", "creator", "year"].join(","), rows: "18", page: "1", output: "json" });
  const response = await fetch("https://archive.org/advancedsearch.php?" + params.toString());
  if (!response.ok) throw new Error("Video discovery is unavailable right now.");
  const data = await response.json();
  return (data.response?.docs || []).map((item: any) => ({
    title: item.title || "Untitled video",
    description: [item.creator, item.year, typeof item.description === "string" ? item.description.replace(/<[^>]*>/g, "").slice(0, 180) : ""].filter(Boolean).join(" · ") || "Open this Internet Archive video.",
    url: "https://archive.org/details/" + encodeURIComponent(item.identifier),
    image: "https://archive.org/services/img/" + encodeURIComponent(item.identifier),
    source: "Internet Archive"
  }));
}

export async function getWeather(place: string) {
  const geo = await fetch("https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent(place) + "&count=1&language=en&format=json");
  if (!geo.ok) throw new Error("Location search failed.");
  const location = (await geo.json()).results?.[0];
  if (!location) throw new Error("Location not found. Try another place.");
  const forecast = await fetch("https://api.open-meteo.com/v1/forecast?latitude=" + location.latitude + "&longitude=" + location.longitude + "&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto");
  if (!forecast.ok) throw new Error("Weather data is unavailable.");
  return { location, data: await forecast.json() };
}

export async function getCurrency(base: string, target: string) {
  const response = await fetch("https://api.frankfurter.dev/v1/latest?base=" + encodeURIComponent(base) + "&symbols=" + encodeURIComponent(target));
  if (!response.ok) throw new Error("Currency conversion is unavailable.");
  return response.json();
}

export async function getPokemon(name: string) {
  const response = await fetch("https://pokeapi.co/api/v2/pokemon/" + encodeURIComponent(name.toLowerCase()));
  if (!response.ok) throw new Error("That Pokémon could not be found.");
  return response.json();
}

export async function getDictionary(word: string) {
  const response = await fetch("https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(word));
  if (!response.ok) throw new Error("No dictionary entry found for that word.");
  return response.json();
}

export async function getHoliday(country: string, year: number) {
  const response = await fetch("https://date.nager.at/api/v3/PublicHolidays/" + year + "/" + encodeURIComponent(country.toUpperCase()));
  if (!response.ok) throw new Error("Holiday data is unavailable for that country and year.");
  return response.json();
}