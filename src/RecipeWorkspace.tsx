import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FormEvent } from "react";
import { ArrowUpRight, ChefHat, ExternalLink, MapPin, Search, ShoppingBag, Utensils, X } from "lucide-react";

type Meal = {
  idMeal: string;
  strMeal: string;
  strMealThumb: string;
  strCategory?: string;
  strArea?: string;
  strInstructions?: string;
  strYoutube?: string;
  [key: string]: string | undefined;
};

const categories = ["All dishes", "Beef", "Chicken", "Dessert", "Lamb", "Miscellaneous", "Pasta", "Pork", "Seafood", "Side", "Starter", "Vegan", "Vegetarian"];
const providers = [
  { name: "Chowdeck", detail: "Browse restaurants and current menu prices in Accra", url: "https://www.chowdeck.com/store/accra" },
  { name: "Bolt Food", detail: "Find restaurants, meals and delivery options", url: "https://bolt.eu/en-gh/food/" }
];

function mealIngredients(meal: Meal) {
  return Array.from({ length: 20 }, (_, index) => {
    const ingredient = meal["strIngredient" + (index + 1)]?.trim();
    const measure = meal["strMeasure" + (index + 1)]?.trim();
    return ingredient ? { ingredient, measure } : null;
  }).filter((item): item is { ingredient: string; measure: string } => Boolean(item));
}

function mealOrderUrl(mealName: string, location: string) {
  return "https://www.google.com/search?q=" + encodeURIComponent("order " + mealName + " restaurant menu price " + location);
}

