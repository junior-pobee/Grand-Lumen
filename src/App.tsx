import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowDownToLine, ArrowLeft, ArrowRight, Atom, BookOpen, Bookmark, Boxes, Calculator, Check, ChevronDown, CircleHelp, Code2, Compass, Copy, Database, ExternalLink, FileText, FlaskConical, Globe2, GraduationCap, Image, Languages, Layers3, Library, Menu, Moon, Play, Plus, Search, Settings, ShieldCheck, Sparkles, Sun, Terminal, Video, Wallet, X, Zap } from "lucide-react";
import { getCurrency, getDictionary, getHoliday, getPokemon, getWeather, searchArchiveVideos, searchCommonsImages, searchHackerNews, searchWikipedia, type SearchItem } from "./api";

type Section = "Home" | "Search" | "Research" | "Images" | "Videos" | "Code Lab" | "Learn" | "API Library" | "Tools" | "Saved" | "Projects" | "Settings";
const sections: { name: Section; icon: any; group: string }[] = [
  { name: "Home", icon: Compass, group: "Workspace" },
  { name: "Search", icon: Search, group: "Workspace" },
  { name: "Research", icon: FlaskConical, group: "Workspace" },
  { name: "Images", icon: Image, group: "Explore" },
  { name: "Videos", icon: Video, group: "Explore" },
  { name: "Code Lab", icon: Code2, group: "Create" },
  { name: "Learn", icon: GraduationCap, group: "Create" },
  { name: "API Library", icon: Database, group: "Discover" },
  { name: "Tools", icon: Calculator, group: "Discover" },
  { name: "Saved", icon: Bookmark, group: "Personal" },
  { name: "Projects", icon: Boxes, group: "Personal" },
  { name: "Settings", icon: Settings, group: "Personal" }
];
const apiCatalog = [
  ["Wikipedia","Knowledge and encyclopedic search","Knowledge","No key"],
  ["Hacker News","Technology stories and community discussions","Technology","No key"],
  ["Open-Meteo","Weather forecasts and climate data","Environment","No key"],
  ["Frankfurter","Foreign exchange reference rates","Finance","No key"],
  ["PokéAPI","Pokémon species, abilities and game data","Entertainment","No key"],
  ["TheMealDB","Meals, recipes and ingredients","Food","No key"],
  ["Dictionary API","English definitions and phonetics","Language","No key"],
  ["Nager.Date","Public holidays across countries","Utilities","No key"],
  ["World Bank","Global development indicators","Research","No key"],
  ["REST Countries","Country profiles and geographic data","Geography","No key"],
  ["GitHub API","Repositories, users and development data","Development","Rate limited"],
  ["npm Registry","JavaScript package information","Development","No key"],
  ["Stack Exchange","Technical questions and answers","Development","Rate limited"],
  ["DEV Community","Developer articles and discussions","Technology","No key"],
  ["NASA Open APIs","Space and astronomy information","Science","Key required for some endpoints"],
  ["Guardian Open Platform","News and editorial archives","News","Key required"],
  ["Unsplash","Photography and visual discovery","Images","Key required"],
  ["Pexels","Photos and video discovery","Media","Key required"],
  ["Pixabay","Images, illustrations and media","Media","Key required"],
  ["Hugging Face","Open machine-learning models and datasets","AI","Varies"]
];
const languages = ["HTML","CSS","JavaScript","TypeScript","Python","C","C++","Java","C#","Go","Rust","PHP","Ruby","SQL","Bash"];
const starterCode: Record<string, string> = {
  HTML: "<!doctype html>\n<html>\n  <head>\n    <title>My Grand-Lumen Project</title>\n  </head>\n  <body>\n    <h1>Hello, Grand-Lumen!</h1>\n    <p>Build something remarkable.</p>\n  </body>\n</html>",
  CSS: "body {\n  font-family: system-ui, sans-serif;\n  background: #080d1b;\n  color: white;\n  padding: 3rem;\n}",
  JavaScript: "const vision = \"Build beyond limits\";\nconsole.log(vision);",
  TypeScript: "type Project = {\n  name: string;\n  status: \"building\" | \"ready\";\n};\n\nconst project: Project = { name: \"Grand-Lumen\", status: \"building\" };\nconsole.log(project);",
  Python: "project = \"Grand-Lumen\"\nprint(f\"Welcome to {project}\")",
  C: "#include <stdio.h>\n\nint main(void) {\n    printf(\"Hello, Grand-Lumen!\\n\");\n    return 0;\n}",
  "C++": "#include <iostream>\n\nint main() {\n    std::cout << \"Hello, Grand-Lumen!\\n\";\n    return 0;\n}",
  Java: "public class Main {\n    public static void main(String[] args) {\n        System.out.println(\"Hello, Grand-Lumen!\");\n    }\n}",
  "C#": "using System;\n\nclass Program {\n    static void Main() {\n        Console.WriteLine(\"Hello, Grand-Lumen!\");\n    }\n}",
  Go: "package main\n\nimport \"fmt\"\n\nfunc main() {\n    fmt.Println(\"Hello, Grand-Lumen!\")\n}",
  Rust: "fn main() {\n    println!(\"Hello, Grand-Lumen!\");\n}",
  PHP: "<?php\necho \"Hello, Grand-Lumen!\";\n",
  Ruby: "puts \"Hello, Grand-Lumen!\"",
  SQL: "SELECT 'Hello, Grand-Lumen!' AS message;",
  Bash: "printf '%s\\n' 'Hello, Grand-Lumen!'"
};
const toolCards = [
  ["Calculator","A quick arithmetic workspace",Calculator],
  ["Dictionary","Definitions, phonetics and meanings",BookOpen],
  ["Weather","Current conditions and forecast",Globe2],
  ["Currency","Live reference-rate conversion",Wallet],
  ["Pokédex","Explore Pokémon data",Atom],
  ["Public Holidays","Explore national holiday calendars",Activity]
] as const;

