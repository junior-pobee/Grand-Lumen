import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Activity, ArrowLeft, BookOpen, CalendarDays, CheckCircle2, Copy, Download, FileText, Globe2, Languages, Plus, Search, ShieldCheck, Trash2, Upload, Wifi, WifiOff } from "lucide-react";

type ModuleName = "Knowledge Graph" | "Verify" | "Document Intelligence" | "Convert" | "World" | "Pulse" | "Scan" | "Workspace" | "Finance" | "Vault" | "Academy" | "Code" | "Lab" | "Create" | "Translate" | "Accessibility" | "Offline" | "Connect" | "Alerts";
type Task = { id: string; title: string; due: string; done: boolean };
type Entry = { id: string; name: string; amount: number; kind: "Income" | "Expense"; date: string };
type SavedFile = { id: string; name: string; type: string; size: number; data: string; savedAt: string };
type Reminder = { id: string; title: string; when: string; notified: boolean };
type Resource = { title: string; description: string; url: string; source: string };

const modules: { name: ModuleName; group: string; description: string }[] = [
  { name: "Knowledge Graph", group: "Knowledge", description: "Explore connected concepts and source-backed topic relationships." },
  { name: "Verify", group: "Knowledge", description: "Compare claims with independent sources before drawing conclusions." },
  { name: "Document Intelligence", group: "Knowledge", description: "Read, extract and organize text from your documents." },
  { name: "Convert", group: "Utilities", description: "Convert everyday units, measurements, data sizes and temperatures." },
  { name: "World", group: "Utilities", description: "Weather, currencies, time zones and country information." },
  { name: "Pulse", group: "Utilities", description: "Search global news and follow current developments." },
  { name: "Scan", group: "Utilities", description: "Create QR codes and open the existing camera scanner." },
  { name: "Workspace", group: "Productivity", description: "Tasks, notes and a personal schedule." },
  { name: "Finance", group: "Productivity", description: "Track income, expenses, budgets and balances locally." },
  { name: "Vault", group: "Productivity", description: "Keep personal files in this browser's local storage." },
  { name: "Academy", group: "Learning", description: "Study structured topics and test your understanding." },
  { name: "Code", group: "Learning", description: "Experiment with HTML, CSS and JavaScript in a live preview." },
  { name: "Lab", group: "Learning", description: "Scientific calculators, unit conversions and formula references." },
  { name: "Create", group: "Learning", description: "Turn an idea into a structured project plan." },
  { name: "Translate", group: "Access", description: "Translate text with an explicitly selected source and target language." },
  { name: "Accessibility", group: "Access", description: "Use speech playback and readable text controls." },
  { name: "Offline", group: "Access", description: "Keep notes and saved resources available without a connection." },
  { name: "Connect", group: "Access", description: "Discover useful public digital services and learning resources." },
  { name: "Alerts", group: "Access", description: "Create personal reminders and optional browser notifications." }
];

const initialTasks: Task[] = [];
const initialEntries: Entry[] = [];
const initialFiles: SavedFile[] = [];
const initialReminders: Reminder[] = [];
const languages = [{ code: "en", name: "English" }, { code: "fr", name: "French" }, { code: "es", name: "Spanish" }, { code: "de", name: "German" }, { code: "pt", name: "Portuguese" }, { code: "sw", name: "Swahili" }, { code: "ak", name: "Akan" }, { code: "ar", name: "Arabic" }, { code: "zh", name: "Chinese" }, { code: "hi", name: "Hindi" }, { code: "ja", name: "Japanese" }, { code: "ru", name: "Russian" }];
const courses = [
  { title: "Scientific method", topic: "Science", lesson: "Observe a phenomenon, ask a question, form a testable hypothesis, plan a fair investigation, record results and evaluate evidence.", question: "What makes a hypothesis useful?", answer: "It is testable and can be checked against evidence." },
  { title: "Forces and motion", topic: "Physics", lesson: "A resultant force changes an object's motion. Newton's second law relates resultant force, mass and acceleration: F = ma.", question: "What is the SI unit of force?", answer: "Newton (N)." },
  { title: "Electric circuits", topic: "Physics", lesson: "Current is the rate of flow of charge. Ohm's law states V = IR for an ohmic conductor at constant temperature.", question: "What does the gradient of a voltage-current graph represent?", answer: "Resistance." },
  { title: "Chemical reactions", topic: "Chemistry", lesson: "Chemical equations represent reactants and products. Equations are balanced by conserving the number of atoms of each element.", question: "Why must equations be balanced?", answer: "Atoms are conserved in a chemical reaction." },
  { title: "Cell biology", topic: "Biology", lesson: "Cells are the basic structural and functional units of living organisms. Organelles perform specialized functions.", question: "Which organelle releases usable energy through respiration?", answer: "Mitochondrion." },
  { title: "Algebra foundations", topic: "Mathematics", lesson: "Algebra uses symbols to represent numbers. Maintain equality by applying the same operation to both sides of an equation.", question: "Solve 3x = 21.", answer: "x = 7." },
  { title: "Statistics", topic: "Mathematics", lesson: "The mean is the sum divided by the count, the median is the middle ordered value, and the mode is the most frequent value.", question: "What is the median of 2, 4, 9?", answer: "4." },
  { title: "Ecosystems", topic: "Biology", lesson: "Energy flows through food chains while nutrients cycle. Producers convert energy into chemical energy that supports consumers.", question: "What is the role of a producer?", answer: "It makes organic food, usually through photosynthesis." }
];
const resources: Resource[] = [
  { title: "World Bank Open Data", description: "Development indicators and country-level datasets.", url: "https://data.worldbank.org/", source: "World Bank" },
  { title: "NASA Open Science", description: "Space science missions, data and educational material.", url: "https://science.nasa.gov/open-science/", source: "NASA" },
  { title: "Khan Academy", description: "Free lessons and practice across academic subjects.", url: "https://www.khanacademy.org/", source: "Khan Academy" },
  { title: "Wikimedia Commons", description: "Freely licensed media with source and licensing details.", url: "https://commons.wikimedia.org/", source: "Wikimedia" },
  { title: "OpenStreetMap", description: "Collaborative open geographic data and maps.", url: "https://www.openstreetmap.org/", source: "OpenStreetMap" },
  { title: "MDN Web Docs", description: "Web platform documentation for developers.", url: "https://developer.mozilla.org/", source: "MDN" },
  { title: "Our World in Data", description: "Research and visualizations about global challenges.", url: "https://ourworldindata.org/", source: "OWID" },
  { title: "PubMed", description: "Biomedical literature search maintained by the US National Library of Medicine.", url: "https://pubmed.ncbi.nlm.nih.gov/", source: "NLM" }
];

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function saveLocal<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent("lumen-core-update", { detail: { key } }));
}

function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
}

function Panel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="lh-panel"><div className="lh-panel-heading"><div><h3>{title}</h3><p>{description}</p></div></div>{children}</section>;
}

function ActionButton({ children, onClick, disabled = false }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button className="lh-action" onClick={onClick} disabled={disabled}>{children}</button>;
}