export default function RecipeWorkspace() {
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("Accra, Ghana");
  const [category, setCategory] = useState("All dishes");
  const [meals, setMeals] = useState<Meal[]>([]);
  const [selected, setSelected] = useState<Meal | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const detailRequest = useRef(0);

  async function searchMeals(value = search, selectedCategory = category) {
    setLoading(true);
    setError("");
    setSearched(true);
    try {
      const url = selectedCategory !== "All dishes"
        ? "https://www.themealdb.com/api/json/v1/1/filter.php?c=" + encodeURIComponent(selectedCategory)
        : "https://www.themealdb.com/api/json/v1/1/search.php?s=" + encodeURIComponent(value.trim());
      const response = await fetch(url);
      if (!response.ok) throw new Error("Recipe search is temporarily unavailable.");
      const data = await response.json();
      const results = Array.isArray(data.meals) ? data.meals.slice(0, 30) : [];
      setMeals(results);
      if (!results.length) setError("No dishes found. Try another name or category.");
    } catch (reason) {
      setMeals([]);
      setError(reason instanceof Error ? reason.message : "Could not load recipes. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function openMeal(meal: Meal) {
    const requestId = ++detailRequest.current;
    setSelected(meal);
    setDetailError("");
    if (meal.strInstructions) {
      setDetailLoading(false);
      return;
    }
    setDetailLoading(true);
    try {
      const response = await fetch("https://www.themealdb.com/api/json/v1/1/lookup.php?i=" + encodeURIComponent(meal.idMeal));
      if (!response.ok) throw new Error("Could not load recipe details.");
      const data = await response.json();
      const details = data.meals?.[0];
      if (!details) throw new Error("Full recipe details are not available for this dish.");
      if (requestId === detailRequest.current) setSelected(details);
    } catch (reason) {
      if (requestId === detailRequest.current) {
        setDetailError(reason instanceof Error ? reason.message : "Recipe details could not be loaded. Please try again.");
      }
    } finally {
      if (requestId === detailRequest.current) setDetailLoading(false);
    }
  }

  function closePreview() {
    detailRequest.current += 1;
    setSelected(null);
    setDetailLoading(false);
    setDetailError("");
  }

  useEffect(() => {
    void searchMeals("chicken", "All dishes");
  }, []);

  useEffect(() => {
    if (!selected) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePreview();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selected]);

  const orderSearchUrl = mealOrderUrl(search.trim() || "popular meals", location);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCategory("All dishes");
    void searchMeals(search, "All dishes");
  }

  function chooseCategory(value: string) {
    setCategory(value);
    void searchMeals(search, value);
  }

  const preview = selected ? createPortal(
    <div className="recipe-modal-backdrop" onClick={closePreview}>
      <section className="recipe-modal" role="dialog" aria-modal="true" aria-label={selected.strMeal + " recipe"} onClick={event => event.stopPropagation()}>
        <button className="recipe-modal-close" onClick={closePreview} aria-label="Close recipe preview"><X size={19}/></button>
        <img className="recipe-modal-image" src={selected.strMealThumb} alt={selected.strMeal}/>
        <div className="recipe-modal-content">
          <span className="eyebrow">RECIPE PREVIEW</span>
          <h2>{selected.strMeal}</h2>
          <div className="recipe-tags"><span>{selected.strCategory || "Dish"}</span>{selected.strArea && <span>{selected.strArea}</span>}</div>
          {detailLoading ? <div className="recipe-message">Loading full recipe…</div> : detailError ? <div className="recipe-message">{detailError}</div> : <>
            <div className="recipe-ingredients"><h3>Ingredients</h3>{mealIngredients(selected).map((item, index) => <div key={index}><span>{item.ingredient}</span><b>{item.measure}</b></div>)}</div>
            <div className="recipe-instructions"><h3>Preparation</h3><p>{selected.strInstructions || "Full preparation details are not available for this dish."}</p></div>
          </>}
          <div className="recipe-modal-actions">
            <a href={mealOrderUrl(selected.strMeal, location)}>Find ready-made meal <ExternalLink size={14}/></a>
            {selected.strYoutube && <a href={selected.strYoutube}>Watch preparation <ExternalLink size={14}/></a>}
          </div>
        </div>
      </section>
    </div>,
    document.body
  ) : null;

  return (
    <div className="recipe-workspace">
      <div className="recipe-search-panel">
        <div className="recipe-search-heading">
          <div className="recipe-mark"><ChefHat size={21}/></div>
          <div><span className="eyebrow">LUMEN FOOD FINDER</span><h2>What are you craving?</h2><p>Search dishes, explore categories and preview meal details.</p></div>
        </div>
        <form className="recipe-search-form" onSubmit={handleSearch}>
          <Search size={18}/>
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search jollof, pizza, grilled chicken..." aria-label="Search dishes"/>
          <button type="submit" disabled={loading}>{loading ? "Searching…" : "Search dishes"}</button>
        </form>
        <label className="recipe-location"><MapPin size={15}/><span>Ordering location</span><input value={location} onChange={event => setLocation(event.target.value)} placeholder="City or area"/></label>
        <div className="recipe-category-row">{categories.map(item => <button type="button" key={item} className={category === item ? "selected" : ""} onClick={() => chooseCategory(item)}>{item}</button>)}</div>
      </div>

      <div className="recipe-results-heading"><div><span className="eyebrow">DISCOVER MEALS</span><h2>{search.trim() ? "Results for “" + search.trim() + "”" : category === "All dishes" ? "Explore popular dishes" : category + " dishes"}</h2></div><span className="recipe-count">{loading ? "Searching…" : meals.length + " results"}</span></div>
      {error && <div className="recipe-message">{error}</div>}
      {!loading && !error && meals.length > 0 && <div className="recipe-results-grid">{meals.map(meal => <article className="recipe-card" key={meal.idMeal}>
        <button type="button" className="recipe-image-button" onClick={() => void openMeal(meal)} aria-label={"Preview " + meal.strMeal}><img src={meal.strMealThumb} alt={meal.strMeal} loading="lazy"/><span>Preview recipe <ArrowUpRight size={13}/></span></button>
        <div className="recipe-card-body">
          <div className="recipe-tags"><span>{meal.strCategory || "Dish"}</span>{meal.strArea && <span>{meal.strArea}</span>}</div>
          <h3>{meal.strMeal}</h3>
          <div className="recipe-card-actions">
            <button type="button" className="recipe-preview-button" onClick={() => void openMeal(meal)}>View recipe details <ArrowUpRight size={14}/></button>
            <a className="recipe-preview-button" href={mealOrderUrl(meal.strMeal, location)}>Find to order <ExternalLink size={13}/></a>
          </div>
        </div>
      </article>)}</div>}
      {!loading && !error && searched && meals.length === 0 && <div className="recipe-empty"><Utensils size={25}/><b>No matching dishes yet</b><span>Try a different search or choose another category.</span></div>}

      <section className="recipe-order-section">
        <div className="recipe-order-intro"><span className="eyebrow">READY-MADE MEALS</span><h2>Find it. Order it. Enjoy it.</h2><p>Open food providers to browse nearby restaurants, confirm the latest menu price and place an order.</p></div>
        <div className="recipe-order-search"><div><b>Search this dish near you</b><span>{location || "Add your location"} · Prices and delivery fees depend on the restaurant and address.</span></div><a href={orderSearchUrl}>Compare menu results <ExternalLink size={14}/></a></div>
        <div className="recipe-provider-grid">{providers.map(provider => <a className="recipe-provider-card" href={provider.url} key={provider.name}><span className="recipe-provider-icon"><ShoppingBag size={18}/></span><span><b>{provider.name}</b><small>{provider.detail}</small></span><ArrowUpRight size={17}/></a>)}</div>
        <div className="recipe-price-note"><span>PRICE ACCURACY</span><p>Live restaurant prices are not supplied by the public recipe database. Lumen sends you to ordering providers to view the restaurant’s current listed price, availability and delivery fee rather than displaying invented or outdated prices.</p></div>
      </section>
      {preview}
    </div>
  );
}