function App() {
  const [section, setSection] = useState<Section>("Home");
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("INITIALIZING GRAND-LUMEN");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [mediaResults, setMediaResults] = useState<SearchItem[]>([]);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<SearchItem[]>(() => JSON.parse(localStorage.getItem("grandLumenSaved") || "[]"));
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [apiFilter, setApiFilter] = useState("All");
  const [tool, setTool] = useState("Calculator");
  const [toolInput, setToolInput] = useState("");
  const [toolOutput, setToolOutput] = useState<any>(null);
  const [currencyBase, setCurrencyBase] = useState("USD");
  const [currencyTarget, setCurrencyTarget] = useState("GHS");
  const [codeLanguage, setCodeLanguage] = useState("HTML");
  const [code, setCode] = useState(starterCode.HTML);
  const [preview, setPreview] = useState(false);
  const [researchNotes, setResearchNotes] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projects, setProjects] = useState<string[]>(() => JSON.parse(localStorage.getItem("grandLumenProjects") || "[]"));

  useEffect(() => {
    const messages = ["INITIALIZING GRAND-LUMEN", "LOADING WORKSPACE MODULES", "CONNECTING KNOWLEDGE SYSTEMS", "PREPARING YOUR CREATIVE SPACE", "WELCOME TO GRAND-LUMEN"];
    let value = 0;
    const interval = window.setInterval(() => {
      value = Math.min(100, value + 4 + Math.random() * 9);
      setProgress(value);
      setStatus(messages[Math.min(messages.length - 1, Math.floor(value / 25))]);
      if (value >= 100) {
        window.clearInterval(interval);
        window.setTimeout(() => setLoading(false), 450);
      }
    }, 85);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    localStorage.setItem("grandLumenSaved", JSON.stringify(saved));
  }, [saved]);
  useEffect(() => {
    localStorage.setItem("grandLumenProjects", JSON.stringify(projects));
  }, [projects]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const filteredApis = useMemo(() => apiCatalog.filter(item => (apiFilter === "All" || item[2] === apiFilter) && item.join(" ").toLowerCase().includes(query.toLowerCase())), [apiFilter, query]);

  async function runSearch(source: "all" | "wiki" | "hn" = "all") {
    if (!query.trim()) return;
    setBusy(true);
    setError("");
    setResults([]);
    try {
      const tasks = source === "wiki" ? [searchWikipedia(query)] : source === "hn" ? [searchHackerNews(query)] : [searchWikipedia(query), searchHackerNews(query)];
      const groups = await Promise.all(tasks);
      setResults(groups.flat());
      if (!groups.flat().length) setError("No results found. Try a different search phrase.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function runMediaSearch(kind: "images" | "videos", value = query) {
    if (!value.trim()) {
      setError("Enter a topic to search.");
      return;
    }
    setMediaBusy(true);
    setError("");
    setMediaResults([]);
    try {
      const items = kind === "images" ? await searchCommonsImages(value.trim()) : await searchArchiveVideos(value.trim());
      setMediaResults(items);
      if (!items.length) setError("No media results found. Try another search.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Media search failed. Please try again.");
    } finally {
      setMediaBusy(false);
    }
  }

  function toggleSave(item: SearchItem) {
    setSaved(current => current.some(savedItem => savedItem.url === item.url) ? current.filter(savedItem => savedItem.url !== item.url) : [item, ...current]);
  }

  function changeLanguage(value: string) {
    setCodeLanguage(value);
    setCode(starterCode[value] || "");
    setPreview(false);
  }

  async function runTool() {
    setBusy(true);
    setError("");
    setToolOutput(null);
    try {
      if (tool === "Calculator") {
        const safe = toolInput.replace(/[^0-9+\-*/().% ]/g, "");
        if (!safe.trim()) throw new Error("Enter a mathematical expression.");
        const result = Function("return (" + safe + ")")();
        if (!Number.isFinite(result)) throw new Error("The expression did not produce a finite number.");
        setToolOutput({ result });
      }
      if (tool === "Dictionary") setToolOutput(await getDictionary(toolInput.trim()));
      if (tool === "Weather") setToolOutput(await getWeather(toolInput.trim()));
      if (tool === "Currency") setToolOutput(await getCurrency(currencyBase, currencyTarget));
      if (tool === "Pokédex") {
        const data = await getPokemon(toolInput.trim());
        setToolOutput({ name: data.name, id: data.id, height: data.height, weight: data.weight, image: data.sprites?.front_default, types: data.types?.map((entry: any) => entry.type.name) });
      }
      if (tool === "Public Holidays") setToolOutput(await getHoliday(toolInput.trim() || "GH", new Date().getFullYear()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The tool could not complete this request.");
    } finally {
      setBusy(false);
    }
  }

  function selectSection(value: Section) {
    setSection(value);
    setMobileMenu(false);
    setError("");
    setResults([]);
    setToolOutput(null);
  }

  const heading: Record<Section, string> = {
    Home: "Explore beyond.",
    Search: "Find what matters.",
    Research: "Think deeper.",
    Images: "A visual universe.",
    Videos: "Watch and discover.",
    "Code Lab": "Build anything.",
    Learn: "Knowledge, expanded.",
    "API Library": "Connect the world.",
    Tools: "Tools for curious minds.",
    Saved: "Your knowledge vault.",
    Projects: "Your creation space.",
    Settings: "Shape your workspace."
  };

  return (
    <>
      {loading && <div id="lumen-loading-screen">
        <div className="ls-logo">LUMEN<span>.</span></div>
        <div className="ls-spinner-container"><div className="ls-spinner-ring" /><div className="ls-spinner-core" /></div>
        <div className="ls-progress-bar-bg"><div className="ls-progress-bar-fill" style={{ width: progress + "%" }} /></div>
        <div className="ls-status-text">{status}</div>
        <div className="ls-credit">A NEW WORLD OF POSSIBILITIES</div>
      </div>}
      <div className="app-shell">
        <aside className={mobileMenu ? "sidebar open" : "sidebar"}>
          <div className="brand"><span className="brand-mark">L</span><div><strong>GRAND-LUMEN</strong><small>EXPLORE BEYOND</small></div></div>
          <div className="workspace-label">WORKSPACE</div>
          <nav className="side-nav">
            {sections.map(item => {
              const Icon = item.icon;
              return <button key={item.name} className={section === item.name ? "nav-item active" : "nav-item"} onClick={() => selectSection(item.name)}><Icon size={17} /><span>{item.name}</span>{item.name === "Saved" && saved.length > 0 && <i>{saved.length}</i>}</button>;
            })}
          </nav>
          <div className="sidebar-bottom"><div className="creator-chip"><span>EP</span><div><b>Grand-Lumen</b><small>Personal workspace</small></div></div><span className="version">FOUNDATION 1.0</span></div>
        </aside>
        <main className="main-area">
          <header className="topbar">
            <button className="icon-button mobile-only" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Toggle navigation"><Menu size={19} /></button>
            <div className="breadcrumb"><span>GRAND-LUMEN</span><ArrowRight size={13} /><b>{section.toUpperCase()}</b></div>
            <div className="top-actions"><span className="system-status"><i /> SYSTEM READY</span><button className="icon-button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">{theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}</button></div>
          </header>
          <div className="content-wrap">
            {section === "Home" && <section>
              <div className="hero-block"><div className="eyebrow"><Sparkles size={13} /> YOUR EXPANDED DIGITAL UNIVERSE</div><h1>Explore beyond<br /><span>what you know.</span></h1><p>One workspace for discovery, research, learning, development and creation. Your next idea starts here.</p><div className="hero-search"><Search size={19} /><input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && runSearch()} placeholder="Search knowledge, ideas, technology..." /><button onClick={() => { selectSection("Search"); runSearch(); }}>Explore <ArrowRight size={15} /></button></div><div className="quick-tags"><button onClick={() => { setQuery("artificial intelligence"); selectSection("Search"); }}>Artificial intelligence</button><button onClick={() => { setQuery("space exploration"); selectSection("Search"); }}>Space exploration</button><button onClick={() => { setQuery("web development"); selectSection("Search"); }}>Web development</button></div></div>
              <div className="section-heading"><div><span className="eyebrow">THE WORKSPACE</span><h2>Everything in one orbit.</h2></div><span className="muted">12 connected spaces</span></div>
              <div className="feature-grid">{[{n:"Research Studio",d:"Explore subjects, collect sources and build understanding.",i:FlaskConical,s:"Research"},{n:"Code Lab",d:"Experiment with 15 programming and markup languages.",i:Code2,s:"Code Lab"},{n:"API Library",d:"Discover open data and connect useful services.",i:Database,s:"API Library"},{n:"Learning Hub",d:"Build skills through guided, practical lessons.",i:GraduationCap,s:"Learn"},{n:"Visual Discovery",d:"Explore visual ideas and media collections.",i:Image,s:"Images"},{n:"Smart Tools",d:"Use calculators, dictionaries and live data utilities.",i:Zap,s:"Tools"}].map(card => { const Icon = card.i; return <button className="feature-card" key={card.n} onClick={() => selectSection(card.s as Section)}><span className="feature-icon"><Icon size={20} /></span><span className="feature-title">{card.n}</span><span className="feature-description">{card.d}</span><ArrowRight className="feature-arrow" size={16} /></button>; })}</div>
              <div className="stats-strip"><div><b>15</b><span>LANGUAGE TRACKS</span></div><div><b>20+</b><span>API CATALOGUE</span></div><div><b>06</b><span>LIVE DATA TOOLS</span></div><div><b>{saved.length.toString().padStart(2,"0")}</b><span>SAVED ITEMS</span></div></div>
            </section>}
            {section === "Search" && <section><PageTitle eyebrow="DISCOVERY ENGINE" title={heading.Search} description="Search across knowledge sources and developer communities without leaving your workspace." /><div className="search-panel"><Search size={18} /><input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && runSearch()} placeholder="What would you like to discover?" /><button onClick={() => runSearch()} disabled={busy}>Search</button></div><div className="filter-row"><button onClick={() => runSearch("all")}>All sources</button><button onClick={() => runSearch("wiki")}>Wikipedia</button><button onClick={() => runSearch("hn")}>Hacker News</button></div><Results items={results} saved={saved} onSave={toggleSave} busy={busy} error={error} /></section>}
            {section === "Research" && <section><PageTitle eyebrow="RESEARCH STUDIO" title={heading.Research} description="Create a research workspace, collect questions and develop structured notes." /><div className="research-grid"><div className="glass-card"><span className="eyebrow">START AN INQUIRY</span><h3>What are you investigating?</h3><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Enter a research topic..." /><button className="solid-button" onClick={() => { selectSection("Search"); runSearch("all"); }}>Find source material <ArrowRight size={15} /></button><div className="research-topics"><button onClick={() => setQuery("renewable energy")}>Renewable energy</button><button onClick={() => setQuery("neural networks")}>Neural networks</button><button onClick={() => setQuery("African history")}>African history</button></div></div><div className="glass-card"><span className="eyebrow">RESEARCH NOTEBOOK</span><h3>Working notes</h3><textarea value={researchNotes} onChange={e => setResearchNotes(e.target.value)} placeholder="Capture your questions, findings, hypotheses and references..." /><div className="note-footer"><span>Saved automatically in this session</span><button onClick={() => navigator.clipboard?.writeText(researchNotes)}><Copy size={14} /> Copy notes</button></div></div></div><div className="info-banner"><ShieldCheck size={18} /><span>Research results should be checked against original sources. Grand-Lumen keeps discovery and note-taking together; it does not replace source verification.</span></div></section>}
            {section === "Images" && <section><PageTitle eyebrow="VISUAL DISCOVERY" title={heading.Images} description="Search openly licensed image collections and view discoveries directly in Grand-Lumen." /><div className="search-panel"><Image size={18} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search images, places, science, design..." onKeyDown={e => e.key === "Enter" && runMediaSearch("images")} /><button onClick={() => runMediaSearch("images")} disabled={mediaBusy}>{mediaBusy ? "Searching..." : "Search images"}</button></div><div className="quick-tags">{["Nature","Architecture","Space","Technology","African art"].map(tag => <button key={tag} onClick={() => { setQuery(tag); runMediaSearch("images", tag); }}>{tag}</button>)}</div><MediaResults items={mediaResults} busy={mediaBusy} error={error} kind="images" onSave={toggleSave} /><div className="info-banner"><ShieldCheck size={18} /><span>Images are retrieved from Wikimedia Commons. Check each file page for its licence and attribution requirements before reuse.</span></div></section>}
            {section === "Videos" && <section><PageTitle eyebrow="VIDEO DISCOVERY" title={heading.Videos} description="Search public video collections and preview available items inside your workspace." /><div className="search-panel"><Video size={18} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search documentaries, tutorials, science..." onKeyDown={e => e.key === "Enter" && runMediaSearch("videos")} /><button onClick={() => runMediaSearch("videos")} disabled={mediaBusy}>{mediaBusy ? "Searching..." : "Search videos"}</button></div><div className="quick-tags">{["Science","Technology","History","Education"].map(tag => <button key={tag} onClick={() => { setQuery(tag); runMediaSearch("videos", tag); }}>{tag}</button>)}</div><MediaResults items={mediaResults} busy={mediaBusy} error={error} kind="videos" onSave={toggleSave} /></section>}
            {section === "Code Lab" && <section className="code-section"><PageTitle eyebrow="MULTI-LANGUAGE DEVELOPMENT" title={heading["Code Lab"]} description="A growing coding space with language starters and a live browser preview for HTML." /><div className="code-toolbar"><div><Terminal size={16} /><select value={codeLanguage} onChange={e => changeLanguage(e.target.value)}>{languages.map(language => <option key={language}>{language}</option>)}</select></div><button className="solid-button" onClick={() => setPreview(!preview)}><Play size={14} /> {preview ? "Hide preview" : "Run preview"}</button><button className="quiet-button" onClick={() => navigator.clipboard?.writeText(code)}><Copy size={14} /> Copy</button></div><div className="editor-layout"><div className="editor-panel"><div className="editor-header"><span><span className="live-dot" /> {codeLanguage.toLowerCase()} / main</span><span>{code.split("\n").length} lines</span></div><textarea spellCheck={false} value={code} onChange={e => setCode(e.target.value)} aria-label={codeLanguage + " editor"} /></div>{preview && <div className="preview-panel"><div className="editor-header"><span>LIVE PREVIEW</span><button onClick={() => setPreview(false)}><X size={14} /></button></div>{codeLanguage === "HTML" || codeLanguage === "JavaScript" ? <iframe title="Code preview" sandbox="allow-scripts" srcDoc={codeLanguage === "HTML" ? code : "<script>" + code.replace(/<\/script/gi, "<\\/script") + "<\/script>"} /> : <div className="preview-placeholder"><Code2 size={25} /><b>{codeLanguage} workspace</b><p>Editing and language starter are available. Native execution for this language will be connected through a secure runtime service.</p></div>}</div>}</div><div className="language-rail">{languages.map(language => <button className={codeLanguage === language ? "selected" : ""} key={language} onClick={() => changeLanguage(language)}>{language}</button>)}</div></section>}
            {section === "Learn" && <section><PageTitle eyebrow="LEARNING HUB" title={heading.Learn} description="Explore guided learning paths across web development, programming and digital knowledge." /><div className="learning-grid">{[{name:"Web foundations",detail:"HTML, CSS, JavaScript and responsive interfaces",level:"BEGINNER",language:"HTML · CSS · JS"},{name:"Programming concepts",detail:"Variables, logic, functions and data structures",level:"FOUNDATION",language:"Python · C · Java"},{name:"Modern development",detail:"Types, components, APIs and application architecture",level:"INTERMEDIATE",language:"TypeScript · React · Node"},{name:"Data and databases",detail:"Queries, records, relationships and analysis",level:"PRACTICAL",language:"SQL · Python"}].map((item,index) => <div className="glass-card learning-card" key={item.name}><span className="learning-number">0{index+1}</span><span className="eyebrow">{item.level}</span><h3>{item.name}</h3><p>{item.detail}</p><span className="language-tags">{item.language}</span><button onClick={() => { setCodeLanguage(item.name === "Web foundations" ? "HTML" : item.name === "Data and databases" ? "SQL" : item.name === "Programming concepts" ? "Python" : "TypeScript"); setCode(starterCode[item.name === "Web foundations" ? "HTML" : item.name === "Data and databases" ? "SQL" : item.name === "Programming concepts" ? "Python" : "TypeScript"]); selectSection("Code Lab"); }}>Open learning workspace <ArrowRight size={14} /></button></div>)}</div></section>}
            {section === "API Library" && <section><PageTitle eyebrow="INTEGRATION DIRECTORY" title={heading["API Library"]} description="A curated catalogue of public APIs and developer services for in-app experiences." /><div className="api-search"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find an API or capability..." /></div><div className="api-categories">{["All","Knowledge","Technology","Environment","Finance","Development","Science","Images","Media","AI","Language","Geography","Food","Utilities","Entertainment","Research","News"].map(item => <button className={apiFilter === item ? "selected" : ""} key={item} onClick={() => setApiFilter(item)}>{item}</button>)}</div><div className="api-grid">{filteredApis.map(item => <div className="api-card" key={item[0]}><div className="api-card-top"><span className="api-symbol"><Database size={17} /></span><span className={item[3] === "No key" ? "keyless" : "key-needed"}>{item[3]}</span></div><h3>{item[0]}</h3><p>{item[1]}</p><div className="api-card-bottom"><span>{item[2]}</span><button onClick={() => { setQuery(item[0]); setToolInput(item[0]); selectSection("Tools"); }}>Explore <ArrowRight size={13} /></button></div></div>)}</div></section>}
            {section === "Tools" && <section><PageTitle eyebrow="UTILITY DECK" title={heading.Tools} description="A set of connected utilities that return useful information inside Grand-Lumen." /><div className="tool-layout"><div className="tool-list">{toolCards.map(([name,detail,Icon]) => <button className={tool === name ? "tool-option active" : "tool-option"} key={name} onClick={() => { setTool(name); setToolOutput(null); setError(""); }}><Icon size={17} /><span><b>{name}</b><small>{detail}</small></span><ChevronDown size={14} /></button>)}</div><div className="glass-card tool-workspace"><span className="eyebrow">ACTIVE UTILITY</span><h3>{tool}</h3>{tool === "Currency" && <div className="currency-row"><select value={currencyBase} onChange={e => setCurrencyBase(e.target.value)}>{["USD","GHS","EUR","GBP","NGN","CAD","JPY","INR","ZAR"].map(x => <option key={x}>{x}</option>)}</select><ArrowRight size={16} /><select value={currencyTarget} onChange={e => setCurrencyTarget(e.target.value)}>{["GHS","USD","EUR","GBP","NGN","CAD","JPY","INR","ZAR"].map(x => <option key={x}>{x}</option>)}</select></div>}<div className="tool-input-row"><input value={toolInput} onChange={e => setToolInput(e.target.value)} onKeyDown={e => e.key === "Enter" && runTool()} placeholder={tool === "Calculator" ? "Example: (25 * 4) / 2" : tool === "Weather" ? "Enter a city, e.g. Accra" : tool === "Pokédex" ? "Enter a Pokémon name" : tool === "Public Holidays" ? "Country code, e.g. GH" : "Enter a word"} /><button className="solid-button" onClick={runTool} disabled={busy}>{busy ? "Working..." : "Run tool"}</button></div>{error && <p className="error-text">{error}</p>}<ToolOutput output={toolOutput} tool={tool} /></div></div></section>}
            {section === "Saved" && <section><PageTitle eyebrow="PERSONAL KNOWLEDGE VAULT" title={heading.Saved} description="Keep useful discoveries close. Saved items remain in this browser." /><div className="saved-list"><Results items={saved} saved={saved} onSave={toggleSave} busy={false} error="" /></div>{!saved.length && <EmptyState title="Your vault is ready." detail="Save search results to build your personal knowledge collection." />}</section>}
            {section === "Projects" && <section><PageTitle eyebrow="PROJECT MANAGEMENT" title={heading.Projects} description="Keep track of ideas and projects you are developing." /><div className="project-create"><input value={projectName} onChange={e => setProjectName(e.target.value)} onKeyDown={e => e.key === "Enter" && projectName.trim() && (setProjects([projectName.trim(), ...projects]), setProjectName(""))} placeholder="Name a project or idea..." /><button className="solid-button" onClick={() => { if (projectName.trim()) { setProjects([projectName.trim(), ...projects]); setProjectName(""); } }}><Plus size={15} /> Add project</button></div><div className="project-grid">{projects.map((name,index) => <div className="glass-card project-card" key={name + index}><span className="feature-icon"><Layers3 size={19} /></span><h3>{name}</h3><span className="muted">PERSONAL PROJECT</span><button onClick={() => setProjects(projects.filter((_,i) => i !== index))}>Remove <X size={13} /></button></div>)}</div>{!projects.length && <EmptyState title="A space for your next big idea." detail="Create your first project to start organising your work." />}</section>}
            {section === "Settings" && <section><PageTitle eyebrow="PREFERENCES" title={heading.Settings} description="Configure the appearance and local workspace preferences." /><div className="settings-card"><div><b>Appearance</b><p>Choose the interface theme.</p></div><div className="theme-switch"><button className={theme === "dark" ? "selected" : ""} onClick={() => setTheme("dark")}><Moon size={15} /> Dark</button><button className={theme === "light" ? "selected" : ""} onClick={() => setTheme("light")}><Sun size={15} /> Light</button></div></div><div className="settings-card"><div><b>Local workspace data</b><p>Saved items and projects are stored in this browser.</p></div><button className="quiet-button" onClick={() => { if (confirm("Clear saved items and projects from this browser?")) { setSaved([]); setProjects([]); } }}>Clear local data</button></div><div className="settings-card"><div><b>About Grand-Lumen</b><p>Foundation build · Modular React and TypeScript architecture.</p></div><span className="version">v1.0.0</span></div></section>}
          </div>
          <footer className="app-footer"><span>GRAND-LUMEN</span><span>EXPLORE BEYOND · BUILD WHAT COMES NEXT</span><span>FOUNDATION 1.0</span></footer>
        </main>
      </div>
    </>
  );
}

function PageTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="page-title"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>;
}
function Results({ items, saved, onSave, busy, error }: { items: SearchItem[]; saved: SearchItem[]; onSave: (item: SearchItem) => void; busy: boolean; error: string }) {
  if (busy) return <div className="loading-state"><span /><span /><span /></div>;
  if (error) return <div className="error-text">{error}</div>;
  return <div className="results-list">{items.map((item,index) => <article className="result-item" key={item.url + index}><div className="result-source">{item.source}</div><a href={item.url} target="_blank" rel="noreferrer">{item.title} <ExternalLink size={13} /></a><p>{item.description}</p><button onClick={() => onSave(item)}>{saved.some(savedItem => savedItem.url === item.url) ? <Check size={14} /> : <Bookmark size={14} />}{saved.some(savedItem => savedItem.url === item.url) ? "Saved" : "Save"}</button></article>)}</div>;
}
function ToolOutput({ output, tool }: { output: any; tool: string }) {
  if (!output) return <div className="tool-empty"><Zap size={20} /><span>Results will appear here.</span></div>;
  if (tool === "Calculator") return <div className="tool-result"><span>RESULT</span><strong>{output.result}</strong></div>;
  if (tool === "Dictionary") return <div className="tool-result"><strong>{output[0]?.word}</strong>{output[0]?.meanings?.slice(0,3).map((meaning: any,index: number) => <p key={index}><b>{meaning.partOfSpeech}</b> — {meaning.definitions?.[0]?.definition}</p>)}</div>;
  if (tool === "Weather") return <div className="tool-result"><strong>{output.location.name}, {output.location.country}</strong><div className="weather-number">{Math.round(output.data.current.temperature_2m)}°C</div><p>Feels like {Math.round(output.data.current.apparent_temperature)}°C · Humidity {output.data.current.relative_humidity_2m}% · Wind {output.data.current.wind_speed_10m} km/h</p></div>;
  if (tool === "Currency") return <div className="tool-result"><span>REFERENCE RATE</span><strong>{Object.values(output.rates || {})[0] as number} {Object.keys(output.rates || {})[0]}</strong><p>1 {output.base} · Date {output.date}</p></div>;
  if (tool === "Pokédex") return <div className="tool-result pokemon-result">{output.image && <img src={output.image} alt={output.name} />}<strong>{output.name} · #{output.id}</strong><p>Types: {output.types?.join(", ")} · Height: {output.height} · Weight: {output.weight}</p></div>;
  return <div className="holiday-results">{output.slice(0,12).map((holiday: any) => <div key={holiday.date}><b>{holiday.date}</b><span>{holiday.localName}</span></div>)}</div>;
}
function MediaResults({ items, busy, error, kind, onSave }: { items: SearchItem[]; busy: boolean; error: string; kind: "images" | "videos"; onSave: (item: SearchItem) => void }) {
  if (busy) return <div className="loading-state media-loading"><span /><span /><span /></div>;
  if (error) return <div className="error-text">{error}</div>;
  if (!items.length) return <EmptyState title={kind === "images" ? "Your visual search starts here." : "Find your next video."} detail="Search a topic to bring public media results into this workspace." />;
  return <div className="media-grid">{items.map((item, index) => <article className="media-card" key={item.url + index}>{kind === "images" && item.image ? <a href={item.url} target="_blank" rel="noreferrer"><img src={item.image} alt={item.title} loading="lazy" /></a> : <iframe title={item.title} src={item.url.replace("https://archive.org/details/", "https://archive.org/embed/")} loading="lazy" allow="fullscreen" /> }<div className="media-card-copy"><span className="result-source">{item.source}</span><b>{item.title}</b><p>{item.description}</p><button onClick={() => onSave(item)}><Bookmark size={13} /> Save</button><a href={item.url} target="_blank" rel="noreferrer">Source details <ExternalLink size={12} /></a></div></article>)}</div>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state"><Sparkles size={23} /><b>{title}</b><p>{detail}</p></div>;
}
function ArrowUpRightIcon() {
  return <ArrowRight className="tile-arrow" size={17} />;
}

export default App;