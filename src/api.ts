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