export default function ExpansionHub({ onOpenScanner, language = "en" }: { onOpenScanner?: () => void; language?: string }) {
  const [active, setActive] = useState<ModuleName>("Knowledge Graph");
  const [moduleOpened, setModuleOpened] = useState(false);
  const [tasks, setTasks] = useState<Task[]>(() => readLocal("lumenTasks", initialTasks));
  const [entries, setEntries] = useState<Entry[]>(() => readLocal("lumenFinanceEntries", initialEntries));
  const [files, setFiles] = useState<SavedFile[]>(() => readLocal("lumenVaultFiles", initialFiles));
  const [previewFile, setPreviewFile] = useState<SavedFile | null>(null);
  const [previewText, setPreviewText] = useState("");
  const [reminders, setReminders] = useState<Reminder[]>(() => readLocal("lumenReminders", initialReminders));
  const [notes, setNotes] = useState(() => localStorage.getItem("lumenWorkspaceNotes") || "");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [entryName, setEntryName] = useState("");
  const [entryAmount, setEntryAmount] = useState("");
  const [entryKind, setEntryKind] = useState<"Income" | "Expense">("Expense");
  const [budget, setBudget] = useState(() => localStorage.getItem("lumenMonthlyBudget") || "0");
  const [idea, setIdea] = useState("");
  const [projectGoal, setProjectGoal] = useState("");
  const [projectSteps, setProjectSteps] = useState<string[]>([]);
  const [stepInput, setStepInput] = useState("");
  const [graphTopic, setGraphTopic] = useState("");
  const [graphResults, setGraphResults] = useState<{ title: string; description: string; url: string }[]>([]);
  const [graphBusy, setGraphBusy] = useState(false);
  const [claim, setClaim] = useState("");
  const [verifyResults, setVerifyResults] = useState<{ title: string; description: string; url: string; source: string }[]>([]);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [documentText, setDocumentText] = useState("");
  const [documentName, setDocumentName] = useState("");
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState("");
  const [documentSummary, setDocumentSummary] = useState("");
  const [convertValue, setConvertValue] = useState("1");
  const [convertCategory, setConvertCategory] = useState("Length");
  const [convertFrom, setConvertFrom] = useState("m");
  const [convertTo, setConvertTo] = useState("km");
  const [convertResult, setConvertResult] = useState("");
  const [weatherPlace, setWeatherPlace] = useState("");
  const [weatherData, setWeatherData] = useState<any>(null);
  const [currencyAmount, setCurrencyAmount] = useState("1");
  const [currencyFrom, setCurrencyFrom] = useState("USD");
  const [currencyTo, setCurrencyTo] = useState("GHS");
  const [currencyData, setCurrencyData] = useState<any>(null);
  const [worldTime, setWorldTime] = useState("Africa/Accra");
  const [countryQuery, setCountryQuery] = useState("");
  const [countryData, setCountryData] = useState<any>(null);
  const [holidayCountry, setHolidayCountry] = useState("GH");
  const [holidayYear, setHolidayYear] = useState(String(new Date().getFullYear()));
  const [holidayData, setHolidayData] = useState<any[]>([]);
  const [pulseQuery, setPulseQuery] = useState("");
  const [pulseResults, setPulseResults] = useState<{ title: string; url: string; source: string; date: string }[]>([]);
  const [pulseBusy, setPulseBusy] = useState(false);
  const [qrText, setQrText] = useState("");
  const [translateText, setTranslateText] = useState("");
  const [translateFrom, setTranslateFrom] = useState("en");
  const [translateTo, setTranslateTo] = useState("fr");
  const [translated, setTranslated] = useState("");
  const [translateBusy, setTranslateBusy] = useState(false);
  const [codeText, setCodeText] = useState("<h1>Hello from Lumen Code</h1>\n<p>Build something useful.</p>\n<style>body{font-family:system-ui;padding:2rem;background:#101827;color:white}</style>");
  const [codeTab, setCodeTab] = useState<"HTML" | "CSS" | "JavaScript">("HTML");
  const [codeCss, setCodeCss] = useState("body { font-family: system-ui; padding: 24px; }");
  const [codeJs, setCodeJs] = useState("document.querySelector('h1')?.addEventListener('click', () => alert('Hello!'));");
  const [labValue, setLabValue] = useState("12");
  const [labUnit, setLabUnit] = useState("km/h");
  const [labResult, setLabResult] = useState("");
  const [courseIndex, setCourseIndex] = useState(0);
  const [courseAnswer, setCourseAnswer] = useState("");
  const [courseRevealed, setCourseRevealed] = useState(false);
  const [speechText, setSpeechText] = useState("Welcome to Grand Lumen. Explore, learn and create.");
  const [highContrast, setHighContrast] = useState(false);
  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderWhen, setReminderWhen] = useState("");
  const [networkOnline, setNetworkOnline] = useState(navigator.onLine);
  const [notice, setNotice] = useState("");
  const [coreActivity, setCoreActivity] = useState("Core ready");

  useEffect(() => {
    const localUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string }>).detail;
      setCoreActivity(detail?.key ? "Updated " + detail.key : "Local module updated");
    };
    const crossTabUpdate = (event: StorageEvent) => {
      if (event.key) setCoreActivity("Synced " + event.key + " from another tab");
    };
    window.addEventListener("lumen-core-update", localUpdate);
    window.addEventListener("storage", crossTabUpdate);
    return () => {
      window.removeEventListener("lumen-core-update", localUpdate);
      window.removeEventListener("storage", crossTabUpdate);
    };
  }, []);

  useEffect(() => {
    const online = () => setNetworkOnline(true);
    const offline = () => setNetworkOnline(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);

  useEffect(() => saveLocal("lumenTasks", tasks), [tasks]);
  useEffect(() => saveLocal("lumenFinanceEntries", entries), [entries]);
  useEffect(() => saveLocal("lumenVaultFiles", files), [files]);
  useEffect(() => saveLocal("lumenReminders", reminders), [reminders]);
  useEffect(() => localStorage.setItem("lumenWorkspaceNotes", notes), [notes]);
  useEffect(() => localStorage.setItem("lumenMonthlyBudget", budget), [budget]);

  useEffect(() => {
    const check = () => {
      const now = Date.now();
      setReminders(current => current.map(item => {
        if (!item.notified && new Date(item.when).getTime() <= now) {
          if ("Notification" in window && Notification.permission === "granted" && "serviceWorker" in navigator) { void navigator.serviceWorker.ready.then(registration => registration.showNotification("Grand Lumen reminder", { body: item.title })).catch(() => setNotice("The reminder is due, but this browser could not display its notification.")); }
          return { ...item, notified: true };
        }
        return item;
      }));
    };
    const timer = window.setInterval(check, 30000);
    check();
    return () => window.clearInterval(timer);
  }, []);

  const balance = entries.reduce((sum, item) => sum + (item.kind === "Income" ? item.amount : -item.amount), 0);
  const expenses = entries.filter(item => item.kind === "Expense").reduce((sum, item) => sum + item.amount, 0);
  const income = entries.filter(item => item.kind === "Income").reduce((sum, item) => sum + item.amount, 0);
  const course = courses[courseIndex];
  const previewDocument = useMemo(() => {
    const html = codeTab === "HTML" ? codeText : codeText;
    const script = "<script>" + codeJs + "</" + "script>";
    return html.replace("</body>", "<style>" + codeCss + "</style>" + script + "</body>");
  }, [codeCss, codeJs, codeText, codeTab]);

  const searchKnowledge = async (value = graphTopic) => {
    if (!value.trim()) return;
    setGraphBusy(true);
    setNotice("");
    try {
      const response = await fetch("https://en.wikipedia.org/w/rest.php/v1/search/page?q=" + encodeURIComponent(value) + "&limit=8");
      if (!response.ok) throw new Error("Knowledge search is unavailable.");
      const data = await response.json();
      setGraphResults((data.pages || []).map((item: any) => ({ title: item.title, description: item.description || item.excerpt?.replace(/<[^>]*>/g, "") || "Related encyclopedia topic", url: "https://en.wikipedia.org/wiki/" + encodeURIComponent(item.key) })));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load knowledge results.");
    } finally {
      setGraphBusy(false);
    }
  };

  const verifyClaim = async () => {
    if (!claim.trim()) return;
    setVerifyBusy(true);
    setVerifyResults([]);
    setNotice("");
    try {
      const query = encodeURIComponent(claim);
      const [wiki, news] = await Promise.allSettled([
        fetch("https://en.wikipedia.org/w/rest.php/v1/search/page?q=" + query + "&limit=5").then(r => { if (!r.ok) throw new Error("Encyclopedia source unavailable"); return r.json(); }),
        fetch("https://api.gdeltproject.org/api/v2/doc/doc?query=" + query + "&mode=ArtList&format=json&maxrecords=10&sort=DateDesc").then(r => { if (!r.ok) throw new Error("News source unavailable"); return r.json(); })
      ]);
      const items = [
        ...(wiki.status === "fulfilled" ? (wiki.value.pages || []).map((item: any) => ({ title: item.title, description: item.description || "Encyclopedia reference", url: "https://en.wikipedia.org/wiki/" + encodeURIComponent(item.key), source: "Wikipedia" })) : []),
        ...(news.status === "fulfilled" ? (news.value.articles || []).map((item: any) => ({ title: item.title || "News report", description: [item.domain, item.seendate].filter(Boolean).join(" · "), url: item.url || "", source: item.domain || "GDELT news index" })).filter((item: any) => item.url) : [])
      ];
      setVerifyResults(items);
      if (!items.length) setNotice("No independent references were returned. Try a shorter claim or different wording.");
    } catch {
      setNotice("Claim comparison is temporarily unavailable.");
    } finally {
      setVerifyBusy(false);
    }
  };

  const readDocument = async (file: File) => {
    setDocumentName(file.name);
    if (file.type === "text/plain" || file.type === "text/markdown" || /\.(txt|md|csv|json)$/i.test(file.name)) {
      const value = await file.text();
      setDocumentText(value);
      setDocumentSummary("");
    } else if (file.type === "application/pdf") {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(URL.createObjectURL(file));
      setDocumentText("");
      setDocumentSummary("");
    } else {
      setNotice("This reader currently extracts text and Markdown files. Other formats can be stored in Vault.");
    }
  };

  useEffect(() => () => {
    if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
  }, [pdfPreviewUrl]);

  const lookupCountry = async () => {
    if (!countryQuery.trim()) return;
    try {
      const response = await fetch("https://restcountries.com/v3.1/name/" + encodeURIComponent(countryQuery) + "?fields=name,capital,region,subregion,population,area,currencies,languages,flags,maps");
      if (!response.ok) throw new Error("Country information was not found.");
      const data = await response.json();
      setCountryData(data[0] || null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Country lookup failed.");
    }
  };

  const lookupHolidays = async () => {
    try {
      const response = await fetch("https://date.nager.at/api/v3/PublicHolidays/" + encodeURIComponent(holidayYear) + "/" + encodeURIComponent(holidayCountry.toUpperCase()));
      if (!response.ok) throw new Error("Holiday calendar is unavailable for that country and year.");
      setHolidayData(await response.json());
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Holiday lookup failed.");
    }
  };

  const makeSummary = () => {
    const words = documentText.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return;
    const sentences = documentText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [documentText];
    const scored = sentences.map(sentence => ({ sentence: sentence.trim(), score: sentence.trim().split(/\s+/).length }));
    setDocumentSummary(scored.sort((a, b) => b.score - a.score).slice(0, 5).map(item => item.sentence).join(" "));
  };

  const loadWorldWeather = async () => {
    if (!weatherPlace.trim()) return;
    setWeatherData(null);
    try {
      const geoResponse = await fetch("https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent(weatherPlace) + "&count=1&language=en&format=json");
      if (!geoResponse.ok) throw new Error("Location search failed.");
      const place = (await geoResponse.json()).results?.[0];
      if (!place) throw new Error("Location not found.");
      const response = await fetch("https://api.open-meteo.com/v1/forecast?latitude=" + place.latitude + "&longitude=" + place.longitude + "&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto");
      if (!response.ok) throw new Error("Weather forecast unavailable.");
      setWeatherData({ place, forecast: await response.json() });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Weather is unavailable.");
    }
  };

  const convertCurrency = async () => {
    try {
      const response = await fetch("https://api.frankfurter.dev/v1/latest?base=" + currencyFrom + "&symbols=" + currencyTo);
      if (!response.ok) throw new Error("Exchange rates are unavailable.");
      const data = await response.json();
      setCurrencyData({ ...data, converted: Number(currencyAmount) * data.rates[currencyTo] });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Currency conversion failed.");
    }
  };

  const loadPulse = async () => {
    setPulseBusy(true);
    setPulseResults([]);
    try {
      const response = await fetch("https://api.gdeltproject.org/api/v2/doc/doc?query=" + encodeURIComponent(pulseQuery.trim() || "world") + "&mode=ArtList&format=json&maxrecords=25&sort=DateDesc");
      if (!response.ok) throw new Error("Global news is temporarily unavailable.");
      const data = await response.json();
      setPulseResults((data.articles || []).map((item: any) => ({ title: item.title || "Untitled report", url: item.url, source: item.domain || item.sourcecountry || "Publisher", date: item.seendate || "" })).filter((item: any) => item.url));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "News search failed.");
    } finally {
      setPulseBusy(false);
    }
  };

  useEffect(() => {
    if (active === "Pulse" && pulseResults.length > 0) void loadPulse();
  }, [language]);

  const translate = async () => {
    if (!translateText.trim()) return;
    setTranslateBusy(true);
    setTranslated("");
    try {
      const response = await fetch("https://api.mymemory.translated.net/get?q=" + encodeURIComponent(translateText) + "&langpair=" + translateFrom + "|" + translateTo);
      if (!response.ok) throw new Error("Translation service unavailable.");
      const data = await response.json();
      if (data.responseStatus !== 200) throw new Error(data.responseDetails || "Translation unavailable.");
      setTranslated(data.responseData.translatedText);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Translation failed.");
    } finally {
      setTranslateBusy(false);
    }
  };

  const addTask = () => {
    if (!taskTitle.trim()) return;
    setTasks(current => [{ id: makeId(), title: taskTitle.trim(), due: taskDue, done: false }, ...current]);
    setTaskTitle("");
    setTaskDue("");
  };

  const addEntry = () => {
    const amount = Number(entryAmount);
    if (!entryName.trim() || !Number.isFinite(amount) || amount <= 0) return;
    setEntries(current => [{ id: makeId(), name: entryName.trim(), amount, kind: entryKind, date: new Date().toISOString().slice(0, 10) }, ...current]);
    setEntryName("");
    setEntryAmount("");
  };

  const addReminder = async () => {
    if (!reminderTitle.trim() || !reminderWhen || new Date(reminderWhen).getTime() <= Date.now()) return;
    if ("Notification" in window && "serviceWorker" in navigator && Notification.permission === "default") await Notification.requestPermission();
    setReminders(current => [{ id: makeId(), title: reminderTitle.trim(), when: reminderWhen, notified: false }, ...current]);
    setReminderTitle("");
    setReminderWhen("");
  };

  const storeVaultFile = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      setNotice("For browser storage reliability, Vault currently accepts files up to 2 MB each.");
      return;
    }
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("The file could not be read."));
      reader.readAsDataURL(file);
    });
    setFiles(current => [{ id: makeId(), name: file.name, type: file.type, size: file.size, data, savedAt: new Date().toISOString() }, ...current]);
  };

  useEffect(() => {
    if (!previewFile) { setPreviewText(""); return; }
    const isText = previewFile.type.startsWith("text/") || /\.(txt|md|csv|json|js|ts|tsx|jsx|css|html|xml|log)$/i.test(previewFile.name);
    if (!isText) { setPreviewText(""); return; }
    fetch(previewFile.data).then(response => response.text()).then(setPreviewText).catch(() => setPreviewText("Preview unavailable for this file."));
  }, [previewFile]);

  const downloadVaultFile = (file: SavedFile) => {
    const anchor = document.createElement("a");
    anchor.href = file.data;
    anchor.download = file.name;
    anchor.click();
  };

  const exportFinance = () => {
    const csv = "date,type,description,amount\n" + entries.map(item => [item.date, item.kind, '"' + item.name.replace(/"/g, '""') + '"', item.amount].join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "grand-lumen-finance.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const saveProjectPlan = () => {
    const plan = { idea, goal: projectGoal, steps: projectSteps, updatedAt: new Date().toISOString() };
    saveLocal("lumenProjectPlan", plan);
    setNotice("Project plan saved on this device.");
  };

  const doUniversalConversion = () => {
    const value = Number(convertValue);
    if (!Number.isFinite(value)) { setConvertResult("Enter a valid number."); return; }
    const groups: Record<string, Record<string, number>> = {
      Length: { m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, ft: 0.3048, in: 0.0254, yd: 0.9144 },
      Mass: { kg: 1, g: 0.001, mg: 0.000001, tonne: 1000, lb: 0.45359237, oz: 0.028349523125 },
      Volume: { L: 1, mL: 0.001, m3: 1000, "US gal": 3.785411784, "UK gal": 4.54609 },
      Speed: { "m/s": 1, "km/h": 1 / 3.6, mph: 0.44704, knot: 0.514444 },
      Area: { "m²": 1, "km²": 1000000, "cm²": 0.0001, hectare: 10000, acre: 4046.8564224 },
      Time: { second: 1, minute: 60, hour: 3600, day: 86400 },
      Data: { B: 1, KB: 1000, MB: 1000000, GB: 1000000000, TB: 1000000000000 }
    };
    if (convertCategory === "Temperature") {
      const celsius = convertFrom === "°C" ? value : convertFrom === "°F" ? (value - 32) * 5 / 9 : value - 273.15;
      const result = convertTo === "°C" ? celsius : convertTo === "°F" ? celsius * 9 / 5 + 32 : celsius + 273.15;
      setConvertResult(value + " " + convertFrom + " = " + Number(result.toPrecision(10)) + " " + convertTo);
      return;
    }
    const units = groups[convertCategory];
    if (!units || units[convertFrom] === undefined || units[convertTo] === undefined) return;
    const result = value * units[convertFrom] / units[convertTo];
    setConvertResult(value + " " + convertFrom + " = " + Number(result.toPrecision(10)) + " " + convertTo);
  };

  const doLabConversion = () => {
    const value = Number(labValue);
    if (!Number.isFinite(value)) { setLabResult("Enter a valid number."); return; }
    const conversions: Record<string, (v: number) => string> = {
      "km/h": v => (v / 3.6).toFixed(4) + " m/s",
      "m/s": v => (v * 3.6).toFixed(4) + " km/h",
      "°C": v => ((v * 9 / 5) + 32).toFixed(2) + " °F",
      "°F": v => ((v - 32) * 5 / 9).toFixed(2) + " °C",
      "cm": v => (v / 100).toFixed(4) + " m",
      "m": v => (v * 100).toFixed(2) + " cm",
      "kg": v => (v * 1000).toFixed(2) + " g",
      "g": v => (v / 1000).toFixed(4) + " kg",
      "kPa": v => (v * 1000).toFixed(2) + " Pa",
      "Pa": v => (v / 1000).toFixed(4) + " kPa"
    };
    setLabResult(conversions[labUnit]?.(value) || "Choose a supported unit.");
  };

  const speak = () => {
    if (!("speechSynthesis" in window)) { setNotice("Speech playback is not supported by this browser."); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(speechText);
    window.speechSynthesis.speak(utterance);
  };

  const exportOfflineNotes = () => {
    const payload = { notes, tasks, savedResources: readLocal("lumenOfflineResources", []), exportedAt: new Date().toISOString() };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "grand-lumen-offline-pack.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const saveOfflineResource = (resource: Resource) => {
    const current = readLocal<Resource[]>("lumenOfflineResources", []);
    if (!current.some(item => item.url === resource.url)) saveLocal("lumenOfflineResources", [resource, ...current]);
    setNotice("Resource saved to your offline reading list. The source page itself may still require internet access.");
  };

  const currentModule = modules.find(item => item.name === active)!;
  const totalBudget = Number(budget) || 0;
  const qrUrl = qrText.trim() ? "https://quickchart.io/qr?size=240&text=" + encodeURIComponent(qrText) : "";

  return <div className={highContrast ? "lumen-hub lh-contrast" : "lumen-hub"}>
    {!moduleOpened && <div className="lh-hub-selection"><div className="lh-intro"><div><span className="eyebrow">GRAND LUMEN · CONNECTED UTILITIES</span><h2>One workspace. More possibilities.</h2><p>Explore practical tools for knowledge, daily life, productivity and learning. AI features are not included in this release.</p></div><div className="lh-network"><span className={networkOnline ? "lh-online" : "lh-offline"} />{networkOnline ? <><Wifi size={15}/> Online</> : <><WifiOff size={15}/> Offline</>}</div></div><div className="lh-module-nav">{["Knowledge","Utilities","Productivity","Learning","Access"].map(group => { const groupModules = modules.filter(item => item.group === group); return <div className="lh-module-group" key={group}><span>{group}</span><div>{groupModules.map((item, index) => <button key={item.name} style={{ "--lh-angle": `${index * 360 / groupModules.length}deg`, "--lh-radius": `${groupModules.length <= 2 ? 62 : 108}px` } as React.CSSProperties} className={active === item.name ? "active" : ""} onClick={() => { setActive(item.name); setNotice(""); setModuleOpened(true); }} title={item.description}>{item.name}</button>)}</div></div>; })}</div></div>}
    {moduleOpened && <div className="lh-module-view"><button className="lh-back-modules" onClick={() => { setModuleOpened(false); setNotice(""); }}><ArrowLeft size={15}/> All Lumen Hub tools</button><div className="lh-active-heading"><div><span className="eyebrow">{currentModule.group.toUpperCase()} MODULE</span><h2>{active}</h2><p>{currentModule.description}</p></div></div></div>}
    {notice && <div className="lh-notice" role="status">{notice}</div>}

    {active === "Knowledge Graph" && <div className="lh-two-col"><Panel title="Explore a concept" description="Search the public encyclopedia and see related topics as connected knowledge nodes."><div className="lh-input-row"><input value={graphTopic} onChange={e => setGraphTopic(e.target.value)} onKeyDown={e => e.key === "Enter" && void searchKnowledge()} placeholder="Search a concept, discovery or subject"/><ActionButton onClick={() => void searchKnowledge()} disabled={graphBusy}>{graphBusy ? "Searching…" : "Explore"}</ActionButton></div>{graphResults.length > 0 && <div className="lh-knowledge-map"><div className="lh-knowledge-root">{graphTopic}</div><div className="lh-knowledge-edges">{graphResults.map(item => <a key={item.url} href={item.url} target="_blank" rel="noreferrer"><b>{item.title}</b><span>{item.description}</span></a>)}</div></div>}</Panel><Panel title="Your knowledge links" description="Keep a small local list of concepts to investigate next."><textarea id="lh-knowledge-notes" defaultValue={localStorage.getItem("lumenKnowledgeNotes") || ""} onChange={e => localStorage.setItem("lumenKnowledgeNotes", e.target.value)} placeholder="Write concepts and how they connect…"/><small className="lh-muted">Saved locally in this browser.</small></Panel></div>}

    {active === "Verify" && <Panel title="Claim comparison" description="Search independent reference collections. This tool presents evidence to inspect; it does not issue an automatic true/false verdict."><textarea value={claim} onChange={e => setClaim(e.target.value)} placeholder="Enter a factual claim to investigate…"/><ActionButton onClick={() => void verifyClaim()} disabled={verifyBusy || !claim.trim()}>{verifyBusy ? "Comparing sources…" : "Compare sources"}</ActionButton>{verifyResults.length > 0 && <div className="lh-results">{verifyResults.map((item, index) => <article key={item.url + index}><span>{item.source}</span><a href={item.url} target="_blank" rel="noreferrer">{item.title}</a><p>{item.description}</p></article>)}</div>}</Panel>}

    {active === "Document Intelligence" && <div className="lh-two-col"><Panel title="Document reader" description="Extract text from plain-text, Markdown, CSV and JSON files. PDF viewing is supported through your browser; paste selected passages for analysis."><label className="lh-upload"><Upload size={16}/> Choose a document<input type="file" accept=".txt,.md,.csv,.json,.pdf,text/plain,text/markdown,text/csv,application/pdf" onChange={e => { const file = e.target.files?.[0]; if (file) void readDocument(file); }}/></label>{documentName && <p className="lh-muted">Selected: {documentName}</p>}<textarea value={documentText} onChange={e => setDocumentText(e.target.value)} placeholder="Document text appears here, or paste a passage…"/><ActionButton onClick={makeSummary} disabled={!documentText.trim()}>Extract key sentences</ActionButton>{documentSummary && <div className="lh-output"><b>Extracted key sentences</b><p>{documentSummary}</p><ActionButton onClick={() => navigator.clipboard?.writeText(documentSummary)}><Copy size={14}/> Copy extraction</ActionButton></div>}</Panel><Panel title="Reading workspace" description="A place to collect passages, observations and document notes.">{pdfPreviewUrl && <iframe className="lh-pdf-preview" title="PDF document preview" src={pdfPreviewUrl}/>}<p className="lh-muted">Text extraction is rule-based, not AI summarization. PDF files can be viewed here, then selected passages can be pasted into the reader. Always check the original document before relying on an extracted passage.</p><button className="lh-secondary" onClick={() => { setDocumentText(""); setDocumentName(""); setDocumentSummary(""); if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl); setPdfPreviewUrl(""); }}>Clear reader</button></Panel></div>}

    {active === "Convert" && <Panel title="Universal unit converter" description="Convert length, mass, volume, speed, area, time, data size and temperature. Currency reference conversion is available in World."><div className="lh-input-row"><label className="lh-field">Category<select value={convertCategory} onChange={e => { const category = e.target.value; setConvertCategory(category); const first = category === "Temperature" ? "°C" : category === "Length" ? "m" : category === "Mass" ? "kg" : category === "Volume" ? "L" : category === "Speed" ? "m/s" : category === "Area" ? "m²" : category === "Time" ? "second" : "B"; const second = category === "Temperature" ? "°F" : category === "Length" ? "km" : category === "Mass" ? "g" : category === "Volume" ? "mL" : category === "Speed" ? "km/h" : category === "Area" ? "km²" : category === "Time" ? "minute" : "KB"; setConvertFrom(first); setConvertTo(second); setConvertResult(""); }}><option>Length</option><option>Mass</option><option>Volume</option><option>Speed</option><option>Area</option><option>Time</option><option>Data</option><option>Temperature</option></select></label><label className="lh-field">Value<input type="number" value={convertValue} onChange={e => setConvertValue(e.target.value)}/></label></div><div className="lh-input-row"><label className="lh-field">From<select value={convertFrom} onChange={e => setConvertFrom(e.target.value)}>{(convertCategory === "Temperature" ? ["°C","°F","K"] : Object.keys(({Length:{m:1,km:1,cm:1,mm:1,mi:1,ft:1,in:1,yd:1},Mass:{kg:1,g:1,mg:1,tonne:1,lb:1,oz:1},Volume:{L:1,mL:1,m3:1,"US gal":1,"UK gal":1},Speed:{"m/s":1,"km/h":1,mph:1,knot:1},Area:{"m²":1,"km²":1,"cm²":1,hectare:1,acre:1},Time:{second:1,minute:1,hour:1,day:1},Data:{B:1,KB:1,MB:1,GB:1,TB:1}} as Record<string,Record<string,number>>)[convertCategory] || {})).map(unit => <option key={unit}>{unit}</option>)}</select></label><label className="lh-field">To<select value={convertTo} onChange={e => setConvertTo(e.target.value)}>{(convertCategory === "Temperature" ? ["°C","°F","K"] : Object.keys(({Length:{m:1,km:1,cm:1,mm:1,mi:1,ft:1,in:1,yd:1},Mass:{kg:1,g:1,mg:1,tonne:1,lb:1,oz:1},Volume:{L:1,mL:1,m3:1,"US gal":1,"UK gal":1},Speed:{"m/s":1,"km/h":1,mph:1,knot:1},Area:{"m²":1,"km²":1,"cm²":1,hectare:1,acre:1},Time:{second:1,minute:1,hour:1,day:1},Data:{B:1,KB:1,MB:1,GB:1,TB:1}} as Record<string,Record<string,number>>)[convertCategory] || {})).map(unit => <option key={unit}>{unit}</option>)}</select></label><ActionButton onClick={doUniversalConversion}>Convert</ActionButton></div>{convertResult && <div className="lh-output"><strong>{convertResult}</strong></div>}</Panel>}

    {active === "World" && <div className="lh-two-col"><Panel title="Weather around the world" description="Current conditions and a short forecast from Open-Meteo."><div className="lh-input-row"><input value={weatherPlace} onChange={e => setWeatherPlace(e.target.value)} onKeyDown={e => e.key === "Enter" && void loadWorldWeather()} placeholder="City or town"/><ActionButton onClick={() => void loadWorldWeather()}>Get weather</ActionButton></div>{weatherData && <div className="lh-output"><h4>{weatherData.place.name}, {weatherData.place.country}</h4><strong>{weatherData.forecast.current.temperature_2m}°C</strong><p>Feels like {weatherData.forecast.current.apparent_temperature}°C · Humidity {weatherData.forecast.current.relative_humidity_2m}% · Wind {weatherData.forecast.current.wind_speed_10m} km/h</p><div className="lh-weather-days">{weatherData.forecast.daily.time.slice(0, 5).map((day: string, index: number) => <span key={day}>{day}<b>{weatherData.forecast.daily.temperature_2m_max[index]}° / {weatherData.forecast.daily.temperature_2m_min[index]}°</b></span>)}</div></div>}</Panel><Panel title="Currency converter" description="Reference exchange rates from Frankfurter. Rates are not a guaranteed transaction quote."><div className="lh-input-row"><input type="number" min="0" value={currencyAmount} onChange={e => setCurrencyAmount(e.target.value)}/><select value={currencyFrom} onChange={e => setCurrencyFrom(e.target.value)}>{["USD","GHS","EUR","GBP","NGN","ZAR","CAD","JPY","INR","KES"].map(x => <option key={x}>{x}</option>)}</select><span>to</span><select value={currencyTo} onChange={e => setCurrencyTo(e.target.value)}>{["GHS","USD","EUR","GBP","NGN","ZAR","CAD","JPY","INR","KES"].map(x => <option key={x}>{x}</option>)}</select><ActionButton onClick={() => void convertCurrency()}>Convert</ActionButton></div>{currencyData && <div className="lh-output"><strong>{currencyAmount} {currencyFrom} = {Number(currencyData.converted).toFixed(2)} {currencyTo}</strong><small>Rate date: {currencyData.date}</small></div>}<label className="lh-field">World clock<select value={worldTime} onChange={e => setWorldTime(e.target.value)}>{["Africa/Accra","Europe/London","Europe/Paris","America/New_York","America/Los_Angeles","Asia/Tokyo","Asia/Dubai","Asia/Kolkata","Australia/Sydney","Pacific/Auckland"].map(x => <option key={x}>{x}</option>)}</select></label><div className="lh-output"><b>{new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "medium", timeZone: worldTime }).format(new Date())}</b><small>{worldTime}</small></div><h4>Country information</h4><div className="lh-input-row"><input value={countryQuery} onChange={e => setCountryQuery(e.target.value)} placeholder="Country name"/><ActionButton onClick={() => void lookupCountry()}>Find country</ActionButton></div>{countryData && <div className="lh-output"><b>{countryData.name.common}</b><p>Capital: {(countryData.capital || []).join(", ") || "Not listed"} · Region: {countryData.region} · Population: {Number(countryData.population).toLocaleString()}</p><p>Languages: {Object.values(countryData.languages || {}).join(", ")}</p><a href={countryData.maps?.googleMaps} target="_blank" rel="noreferrer">Open country map ↗</a></div>}<h4>Public holidays</h4><div className="lh-input-row"><input value={holidayCountry} onChange={e => setHolidayCountry(e.target.value)} placeholder="ISO country code"/><input type="number" value={holidayYear} onChange={e => setHolidayYear(e.target.value)}/><ActionButton onClick={() => void lookupHolidays()}>Find holidays</ActionButton></div>{holidayData.length > 0 && <div className="lh-task-list">{holidayData.slice(0, 12).map((item: any) => <article key={item.date + item.name}><span>{item.date} · {item.localName}</span><small>{item.name}</small></article>)}</div>}</Panel></div>}

    {active === "Pulse" && <Panel title="Global news search" description="Search current indexed news reports. Open publishers for full reporting and context."><div className="lh-input-row"><input value={pulseQuery} onChange={e => setPulseQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && void loadPulse()} placeholder="Search a topic, country or event"/><ActionButton onClick={() => void loadPulse()} disabled={pulseBusy}>{pulseBusy ? "Searching…" : "Search news"}</ActionButton></div><div className="lh-results">{pulseResults.map((item, index) => <article key={item.url + index}><span>{item.source} · {item.date}</span><a href={item.url} target="_blank" rel="noreferrer">{item.title}</a></article>)}</div></Panel>}

    {active === "Scan" && <div className="lh-two-col"><Panel title="Create a QR code" description="Generate a QR image for a URL, contact card or short text."><textarea value={qrText} onChange={e => setQrText(e.target.value)} placeholder="Paste a URL or enter text…"/>{qrUrl && <div className="lh-qr"><img src={qrUrl} alt="Generated QR code"/><a href={qrUrl} target="_blank" rel="noreferrer">Open QR image</a></div>}</Panel><Panel title="Camera scanner" description="Use the existing Grand Lumen camera scanner to read QR codes and supported barcodes."><p>Camera access is requested only when you open the scanner.</p><ActionButton onClick={() => onOpenScanner?.()}>Open camera scanner</ActionButton></Panel></div>}

    {active === "Workspace" && <div className="lh-two-col"><Panel title="Tasks and schedule" description="Create tasks with optional due dates and mark them complete."><div className="lh-input-row"><input value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="What needs to get done?"/><input type="date" value={taskDue} onChange={e => setTaskDue(e.target.value)}/><ActionButton onClick={addTask}><Plus size={14}/> Add</ActionButton></div><div className="lh-task-list">{tasks.map(task => <article key={task.id}><label><input type="checkbox" checked={task.done} onChange={() => setTasks(current => current.map(item => item.id === task.id ? { ...item, done: !item.done } : item))}/><span className={task.done ? "done" : ""}>{task.title}</span></label><small>{task.due || "No due date"}</small><button onClick={() => setTasks(current => current.filter(item => item.id !== task.id))} aria-label="Delete task"><Trash2 size={14}/></button></article>)}</div></Panel><Panel title="Notes" description="Notes are saved automatically in this browser."><textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Capture thoughts, plans and useful information…"/><div className="lh-inline-actions"><ActionButton onClick={() => navigator.clipboard?.writeText(notes)}><Copy size={14}/> Copy notes</ActionButton><span className="lh-muted">Auto-saved locally</span></div></Panel></div>}

    {active === "Finance" && <div className="lh-finance"><div className="lh-metrics"><article><span>Income</span><b>{income.toFixed(2)}</b></article><article><span>Expenses</span><b>{expenses.toFixed(2)}</b></article><article><span>Net balance</span><b>{balance.toFixed(2)}</b></article></div><Panel title="Monthly budget" description="Set a budget and compare it with recorded expenses."><div className="lh-input-row"><label className="lh-field">Budget amount<input type="number" min="0" value={budget} onChange={e => setBudget(e.target.value)}/></label><div className="lh-budget-track"><span style={{ width: Math.min(100, totalBudget > 0 ? expenses / totalBudget * 100 : 0) + "%" }}/></div><b>{totalBudget > 0 ? Math.round(expenses / totalBudget * 100) : 0}% used</b></div></Panel><Panel title="Record transaction" description="Choose a currency in the description, for example GHS, USD or EUR."><div className="lh-input-row"><input value={entryName} onChange={e => setEntryName(e.target.value)} placeholder="Description / currency"/><input type="number" min="0" value={entryAmount} onChange={e => setEntryAmount(e.target.value)} placeholder="Amount"/><select value={entryKind} onChange={e => setEntryKind(e.target.value as "Income" | "Expense")}><option>Expense</option><option>Income</option></select><ActionButton onClick={addEntry}>Add</ActionButton></div><ActionButton onClick={exportFinance}><Download size={14}/> Export CSV</ActionButton><div className="lh-task-list">{entries.map(item => <article key={item.id}><span>{item.name} · {item.kind}</span><b>{item.kind === "Income" ? "+" : "−"}{item.amount.toFixed(2)}</b><button onClick={() => setEntries(current => current.filter(entry => entry.id !== item.id))} aria-label="Delete transaction"><Trash2 size={14}/></button></article>)}</div></Panel></div>}

    {active === "Vault" && <><Panel title="Personal file vault" description="Files are stored in this browser only. Keep backups; clearing browser storage can erase them. Each file is limited to 2 MB."><label className="lh-upload"><Upload size={16}/> Add files<input type="file" multiple accept="image/*,video/*,audio/*,.pdf,.txt,.md,.csv,.json,.doc,.docx" onChange={e => { Array.from(e.target.files || []).forEach(file => void storeVaultFile(file)); e.currentTarget.value = ""; }}/></label><div className="lh-task-list">{files.map(file => <article key={file.id}><FileText size={15}/><span>{file.name}<small>{(file.size / 1024).toFixed(1)} KB · {new Date(file.savedAt).toLocaleDateString()}</small></span><button onClick={() => setPreviewFile(file)} aria-label={"Preview " + file.name} title="Preview in app"><Activity size={14}/></button><button onClick={() => downloadVaultFile(file)} aria-label="Download file"><Download size={14}/></button><button onClick={() => { setFiles(current => current.filter(item => item.id !== file.id)); if (previewFile?.id === file.id) setPreviewFile(null); }} aria-label="Delete file"><Trash2 size={14}/></button></article>)}</div>{!files.length && <p className="lh-muted">Your vault is empty.</p>}</Panel>{previewFile && <div className="lh-vault-preview-backdrop" role="dialog" aria-modal="true" aria-label={"Preview " + previewFile.name}><section className="lh-vault-preview"><header><div><b>{previewFile.name}</b><small>{previewFile.type || "Unknown file type"}</small></div><button onClick={() => setPreviewFile(null)} aria-label="Close preview">×</button></header><div className="lh-vault-preview-body">{previewFile.type.startsWith("image/") ? <img src={previewFile.data} alt={previewFile.name}/> : previewFile.type.startsWith("video/") ? <video src={previewFile.data} controls playsInline /> : previewFile.type.startsWith("audio/") ? <audio src={previewFile.data} controls /> : previewFile.type === "application/pdf" || /\.pdf$/i.test(previewFile.name) ? <iframe src={previewFile.data} title={previewFile.name}/> : previewText ? <pre>{previewText}</pre> : <div className="lh-muted">This file type cannot be previewed in the app. You can still download it.</div>}</div><footer><button className="lh-secondary" onClick={() => downloadVaultFile(previewFile)}><Download size={14}/> Download file</button></footer></section></div>}</>}

    {active === "Academy" && <div className="lh-two-col"><Panel title={course.title} description={course.topic + " · Self-guided lesson"}><p className="lh-lesson">{course.lesson}</p><div className="lh-input-row"><ActionButton onClick={() => { setCourseIndex((courseIndex + courses.length - 1) % courses.length); setCourseRevealed(false); setCourseAnswer(""); }}>Previous lesson</ActionButton><ActionButton onClick={() => { setCourseIndex((courseIndex + 1) % courses.length); setCourseRevealed(false); setCourseAnswer(""); }}>Next lesson</ActionButton></div></Panel><Panel title="Check your understanding" description={course.question}><input value={courseAnswer} onChange={e => setCourseAnswer(e.target.value)} placeholder="Write your answer…"/><ActionButton onClick={() => setCourseRevealed(true)}>Reveal model answer</ActionButton>{courseRevealed && <div className="lh-output"><b>Model answer</b><p>{course.answer}</p></div>}</Panel></div>}

    {active === "Code" && <div className="lh-two-col"><Panel title="HTML playground" description="Edit HTML, CSS and JavaScript and preview the result locally. The preview runs in a sandboxed frame."><div className="lh-code-tabs">{(["HTML","CSS","JavaScript"] as const).map(tab => <button className={codeTab === tab ? "active" : ""} key={tab} onClick={() => setCodeTab(tab)}>{tab}</button>)}</div><textarea className="lh-code-editor" spellCheck={false} value={codeTab === "HTML" ? codeText : codeTab === "CSS" ? codeCss : codeJs} onChange={e => codeTab === "HTML" ? setCodeText(e.target.value) : codeTab === "CSS" ? setCodeCss(e.target.value) : setCodeJs(e.target.value)}/><div className="lh-preview-label">LIVE PREVIEW</div><iframe title="Lumen code preview" sandbox="allow-scripts" srcDoc={previewDocument}/></Panel><Panel title="Safe preview" description="The preview is sandboxed and does not receive access to the parent application or its storage."><p>Use this playground for front-end experiments. For larger projects, use the full Code Lab workspace.</p><ActionButton onClick={() => navigator.clipboard?.writeText(codeText + "\n<style>" + codeCss + "</style>\n<script>" + codeJs + "</script>")}><Copy size={14}/> Copy project source</ActionButton></Panel></div>}

    {active === "Lab" && <div className="lh-two-col"><Panel title="Science unit converter" description="Convert common physics and chemistry measurements."><div className="lh-input-row"><input type="number" value={labValue} onChange={e => setLabValue(e.target.value)}/><select value={labUnit} onChange={e => setLabUnit(e.target.value)}>{["km/h","m/s","°C","°F","cm","m","kg","g","kPa","Pa"].map(x => <option key={x}>{x}</option>)}</select><ActionButton onClick={doLabConversion}>Convert</ActionButton></div>{labResult && <div className="lh-output"><strong>{labResult}</strong></div>}</Panel><Panel title="Formula reference" description="Common formulas for mathematics and science."><div className="lh-formula-list"><p><b>Speed</b><span>v = distance ÷ time</span></p><p><b>Density</b><span>ρ = mass ÷ volume</span></p><p><b>Force</b><span>F = ma</span></p><p><b>Electrical power</b><span>P = VI</span></p><p><b>Ohm's law</b><span>V = IR</span></p><p><b>Work done</b><span>W = Fd</span></p><p><b>Wave speed</b><span>v = fλ</span></p><p><b>Area of a circle</b><span>A = πr²</span></p><p><b>Quadratic formula</b><span>x = (−b ± √(b² − 4ac)) / 2a</span></p></div></Panel></div>}

    {active === "Create" && <div className="lh-two-col"><Panel title="Project planner" description="Break an idea into a goal and manageable steps."><input value={idea} onChange={e => setIdea(e.target.value)} placeholder="Project name or idea"/><textarea value={projectGoal} onChange={e => setProjectGoal(e.target.value)} placeholder="What outcome do you want to achieve?"/><div className="lh-input-row"><input value={stepInput} onChange={e => setStepInput(e.target.value)} placeholder="Add a milestone"/><ActionButton onClick={() => { if (stepInput.trim()) { setProjectSteps(current => [...current, stepInput.trim()]); setStepInput(""); } }}><Plus size={14}/> Add step</ActionButton></div><div className="lh-task-list">{projectSteps.map((step, index) => <article key={index}><span>{index + 1}. {step}</span><button onClick={() => setProjectSteps(current => current.filter((_, i) => i !== index))}><Trash2 size={14}/></button></article>)}</div><ActionButton onClick={saveProjectPlan}>Save project plan</ActionButton></Panel><Panel title="Saved plan" description="Your latest plan is saved on this device."><p className="lh-muted">Use the project planner to shape an idea into clear milestones and next actions.</p></Panel></div>}

    {active === "Translate" && <Panel title="Text translation" description="Select both languages yourself. Translation is provided by MyMemory and may have usage limits or quality differences."><div className="lh-input-row"><select value={translateFrom} onChange={e => setTranslateFrom(e.target.value)}>{languages.map(item => <option value={item.code} key={item.code}>{item.name}</option>)}</select><span>to</span><select value={translateTo} onChange={e => setTranslateTo(e.target.value)}>{languages.map(item => <option value={item.code} key={item.code}>{item.name}</option>)}</select></div><textarea value={translateText} onChange={e => setTranslateText(e.target.value)} placeholder="Enter text to translate…"/><ActionButton onClick={() => void translate()} disabled={translateBusy}>{translateBusy ? "Translating…" : "Translate text"}</ActionButton>{translated && <div className="lh-output"><p>{translated}</p><ActionButton onClick={() => navigator.clipboard?.writeText(translated)}><Copy size={14}/> Copy translation</ActionButton></div>}</Panel>}

    {active === "Accessibility" && <div className="lh-two-col"><Panel title="Read text aloud" description="Use your device's built-in speech synthesis."><textarea value={speechText} onChange={e => setSpeechText(e.target.value)}/><div className="lh-inline-actions"><ActionButton onClick={speak}>Read aloud</ActionButton><ActionButton onClick={() => window.speechSynthesis?.cancel()}>Stop</ActionButton></div><label className="lh-check"><input type="checkbox" checked={highContrast} onChange={e => setHighContrast(e.target.checked)}/> High contrast in this workspace</label></Panel><Panel title="Reading preferences" description="Use your browser zoom and operating-system accessibility settings for app-wide scaling."><p>Grand Lumen supports keyboard navigation, readable labels and responsive layouts in this workspace. Browser zoom can enlarge the entire interface without changing your saved preferences.</p></Panel></div>}

    {active === "Offline" && <div className="lh-two-col"><Panel title="Offline readiness" description="Your local notes, tasks and stored files remain in this browser. Network-only services need a connection."><div className="lh-network"><span className={networkOnline ? "lh-online" : "lh-offline"}/>{networkOnline ? "Connection available" : "Offline mode"}</div><p>Offline reading list: {readLocal<Resource[]>("lumenOfflineResources", []).length} saved links.</p><ActionButton onClick={exportOfflineNotes}><Download size={14}/> Export offline pack</ActionButton></Panel><Panel title="Save resources for later" description="Keep useful source links in your local reading list."><div className="lh-results">{resources.slice(0, 5).map(resource => <article key={resource.url}><a href={resource.url} target="_blank" rel="noreferrer">{resource.title}</a><p>{resource.description}</p><button onClick={() => saveOfflineResource(resource)}>Save for offline list</button></article>)}</div></Panel></div>}

    {active === "Connect" && <Panel title="Global digital directory" description="A curated starting point for public knowledge, science, development and learning services."><div className="lh-connect-grid">{resources.map(resource => <article key={resource.url}><span>{resource.source}</span><h4>{resource.title}</h4><p>{resource.description}</p><a href={resource.url} target="_blank" rel="noreferrer">Visit resource ↗</a><button onClick={() => saveOfflineResource(resource)}>Save resource</button></article>)}</div></Panel>}

    {active === "Alerts" && <Panel title="Personal reminders" description="Create reminders. Browser notifications are optional and require your permission."><div className="lh-input-row"><input value={reminderTitle} onChange={e => setReminderTitle(e.target.value)} placeholder="Reminder title"/><input type="datetime-local" value={reminderWhen} onChange={e => setReminderWhen(e.target.value)}/><ActionButton onClick={() => void addReminder()}><Plus size={14}/> Add reminder</ActionButton></div><div className="lh-task-list">{reminders.map(item => <article key={item.id}><CalendarDays size={14}/><span>{item.title}<small>{new Date(item.when).toLocaleString()}</small></span><small>{item.notified ? "Notified" : "Scheduled"}</small><button onClick={() => setReminders(current => current.filter(reminder => reminder.id !== item.id))}><Trash2 size={14}/></button></article>)}</div></Panel>}

    {!moduleOpened && <div className="lh-footer"><span><ShieldCheck size={14}/> Your personal data is stored locally in this browser unless a feature explicitly uses an external public service.</span><span><Activity size={14}/> Lumen Core · {coreActivity}</span></div>}
  </div>;
}
