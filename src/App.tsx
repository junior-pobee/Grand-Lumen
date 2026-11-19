import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Activity, Bell, Newspaper, ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, Atom, BookOpen, Bookmark, Boxes, Calculator, Check, CheckCircle2, ChevronDown, CircleHelp, Code2, Compass, Copy, Database, ExternalLink, Eye, EyeOff, FileText, FlaskConical, Globe2, GraduationCap, Image, Languages, Layers3, Library, LocateFixed, LockKeyhole, LogIn, LogOut, Mail, MapPin, Maximize2, Menu, Moon, MonitorSmartphone, Navigation, Play, Plus, Search, Send, Settings, ShieldCheck, Sparkles, Sun, Terminal, UserRound, Video, Wallet, X, Zap, QrCode, ScanLine, Share2, Upload, Download, Smartphone } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import Peer from "peerjs";
import GraphWorkspace from "./GraphWorkspace";
import ExpansionHub from "./ExpansionHub";
import TeamWorkspace from "./TeamWorkspace";
import LumenSheets from "./LumenSheets";
import ActivityDigest, { type ActivityEntry } from "./ActivityDigest";
import WelcomeTour from "./WelcomeTour";
import { supabase, supabaseConfigured } from "./auth";
import { getCurrency, getDictionary, getHoliday, getPokemon, getWeather, researchTopic, searchArchiveVideos, searchCommonsImages, searchHackerNews, searchWikipedia, searchGlobalNews, type SearchItem, type NewsItem, connectionAwareMessage } from "./api";

function escapeCode(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function highlightCode(value: string): string {
  const escaped = escapeCode(value);
  const pattern = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|&lt;!--[\s\S]*?--&gt;|&lt;\/?[A-Za-z][^&]*?&gt;|&quot;.*?&quot;|&#39;.*?&#39;|\b(?:const|let|var|function|return|if|else|for|while|class|new|import|from|export|default|async|await|try|catch|throw|true|false|null|undefined|public|static|void|int|float|double|char|include|using|namespace|print|def|lambda|SELECT|FROM|WHERE|CREATE|TABLE)\b|\b\d+(?:\.\d+)?\b)/g;
  return escaped.replace(pattern, token => {
    if (token.startsWith("//") || token.startsWith("/*") || token.startsWith("&lt;!--")) return '<span class="syntax-comment">' + token + '</span>';
    if (token.startsWith("&quot;") || token.startsWith("&#39;")) return '<span class="syntax-string">' + token + '</span>';
    if (token.startsWith("&lt;")) return '<span class="syntax-tag">' + token + '</span>';
    if (/^\d/.test(token)) return '<span class="syntax-number">' + token + '</span>';
    return '<span class="syntax-keyword">' + token + '</span>';
  });
}

function accountProfileImage(email: string): string {
  try {
    const images = JSON.parse(localStorage.getItem("grandLumenProfileImages") || "{}") as Record<string, string>;
    return images[email.trim().toLowerCase()] || "";
  } catch {
    return "";
  }
}

function saveAccountProfileImage(email: string, image: string): void {
  try {
    const images = JSON.parse(localStorage.getItem("grandLumenProfileImages") || "{}") as Record<string, string>;
    const key = email.trim().toLowerCase();
    if (image) images[key] = image;
    else delete images[key];
    localStorage.setItem("grandLumenProfileImages", JSON.stringify(images));
  } catch {
    localStorage.setItem("grandLumenProfileImages", JSON.stringify({ [email.trim().toLowerCase()]: image }));
  }
}

function initialDisplayScale(key: string): number {
  const smallScreen = typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;
  const stored = localStorage.getItem(smallScreen ? key + "Mobile" : key);
  const value = Number(stored ?? "1");
  return Number.isFinite(value) ? value : 1;
}

function readWorkspaceData<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

async function hashLocalPassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: Uint8Array.from(salt.match(/.{1,2}/g) || [], value => parseInt(value, 16)), iterations: 180000, hash: "SHA-256" }, key, 256);
  return Array.from(new Uint8Array(bits)).map(value => value.toString(16).padStart(2, "0")).join("");
}

type Section = "Lumen Hub" | "Home" | "Search" | "Research" | "News" | "Images" | "Videos" | "Maps" | "Code Lab" | "Learn" | "API Library" | "Tools" | "Scanner" | "Share" | "Saved" | "Activity Digest" | "Projects" | "Creative Studio" | "Messages" | "Team" | "Settings";
const sections: { name: Section; icon: any; group: string }[] = [
  { name: "Home", icon: Compass, group: "Workspace" },
  { name: "Search", icon: Search, group: "Workspace" },
  { name: "Research", icon: FlaskConical, group: "Workspace" },
  { name: "News", icon: Newspaper, group: "Explore" },
  { name: "Images", icon: Image, group: "Explore" },
  { name: "Videos", icon: Video, group: "Explore" },
  { name: "Maps", icon: MapPin, group: "Explore" },
  { name: "Code Lab", icon: Code2, group: "Create" },
  { name: "Learn", icon: GraduationCap, group: "Create" },
  { name: "API Library", icon: Database, group: "Discover" },
  { name: "Tools", icon: Calculator, group: "Discover" },
  { name: "Scanner", icon: ScanLine, group: "Discover" },
  { name: "Share", icon: Share2, group: "Discover" },
  { name: "Messages", icon: Mail, group: "Discover" },
  { name: "Team", icon: UserRound, group: "Discover" },
  { name: "Saved", icon: Bookmark, group: "Personal" },
  { name: "Activity Digest", icon: Activity, group: "Personal" },
  { name: "Projects", icon: Boxes, group: "Personal" },
  { name: "Creative Studio", icon: Image, group: "Create" },
  { name: "Lumen Hub", icon: Boxes, group: "Create" },
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

const apiSourceUrls: Record<string, string> = {
  "Wikipedia": "https://www.mediawiki.org/wiki/API:Main_page",
  "Hacker News": "https://github.com/HackerNews/API",
  "Open-Meteo": "https://open-meteo.com/en/docs",
  "Frankfurter": "https://frankfurter.dev/",
  "PokéAPI": "https://pokeapi.co/docs/v2",
  "TheMealDB": "https://www.themealdb.com/api.php",
  "Dictionary API": "https://dictionaryapi.dev/",
  "Nager.Date": "https://date.nager.at/Api",
  "World Bank": "https://datahelpdesk.worldbank.org/knowledgebase/topics/125589",
  "REST Countries": "https://restcountries.com/",
  "GitHub API": "https://docs.github.com/en/rest",
  "npm Registry": "https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md",
  "Stack Exchange": "https://api.stackexchange.com/docs",
  "DEV Community": "https://developers.forem.com/api",
  "NASA Open APIs": "https://api.nasa.gov/",
  "Guardian Open Platform": "https://open-platform.theguardian.com/documentation/",
  "Unsplash": "https://unsplash.com/documentation",
  "Pexels": "https://www.pexels.com/api/documentation/",
  "Pixabay": "https://pixabay.com/api/docs/",
  "Hugging Face": "https://huggingface.co/docs/api-inference/index"
};
const languages = ["HTML","CSS","JavaScript","TypeScript","Python","C","C++","Java","C#","Go","Rust","PHP","Ruby","SQL","Bash"];
const starterCode: Record<string, string> = {
  HTML: `<!doctype html>
<html>
  <head>
    <title>My Grand-Lumen Project</title>
  </head>
  <body>
    <h1>Hello, Grand-Lumen!</h1>
    <p>Build something remarkable.</p>
  </body>
</html>`,
  CSS: `body {
  font-family: system-ui, sans-serif;
  background: #080d1b;
  color: white;
  padding: 3rem;
}`,
  JavaScript: `const vision = "Build beyond limits";
console.log(vision);`,
  TypeScript: `type Project = {
  name: string;
  status: "building" | "ready";
};

const project: Project = { name: "Grand-Lumen", status: "building" };
console.log(project);`,
  Python: `project = "Grand-Lumen"
print(f"Welcome to {project}")`,
  C: `#include <stdio.h>

int main(void) {
    printf("Hello, Grand-Lumen!\\n");
    return 0;
}`,
  "C++": `#include <iostream>

int main() {
    std::cout << "Hello, Grand-Lumen!\\n";
    return 0;
}`,
  Java: `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, Grand-Lumen!");
    }
}`,
  "C#": `using System;

class Program {
    static void Main() {
        Console.WriteLine("Hello, Grand-Lumen!");
    }
}`,
  Go: `package main

import "fmt"

func main() {
    fmt.Println("Hello, Grand-Lumen!")
}`,
  Rust: `fn main() {
    println!("Hello, Grand-Lumen!");
}`,
  PHP: `<?php
echo "Hello, Grand-Lumen!";
`,
  Ruby: `puts "Hello, Grand-Lumen!"`,
  SQL: `SELECT 'Hello, Grand-Lumen!' AS message;`,
  Bash: `printf '%s\\n' 'Hello, Grand-Lumen!'`
};
const toolCards = [
  ["Calculator","A quick arithmetic workspace",Calculator],
  ["Graph Studio","Mathematical and scientific graphing",Activity],
  ["Dictionary","Definitions, phonetics and meanings",BookOpen],
  ["Weather","Current conditions and forecast",Globe2],
  ["Currency","Live reference-rate conversion",Wallet],
  ["Pokédex","Explore Pokémon data",Atom],
  ["Public Holidays","Explore national holiday calendars",Activity],
  ["Alerts","Create and manage reminders",Bell]
] as const;


const appLanguages: { code: string; name: string }[] = [
  {
    "code": "en",
    "name": "English"
  },
  {
    "code": "af",
    "name": "Afrikaans"
  },
  {
    "code": "sq",
    "name": "Albanian"
  },
  {
    "code": "am",
    "name": "Amharic"
  },
  {
    "code": "ar",
    "name": "Arabic"
  },
  {
    "code": "hy",
    "name": "Armenian"
  },
  {
    "code": "az",
    "name": "Azerbaijani"
  },
  {
    "code": "eu",
    "name": "Basque"
  },
  {
    "code": "be",
    "name": "Belarusian"
  },
  {
    "code": "bn",
    "name": "Bengali"
  },
  {
    "code": "bs",
    "name": "Bosnian"
  },
  {
    "code": "bg",
    "name": "Bulgarian"
  },
  {
    "code": "ca",
    "name": "Catalan"
  },
  {
    "code": "ceb",
    "name": "Cebuano"
  },
  {
    "code": "zh-CN",
    "name": "Chinese (Simplified)"
  },
  {
    "code": "zh-TW",
    "name": "Chinese (Traditional)"
  },
  {
    "code": "co",
    "name": "Corsican"
  },
  {
    "code": "hr",
    "name": "Croatian"
  },
  {
    "code": "cs",
    "name": "Czech"
  },
  {
    "code": "da",
    "name": "Danish"
  },
  {
    "code": "nl",
    "name": "Dutch"
  },
  {
    "code": "eo",
    "name": "Esperanto"
  },
  {
    "code": "et",
    "name": "Estonian"
  },
  {
    "code": "tl",
    "name": "Filipino"
  },
  {
    "code": "fi",
    "name": "Finnish"
  },
  {
    "code": "fr",
    "name": "French"
  },
  {
    "code": "fy",
    "name": "Frisian"
  },
  {
    "code": "gl",
    "name": "Galician"
  },
  {
    "code": "ka",
    "name": "Georgian"
  },
  {
    "code": "de",
    "name": "German"
  },
  {
    "code": "el",
    "name": "Greek"
  },
  {
    "code": "gu",
    "name": "Gujarati"
  },
  {
    "code": "ht",
    "name": "Haitian Creole"
  },
  {
    "code": "ha",
    "name": "Hausa"
  },
  {
    "code": "haw",
    "name": "Hawaiian"
  },
  {
    "code": "he",
    "name": "Hebrew"
  },
  {
    "code": "hi",
    "name": "Hindi"
  },
  {
    "code": "hmn",
    "name": "Hmong"
  },
  {
    "code": "hu",
    "name": "Hungarian"
  },
  {
    "code": "is",
    "name": "Icelandic"
  },
  {
    "code": "ig",
    "name": "Igbo"
  },
  {
    "code": "id",
    "name": "Indonesian"
  },
  {
    "code": "ga",
    "name": "Irish"
  },
  {
    "code": "it",
    "name": "Italian"
  },
  {
    "code": "ja",
    "name": "Japanese"
  },
  {
    "code": "jv",
    "name": "Javanese"
  },
  {
    "code": "kn",
    "name": "Kannada"
  },
  {
    "code": "kk",
    "name": "Kazakh"
  },
  {
    "code": "km",
    "name": "Khmer"
  },
  {
    "code": "rw",
    "name": "Kinyarwanda"
  },
  {
    "code": "ko",
    "name": "Korean"
  },
  {
    "code": "ku",
    "name": "Kurdish"
  },
  {
    "code": "ky",
    "name": "Kyrgyz"
  },
  {
    "code": "lo",
    "name": "Lao"
  },
  {
    "code": "la",
    "name": "Latin"
  },
  {
    "code": "lv",
    "name": "Latvian"
  },
  {
    "code": "lt",
    "name": "Lithuanian"
  },
  {
    "code": "lb",
    "name": "Luxembourgish"
  },
  {
    "code": "mk",
    "name": "Macedonian"
  },
  {
    "code": "mg",
    "name": "Malagasy"
  },
  {
    "code": "ms",
    "name": "Malay"
  },
  {
    "code": "ml",
    "name": "Malayalam"
  },
  {
    "code": "mt",
    "name": "Maltese"
  },
  {
    "code": "mi",
    "name": "Maori"
  },
  {
    "code": "mr",
    "name": "Marathi"
  },
  {
    "code": "mn",
    "name": "Mongolian"
  },
  {
    "code": "my",
    "name": "Myanmar (Burmese)"
  },
  {
    "code": "ne",
    "name": "Nepali"
  },
  {
    "code": "no",
    "name": "Norwegian"
  },
  {
    "code": "ny",
    "name": "Nyanja (Chichewa)"
  },
  {
    "code": "or",
    "name": "Odia"
  },
  {
    "code": "ps",
    "name": "Pashto"
  },
  {
    "code": "fa",
    "name": "Persian"
  },
  {
    "code": "pl",
    "name": "Polish"
  },
  {
    "code": "pt",
    "name": "Portuguese"
  },
  {
    "code": "pa",
    "name": "Punjabi"
  },
  {
    "code": "ro",
    "name": "Romanian"
  },
  {
    "code": "ru",
    "name": "Russian"
  },
  {
    "code": "sm",
    "name": "Samoan"
  },
  {
    "code": "gd",
    "name": "Scots Gaelic"
  },
  {
    "code": "sr",
    "name": "Serbian"
  },
  {
    "code": "st",
    "name": "Sesotho"
  },
  {
    "code": "sn",
    "name": "Shona"
  },
  {
    "code": "sd",
    "name": "Sindhi"
  },
  {
    "code": "si",
    "name": "Sinhala"
  },
  {
    "code": "sk",
    "name": "Slovak"
  },
  {
    "code": "sl",
    "name": "Slovenian"
  },
  {
    "code": "so",
    "name": "Somali"
  },
  {
    "code": "es",
    "name": "Spanish"
  },
  {
    "code": "su",
    "name": "Sundanese"
  },
  {
    "code": "sw",
    "name": "Swahili"
  },
  {
    "code": "sv",
    "name": "Swedish"
  },
  {
    "code": "tg",
    "name": "Tajik"
  },
  {
    "code": "ta",
    "name": "Tamil"
  },
  {
    "code": "tt",
    "name": "Tatar"
  },
  {
    "code": "te",
    "name": "Telugu"
  },
  {
    "code": "th",
    "name": "Thai"
  },
  {
    "code": "tr",
    "name": "Turkish"
  },
  {
    "code": "tk",
    "name": "Turkmen"
  },
  {
    "code": "uk",
    "name": "Ukrainian"
  },
  {
    "code": "ur",
    "name": "Urdu"
  },
  {
    "code": "ug",
    "name": "Uyghur"
  },
  {
    "code": "uz",
    "name": "Uzbek"
  },
  {
    "code": "vi",
    "name": "Vietnamese"
  },
  {
    "code": "cy",
    "name": "Welsh"
  },
  {
    "code": "xh",
    "name": "Xhosa"
  },
  {
    "code": "yi",
    "name": "Yiddish"
  },
  {
    "code": "yo",
    "name": "Yoruba"
  },
  {
    "code": "zu",
    "name": "Zulu"
  }
];

type PortalMode = "about" | "signin" | "signup";

function PublicPortal({ onGuest }: { onGuest: (profile?: { fullName: string; email: string; profileImage?: string; onboardingPending?: boolean }) => void }) {
  const [mode, setMode] = useState<PortalMode>("about");
  return <div className="public-portal">
    <div className="portal-ambient portal-ambient-one" />
    <div className="portal-ambient portal-ambient-two" />
    <header className="portal-nav">
      <button className="portal-brand" onClick={() => setMode("about")}><span className="portal-brand-mark"><img src={`${import.meta.env.BASE_URL}icons/grand-lumen-icon.svg`} alt="Grand-Lumen" /></span><span><b>GRAND-LUMEN</b><small>EXPLORE BEYOND</small></span></button>
      <nav><button className={mode === "about" ? "portal-nav-active" : ""} onClick={() => setMode("about")}>Overview</button><button onClick={() => setMode("signin")}>Sign in</button><button className="portal-nav-cta" onClick={() => setMode("signup")}>Create account <ArrowUpRight size={15} /></button></nav>
    </header>
    {mode === "about" ? <main className="portal-about">
      <section className="portal-hero">
        <div className="portal-copy"><span className="portal-kicker"><span /> A UNIVERSE FOR THE CURIOUS</span><h1>Think wider.<br /><span>Build beyond.</span></h1><p>Grand-Lumen is a connected digital environment for discovering knowledge, researching ideas, learning skills and creating things that matter.</p><div className="portal-actions"><button className="portal-primary" onClick={() => setMode("signup")}>Create your account <ArrowUpRight size={17} /></button><button className="portal-secondary" onClick={() => setMode("signin")}>Sign in <ArrowRight size={16} /></button></div><div className="portal-trust"><ShieldCheck size={16} /><span>A simple account to unlock your workspace on this device.</span></div></div>
        <div className="portal-visual"><div className="portal-orbit orbit-one" /><div className="portal-orbit orbit-two" /><div className="portal-orbit orbit-three" /><div className="portal-core"><img src={`${import.meta.env.BASE_URL}icons/grand-lumen-icon.svg`} alt="Grand-Lumen star and rings emblem" /><small>GRAND<br />LUMEN</small></div><div className="portal-float portal-float-search"><Search size={16} /><span>Discovery</span></div><div className="portal-float portal-float-code"><Code2 size={16} /><span>Creation</span></div><div className="portal-float portal-float-learn"><BookOpen size={16} /><span>Learning</span></div></div>
      </section>
      <section className="portal-manifesto"><div><span className="portal-kicker">THE GRAND-LUMEN IDEA</span><h2>More than a search page.<br /><span>A place to make progress.</span></h2></div><p>Grand-Lumen brings useful digital capabilities into one organised workspace. Move from a question to a source, from a concept to a lesson, and from an idea to a working project without losing your direction.</p></section>
      <section className="portal-feature-section"><div className="portal-section-heading"><span className="portal-kicker">INSIDE THE UNIVERSE</span><h2>One environment.<br /><span>Many ways to explore.</span></h2></div><div className="portal-feature-grid">
        {[{icon:Search,title:"Discovery engine",detail:"Explore knowledge and technology sources in one search experience."},{icon:FlaskConical,title:"Research studio",detail:"Investigate topics, collect source material and organise your thinking."},{icon:Code2,title:"Multi-language Code Lab",detail:"Experiment with programming languages and preview web projects."},{icon:GraduationCap,title:"Learning hub",detail:"Build practical knowledge through guided learning paths."},{icon:Image,title:"Visual universe",detail:"Discover images and public video collections."},{icon:MapPin,title:"Maps and location",detail:"Explore places, use device GPS and plan directions."},{icon:Calculator,title:"Smart utilities",detail:"Use a scientific calculator, dictionary, weather and conversion tools."},{icon:Database,title:"API library",detail:"Discover services and open data for future integrations."}].map((item,index)=>{const Icon=item.icon;return <article className="portal-feature" key={item.title}><span className="portal-feature-index">0{index+1}</span><span className="portal-feature-icon"><Icon size={20}/></span><h3>{item.title}</h3><p>{item.detail}</p></article>;})}
      </div></section>
      <section className="portal-account-band"><div><span className="portal-kicker">YOUR WORKSPACE, YOUR ACCOUNT</span><h2>Pick up where you left off.</h2><p>Create a temporary local account to unlock Grand-Lumen in this browser. Cloud sign-in and cross-device access will be added when Supabase is connected.</p></div><button className="portal-primary" onClick={() => setMode("signup")}>Get started <ArrowUpRight size={17}/></button></section>
      <footer className="portal-footer"><span>GRAND-LUMEN</span><span>EXPLORE BEYOND · BUILD WHAT COMES NEXT</span><button onClick={() => setMode("signin")}>Account access <ArrowRight size={14}/></button></footer>
    </main> : <AuthPanel mode={mode} onModeChange={setMode} onGuest={onGuest} />}
  </div>;
}

function AuthPanel({ mode, onModeChange, onGuest }: { mode: "signin" | "signup"; onModeChange: (mode: PortalMode) => void; onGuest: (profile?: { fullName: string; email: string; profileImage?: string; onboardingPending?: boolean }) => void }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"error" | "success" | "info">("info");
  const isSignup = mode === "signup";
  const setNotice = (value: string, type: "error" | "success" | "info" = "info") => {
    setMessage(value);
    setMessageType(type);
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    if (password.length < 8) {
      setNotice("Use a password with at least 8 characters.", "error");
      return;
    }
    setBusy(true);
    try {
      if (supabase) {
        if (isSignup) {
          const { data, error } = await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: {
              data: { full_name: fullName.trim(), grand_lumen_onboarding_pending: true },
              emailRedirectTo: window.location.origin + window.location.pathname
            }
          });
          if (error) throw error;
          if (data.session) setNotice("Your account is ready. Opening your workspace…", "success");
          else setNotice("Account created. Email confirmation is still required by the current authentication settings. Verify your email, then sign in.", "success");
        } else {
          const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
          if (error) throw error;
        }
      } else {
        const accounts = JSON.parse(localStorage.getItem("grandLumenLocalAccounts") || "[]") as { fullName: string; email: string; salt: string; passwordHash: string; onboardingPending?: boolean }[];
        const normalizedEmail = email.trim().toLowerCase();
        if (isSignup) {
          if (accounts.some(account => account.email === normalizedEmail)) throw new Error("An account with this email already exists. Sign in instead.");
          const salt = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(value => value.toString(16).padStart(2, "0")).join("");
          const passwordHash = await hashLocalPassword(password, salt);
          accounts.push({ fullName: fullName.trim(), email: normalizedEmail, salt, passwordHash, onboardingPending: true });
          localStorage.setItem("grandLumenLocalAccounts", JSON.stringify(accounts));
          localStorage.setItem("grandLumenLocalSession", JSON.stringify({ fullName: fullName.trim(), email: normalizedEmail, onboardingPending: true }));
          setNotice("Your local account is ready. Opening Grand-Lumen…", "success");
          window.setTimeout(() => onGuest({ fullName: fullName.trim(), email: normalizedEmail, onboardingPending: true }), 250);
        } else {
          const account = accounts.find(item => item.email === normalizedEmail);
          if (!account || await hashLocalPassword(password, account.salt) !== account.passwordHash) throw new Error("Email or password is incorrect.");
          const profile = { fullName: account.fullName, email: account.email, profileImage: accountProfileImage(account.email), onboardingPending: account.onboardingPending === true };
          localStorage.setItem("grandLumenLocalSession", JSON.stringify(profile));
          setNotice("Signed in. Opening Grand-Lumen…", "success");
          window.setTimeout(() => onGuest(profile), 250);
        }
      }
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Authentication could not be completed.", "error");
    } finally {
      setBusy(false);
    }
  };
  const resetPassword = async () => {
    if (!email.trim()) {
      setNotice("Enter your email address first, then request a reset link.", "info");
      return;
    }
    if (!supabase) {
      setNotice("Local accounts do not use email recovery. Create a new account if you no longer have access to this one.", "info");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + window.location.pathname });
      if (error) throw error;
      setNotice("Password reset instructions have been sent to your email.", "success");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Could not send the reset email.", "error");
    } finally {
      setBusy(false);
    }
  };
  return <main className="portal-auth-layout">
    <section className="portal-auth-story"><button className="portal-brand" onClick={() => onModeChange("about")}><span className="portal-brand-mark"><img src={`${import.meta.env.BASE_URL}icons/grand-lumen-icon.svg`} alt="Grand-Lumen" /></span><span><b>GRAND-LUMEN</b><small>EXPLORE BEYOND</small></span></button><div className="portal-story-copy"><span className="portal-kicker">YOUR NEXT CHAPTER STARTS HERE</span><h1>{isSignup ? "Create space for your next idea." : "Your world of discovery awaits."}</h1><p>Research, learn, explore and build from one connected digital workspace.</p><div className="portal-story-points"><span><CheckCircle2 size={17}/> One account across your devices</span><span><CheckCircle2 size={17}/> A workspace built for curiosity</span><span><CheckCircle2 size={17}/> Secure email and password access</span></div></div><div className="portal-story-footer">GRAND-LUMEN · EXPLORE BEYOND</div></section>
    <section className="portal-auth-side"><div className="portal-auth-card"><button className="portal-back-link" onClick={() => onModeChange("about")}><ArrowLeft size={15}/> Back to overview</button><div className="portal-auth-tabs"><button className={!isSignup ? "active" : ""} onClick={() => { onModeChange("signin"); setNotice(""); }}>Sign in</button><button className={isSignup ? "active" : ""} onClick={() => { onModeChange("signup"); setNotice(""); }}>Create account</button></div><span className="portal-kicker">{isSignup ? "JOIN GRAND-LUMEN" : "WELCOME BACK"}</span><h2>{isSignup ? "Start exploring." : "Good to see you."}</h2><p className="portal-auth-intro">{isSignup ? "Create your account to enter your personal workspace." : "Sign in to continue to your Grand-Lumen workspace."}</p>
      {!supabaseConfigured && <div className="portal-config-notice"><LockKeyhole size={17}/><span>Temporary local accounts are active. Your account works in this browser only; cross-device sync will be enabled when cloud authentication is added.</span></div>}
      <form onSubmit={submit}>
        {isSignup && <label>Full name<div className="portal-input"><UserRound size={17}/><input value={fullName} onChange={event => setFullName(event.target.value)} placeholder="Your name" autoComplete="name" required/></div></label>}
        <label>Email address<div className="portal-input"><Mail size={17}/><input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required/></div></label>
        <label>Password<div className="portal-input"><LockKeyhole size={17}/><input type={showPassword ? "text" : "password"} value={password} onChange={event => setPassword(event.target.value)} placeholder="At least 8 characters" autoComplete={isSignup ? "new-password" : "current-password"} minLength={8} required/><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div></label>
        {!isSignup && <button className="portal-forgot" type="button" onClick={resetPassword} disabled={busy}>Forgot password?</button>}
        <button className="portal-primary portal-submit" type="submit" disabled={busy}>{busy ? "Please wait…" : isSignup ? "Create account" : "Sign in"} <ArrowRight size={17}/></button>
      </form>
      {message && <div className={"portal-auth-message " + messageType}>{message}</div>}
      <div className="portal-auth-switch">{isSignup ? "Already have an account?" : "New to Grand-Lumen?"} <button onClick={() => { onModeChange(isSignup ? "signin" : "signup"); setNotice(""); }}>{isSignup ? "Sign in" : "Create an account"}</button></div>
      <div className="portal-security-note"><ShieldCheck size={15}/> {supabaseConfigured ? "Your password is handled by the authentication provider." : "Your password is stored as a one-way hash in this browser. This temporary account is not synced across devices."}</div>
    </div></section>
  </main>;
}

function parseScannedPayload(value: string) {
  const raw = value.trim();
  const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const entries: { label: string; value: string }[] = [];
  let type = "Plain text";
  let summary = "This code contains text data.";
  let link = "";

  const add = (label: string, content: unknown) => {
    if (content === undefined || content === null || content === "") return;
    const display = typeof content === "string" ? content : typeof content === "object" ? JSON.stringify(content, null, 2) : String(content);
    entries.push({ label, value: display });
  };

  if (/^https?:\/\//i.test(raw)) {
    type = "Website link";
    summary = "This QR code stores a web address.";
    link = raw;
    try {
      const url = new URL(raw);
      add("Website", url.hostname);
      add("Full address", url.href);
      if (url.pathname !== "/") add("Page path", url.pathname);
      url.searchParams.forEach((value, key) => add("Parameter: " + key, value));
      if (url.hash) add("Page section", url.hash.slice(1));
    } catch {
      add("Address", raw);
    }
  } else if (/^WIFI:/i.test(raw)) {
    type = "Wi-Fi connection";
    summary = "This code contains wireless network connection details.";
    const body = raw.slice(raw.indexOf(":") + 1).replace(/;;$/, "");
    const fields = body.match(/(?:^|;)(S|T|P|H|E|A|I|PH):((?:\\.|[^;])*)/g) || [];
    const values: Record<string, string> = {};
    fields.forEach(field => {
      const match = field.replace(/^;/, "").match(/^([A-Z]+):([\s\S]*)$/);
      if (match) values[match[1]] = match[2].replace(/\\([\\;,:"])/g, "$1");
    });
    add("Network name (SSID)", values.S);
    add("Security", values.T || "Not specified");
    add("Password", values.P);
    add("Hidden network", values.H === "true" ? "Yes" : values.H === "false" ? "No" : undefined);
    add("EAP method", values.E);
    add("Anonymous identity", values.A);
    add("Identity", values.I);
    add("Phase 2 method", values.PH);
  } else if (/^(BEGIN:VCARD|MECARD:)/i.test(raw)) {
    type = "Contact card";
    summary = "This code contains contact information.";
    if (/^MECARD:/i.test(raw)) {
      const body = raw.replace(/^MECARD:/i, "").replace(/;;$/, "");
      const fields = body.match(/(?:^|;)(N|SOUND|TEL|EMAIL|NOTE|ADR|BDAY|URL|ORG|TITLE|NICKNAME):((?:\\.|[^;])*)/g) || [];
      fields.forEach(field => {
        const match = field.replace(/^;/, "").match(/^([^:]+):([\s\S]*)$/);
        if (match) add(({N:"Name",SOUND:"Pronunciation",TEL:"Phone",EMAIL:"Email",NOTE:"Note",ADR:"Address",BDAY:"Birthday",URL:"Website",ORG:"Organisation",TITLE:"Job title",NICKNAME:"Nickname"} as Record<string,string>)[match[1]] || match[1], match[2].replace(/\\([\\;,:"])/g, "$1"));
      });
    } else {
      lines.filter(line => !/^BEGIN:VCARD|^END:VCARD|^VERSION:/i.test(line)).forEach(line => {
        const match = line.match(/^([^:;]+)(?:;[^:]*)?:(.*)$/);
        if (!match) return;
        const key = match[1].toUpperCase();
        const labels: Record<string,string> = {FN:"Full name",N:"Name",ORG:"Organisation",TITLE:"Job title",TEL:"Phone",EMAIL:"Email",ADR:"Address",URL:"Website",NOTE:"Note",BDAY:"Birthday"};
        add(labels[key] || key, match[2].replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";"));
      });
    }
  } else if (/^geo:/i.test(raw)) {
    type = "Map location";
    summary = "This code contains geographic coordinates.";
    const match = raw.match(/^geo:([^,;]+),([^;]+)(?:;(.+))?/i);
    if (match) {
      add("Latitude", match[1]);
      add("Longitude", match[2]);
      add("Additional location data", match[3]);
      link = "https://www.google.com/maps?q=" + encodeURIComponent(match[1] + "," + match[2]);
    } else add("Location data", raw);
  } else if (/^mailto:/i.test(raw)) {
    type = "Email";
    summary = "This code contains an email recipient and possibly a message.";
    try {
      const url = new URL(raw);
      add("Recipient", decodeURIComponent(url.pathname));
      add("Subject", url.searchParams.get("subject"));
      add("Message", url.searchParams.get("body"));
    } catch { add("Email data", raw); }
  } else if (/^(tel:|sms:|smsto:)/i.test(raw)) {
    type = /^tel:/i.test(raw) ? "Phone number" : "Text message";
    summary = /^tel:/i.test(raw) ? "This code contains a telephone number." : "This code contains a message recipient and possibly message text.";
    try {
      const url = new URL(raw.replace(/^smsto:/i, "sms:"));
      add("Number", url.pathname);
      add("Message", url.searchParams.get("body"));
    } catch { add("Data", raw); }
  } else {
    try {
      const parsed = JSON.parse(raw);
      type = "Structured JSON data";
      summary = "This code contains structured data. Its fields are displayed below.";
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        Object.entries(parsed).forEach(([key, content]) => add(key, content));
      } else add("Value", parsed);
    } catch {
      if (/^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(raw)) {
        type = "Email address";
        summary = "This code contains an email address.";
        add("Email", raw);
      } else if (/^\+?[\d\s().-]{7,}$/.test(raw)) {
        type = "Number or identifier";
        summary = "This code contains a numeric value. A QR code only stores the data encoded by its creator; it does not automatically contain a person's or product's full details.";
        add("Encoded number", raw);
      } else if (lines.some(line => /^[\w -]{2,30}\s*[:=]\s*.+/.test(line))) {
        type = "Labelled information";
        summary = "This code contains labelled text fields.";
        lines.forEach(line => {
          const match = line.match(/^([\w -]{2,30})\s*[:=]\s*(.+)$/);
          if (match) add(match[1], match[2]);
          else add("Additional text", line);
        });
      } else {
        add("Content", raw);
      }
    }
  }

  return { type, summary, entries, raw, link };
}

function BarcodeScanner({ onDetected }: { onDetected?: (value: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanning, setScanning] = useState(false);
  const [value, setValue] = useState("");
  const [format, setFormat] = useState("");
  const [error, setError] = useState("");
  const [supported, setSupported] = useState(true);
  const details = value ? parseScannedPayload(value) : null;

  useEffect(() => {
    if (!scanning) return;
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    const start = async () => {
      try {
        const Detector = (window as any).BarcodeDetector;
        if (!Detector) {
          setSupported(false);
          setError("This browser does not support camera barcode detection. Try the latest Chrome browser.");
          setScanning(false);
          return;
        }
        const detector = new Detector({ formats: ["qr_code","ean_13","ean_8","upc_a","upc_e","code_128","code_39","itf","data_matrix","pdf417","aztec"] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (!videoRef.current || stopped) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const scan = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length && codes[0].rawValue) {
              const result = codes[0].rawValue;
              setValue(result);
              setFormat(codes[0].format || "Detected code");
              onDetected?.(result);
              setScanning(false);
              return;
            }
          } catch {
            setError("The camera could not read this code. Adjust the angle and lighting.");
          }
          frame = requestAnimationFrame(scan);
        };
        scan();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Camera access was unavailable. Allow camera permission and try again.");
        setScanning(false);
      }
    };
    start();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach(track => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [scanning, onDetected]);

  return <div className="scanner-workspace">
    <div className="scanner-camera">
      {scanning ? <video ref={videoRef} muted playsInline /> : <div className="scanner-placeholder"><ScanLine size={42}/><b>Camera scanner</b><span>Position a QR code or barcode inside the camera view.</span></div>}
      {scanning && <div className="scanner-frame"><i/></div>}
    </div>
    <div className="scanner-controls"><button className="solid-button" onClick={() => { setError(""); setScanning(value => !value); }}>{scanning ? "Stop camera" : "Start camera scanner"}</button><button className="quiet-button" onClick={() => { setValue(""); setFormat(""); setError(""); }}>Clear result</button></div>
    {!supported && <p className="error-text">{error}</p>}
    {error && supported && <p className="error-text">{error}</p>}
    {details && <div className="scanner-result">
      <span className="eyebrow">SCAN COMPLETE · {format.toUpperCase()}</span>
      <h3>{details.type}</h3>
      <p>{details.summary}</p>
      {details.entries.length > 0 && <div className="scanner-detail-list">{details.entries.map((entry,index) => <div className="scanner-detail-row" key={entry.label + index}><b>{entry.label}</b><span>{entry.value}</span></div>)}</div>}
      <details className="scanner-raw-data"><summary>View complete original QR data</summary><pre>{details.raw}</pre></details>
      <div className="scanner-result-actions">
        <button className="quiet-button" onClick={() => navigator.clipboard?.writeText(details.raw)}><Copy size={14}/> Copy all information</button>
        {details.link && <button className="quiet-button" onClick={() => window.open(details.link, "_blank", "noopener,noreferrer")}>Open destination</button>}
        <button className="quiet-button" onClick={() => onDetected?.(details.raw)}>Use result</button>
      </div>
    </div>}
    <p className="scanner-note">Grand-Lumen displays the information actually encoded in the QR code, including supported contact, Wi-Fi, location, email, link and structured-data formats. A code containing only a number cannot reveal extra details that were never encoded.</p>
  </div>;
}
function CreativeStudio() {
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState("");
  const [kind, setKind] = useState<"image" | "video" | "">("");
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [blur, setBlur] = useState(0);
  const [cropZoom, setCropZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [flip, setFlip] = useState(false);
  const [effect, setEffect] = useState("none");
  const [overlayText, setOverlayText] = useState("");
  const [videoStart, setVideoStart] = useState(0);
  const [videoEnd, setVideoEnd] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [muted, setMuted] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordedPreview, setRecordedPreview] = useState<string>("");
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageFilter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) blur(${blur}px) ${effect === "mono" ? "grayscale(1)" : effect === "warm" ? "sepia(.35)" : effect === "cool" ? "hue-rotate(18deg) saturate(1.15)" : effect === "vintage" ? "sepia(.45) contrast(1.1)" : ""}`;
  const chooseFile = (next: File | undefined) => {
    if (!next) return;
    if (!next.type.startsWith("image/") && !next.type.startsWith("video/")) return;
    if (source) URL.revokeObjectURL(source);
    const url = URL.createObjectURL(next);
    setFile(next);
    setSource(url);
    setKind(next.type.startsWith("image/") ? "image" : "video");
    setBrightness(100); setContrast(100); setSaturation(100); setBlur(0); setCropZoom(100); setRotation(0); setFlip(false); setEffect("none"); setOverlayText("");
  };
  useEffect(() => () => { if (source) URL.revokeObjectURL(source); }, [source]);
  useEffect(() => () => { cameraStreamRef.current?.getTracks().forEach(track => track.stop()); if (recordedPreview) URL.revokeObjectURL(recordedPreview); }, [recordedPreview]);
  const openCamera = async () => {
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) { setCameraError("Camera access requires a supported browser and a secure HTTPS connection."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      cameraStreamRef.current = stream;
      setCameraOpen(true);
      window.setTimeout(() => { if (cameraVideoRef.current) { cameraVideoRef.current.srcObject = stream; void cameraVideoRef.current.play(); } }, 100);
    } catch { setCameraError("Camera permission was unavailable. Allow camera access and try again."); }
  };
  const closeCamera = () => { if (recorderRef.current?.state === "recording") recorderRef.current.stop(); cameraStreamRef.current?.getTracks().forEach(track => track.stop()); cameraStreamRef.current = null; setCameraOpen(false); setRecording(false); };
  const startVideoRecording = () => {
    const stream = cameraStreamRef.current;
    if (!stream || typeof MediaRecorder === "undefined") { setCameraError("Video recording is not supported by this browser."); return; }
    try {
      recordingChunksRef.current = [];
      const mime = ["video/webm;codecs=vp9","video/webm;codecs=vp8","video/webm"].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = event => { if (event.data.size) recordingChunksRef.current.push(event.data); };
      recorder.onstop = () => { const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || "video/webm" }); if (blob.size) { const url = URL.createObjectURL(blob); setRecordedPreview(url); } setRecording(false); };
      recorder.start(); setRecording(true); setCameraError("");
    } catch { setCameraError("Could not start video recording on this device."); }
  };
  const stopVideoRecording = () => { if (recorderRef.current?.state === "recording") recorderRef.current.stop(); };
  const acceptRecordedVideo = async () => { if (!recordedPreview) return; const response = await fetch(recordedPreview); const blob = await response.blob(); chooseFile(new File([blob], "grand-lumen-video-" + Date.now() + ".webm", { type: blob.type || "video/webm" })); URL.revokeObjectURL(recordedPreview); setRecordedPreview(""); closeCamera(); };
  const discardRecordedVideo = () => { if (recordedPreview) URL.revokeObjectURL(recordedPreview); setRecordedPreview(""); };
  const capturePhoto = () => {
    const video = cameraVideoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => { if (!blob) return; chooseFile(new File([blob], "grand-lumen-photo-" + Date.now() + ".jpg", { type: "image/jpeg" })); closeCamera(); }, "image/jpeg", .94);
  };
  const exportImage = async () => {
    if (!source || kind !== "image") return;
    const image = new window.Image();
    image.src = source;
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("Image could not be loaded.")); });
    const canvas = canvasRef.current || document.createElement("canvas");
    const cropWidth = image.naturalWidth / (cropZoom / 100);
    const cropHeight = image.naturalHeight / (cropZoom / 100);
    const cropX = (image.naturalWidth - cropWidth) / 2;
    const cropY = (image.naturalHeight - cropHeight) / 2;
    const sideways = Math.abs(rotation % 180) === 90;
    canvas.width = Math.round(sideways ? cropHeight : cropWidth);
    canvas.height = Math.round(sideways ? cropWidth : cropHeight);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(rotation * Math.PI / 180);
    ctx.scale(flip ? -1 : 1, 1);
    ctx.filter = imageFilter;
    const width = sideways ? canvas.height : canvas.width;
    const height = sideways ? canvas.width : canvas.height;
    ctx.drawImage(image, cropX, cropY, cropWidth, cropHeight, -width / 2, -height / 2, width, height);
    ctx.filter = "none";
    if (overlayText.trim()) { ctx.font = `bold ${Math.max(24, Math.round(canvas.width / 28))}px sans-serif`; ctx.textAlign = "center"; ctx.lineWidth = Math.max(3, canvas.width / 300); ctx.strokeStyle = "#101522"; ctx.fillStyle = "#ffffff"; ctx.strokeText(overlayText, 0, canvas.height * .38); ctx.fillText(overlayText, 0, canvas.height * .38); }
    ctx.restore();
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "grand-lumen-edited.png"; link.click(); URL.revokeObjectURL(link.href);
  };
  const exportVideo = async () => {
    const video = videoRef.current;
    if (!video || !source || !("MediaRecorder" in window)) return;
    setExporting(true);
    try {
      const stream = (video as any).captureStream?.() || (video as any).mozCaptureStream?.();
      if (!stream) throw new Error("Video export is not supported by this browser.");
      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      const stopped = new Promise<void>(resolve => { recorder.onstop = () => resolve(); });
      video.pause(); video.currentTime = videoStart; video.playbackRate = speed; video.muted = muted;
      await new Promise<void>(resolve => { const ready = () => { video.removeEventListener("seeked", ready); resolve(); }; video.addEventListener("seeked", ready); if (Math.abs(video.currentTime - videoStart) < .05) resolve(); });
      recorder.start();
      await video.play();
      await new Promise<void>(resolve => { const tick = () => { if (video.currentTime >= videoEnd || video.ended) { video.pause(); resolve(); } else requestAnimationFrame(tick); }; tick(); });
      recorder.stop();
      await stopped;
      const blob = new Blob(chunks, { type: mime });
      const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "grand-lumen-edited.webm"; link.click(); URL.revokeObjectURL(link.href);
    } catch (error) { alert(error instanceof Error ? error.message : "Video export failed."); }
    finally { setExporting(false); }
  };
  return <div className="creative-studio"><div className="studio-upload"><label className="solid-button"><Upload size={16}/> Import photo or video<input type="file" accept="image/*,video/*" onChange={event => { chooseFile(event.target.files?.[0]); event.currentTarget.value = ""; }}/></label><button className="quiet-button" onClick={() => void openCamera()}><Image size={15}/> Take a photo</button><span>{file ? file.name : "Choose a file or capture a new photo"}</span></div>{cameraError && <p className="error-text">{cameraError}</p>}{recordedPreview && <div className="camera-capture-panel"><video src={recordedPreview} controls playsInline/><div><button className="solid-button" onClick={() => void acceptRecordedVideo()}>Use this video</button><button className="quiet-button" onClick={discardRecordedVideo}>Discard and retake</button><button className="quiet-button" onClick={() => { discardRecordedVideo(); void openCamera(); }}>Clear video</button></div></div>}{cameraOpen && <div className="camera-capture-panel"><video ref={cameraVideoRef} autoPlay playsInline muted/><div><button className="solid-button" onClick={capturePhoto} disabled={recording}><Image size={15}/> Capture photo</button>{recording ? <button className="solid-button" onClick={stopVideoRecording}>Stop recording</button> : <button className="quiet-button" onClick={startVideoRecording}>Record video</button>}<button className="quiet-button" onClick={closeCamera}>Close camera</button></div><small>{recording ? "Recording video…" : "Take a photo or record a video."}</small></div>}{!file ? <EmptyState title="Your creative workspace is ready." detail="Import a photo or video to access the editing tools."/> : <><div className="studio-preview">{kind === "image" ? <img src={source} alt="Editing preview" style={{filter:imageFilter,transform:`rotate(${rotation}deg) scaleX(${flip ? -1 : 1}) scale(${cropZoom / 100})`}}/> : <video ref={videoRef} src={source} controls playsInline onLoadedMetadata={event => { setVideoEnd(event.currentTarget.duration); }} style={{filter:imageFilter}}/>}</div><div className="studio-tools"><div className="studio-tool-head"><b>{kind === "image" ? "PHOTO LAB" : "VIDEO LAB"}</b><button className="quiet-button" onClick={() => { setBrightness(100); setContrast(100); setSaturation(100); setBlur(0); setCropZoom(100); setRotation(0); setFlip(false); setEffect("none"); setOverlayText(""); setSpeed(1); setMuted(false); }}>Reset edits</button></div><div className="studio-controls"><label>Brightness <output>{brightness}%</output><input type="range" min="0" max="200" value={brightness} onChange={event => setBrightness(Number(event.target.value))}/></label><label>Contrast <output>{contrast}%</output><input type="range" min="0" max="200" value={contrast} onChange={event => setContrast(Number(event.target.value))}/></label><label>Saturation <output>{saturation}%</output><input type="range" min="0" max="200" value={saturation} onChange={event => setSaturation(Number(event.target.value))}/></label><label>Soft focus <output>{blur}px</output><input type="range" min="0" max="12" value={blur} onChange={event => setBlur(Number(event.target.value))}/></label><label>Crop zoom <output>{cropZoom}%</output><input type="range" min="100" max="200" value={cropZoom} onChange={event => setCropZoom(Number(event.target.value))}/></label></div>{kind === "video" && <div className="studio-library-actions"><button className="quiet-button" onClick={async()=>{if(!file)return;const shareFile=new File([file],file.name,{type:file.type});if(navigator.share&&navigator.canShare?.({files:[shareFile]})){try{await navigator.share({files:[shareFile],title:file.name});}catch{}}else{const link=document.createElement("a");link.href=source;link.download=file.name;link.click();}}}><Share2 size={14}/> Share video</button><a className="quiet-button" href={source} download={file.name}><Download size={14}/> Download original</a><button className="quiet-button" onClick={()=>{if(source)URL.revokeObjectURL(source);setFile(null);setSource("");setKind("");setVideoStart(0);setVideoEnd(0);}}><X size={14}/> Delete media</button></div>}<div className="studio-actions"><label>Creative filter<select value={effect} onChange={event => setEffect(event.target.value)}><option value="none">Original</option><option value="mono">Monochrome</option><option value="warm">Warm film</option><option value="cool">Cool tone</option><option value="vintage">Vintage</option></select></label>{kind === "image" ? <><label>Add text overlay<input value={overlayText} onChange={event => setOverlayText(event.target.value)} placeholder="Type a caption"/></label><button className="quiet-button" onClick={() => setRotation(value => (value + 90) % 360)}>Rotate 90°</button><button className="quiet-button" onClick={() => setFlip(value => !value)}>Flip horizontal</button><button className="solid-button" onClick={() => void exportImage()}>Export edited image</button></> : <><label>Trim start <output>{videoStart.toFixed(1)}s</output><input type="range" min="0" max={Math.max(0,videoEnd)} step=".1" value={videoStart} onChange={event => setVideoStart(Math.min(Number(event.target.value),Math.max(0,videoEnd-.1)))}/></label><label>Trim end <output>{videoEnd.toFixed(1)}s</output><input type="range" min="0" max={videoRef.current?.duration || videoEnd || 1} step=".1" value={videoEnd} onChange={event => setVideoEnd(Math.max(Number(event.target.value),videoStart+.1))}/></label><label>Playback speed<select value={speed} onChange={event => { setSpeed(Number(event.target.value)); if(videoRef.current) videoRef.current.playbackRate=Number(event.target.value); }}><option value="0.5">0.5× slow</option><option value="0.75">0.75×</option><option value="1">1× normal</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2× fast</option></select></label><button className="quiet-button" onClick={() => {setMuted(value => !value); if(videoRef.current) videoRef.current.muted=!muted;}}>{muted ? "Unmute audio" : "Mute audio"}</button><button className="solid-button" disabled={exporting} onClick={() => void exportVideo()}>{exporting ? "Rendering clip…" : "Export trimmed video"}</button></>}</div></div></>}</div>;
}


const academyCourses = [
  {title:"Digital Literacy",level:"Beginner",summary:"Understand devices, files, the web and online safety.",lessons:[["How computers work","A computer receives input, processes it using instructions, stores information and gives output. A keyboard is an input device, a processor handles instructions, storage keeps files and a screen shows output."],["Files and the internet","A file is saved information such as a photo, document or video. The internet connects devices so they can exchange information using agreed rules called protocols."],["Staying safe online","Use strong unique passwords, keep private information private, check website addresses and ask a trusted adult before sharing sensitive details."]],practice:[["Which part processes instructions?","The processor","The monitor","The keyboard",0],["What is a file?","A type of screen","Saved information","A Wi-Fi signal",1],["What should you do before sharing private information?","Post it publicly","Check with a trusted adult","Send it to everyone",1]]},
  {title:"HTML Foundations",level:"Beginner",summary:"Build the structure of web pages with semantic HTML.",lessons:[["What HTML does","HTML gives a web page its structure. Headings describe titles, paragraphs hold text, links connect pages and images display pictures."],["Elements and attributes","An element usually has an opening tag, content and a closing tag. Attributes add information, such as href on a link or alt text on an image."],["Build a simple page","A good page begins with a doctype, html element, head for page information and body for visible content. Use headings in a meaningful order."]],practice:[["Which tag makes the main heading?","<h1>","<p>","<img>",0],["Which attribute describes an image for screen readers?","src","alt","width",1],["Where does visible page content go?","head","body","title",1]]},
  {title:"CSS and Web Design",level:"Beginner",summary:"Style layouts, typography, colour and responsive pages.",lessons:[["CSS rules","A CSS rule has a selector and declarations. The selector chooses elements and declarations set properties such as colour, spacing and font size."],["The box model","Every element is made of content, padding, border and margin. Understanding these layers helps control spacing and layout."],["Responsive design","Responsive pages adapt to different screens. Flexible widths, CSS Grid, Flexbox and media queries help layouts work on phones and computers."]],practice:[["Which CSS property changes text colour?","background","color","display",1],["What is inside the border in the box model?","content and padding","margin only","the viewport",0],["Which feature adapts styles to screen sizes?","media queries","HTML comments","database tables",0]]},
  {title:"JavaScript Programming",level:"Beginner",summary:"Learn variables, conditions, loops and functions.",lessons:[["Variables and values","Variables store values. const is for a binding that will not be reassigned, while let is used when the binding needs to change."],["Conditions and loops","An if statement chooses what to do based on a condition. Loops repeat instructions while a condition is true or for each item in a collection."],["Functions","A function groups instructions into a reusable unit. It can receive inputs called parameters and return a result."]],practice:[["Which keyword declares a reassignable variable?","const","let","return",1],["What does an if statement do?","Makes a decision","Creates an image","Saves a file",0],["What is a function for?","Reusable instructions","Changing Wi-Fi","Styling HTML",0]]},
  {title:"Python Essentials",level:"Beginner",summary:"Write readable programs and work with data.",lessons:[["Python syntax","Python uses indentation to show blocks of code. print() displays output and input() reads text entered by a user."],["Collections","Lists store ordered items, dictionaries store key-value pairs, and tuples store ordered items that are not meant to be changed."],["Reusable code","Functions begin with def. They can accept parameters, perform a task and return a value for another part of the program."]],practice:[["Which function displays output?","show()","print()","echoText()",1],["Which collection stores key-value pairs?","dictionary","list","string",0],["Which keyword begins a function?","func","define","def",2]]},
  {title:"C Programming",level:"Foundation",summary:"Understand types, input/output, decisions and loops.",lessons:[["A C program","A C program commonly includes standard library headers and a main function. Execution begins in main, and return 0 indicates successful completion."],["Variables and types","int stores whole numbers, char stores a character and float stores a decimal approximation. Choose a type that fits the information."],["Control flow","if and else choose a path. for and while loops repeat work. Braces group the statements that belong to a block."]],practice:[["Where does a basic C program start?","main()","printf()","include()",0],["Which type stores whole numbers?","float","int","char",1],["Which function prints formatted output?","scanf","printf","return",1]]},
  {title:"Computer Networks",level:"Foundation",summary:"Learn how devices communicate across local and global networks.",lessons:[["Network basics","A network connects devices so they can share information and resources. A local area network covers a limited area such as a home or school."],["IP and DNS","An IP address identifies a device or network interface. DNS helps find the IP address associated with a human-readable domain name."],["Web communication","Browsers and servers exchange requests and responses. HTTPS protects information in transit using encryption."]],practice:[["What does DNS help translate?","Domain names to IP addresses","Photos to videos","Code to electricity",0],["What does LAN mean?","Large Access Number","Local Area Network","Linked App Node",1],["What does HTTPS help provide?","Encryption in transit","Unlimited storage","Faster typing",0]]},
  {title:"Databases and SQL",level:"Foundation",summary:"Store, organise and retrieve information with relational databases.",lessons:[["Tables and records","A relational database stores information in tables. Rows are records and columns describe fields such as name, date or status."],["Keys and relationships","A primary key uniquely identifies a row. A foreign key links a row to another table and helps represent relationships."],["SQL queries","SELECT reads data, INSERT adds records, UPDATE changes records and DELETE removes records. WHERE filters which rows are affected."]],practice:[["Which SQL command reads records?","SELECT","DROP","UPDATE",0],["What uniquely identifies a row?","primary key","CSS selector","file extension",0],["Which clause filters rows?","ORDER","WHERE","GROUP",1]]},
  {title:"Cybersecurity Basics",level:"Foundation",summary:"Protect accounts, devices and information responsibly.",lessons:[["Threats and protection","Cybersecurity protects devices, accounts and data from unauthorised access, damage and disruption."],["Passwords and multi-factor authentication","Use unique passwords and enable multi-factor authentication when available. Never share one-time sign-in codes."],["Recognising suspicious messages","Be careful with unexpected links, urgent requests and attachments. Verify the sender through a trusted channel before taking action."]],practice:[["Why use unique passwords?","To limit damage if one account is exposed","To make passwords public","To avoid updates",0],["What is multi-factor authentication?","An extra identity check","A screen brightness mode","A file type",0],["What should you do with an unexpected suspicious link?","Open it quickly","Verify it first","Forward it widely",1]]},
  {title:"AI and Data Literacy",level:"Foundation",summary:"Understand AI, datasets, patterns and responsible use.",lessons:[["What AI means","Artificial intelligence describes computer systems designed to perform tasks that normally need human-like abilities, such as recognising patterns or understanding language."],["Data and patterns","A dataset is a collection of information. Models learn patterns from examples, but poor-quality or biased data can lead to unreliable results."],["Using AI responsibly","Check important claims, protect personal information, respect copyright and remember that AI can make mistakes. Human judgement remains important."]],practice:[["What is a dataset?","A collection of information","A computer cable","A password manager",0],["What can biased data cause?","Unfair or unreliable results","Perfect accuracy","More battery life",0],["What should you do with important AI claims?","Trust all automatically","Verify them","Hide the source",1]]}
];

const expandedAcademyCourses = academyCourses.map(course => ({
  ...course,
  lessons: course.lessons.flatMap(([title, content]) => [
    [title, content],
    ["Key ideas: " + title, "Build a clear understanding of " + title.toLowerCase() + " by identifying its main purpose, the important terms involved and how it connects to " + course.title + ". Write down the central idea in your own words before moving on."],
    ["How it works: " + title, "Break " + title.toLowerCase() + " into smaller steps. Start with the basic idea from the lesson, follow how each part contributes to the result, and explain why the steps matter in " + course.title + "."],
    ["Practical application: " + title, "Apply what you have learned about " + title.toLowerCase() + " to a simple real-world situation. Identify the problem, choose the relevant concept, work through it carefully and explain the result."],
    ["Review and reflect: " + title, "Summarise the most important points about " + title.toLowerCase() + ". Check that you can define the key terms, give an example and explain the concept without copying the lesson. Note any question you still need to practise."]
  ])
}));


function MessagesWorkspace({ session }: { session: Session | null }) {
  const [openQuestion, setOpenQuestion] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const questions = [
    { category: "About Grand Lumen", question: "What is Grand Lumen?", answer: "Grand Lumen is a connected digital workspace designed to bring discovery, research, learning, creativity and practical tools together in one place. Its guiding idea is to help people explore beyond the ordinary." },
    { category: "About Grand Lumen", question: "Who founded Grand Lumen?", answer: "Grand Lumen was founded and developed by Emmanuel Pobee Okpoti, a student developer and technology enthusiast who is interested in building useful digital experiences." },
    { category: "About Grand Lumen", question: "Who is Emmanuel Pobee Okpoti?", answer: "Emmanuel Pobee Okpoti is the founder and developer of Grand Lumen. He is a student developer with interests in front-end development, technology, learning, invention and building practical tools that help people explore ideas." },
    { category: "About Grand Lumen", question: "Why was Grand Lumen created?", answer: "Grand Lumen was created to bring useful digital experiences into one connected workspace, reducing the need to jump between separate tools for research, learning, exploration and creation." },
    { category: "About Grand Lumen", question: "What does “Explore Beyond” mean?", answer: "“Explore Beyond” is Grand Lumen's guiding phrase. It encourages curiosity, independent learning and looking beyond the first answer or familiar way of doing things." },
    { category: "About Grand Lumen", question: "Who is Grand Lumen designed for?", answer: "Grand Lumen is designed for curious people, students, researchers, creators and anyone who wants a convenient place to explore information and use practical digital tools." },
    { category: "Features", question: "What can I do with Grand Lumen?", answer: "Depending on the feature and its connected services, you can search and research topics, explore news and media, use maps and utilities, practise learning, write and preview code, scan QR codes, save items and organize projects." },
    { category: "Features", question: "What is the Lumen Hub?", answer: "The Lumen Hub is a collection of focused utilities for knowledge, productivity, learning and everyday tasks. Open a tool from the Hub to work in its dedicated view, then use its back control to return to the Hub." },
    { category: "Features", question: "How does Search work?", answer: "Use Search to enter a topic or phrase and review the results returned by the connected search services. Open a result to continue with its source when you need more detail." },
    { category: "Features", question: "What is the Research workspace for?", answer: "Research helps you investigate a topic, discover relevant material and compare information. Check the original sources before relying on important claims." },
    { category: "Features", question: "Where does the News section get its stories?", answer: "The News section retrieves current stories through connected news search services and links to the publishers. Availability and coverage depend on those external services." },
    { category: "Features", question: "Can I explore images and videos?", answer: "Yes. The Images and Videos sections help you discover media through connected public search services. The original media or publisher may have its own usage and copyright conditions." },
    { category: "Features", question: "What is Code Lab?", answer: "Code Lab is a workspace for writing code and testing supported projects with an in-app preview. Available languages and execution features depend on the tools provided in the Code Lab." },
    { category: "Features", question: "What can I do in Learn?", answer: "Learn provides structured learning material and practice activities. Use it to review a topic, work through lessons and check your understanding." },
    { category: "Features", question: "What is the API Library?", answer: "The API Library introduces public APIs and services that developers can use in their own projects. Check each provider's documentation for its current limits, terms and attribution requirements." },
    { category: "Features", question: "What is the Tools section?", answer: "Tools brings together practical utilities such as calculators, graphing and selected information lookups. The available tools are shown inside the section." },
    { category: "Features", question: "Can Grand Lumen scan QR codes?", answer: "Yes. Open Scanner and choose the camera scanner. Your browser will ask for camera permission when the scanner needs it. You can also use the QR creation option where available." },
    { category: "Features", question: "What does the Share section do?", answer: "Share provides ways to share supported Grand Lumen content or create shareable items. Review the details shown before sharing anything personal." },
    { category: "Features", question: "What are Saved and Projects used for?", answer: "Saved helps you keep supported items for later, while Projects gives you a place to organize project-related work. What is retained can depend on the feature and your browser or account state." },
    { category: "Features", question: "What is Creative Studio?", answer: "Creative Studio is a space for supported creative tasks and visual exploration. Available creation options may change as the app develops." },
    { category: "Features", question: "What is the Messages section now?", answer: "Messages is the Grand Lumen Help Desk. It contains questions and answers about the app, its founder, features, usage and privacy. Open a question to reveal its answer." },
    { category: "Documents", question: "Can Grand Lumen read uploaded manuals?", answer: "Document Intelligence in the Lumen Hub can extract readable text from supported documents so you can read, edit and work with the contents inside the app." },
    { category: "Documents", question: "Which document formats are supported?", answer: "The current reader supports searchable PDF files, DOCX Word documents, TXT, Markdown, CSV and JSON files. Older DOC files are not currently listed as supported." },
    { category: "Documents", question: "Can I read and edit a manual in full screen?", answer: "Yes. After text has been extracted, choose Read full screen or Edit full screen. Use the Back to Document Intelligence control to return to the document workspace." },
    { category: "Documents", question: "Can scanned PDFs be converted into editable text?", answer: "Scanned image-only PDFs need optical character recognition (OCR). The current reader extracts selectable text from searchable PDFs; it does not currently provide OCR for image-only pages." },
    { category: "Documents", question: "Will editing extracted text change my original file?", answer: "Editing the extracted text changes the working text inside Grand Lumen. It does not rewrite the original uploaded PDF or DOCX file." },
    { category: "Language & Access", question: "Can I change Grand Lumen's language?", answer: "Use the language setting in the app to select a supported language. Some external content or services may remain in their original language if a translation is not available." },
    { category: "Language & Access", question: "Does Grand Lumen work offline?", answer: "Some previously loaded or saved app content may remain available, but search, news, maps, translation and other connected services generally need an internet connection. Offline availability varies by feature." },
    { category: "Language & Access", question: "Can I use Grand Lumen on a phone or computer?", answer: "Grand Lumen is designed to adapt to different screen sizes, including phones, tablets and desktop browsers. The exact experience can vary with the browser and device." },
    { category: "Language & Access", question: "Can I install Grand Lumen like an app?", answer: "Where your browser supports installation, use its Install option. On some mobile browsers, the available option may be Add to Home Screen. Installation availability depends on the browser and device." },
    { category: "Privacy & Accounts", question: "Do I need an account to use Grand Lumen?", answer: "Some parts of Grand Lumen may be available without signing in, while account-linked features require you to sign in. Follow the sign-in prompt shown by the feature you want to use." },
    { category: "Privacy & Accounts", question: "Where is my information stored?", answer: "Storage depends on the feature. Some working data is kept in your browser, while account-linked features may use the connected Grand Lumen cloud services. The app indicates when a feature relies on an external service." },
    { category: "Privacy & Accounts", question: "Does Grand Lumen send my files to other people?", answer: "Grand Lumen does not automatically send a document to another person just because you open it in the reader. Be mindful when you choose a sharing action or use an external service, and review what that service receives." },
    { category: "Privacy & Accounts", question: "Are search and news results guaranteed to be correct?", answer: "No. Search and news results are supplied by external sources and can be incomplete, outdated or mistaken. Check the original source and compare reliable references for important decisions." },
    { category: "Support", question: "How can I report a problem or suggest a feature?", answer: "You can report an issue or suggest an improvement through the Grand Lumen GitHub repository: https://github.com/junior-pobee/Grand-Lumen/issues. Include the section involved and a clear description of what happened. Do not include passwords or private account details." },
    { category: "Support", question: "Where can I find the official Grand Lumen app?", answer: "The current public GitHub Pages version is available at https://junior-pobee.github.io/Grand-Lumen/. Use that address to open the app." },
    { category: "Support", question: "Is Grand Lumen still being developed?", answer: "Grand Lumen is an evolving project. Features and supported services may be improved over time, so check the app and its official repository for updates." }
  ];
  const filteredQuestions = questions.filter(item => (item.question + " " + item.answer + " " + item.category).toLowerCase().includes(search.trim().toLowerCase()));
  const categories = Array.from(new Set(questions.map(item => item.category)));
  return <div className="lumen-faq">
    <section className="lumen-faq-hero">
      <div className="lumen-faq-mark"><CircleHelp size={26}/></div>
      <span className="eyebrow">GRAND LUMEN · HELP DESK</span>
      <h2>Questions about Grand Lumen?</h2>
      <p>Explore answers about the platform, its tools, and the person behind it.</p>
      <label className="lumen-faq-search"><Search size={17}/><input value={search} onChange={event => { setSearch(event.target.value); setOpenQuestion(null); }} placeholder="Search questions or topics…"/></label>
      <div className="lumen-faq-count"><span>{questions.length} answers available</span><span>{session ? "Signed in" : "Guest access"}</span></div>
    </section>
    <section className="lumen-faq-list">
      {categories.map(category => {
        const items = filteredQuestions.filter(item => item.category === category);
        if (!items.length) return null;
        return <div className="lumen-faq-category" key={category}>
          <div className="lumen-faq-category-title">{category}</div>
          {items.map(item => {
            const index = questions.indexOf(item);
            const isOpen = openQuestion === index;
            return <article className={"lumen-faq-item" + (isOpen ? " open" : "")} key={item.question}>
              <button className="lumen-faq-question" aria-expanded={isOpen} onClick={() => setOpenQuestion(current => current === index ? null : index)}>
                <span className="lumen-faq-number">{String(index + 1).padStart(2, "0")}</span>
                <span>{item.question}</span>
                <ChevronDown size={18}/>
              </button>
              <div className="lumen-faq-answer-wrap" aria-hidden={!isOpen}>
                <div className="lumen-faq-answer"><p>{item.answer}</p></div>
              </div>
            </article>;
          })}
        </div>;
      })}
      {!filteredQuestions.length && <div className="lumen-faq-empty"><Search size={22}/><strong>No matching questions</strong><span>Try another word or clear your search.</span><button onClick={() => setSearch("")}>Show all questions</button></div>}
    </section>
    <footer className="lumen-faq-founder">
      <div><span className="eyebrow">BUILT WITH CURIOSITY</span><h3>Meet the founder</h3><strong>Emmanuel Pobee Okpoti</strong><p>Founder & Developer · Student Developer · Technology Enthusiast</p><p>Building Grand Lumen around discovery, learning, research and practical digital experiences.</p><div className="lumen-faq-links"><a href="https://github.com/junior-pobee" target="_blank" rel="noreferrer">GitHub profile <ArrowUpRight size={13}/></a><a href="https://junior-pobee.vercel.app" target="_blank" rel="noreferrer">Personal portfolio <ArrowUpRight size={13}/></a><a href="https://github.com/junior-pobee/Grand-Lumen" target="_blank" rel="noreferrer">Grand Lumen repository <ArrowUpRight size={13}/></a></div></div>
      <div className="lumen-faq-founder-badge"><Sparkles size={22}/><span>GRAND LUMEN</span><small>EXPLORE BEYOND</small></div>
    </footer>
  </div>;
}


type StudioFile = { id: string; name: string; content: string };
let pyodideLoader: Promise<any> | null = null;
async function loadPythonRuntime() {
  if (!(window as any).loadPyodide) {
    if (!pyodideLoader) pyodideLoader = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js";
      script.async = true;
      script.onload = () => resolve((window as any).loadPyodide);
      script.onerror = () => reject(new Error("Python runtime download failed. Check your connection."));
      document.head.appendChild(script);
    });
    await pyodideLoader;
  }
  const loader = (window as any).loadPyodide;
  if (!loader) throw new Error("Python runtime did not initialise.");
  return loader({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/" });
}


const studioStarterFiles: StudioFile[] = [
  { id: "index-html", name: "index.html", content: `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Project</title>
</head>
<body>
  <main class="card">
    <span class="eyebrow">GRAND-LUMEN STUDIO</span>
    <h1>Hello, world.</h1>
    <p>Your next idea starts here.</p>
    <button id="action">Test interaction</button>
    <p id="message"></p>
  </main>
</body>
</html>` },
  { id: "styles-css", name: "styles.css", content: `body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: #0b1222;
  color: #edf4ff;
  font-family: Inter, system-ui, sans-serif;
}
.card {
  width: min(520px, calc(100% - 48px));
  padding: 36px;
  border: 1px solid #273a59;
  border-radius: 24px;
  background: #111d32;
}
.eyebrow { color: #80b9ff; letter-spacing: .18em; font-size: 11px; }
button { padding: 12px 18px; border: 0; border-radius: 10px; background: #8abfff; color: #081326; font-weight: 700; cursor: pointer; }` },
  { id: "app-js", name: "app.js", content: `const action = document.querySelector("#action");
const message = document.querySelector("#message");
action?.addEventListener("click", () => {
  message.textContent = "Your project is running inside Grand-Lumen.";
});` },
  { id: "readme-md", name: "README.md", content: `# My Project

Created in Grand-Lumen Code Lab.

Edit the files, then choose Run preview.` }
];

function CodeStudioWorkspace() {
  const [files, setFiles] = useState<StudioFile[]>(() => {
    try {
      const saved = localStorage.getItem("grandLumenStudioFiles");
      const parsed = saved ? JSON.parse(saved) : null;
      return Array.isArray(parsed) && parsed.length ? parsed : studioStarterFiles;
    } catch {
      return studioStarterFiles;
    }
  });
  const [activeId, setActiveId] = useState(() => {
    try { return localStorage.getItem("grandLumenStudioActive") || "index-html"; } catch { return "index-html"; }
  });
  const [newName, setNewName] = useState("");
  const [command, setCommand] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("html");
  const [pythonBusy, setPythonBusy] = useState(false);
  const [terminalLines, setTerminalLines] = useState<string[]>(["Grand-Lumen Terminal · Workspace ready", "Type help to see available commands."]);
  const [showTerminal, setShowTerminal] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const importRef = useRef<HTMLInputElement>(null);
  const commandRef = useRef<HTMLInputElement>(null);
  const activeFile = files.find(file => file.id === activeId) || files[0];
  const extensionLanguage = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase();
    const types: Record<string,string> = {html:"HTML",htm:"HTML",css:"CSS",js:"JavaScript",jsx:"JavaScript",ts:"TypeScript",tsx:"TypeScript",py:"Python",c:"C",h:"C",cpp:"C++",cc:"C++",java:"Java",cs:"C#",go:"Go",rs:"Rust",php:"PHP",rb:"Ruby",sql:"SQL",sh:"Bash",md:"Markdown",json:"JSON"};
    return types[ext || ""] || "Plain text";
  };
  const updateActive = (content: string) => setFiles(current => current.map(file => file.id === activeId ? { ...file, content } : file));

  useEffect(() => {
    try {
      localStorage.setItem("grandLumenStudioFiles", JSON.stringify(files));
      localStorage.setItem("grandLumenStudioActive", activeId);
    } catch {
      setTerminalLines(lines => lines.includes("Storage is full. Export your project to keep a backup.") ? lines : [...lines, "Storage is full. Export your project to keep a backup."]);
    }
  }, [files, activeId]);

  const addFile = () => {
    const name = newName.trim().replace(/^\/+/, "");
    if (!name || name.includes("..") || files.some(file => file.name.toLowerCase() === name.toLowerCase())) return;
    const id = "file-" + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
    setFiles(current => [...current, { id, name, content: "" }]);
    setActiveId(id);
    setNewName("");
  };

  const importFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []);
    const incoming = await Promise.all(selected.map(async file => ({ id: "import-" + Date.now().toString(36) + Math.random().toString(36).slice(2,7), name: file.name, content: await file.text() })));
    if (incoming.length) {
      setFiles(current => [...current.filter(file => !incoming.some(next => next.name === file.name)), ...incoming]);
      setActiveId(incoming[0].id);
      setTerminalLines(lines => [...lines, "Imported " + incoming.length + " file(s)."]);
    }
    event.target.value = "";
  };

  const downloadFile = (name: string, content: string) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name.split("/").pop() || "project-file.txt";
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportWorkspace = () => {
    const bundle = { application: "Grand-Lumen Code Lab", format: "grand-lumen-workspace-v1", exportedAt: new Date().toISOString(), files: files.map(({ name, content }) => ({ name, content })) };
    downloadFile("grand-lumen-project.json", JSON.stringify(bundle, null, 2));
    setTerminalLines(lines => [...lines, "Workspace exported as grand-lumen-project.json"]);
  };
  const exportZip = () => {
    const encoder = new TextEncoder();
    const table = new Uint32Array(256);
    for (let n=0;n<256;n++){let v=n;for(let b=0;b<8;b++)v=v&1?0xedb88320^(v>>>1):v>>>1;table[n]=v>>>0;}
    const crc = (bytes:Uint8Array) => {let v=0xffffffff;for(const b of bytes)v=table[(v^b)&255]^(v>>>8);return (v^0xffffffff)>>>0;};
    const locals:Uint8Array[]=[]; const centrals:Uint8Array[]=[]; let offset=0;
    const p16=(v:DataView,i:number,n:number)=>v.setUint16(i,n,true);
    const p32=(v:DataView,i:number,n:number)=>v.setUint32(i,n,true);
    files.forEach(file=>{
      const name=encoder.encode(file.name); const data=encoder.encode(file.content); const sum=crc(data);
      const local=new Uint8Array(30+name.length); const lv=new DataView(local.buffer);
      p32(lv,0,0x04034b50);p16(lv,4,20);p16(lv,6,0);p16(lv,8,0);p16(lv,10,0);p16(lv,12,0);p32(lv,14,sum);p32(lv,18,data.length);p32(lv,22,data.length);p16(lv,26,name.length);p16(lv,28,0);local.set(name,30);locals.push(local,data);
      const central=new Uint8Array(46+name.length);const cv=new DataView(central.buffer);
      p32(cv,0,0x02014b50);p16(cv,4,20);p16(cv,6,20);p16(cv,8,0);p16(cv,10,0);p16(cv,12,0);p16(cv,14,0);p32(cv,16,sum);p32(cv,20,data.length);p32(cv,24,data.length);p16(cv,28,name.length);p16(cv,30,0);p16(cv,32,0);p16(cv,34,0);p16(cv,36,0);p32(cv,38,0);p32(cv,42,offset);central.set(name,46);centrals.push(central);offset+=local.length+data.length;
    });
    const centralSize=centrals.reduce((n,item)=>n+item.length,0);const end=new Uint8Array(22);const ev=new DataView(end.buffer);
    p32(ev,0,0x06054b50);p16(ev,4,0);p16(ev,6,0);p16(ev,8,files.length);p16(ev,10,files.length);p32(ev,12,centralSize);p32(ev,16,offset);p16(ev,20,0);
    const url=URL.createObjectURL(new Blob([...locals,...centrals,end],{type:"application/zip"}));const link=document.createElement("a");link.href=url;link.download="grand-lumen-project.zip";link.click();URL.revokeObjectURL(url);
    setTerminalLines(lines=>[...lines,"Complete project exported as grand-lumen-project.zip"]);
  };


  const previewDocument = useMemo(() => {
    const html = files.find(file => file.name.toLowerCase() === "index.html" || file.name.toLowerCase().endsWith(".html"))?.content || "<!doctype html><html><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1.0\"></head><body><main id=\"app\"></main></body></html>";
    const css = files.filter(file => file.name.toLowerCase().endsWith(".css")).map(file => file.content).join("\n");
    const js = files.filter(file => /\.(js|mjs|cjs)$/i.test(file.name)).map(file => file.content).join("\n");
    const style = "<style>" + css.replace(/<\/style/gi, "<\\/style") + "</style>";
    const script = "<script>" + js.replace(/<\/script/gi, "<\\/script") + "<\/script>";
    const withStyle = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, style + "</head>") : style + html;
    return /<\/body>/i.test(withStyle) ? withStyle.replace(/<\/body>/i, script + "</body>") : withStyle + script;
  }, [files, previewKey]);


  const projectTemplates: Record<string, StudioFile[]> = {
    html: [
      { id: "tpl-html", name: "index.html", content: "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"UTF-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<title>My Website</title>\n<link rel=\"stylesheet\" href=\"style.css\">\n</head>\n<body>\n<main><h1>Hello, Grand-Lumen!</h1><p>Your project starts here.</p><button id=\"action\">Try it</button></main>\n<script src=\"main.js\"></script>\n</body>\n</html>" },
      { id: "tpl-css", name: "style.css", content: "body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui;background:#101827;color:white}main{padding:2rem;border-radius:1.5rem;background:#1e293b;text-align:center}button{padding:.8rem 1.2rem;border:0;border-radius:.7rem;cursor:pointer}" },
      { id: "tpl-js", name: "main.js", content: "document.querySelector('#action').addEventListener('click',()=>{document.querySelector('p').textContent='Your project is running!'});" }
    ],
    python: [
      { id: "tpl-py", name: "main.py", content: `name = 'Grand-Lumen'
print(f'Hello from {name}!')
for number in range(1, 6):
    print(f'Number: {number}')` },
      { id: "tpl-py-readme", name: "README.md", content: "# Python Starter\n\nRun main.py with the python terminal command.\n" }
    ],
    portfolio: [
      { id: "tpl-port-html", name: "index.html", content: "<!doctype html>\n<html><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>My Portfolio</title><link rel=\"stylesheet\" href=\"style.css\"></head><body><header><h1>Your Name</h1><p>Developer · Creator · Learner</p></header><main><section><h2>About me</h2><p>Write your introduction here.</p></section><section><h2>Projects</h2><article><h3>Project One</h3><p>Describe what you built.</p></article></section></main></body></html>" },
      { id: "tpl-port-css", name: "style.css", content: "body{margin:0;padding:3rem;font-family:system-ui;background:#0b1220;color:#eef4ff}header{padding:3rem 0;border-bottom:1px solid #334155}h1{font-size:clamp(2.5rem,8vw,5rem);margin:0}main{max-width:800px;margin:2rem auto}section{padding:1.5rem 0}article{padding:1.2rem;background:#172338;border-radius:1rem}" }
    ]
  };

  const applyTemplate = () => {
    const next = projectTemplates[selectedTemplate] || projectTemplates.html;
    setFiles(next);
    setActiveId(next[0].id);
    setTerminalLines(lines => [...lines, "Loaded " + selectedTemplate + " template with " + next.length + " files."]);
    setShowPreview(selectedTemplate !== "python");
  };

  const runPython = async () => {
    const pythonFile = files.find(file => file.id === activeId && file.name.toLowerCase().endsWith(".py")) || files.find(file => file.name.toLowerCase().endsWith(".py"));
    if (!pythonFile) {
      setTerminalLines(lines => [...lines, "$ python", "No Python file found. Create or open a .py file first."]);
      return;
    }
    setPythonBusy(true);
    setTerminalLines(lines => [...lines, "$ python " + pythonFile.name, "Starting browser Python runtime. The first launch may take a little while..."]);
    try {
      const runtime = await loadPythonRuntime();
      let output = "";
      runtime.setStdout({ batched: (value: string) => { output += value; } });
      runtime.setStderr({ batched: (value: string) => { output += value; } });
      const result = await runtime.runPythonAsync(pythonFile.content);
      const outputLines = output.trimEnd().split("\\n").filter(Boolean);
      if (result !== undefined && result !== null) outputLines.push(String(result));
      setTerminalLines(lines => [...lines, ...(outputLines.length ? outputLines : ["Python finished successfully with no printed output."])]);
    } catch (error) {
      setTerminalLines(lines => [...lines, "Python error: " + (error instanceof Error ? error.message : String(error))]);
    } finally {
      setPythonBusy(false);
    }
  };

  const runCommand = async () => {
    const raw = command.trim();
    if (!raw) return;
    const [verb, ...rest] = raw.split(" ");
    const argument = rest.join(" ").trim();
    let output = "";
    if (verb === "help") output = "help · ls · pwd · cat filename · clear · run · python · template html|python|portfolio · echo text";
    else if (verb === "ls") output = files.map(file => file.name).join("    ") || "No files in this workspace.";
    else if (verb === "pwd") output = "/grand-lumen/workspace";
    else if (verb === "cat") output = files.find(file => file.name === argument)?.content || "File not found: " + argument;
    else if (verb === "echo") output = argument;
    else if (verb === "run") { setShowPreview(true); setPreviewKey(value => value + 1); output = "Browser preview refreshed. HTML, CSS and JavaScript execute in the browser preview."; }
    else if (verb === "python") { setCommand(""); await runPython(); return; }
    else if (verb === "template") {
      if (projectTemplates[argument]) {
        const next = projectTemplates[argument];
        setSelectedTemplate(argument);
        setFiles(next);
        setActiveId(next[0].id);
        setShowPreview(argument !== "python");
        output = "Loaded " + argument + " project template.";
      } else output = "Choose a template: template html, template python, or template portfolio.";
    }
    else if (verb === "clear") { setTerminalLines([]); setCommand(""); return; }
    else output = "Command not available yet. Type help for supported commands.";
    setTerminalLines(lines => [...lines, "$ " + raw, output]);
    setCommand("");
  };


  return <div className={"studio-shell" + (showPreview ? " studio-has-preview" : " studio-editor-focused") + (previewExpanded ? " studio-preview-expanded" : "")}>
    <div className="studio-topbar"><div className="studio-brand"><span className="studio-brand-mark"><Code2 size={17}/></span><div><b>GRAND-LUMEN STUDIO</b><small>WORKSPACE / LOCAL PROJECT</small></div></div><div className="studio-actions"><span className="studio-save-state"><span/> Auto-saved</span><button onClick={() => setShowTerminal(value => !value)}><Terminal size={14}/> Terminal</button><button onClick={() => { setShowPreview(true); setPreviewKey(value => value + 1); }}><Play size={14}/> Run</button><button onClick={() => void runPython()} disabled={pythonBusy}><Terminal size={14}/> Run Python</button><select className="studio-template-select" aria-label="Project template" value={selectedTemplate} onChange={event => setSelectedTemplate(event.target.value)}><option value="html">HTML starter</option><option value="python">Python starter</option><option value="portfolio">Portfolio starter</option></select><button onClick={applyTemplate}><Plus size={14}/> New template</button><button onClick={exportWorkspace}><Download size={14}/> JSON backup</button><button className="studio-export" onClick={exportZip}><Boxes size={14}/> Export ZIP</button></div></div>
    <div className="studio-main">
      <aside className="studio-explorer"><div className="studio-pane-title"><span>EXPLORER</span><button title="Import files" onClick={() => importRef.current?.click()}><Upload size={14}/></button></div><div className="studio-project-name"><Boxes size={15}/> GRAND-LUMEN-PROJECT</div><div className="studio-file-list">{files.map(file => <div key={file.id} className={file.id === activeId ? "studio-file active" : "studio-file"}><button onClick={() => setActiveId(file.id)}><FileText size={14}/><span>{file.name}</span></button><button className="studio-file-remove" title={"Remove " + file.name} onClick={() => { const next = files.filter(item => item.id !== file.id); setFiles(next); if (activeId === file.id && next[0]) setActiveId(next[0].id); }}><X size={12}/></button></div>)}</div><div className="studio-new-file"><input value={newName} onChange={event => setNewName(event.target.value)} onKeyDown={event => event.key === "Enter" && addFile()} placeholder="src/new-file.js"/><button onClick={addFile} disabled={!newName.trim()} title="Create file"><Plus size={15}/></button></div><input ref={importRef} type="file" multiple hidden onChange={importFiles}/><div className="studio-explorer-foot">FOLDERS · FILES · LOCAL AUTOSAVE</div></aside>
      <div className="studio-editor-area"><div className="studio-tabs">{files.map(file => <button key={file.id} className={file.id === activeId ? "active" : ""} onClick={() => setActiveId(file.id)}><FileText size={13}/>{file.name}{file.id === activeId && <span/>}</button>)}</div><div className="studio-editor-meta"><span>{activeFile?.name || "No file selected"}</span><span>{extensionLanguage(activeFile?.name || "")} · {activeFile?.content.split("\n").length || 0} lines</span></div><div className="studio-editor-wrap">{activeFile ? <><div className="studio-line-numbers">{activeFile.content.split("\n").map((_, index) => <span key={index}>{index + 1}</span>)}</div><div className="studio-code-layer"><pre className="studio-code-highlight" aria-hidden="true" dangerouslySetInnerHTML={{ __html: highlightCode(activeFile.content) + "\n" }}/><textarea className="studio-code-input" spellCheck={false} autoCapitalize="off" autoCorrect="off" value={activeFile.content} onChange={event => updateActive(event.target.value)} aria-label="Code editor" /></div></> : <div className="studio-no-file">Create or import a file to begin.</div>}</div><div className="studio-statusbar"><span><span className="studio-status-dot"/> Ready</span><span>{extensionLanguage(activeFile?.name || "")}</span><span>UTF-8</span><span>Grand-Lumen Studio</span></div>
      {showTerminal && <div className="studio-terminal"><div className="studio-terminal-head"><span><Terminal size={13}/> TERMINAL</span><button onClick={() => setShowTerminal(false)}><X size={13}/></button></div><div className="studio-terminal-output">{terminalLines.map((line, index) => <pre key={index}>{line}</pre>)}</div><form className="studio-terminal-command" onSubmit={event => { event.preventDefault(); void runCommand(); }}><span>$</span><input ref={commandRef} value={command} onChange={event => setCommand(event.target.value)} placeholder={pythonBusy ? "Python is starting..." : "Try help, python, template html"}/><button type="submit" disabled={pythonBusy}><ArrowRight size={14}/></button></form></div>}</div>
      {showPreview && <aside className="studio-preview"><div className="studio-preview-head"><span><MonitorSmartphone size={14}/> LIVE PREVIEW</span><div className="studio-preview-controls"><button onClick={() => setPreviewExpanded(value => !value)} title={previewExpanded ? "Restore preview size" : "Enlarge preview"}><Maximize2 size={13}/>{previewExpanded ? "Restore" : "Enlarge"}</button><button onClick={() => setShowPreview(false)} title="Close preview"><X size={13}/></button></div></div><iframe key={previewKey} title="Grand-Lumen project preview" sandbox="allow-scripts" srcDoc={previewDocument}/><div className="studio-preview-foot">SANDBOXED BROWSER PREVIEW · HTML / CSS / JS</div></aside>}
    </div>
    <div className="studio-footer-note">Folder paths are supported, such as src/app.js. Export a ZIP to move the complete project.</div>
  </div>;
}

function LearnWorkspace() {
  const [courseIndex, setCourseIndex] = useState(0);
  const [lessonIndex, setLessonIndex] = useState(0);
  const [mode, setMode] = useState<"course" | "practice">("course");
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [checked, setChecked] = useState(false);
  const course = expandedAcademyCourses[courseIndex];
  const questions = course.practice;
  const score = questions.reduce((total, question, index) => total + (answers[index] === Number(question[4]) ? 1 : 0), 0);
  return <div className="academy-layout"><aside className="academy-course-list"><span className="eyebrow">{academyCourses.length} LEARNING PATHS · 15 LESSONS EACH</span>{academyCourses.map((item,index) => <button className={courseIndex === index ? "active" : ""} key={item.title} onClick={() => { setCourseIndex(index); setLessonIndex(0); setMode("course"); setAnswers({}); setChecked(false); }}><span>{String(index+1).padStart(2,"0")}</span><div><b>{item.title}</b><small>{item.level}</small></div></button>)}</aside><div className="academy-content"><div className="academy-course-heading"><span className="eyebrow">COURSE {String(courseIndex+1).padStart(2,"0")} / {academyCourses.length} · 15 LESSONS</span><h2>{course.title}</h2><p>{course.summary}</p></div><div className="academy-tabs"><button className={mode === "course" ? "active" : ""} onClick={() => { setMode("course"); setChecked(false); }}>Course lessons</button><button className={mode === "practice" ? "active" : ""} onClick={() => { setMode("practice"); setChecked(false); }}>Separate practice</button></div>{mode === "course" ? <article className="academy-lesson"><span className="eyebrow">LESSON {lessonIndex+1} / {course.lessons.length}</span><h3>{course.lessons[lessonIndex][0]}</h3><p>{course.lessons[lessonIndex][1]}</p><div className="academy-lesson-nav"><button className="quiet-button" disabled={lessonIndex===0} onClick={() => setLessonIndex(value => value-1)}>Previous lesson</button><button className="solid-button" onClick={() => setLessonIndex(value => value === course.lessons.length-1 ? 0 : value+1)}>{lessonIndex===course.lessons.length-1 ? "Review course" : "Next lesson"} <ArrowRight size={14}/></button></div></article> : <article className="academy-practice"><span className="eyebrow">CHECK YOUR UNDERSTANDING</span><h3>Practice questions</h3>{questions.map((question,index) => <div className="academy-question" key={question[0]}><b>{index+1}. {question[0]}</b>{question.slice(1,4).map((option,optionIndex) => <label key={optionIndex}><input type="radio" name={"academy-"+courseIndex+"-"+index} checked={answers[index]===optionIndex} onChange={() => { setAnswers(current => ({...current,[index]:optionIndex})); setChecked(false); }}/>{option}</label>)}{checked && <small className={answers[index]===Number(question[4]) ? "correct" : "incorrect"}>{answers[index]===question[3] ? "Correct" : "Review this lesson and try again."}</small>}</div>)}<button className="solid-button" onClick={() => setChecked(true)} disabled={Object.keys(answers).length!==questions.length}>Check my answers</button>{checked && <div className="academy-score">You scored {score} out of {questions.length}.</div>}</article>}</div></div>;
}

function ShareWorkspace({ initialText }: { initialText: string }) {
  const peerRef = useRef<Peer | null>(null);
  const connectionRef = useRef<any>(null);
  const chunksRef = useRef<ArrayBuffer[]>([]);
  const incomingRef = useRef<{ name: string; type: string; size: number } | null>(null);
  const [peerId, setPeerId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("Starting secure connection service…");
  const [received, setReceived] = useState<{ id: string; name: string; url: string; size: number; type: string }[]>([]);
  const [sending, setSending] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [scanOpen, setScanOpen] = useState(false);
  const [shareText, setShareText] = useState("");
  const [receivedMessages, setReceivedMessages] = useState<{ id: string; text: string; time: string }[]>([]);

  useEffect(() => { if (initialText) setShareText(initialText); }, [initialText]);

  useEffect(() => {
    const peer = new Peer();
    peerRef.current = peer;
    peer.on("open", id => { setPeerId(id); setStatus("Your code is ready. Keep this page open while the other device scans it."); });
    peer.on("connection", connection => attachConnection(connection));
    peer.on("error", error => setStatus("Connection service: " + error.message));
    return () => { peer.destroy(); peerRef.current = null; };
  }, []);

  const attachConnection = (connection: any) => {
    connectionRef.current = connection;
    connection.on("open", () => { setConnected(true); setStatus("Devices connected. You can now exchange files."); });
    connection.on("data", (data: any) => {
      if (typeof data === "string") {
        try {
          const message = JSON.parse(data);
          if (message.kind === "share-text") {
            setReceivedMessages(items => [{ id: crypto.randomUUID(), text: message.text, time: new Date().toLocaleTimeString() }, ...items]);
            setStatus("A message or shared result arrived.");
          }
          if (message.kind === "file-start") {
            incomingRef.current = { name: message.name, type: message.type || "application/octet-stream", size: message.size };
            chunksRef.current = [];
            setStatus("Receiving " + message.name + "…");
          }
          if (message.kind === "file-end" && incomingRef.current) {
            const info = incomingRef.current;
            const blob = new Blob(chunksRef.current, { type: info.type });
            const url = URL.createObjectURL(blob);
            setReceived(items => [{ id: crypto.randomUUID(), name: info.name, url, size: blob.size, type: info.type }, ...items]);
            incomingRef.current = null;
            chunksRef.current = [];
            setStatus("File received: " + info.name);
          }
        } catch {
          setStatus("Received a message from the connected device.");
        }
      } else if (data instanceof ArrayBuffer) {
        chunksRef.current.push(data);
      } else if (ArrayBuffer.isView(data)) {
        chunksRef.current.push(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
      } else if (data instanceof Blob) {
        data.arrayBuffer().then(buffer => chunksRef.current.push(buffer));
      }
    });
    connection.on("close", () => { setConnected(false); setStatus("The other device disconnected."); });
    connection.on("error", (error: Error) => setStatus(error.message));
  };

  const connectToDevice = (deviceId = targetId) => {
    const id = deviceId.trim();
    if (!id || !peerRef.current) return;
    setStatus("Connecting to the other device…");
    const connection = peerRef.current.connect(id, { reliable: true });
    attachConnection(connection);
  };

  const sendText = () => {
    if (!shareText.trim() || !connectionRef.current || !connected) return;
    connectionRef.current.send(JSON.stringify({ kind: "share-text", text: shareText.trim() }));
    setShareText("");
    setStatus("Your text, link or code was sent.");
  };

  const sendFiles = async () => {
    if (!selectedFiles.length || !connectionRef.current || !connected) return;
    setSending(true);
    try {
      for (const file of selectedFiles) {
        connectionRef.current.send(JSON.stringify({ kind: "file-start", name: file.name, type: file.type, size: file.size }));
        const chunkSize = 16 * 1024;
        for (let offset = 0; offset < file.size; offset += chunkSize) {
          const buffer = await file.slice(offset, Math.min(offset + chunkSize, file.size)).arrayBuffer();
          connectionRef.current.send(buffer);
        }
        connectionRef.current.send(JSON.stringify({ kind: "file-end" }));
      }
      setStatus("Files sent successfully.");
      setSelectedFiles([]);
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "File transfer failed.");
    } finally {
      setSending(false);
    }
  };

  const qrUrl = peerId ? "https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=12&data=" + encodeURIComponent(peerId) : "";

  return <div className="share-workspace">
    <div className="share-intro"><span className="share-symbol"><Share2 size={23}/></span><div><span className="eyebrow">LUMEN SHARE</span><h2>Send a photo, video or file.</h2><p>It is just like passing a picture to a friend. Follow these three easy steps.</p></div></div><div className="share-howto"><div className="share-howto-step"><span className="share-step-number">1</span><div><b>Show your code</b><p>Choose this phone to show the square code. Keep this screen open.</p></div></div><div className="share-howto-step"><span className="share-step-number">2</span><div><b>Scan their code</b><p>On the other phone, tap Scan QR and point its camera at this square. Only one phone needs to scan.</p></div></div><div className="share-howto-step"><span className="share-step-number">3</span><div><b>Pick and send</b><p>The phone that scanned chooses the pictures or files and taps Send. To send back, swap roles and scan the other phone's code.</p></div></div></div>
    <div className="share-grid">
      <article className="glass-card share-card"><span className="eyebrow">STEP 1 · SHOW THIS CODE</span><h3>Let the other phone scan this</h3><p>On the other phone, open Share, tap <b>Scan their QR code</b>, and point its camera at this square. Only one phone scans. Keep both screens open.</p>{qrUrl ? <img className="share-qr" src={qrUrl} alt="Your device connection QR code"/> : <div className="share-qr-loading">Preparing QR code…</div>}<code className="share-peer-id">{peerId || "Connecting…"}</code><button className="quiet-button" onClick={() => navigator.clipboard?.writeText(peerId)} disabled={!peerId}><Copy size={14}/> Copy device ID</button></article>
      <article className="glass-card share-card"><span className="eyebrow">STEP 2 · SCAN THEIR CODE</span><h3>Connect to the other phone</h3><p>Tap the button and point your camera at the other phone's square code.</p><div className="share-actions"><button className="solid-button" onClick={() => setScanOpen(value => !value)}><ScanLine size={15}/> {scanOpen ? "Close camera" : "Scan their QR code"}</button></div>{scanOpen && <BarcodeScanner onDetected={value => { setTargetId(value); setScanOpen(false); connectToDevice(value); }}/>}<details className="share-manual-connect"><summary>Can't scan? Enter the code instead</summary><input value={targetId} onChange={event => setTargetId(event.target.value)} placeholder="Paste the other phone's code"/><button className="quiet-button" onClick={() => connectToDevice()} disabled={!targetId.trim() || connected}>Connect using code</button></details><div className={connected ? "share-status connected" : "share-status"}><i/>{connected ? "You are connected! Now choose something to send." : status}</div><div className="share-send-area"><span className="eyebrow">SHARE TEXT, LINKS OR CODE</span><textarea value={shareText} onChange={event => setShareText(event.target.value)} placeholder="Paste a search result, website link, message or code here…"/><button className="solid-button" onClick={sendText} disabled={!connected || !shareText.trim()}>Send text or code</button><span className="eyebrow">SEND PHOTOS, VIDEOS OR FILES</span><label className="share-file-button"><Upload size={16}/> {sending ? "Sending your files…" : "Choose photos, videos or files"}<input type="file" multiple disabled={sending} onChange={event => { setSelectedFiles(Array.from(event.target.files || [])); if (event.target.files?.length) setStatus(connected ? event.target.files.length + " file(s) selected. Ready to send." : event.target.files.length + " file(s) selected. Connect to the other device to send."); event.currentTarget.value = ""; }}/></label>{selectedFiles.length > 0 && <div className="share-selected-files"><div className="share-selected-heading"><b>{selectedFiles.length} file(s) selected</b><button className="quiet-button" type="button" onClick={() => setSelectedFiles([])}>Clear</button></div>{selectedFiles.map((file,index) => <div className="share-selected-file" key={file.name + file.lastModified + index}><span>{file.name}</span><small>{(file.size / 1024 / 1024).toFixed(2)} MB</small></div>)}<button className="solid-button share-send-button" type="button" disabled={!connected || sending} onClick={() => void sendFiles()}><Upload size={15}/>{sending ? "Sending…" : connected ? "Send now" : "Connect first to send"}</button></div>}</div></article>
    </div>
    {receivedMessages.length > 0 && <div className="glass-card share-received"><span className="eyebrow">SHARED MESSAGES AND RESULTS</span><h3>Things people shared with you</h3><div className="share-message-list">{receivedMessages.map(item => <article key={item.id}><small>{item.time}</small><pre>{item.text}</pre><div className="received-item-actions"><button className="quiet-button" onClick={() => navigator.clipboard?.writeText(item.text)}><Copy size={13}/> Copy</button><button className="quiet-button" onClick={() => { const blob = new Blob([item.text], { type: "text/plain;charset=utf-8" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "grand-lumen-shared-result.txt"; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }}><Download size={13}/> Save result</button><button className="quiet-button" onClick={() => setReceivedMessages(items => items.filter(entry => entry.id !== item.id))}><X size={13}/> Delete</button></div></article>)}</div></div>}<div className="glass-card share-received"><span className="eyebrow">YOUR RECEIVED FILES</span><h3>Things people sent you</h3>{received.length ? <div className="received-gallery">{received.map(file => <article className="received-item" key={file.url}>{file.type.startsWith("image/") ? <a className="received-preview" href={file.url} target="_blank" rel="noreferrer"><img src={file.url} alt={file.name}/></a> : file.type.startsWith("video/") ? <video className="received-preview" src={file.url} controls/> : <div className="received-file-icon"><FileText size={30}/></div>}<div className="received-item-info"><b>{file.name}</b><small>{(file.size / 1024 / 1024).toFixed(2)} MB</small><div className="received-item-actions"><a href={file.url} download={file.name}><Download size={15}/> Save to device</a><button className="quiet-button" onClick={() => { URL.revokeObjectURL(file.url); setReceived(items => items.filter(entry => entry.id !== file.id)); }}><X size={13}/> Delete</button></div></div></article>)}</div> : <p>Nothing has arrived yet. When someone sends you a picture, video or file, it will show up here.</p>}</div>
    <div className="share-disclaimer"><ShieldCheck size={16}/> Both phones must have Grand-Lumen open and be connected to the internet. Only scan a code from someone you want to connect with. Files travel directly between the connected devices.</div>
  </div>;
}


function NewsWorkspace() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [term, setTerm] = useState("");
  const [country, setCountry] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<NewsItem | null>(null);
  const load = async (search = term, selectedCountry = country) => {
    setBusy(true);
    setError("");
    try {
      const result = await searchGlobalNews(search, selectedCountry);
      setItems(result);
      if (!result.length) setError("No matching reports were found. Try a different topic, date, country or publisher.");
    } catch (reason) {
      setItems([]);
      setError(connectionAwareMessage(reason, "News could not be loaded."));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => { void load("", "all"); }, []);
  const countries = [["all","All countries"],["GH","Ghana"],["NG","Nigeria"],["ZA","South Africa"],["KE","Kenya"],["US","United States"],["GB","United Kingdom"],["CA","Canada"],["IN","India"],["AU","Australia"],["DE","Germany"],["FR","France"],["JP","Japan"],["BR","Brazil"],["EG","Egypt"],["AE","United Arab Emirates"]];
  return <div className="news-workspace">
    <div className="news-search-panel"><div className="news-search-input"><Search size={18}/><input value={term} onChange={event=>setTerm(event.target.value)} onKeyDown={event=>event.key==="Enter" && void load()} placeholder="Search worldwide news, past events, years or historical topics..."/><button onClick={()=>void load()} disabled={busy}>{busy?"Searching…":"Search news"}</button></div><div className="news-filters"><label>Country<select value={country} onChange={event=>{setCountry(event.target.value);void load(term,event.target.value);}}>{countries.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></div><p className="news-source-note">Search current worldwide coverage and indexed historical newspaper collections. Try a year, historical event, country, publisher or keyword. Search availability depends on each archive's digitised records.</p></div>
    {busy && <div className="news-loading">Searching live coverage and historical collections…</div>}
    {error && <div className="news-error">{error}</div>}
    <div className="news-results-heading"><div><span className="eyebrow">WORLDWIDE NEWS & ARCHIVES</span><h2>{term.trim()?"Search results":"Latest and archived reports"}</h2></div><span>{items.length} reports</span></div>
    <div className="news-grid">{items.map((item,index)=><article className="news-card" key={item.url+index}>{item.image?<img className="news-card-image" src={item.image} alt="" loading="lazy" onError={event=>{event.currentTarget.style.display="none";}}/>:<div className="news-card-placeholder"><Newspaper size={28}/></div>}<div className="news-card-body"><div className="news-meta"><span>{item.country}</span><span>{item.source}</span></div><h3>{item.title}</h3><p>{item.publishedAt||"Date not supplied"}</p><div className="news-card-actions"><button className="quiet-button" onClick={()=>setSelected(item)}>Read more <ArrowRight size={14}/></button><a href={item.url} target="_blank" rel="noreferrer">Open source <ExternalLink size={13}/></a></div></div></article>)}</div>
    {selected && <div className="news-detail-backdrop" onClick={()=>setSelected(null)}><article className="news-detail" onClick={event=>event.stopPropagation()}><button className="news-detail-close" onClick={()=>setSelected(null)} aria-label="Close"><X size={18}/></button>{selected.image&&<img src={selected.image} alt=""/>}<span className="eyebrow">{selected.country} · {selected.source}</span><h2>{selected.title}</h2><p>{selected.description}</p><div className="news-publisher-note">This result is indexed from its original publisher or digitised archive. The full article, newspaper scan, images and any available video are provided by the source.</div><a className="solid-button news-open-publisher" href={selected.url} target="_blank" rel="noreferrer">Open complete source <ExternalLink size={15}/></a></article></div>}
  </div>;
}
type ReminderRecord = { id: string; title: string; when: string; notified: boolean; read?: boolean };

function GlobalReminderMonitor() {
  const [items, setItems] = useState<ReminderRecord[]>(() => {
    try { return JSON.parse(localStorage.getItem("lumenReminders") || "[]") as ReminderRecord[]; } catch { return []; }
  });
  useEffect(() => {
    const readItems = () => {
      try { setItems(JSON.parse(localStorage.getItem("lumenReminders") || "[]") as ReminderRecord[]); } catch { setItems([]); }
    };
    const checkDue = () => {
      let current: ReminderRecord[] = [];
      try { current = JSON.parse(localStorage.getItem("lumenReminders") || "[]") as ReminderRecord[]; } catch { current = []; }
      let changed = false;
      const now = Date.now();
      const next = current.map(item => {
        const dueAt = new Date(item.when).getTime();
        if (!item.notified && Number.isFinite(dueAt) && dueAt <= now) {
          changed = true;
          if ("Notification" in window && Notification.permission === "granted" && "serviceWorker" in navigator) {
            void navigator.serviceWorker.ready.then(registration => registration.showNotification("Grand Lumen reminder", { body: item.title, tag: "lumen-reminder-" + item.id, data: { reminderId: item.id } })).catch(() => undefined);
          }
          return { ...item, notified: true, read: false };
        }
        return item;
      });
      if (changed) { localStorage.setItem("lumenReminders", JSON.stringify(next)); window.dispatchEvent(new CustomEvent("lumen-reminders-updated")); }
      setItems(next);
    };
    checkDue();
    const timer = window.setInterval(checkDue, 1000);
    window.addEventListener("focus", checkDue);
    document.addEventListener("visibilitychange", checkDue);
    window.addEventListener("storage", readItems);
    window.addEventListener("lumen-reminders-updated", readItems);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", checkDue);
      document.removeEventListener("visibilitychange", checkDue);
      window.removeEventListener("storage", readItems);
      window.removeEventListener("lumen-reminders-updated", readItems);
    };
  }, []);
  const due = items.filter(item => item.notified && !item.read);
  const markRead = (id?: string) => {
    const next = items.map(item => item.notified && !item.read && (!id || item.id === id) ? { ...item, read: true } : item);
    localStorage.setItem("lumenReminders", JSON.stringify(next));
    setItems(next);
    window.dispatchEvent(new CustomEvent("lumen-reminders-updated"));
  };
  if (!due.length) return null;
  return <div className="lh-reminder-backdrop" role="presentation" style={{ position: "fixed", inset: 0, zIndex: 100000, display: "grid", placeItems: "center" }}>
    <section className="lh-reminder-dialog" role="dialog" aria-modal="true" aria-labelledby="lh-global-reminder-title">
      <div className="lh-reminder-dialog-head"><CheckCircle2 size={22}/><span><b id="lh-global-reminder-title">Reminder alert</b><small>{due.length} reminder{due.length === 1 ? "" : "s"} due</small></span></div>
      <p>You have reminders that are due. Mark each one as read to clear it from this alert.</p>
      <div className="lh-reminder-due-list">{due.map(item => <article key={item.id}><div><b>{item.title}</b><small>{new Date(item.when).toLocaleString()}</small></div><button onClick={() => markRead(item.id)}><CheckCircle2 size={15}/> Mark as read</button></article>)}</div>
      <button className="lh-reminder-mark-all" onClick={() => markRead()}>Mark all as read</button>
    </section>
  </div>;
}

function AlertCenter() {
  const [items, setItems] = useState<ReminderRecord[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const refresh = () => {
      try { setItems(JSON.parse(localStorage.getItem("lumenReminders") || "[]") as ReminderRecord[]); } catch { setItems([]); }
    };
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("lumen-reminders-updated", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("lumen-reminders-updated", refresh);
    };
  }, []);
  const unread = items.filter(item => item.notified && !item.read);
  const markRead = (id?: string) => {
    const next = items.map(item => item.notified && !item.read && (!id || item.id === id) ? { ...item, read: true } : item);
    localStorage.setItem("lumenReminders", JSON.stringify(next));
    setItems(next);
    window.dispatchEvent(new CustomEvent("lumen-reminders-updated"));
  };
  return <div className="alert-center">
    <button className="icon-button alert-center-trigger" onClick={() => setOpen(value => !value)} aria-label="Open alerts" aria-expanded={open}>
      <Bell size={17}/>{unread.length > 0 && <span className="alert-center-count">{unread.length > 99 ? "99+" : unread.length}</span>}
    </button>
    {open && <><button className="alert-center-dismiss" aria-label="Close alerts" onClick={() => setOpen(false)}/><section className="alert-center-panel" aria-label="Alerts">
      <div className="alert-center-heading"><div><span className="eyebrow">GRAND-LUMEN</span><h3>Alerts</h3><p>{unread.length ? unread.length + " unread reminder" + (unread.length === 1 ? "" : "s") : "You're all caught up."}</p></div><button className="quiet-button" onClick={() => setOpen(false)} aria-label="Close alerts"><X size={16}/></button></div>
      {items.length ? <div className="alert-center-list">{[...items].sort((a,b) => new Date(b.when).getTime() - new Date(a.when).getTime()).map(item => <article className={item.notified && !item.read ? "alert-center-item unread" : "alert-center-item"} key={item.id}><span className="alert-center-item-icon"><Bell size={15}/></span><div><b>{item.title}</b><small>{new Date(item.when).toLocaleString()}</small><span>{item.notified ? item.read ? "Read" : "Due · Unread" : "Scheduled"}</span></div>{item.notified && !item.read && <button onClick={() => markRead(item.id)}>Mark read</button>}</article>)}</div> : <div className="alert-center-empty"><Bell size={24}/><b>No alerts yet</b><span>Reminders created in Lumen Hub will appear here when they become due.</span></div>}
      {unread.length > 1 && <button className="alert-center-mark-all" onClick={() => markRead()}>Mark all as read</button>}
    </section></>}
  </div>;
}

function ReminderToolsWorkspace() {
  const [items, setItems] = useState<ReminderRecord[]>(() => {
    try { return JSON.parse(localStorage.getItem("lumenReminders") || "[]") as ReminderRecord[]; } catch { return []; }
  });
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    const refresh = () => {
      try { setItems(JSON.parse(localStorage.getItem("lumenReminders") || "[]") as ReminderRecord[]); } catch { setItems([]); }
    };
    window.addEventListener("lumen-reminders-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("lumen-reminders-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  const saveItems = (next: ReminderRecord[]) => {
    localStorage.setItem("lumenReminders", JSON.stringify(next));
    setItems(next);
    window.dispatchEvent(new CustomEvent("lumen-reminders-updated"));
  };
  const createReminder = async () => {
    const dueAt = new Date(when).getTime();
    if (!title.trim() || !when || !Number.isFinite(dueAt) || dueAt <= Date.now()) {
      setMessage("Enter a reminder title and a future date and time.");
      return;
    }
    if ("Notification" in window && Notification.permission === "default") {
      try { await Notification.requestPermission(); } catch {}
    }
    saveItems([{ id: crypto.randomUUID(), title: title.trim(), when: new Date(dueAt).toISOString(), notified: false }, ...items]);
    setTitle("");
    setWhen("");
    setMessage("Reminder saved. Grand-Lumen will alert you when it is due.");
  };
  const removeReminder = (id: string) => saveItems(items.filter(item => item.id !== id));
  return <div className="reminder-tools-workspace">
    <div className="reminder-tools-heading"><span className="alert-center-item-icon"><Bell size={18}/></span><div><h3>Notification settings</h3><p>Create and manage reminders across Grand-Lumen. These reminders are shared with Lumen Hub.</p></div></div>
    <div className="reminder-tools-form"><label>Reminder title<input value={title} onChange={event => setTitle(event.target.value)} placeholder="What should Grand-Lumen remind you about?"/></label><label>Date and time<input type="datetime-local" value={when} onChange={event => setWhen(event.target.value)} min={new Date(Date.now() + 60000).toISOString().slice(0,16)}/></label><button className="solid-button" onClick={() => void createReminder()}><Plus size={15}/> Create reminder</button></div>
    {message && <p className="reminder-tools-message" role="status">{message}</p>}
    <div className="reminder-tools-list"><div className="reminder-tools-list-head"><b>Your reminders</b><span>{items.length} saved</span></div>{items.length ? [...items].sort((a,b) => new Date(a.when).getTime() - new Date(b.when).getTime()).map(item => <article key={item.id}><span className="alert-center-item-icon"><Bell size={15}/></span><div><b>{item.title}</b><small>{new Date(item.when).toLocaleString()}</small><span>{item.notified ? item.read ? "Read" : "Due · Unread" : "Scheduled"}</span></div><button onClick={() => removeReminder(item.id)} aria-label={"Delete reminder: " + item.title}><X size={16}/></button></article>) : <div className="alert-center-empty"><Bell size={24}/><b>No reminders yet</b><span>Create your first reminder above. It will also appear in Lumen Hub Alerts.</span></div>}</div>
  </div>;
}

function App() {
  const [section, setSection] = useState<Section>("Home");
  const [session, setSession] = useState<Session | null>(null);
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [guestMode, setGuestMode] = useState(false);
  const [localProfile, setLocalProfile] = useState<{ fullName: string; email: string; profileImage?: string; onboardingPending?: boolean } | null>(null);
  const [welcomeTourOpen, setWelcomeTourOpen] = useState(false);
  const [activityEntries, setActivityEntries] = useState<ActivityEntry[]>([]);
  const [clearDataOpen, setClearDataOpen] = useState(false);
  const [clearDataPassword, setClearDataPassword] = useState("");
  const [clearDataError, setClearDataError] = useState("");
  const [clearDataBusy, setClearDataBusy] = useState(false);
  const [profilePicture, setProfilePicture] = useState<string>(() => localStorage.getItem("grandLumenProfileImage") || "");
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("INITIALIZING GRAND-LUMEN");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [mediaResults, setMediaResults] = useState<SearchItem[]>([]);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<SearchItem[]>(() => readWorkspaceData("grandLumenSaved", []));
  const [theme, setTheme] = useState<"dark" | "light">("light");
  const [fontScale, setFontScale] = useState(() => initialDisplayScale("grandLumenFontScale"));
  const [interfaceScale, setInterfaceScale] = useState(() => initialDisplayScale("grandLumenInterfaceScale"));
  const [fontFamily, setFontFamily] = useState(() => localStorage.getItem("grandLumenFontFamily") || "Manrope, sans-serif");
  const [fontWeight, setFontWeight] = useState(() => localStorage.getItem("grandLumenFontWeight") || "normal");
  const [appLanguage, setAppLanguage] = useState(() => {
    const chosen = localStorage.getItem("grandLumenLanguageChosen") === "true";
    if (!chosen) {
      localStorage.setItem("grandLumenLanguage", "en");
      return "en";
    }
    return localStorage.getItem("grandLumenLanguage") || "en";
  });
  const [languageSearch, setLanguageSearch] = useState(() => appLanguages.find(language => language.code === (localStorage.getItem("grandLumenLanguageChosen") === "true" ? localStorage.getItem("grandLumenLanguage") || "en" : "en"))?.name || "English");

  useEffect(() => {
    const smallScreen = window.matchMedia("(max-width: 760px)").matches;
    localStorage.setItem(smallScreen ? "grandLumenFontScaleMobile" : "grandLumenFontScale", String(fontScale));
    localStorage.setItem(smallScreen ? "grandLumenInterfaceScaleMobile" : "grandLumenInterfaceScale", String(interfaceScale));
    localStorage.setItem("grandLumenFontFamily", fontFamily);
    localStorage.setItem("grandLumenFontWeight", fontWeight);
    document.documentElement.style.setProperty("--gl-font-scale", String(fontScale));
    document.documentElement.style.setProperty("--gl-interface-scale", String(interfaceScale));
    document.documentElement.style.setProperty("--gl-font-family", fontFamily);
    document.documentElement.style.setProperty("--gl-font-weight", fontWeight);
    let typographyStyle = document.getElementById("gl-typography-overrides") as HTMLStyleElement | null;
    if (!typographyStyle) {
      typographyStyle = document.createElement("style");
      typographyStyle.id = "gl-typography-overrides";
      document.head.appendChild(typographyStyle);
    }
    typographyStyle.textContent = `.app-shell,.app-shell *:not(svg):not(path):not(i):not(pre):not(code):not(.lh-code-editor){font-family:${fontFamily}!important;font-weight:${fontWeight}!important}.app-shell .preference-preview,.app-shell .preference-preview *{font-family:${fontFamily}!important;font-weight:${fontWeight}!important}.app-shell pre,.app-shell code,.app-shell .lh-code-editor{font-family:ui-monospace,monospace!important}`;
  }, [fontScale, interfaceScale, fontFamily, fontWeight]);

  useEffect(() => {
    const screenQuery = window.matchMedia("(max-width: 760px)");
    const syncDisplayScale = () => {
      const fontValue = Number(localStorage.getItem(screenQuery.matches ? "grandLumenFontScaleMobile" : "grandLumenFontScale") || "1");
      const interfaceValue = Number(localStorage.getItem(screenQuery.matches ? "grandLumenInterfaceScaleMobile" : "grandLumenInterfaceScale") || "1");
      setFontScale(Number.isFinite(fontValue) ? fontValue : 1);
      setInterfaceScale(Number.isFinite(interfaceValue) ? interfaceValue : 1);
    };
    screenQuery.addEventListener("change", syncDisplayScale);
    return () => screenQuery.removeEventListener("change", syncDisplayScale);
  }, []);

  useEffect(() => {
    localStorage.setItem("grandLumenLanguage", appLanguage);
    document.documentElement.lang = appLanguage;
    if (appLanguage === "en") return;
    let attempts = 0;
    const applyLanguage = () => {
      const selector = document.querySelector<HTMLSelectElement>(".goog-te-combo");
      if (!selector) return false;
      selector.value = appLanguage;
      selector.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    };
    const timer = window.setInterval(() => {
      attempts += 1;
      if (applyLanguage() || attempts >= 40) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [appLanguage]);

  const resetToEnglish = () => {
    localStorage.setItem("grandLumenLanguageChosen", "true");
    localStorage.setItem("grandLumenLanguage", "en");
    document.cookie = "googtrans=;path=/;expires=Thu, 01 Jan 1970 00:00:00 GMT;SameSite=Lax";
    document.cookie = "googtrans=;path=/;domain=" + window.location.hostname + ";expires=Thu, 01 Jan 1970 00:00:00 GMT;SameSite=Lax";
    document.documentElement.lang = "en";
    setAppLanguage("en");
    window.setTimeout(() => window.location.reload(), 120);
  };

  useEffect(() => {
    const removeGoogleTranslateBanner = () => {
      document.querySelectorAll(".goog-te-banner-frame, .goog-te-balloon-frame, #goog-gt-tt, .goog-tooltip").forEach(element => element.remove());
      document.body.style.top = "0px";
    };
    removeGoogleTranslateBanner();
    const observer = new MutationObserver(removeGoogleTranslateBanner);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setLanguageSearch(appLanguages.find(language => language.code === appLanguage)?.name || "English");
  }, [appLanguage]);

  useEffect(() => {
    if (appLanguage === "en") return;
    const initializeTranslator = () => {
      const google = (window as any).google;
      if (!google?.translate?.TranslateElement) return;
      let host = document.getElementById("grand-lumen-google-translate");
      if (!host) {
        host = document.createElement("div");
        host.id = "grand-lumen-google-translate";
        host.className = "grand-lumen-translate-host";
        host.setAttribute("aria-hidden", "true");
        document.body.appendChild(host);
      }
      if (!host.querySelector(".goog-te-combo")) {
        new google.translate.TranslateElement({
          pageLanguage: "en",
          includedLanguages: appLanguages.map(language => language.code).filter(code => code !== "en").join(","),
          autoDisplay: false
        }, "grand-lumen-google-translate");
      }
      let attempts = 0;
      const languageTimer = window.setInterval(() => {
        const selector = document.querySelector<HTMLSelectElement>(".goog-te-combo");
        if (selector) {
          selector.value = appLanguage;
          selector.dispatchEvent(new Event("change"));
          window.clearInterval(languageTimer);
        } else if (++attempts >= 40) {
          window.clearInterval(languageTimer);
        }
      }, 250);
    };
    (window as any).googleTranslateElementInit = initializeTranslator;
    if ((window as any).google?.translate?.TranslateElement) {
      initializeTranslator();
    } else if (!document.querySelector("script[data-grand-lumen-translator]")) {
      const script = document.createElement("script");
      script.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
      script.async = true;
      script.dataset.grandLumenTranslator = "true";
      document.head.appendChild(script);
    }
  }, [appLanguage]);
  const [apiFilter, setApiFilter] = useState("All");
  const [tool, setTool] = useState("Calculator");
  const [toolFocused, setToolFocused] = useState(false);
  const [toolInput, setToolInput] = useState("");
  const [toolOutput, setToolOutput] = useState<any>(null);
  const [currencyBase, setCurrencyBase] = useState("USD");
  const [currencyTarget, setCurrencyTarget] = useState("GHS");
  const [codeLanguage, setCodeLanguage] = useState("HTML");
  const [code, setCode] = useState(starterCode.HTML);
  const [preview, setPreview] = useState(false);
  const [researchNotes, setResearchNotes] = useState(() => localStorage.getItem("grandLumenResearchNotes") || "");
  const [researchResults, setResearchResults] = useState<{ title: string; extract: string; url: string }[]>([]);
  const [researchBusy, setResearchBusy] = useState(false);
  const [shareDraft, setShareDraft] = useState("");
  const openShare = (value: string) => { setShareDraft(value); setSection("Share"); setMobileMenu(false); };
  const [mobileMenu, setMobileMenu] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projects, setProjects] = useState<string[]>(() => readWorkspaceData("grandLumenProjects", []));
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [installHelp, setInstallHelp] = useState("");
  const [isInstalled, setIsInstalled] = useState(() => window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as any).standalone));
  const activityStorageKey = "grandLumenActivity_" + encodeURIComponent(session?.user.id || localProfile?.email || "guest");
  const verifyActivityPassword = async (password: string): Promise<boolean> => {
    if (!password) return false;
    if (session && supabase && session.user.email) {
      const { error: authError } = await supabase.auth.signInWithPassword({ email: session.user.email, password });
      if (authError) {
        if (authError.status === 0 || authError.name === "AuthRetryableFetchError" || /network|fetch failed|failed to fetch|load failed|connection|timeout/i.test(authError.message)) throw authError;
        return false;
      }
      return true;
    }
    const email = (localProfile?.email || "").trim().toLowerCase();
    if (!email) return false;
    const accounts = readWorkspaceData<{ fullName: string; email: string; salt: string; passwordHash: string }[]>("grandLumenLocalAccounts", []);
    const account = accounts.find(item => item.email.toLowerCase() === email);
    if (!account) return false;
    return await hashLocalPassword(password, account.salt) === account.passwordHash;
  };
  const clearWorkspaceData = async () => {
    if (clearDataBusy) return;
    setClearDataBusy(true);
    setClearDataError("");
    try {
      const verified = await verifyActivityPassword(clearDataPassword);
      if (!verified) {
        setClearDataError("The password is incorrect. Your workspace data has not been changed.");
        return;
      }
      const workspaceKeys = Object.keys(localStorage).filter(key =>
        key === "grandLumenSaved" ||
        key === "grandLumenProjects" ||
        key === "grandLumenResearchNotes" ||
        key === "grandLumenStudioFiles" ||
        key === "grandLumenStudioActive" ||
        key.startsWith("grandLumenActivity_")
      );
      workspaceKeys.forEach(key => localStorage.removeItem(key));
      setSaved([]);
      setProjects([]);
      setResearchNotes("");
      setActivityEntries([]);
      setClearDataPassword("");
      setClearDataOpen(false);
      setSection("Settings");
    } catch (reason) {
      setClearDataError(reason instanceof Error ? reason.message : "Workspace data could not be cleared. Please try again.");
    } finally {
      setClearDataBusy(false);
    }
  };
  const recordActivity = (action: string, activitySection: string = section) => {
    const entry: ActivityEntry = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), action, section: activitySection, timestamp: new Date().toISOString() };
    setActivityEntries(current => {
      const next = [entry, ...current].slice(0, 1500);
      try { localStorage.setItem(activityStorageKey, JSON.stringify(next)); } catch { }
      return next;
    });
  };
  useEffect(() => {
    setActivityEntries(readWorkspaceData<ActivityEntry[]>(activityStorageKey, []));
  }, [activityStorageKey]);
  useEffect(() => {
    const captureActivity = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("button, a, [role=button]") : null;
      if (!target || target.closest(".nav-item, .feature-card, .activity-digest")) return;
      const action = (target.innerText || target.getAttribute("aria-label") || target.getAttribute("title") || "").replace(/\s+/g, " ").trim();
      if (!action || action.length < 2) return;
      recordActivity(action.slice(0, 100));
    };
    const captureFieldChange = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
      if (target instanceof HTMLInputElement && ["password", "hidden", "file"].includes(target.type)) return;
      const label = target.getAttribute("aria-label") || target.getAttribute("placeholder") || target.name || target.closest("label")?.innerText || target.tagName.toLowerCase();
      recordActivity("Updated " + label.replace(/\s+/g, " ").trim().slice(0, 70));
    };
    document.addEventListener("click", captureActivity, true);
    document.addEventListener("change", captureFieldChange, true);
    return () => {
      document.removeEventListener("click", captureActivity, true);
      document.removeEventListener("change", captureFieldChange, true);
    };
  }, [activityStorageKey, section]);
  useEffect(() => {
    const captureInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event);
      setInstallHelp("Grand-Lumen is ready to install on this device.");
    };
    const installed = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
      setInstallHelp("Grand-Lumen is installed on this device.");
    };
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const syncInstalledState = () => setIsInstalled(displayMode.matches || Boolean((navigator as any).standalone));
    window.addEventListener("beforeinstallprompt", captureInstall);
    window.addEventListener("appinstalled", installed);
    displayMode.addEventListener?.("change", syncInstalledState);
    syncInstalledState();
    return () => {
      window.removeEventListener("beforeinstallprompt", captureInstall);
      window.removeEventListener("appinstalled", installed);
      displayMode.removeEventListener?.("change", syncInstalledState);
    };
  }, []);
  const installGrandLumen = async () => {
    if (isInstalled) {
      setInstallHelp("Grand-Lumen is already installed on this device.");
      return;
    }
    if (installPrompt) {
      try {
        await installPrompt.prompt();
        const choice = await installPrompt.userChoice;
        setInstallHelp(choice?.outcome === "accepted" ? "Follow your device prompts to finish installing Grand-Lumen." : "Installation was cancelled. You can try again later.");
      } catch {
        setInstallHelp("The browser could not open its install prompt. Open the browser menu and choose Install app or Add to Home screen.");
      } finally {
        setInstallPrompt(null);
      }
      return;
    }
    if (!window.isSecureContext) {
      setInstallHelp("Installation requires the secure HTTPS Grand-Lumen website.");
      return;
    }
    setInstallHelp(/iphone|ipad|ipod/i.test(navigator.userAgent)
      ? "On iPhone or iPad, open the Share menu, choose Add to Home Screen, then tap Add."
      : "Chrome has not offered its install prompt yet. Open the published HTTPS site in Chrome, refresh it, then use Chrome ⋮ → Install app or Add to Home screen. If that option is missing, Chrome is still rejecting an installation requirement.");
  };

  useEffect(() => {
    if (!supabase) {
      try {
        const localSession = localStorage.getItem("grandLumenLocalSession");
        if (localSession) {
          const profile = JSON.parse(localSession) as { fullName: string; email: string; profileImage?: string; onboardingPending?: boolean };
          setLocalProfile(profile);
          setWelcomeTourOpen(profile.onboardingPending === true);
          setGuestMode(true);
        }
      } catch {
        localStorage.removeItem("grandLumenLocalSession");
      }
      setAuthReady(true);
      return;
    }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) {
        const activeSession = data.session;
        setSession(activeSession);
        setWelcomeTourOpen(Boolean(activeSession && activeSession.user.user_metadata?.grand_lumen_onboarding_pending && localStorage.getItem("grandLumenTourCompleted:" + activeSession.user.id) !== "true"));
        setAuthReady(true);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setWelcomeTourOpen(Boolean(nextSession && nextSession.user.user_metadata?.grand_lumen_onboarding_pending && localStorage.getItem("grandLumenTourCompleted:" + nextSession.user.id) !== "true"));
      setAuthReady(true);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    setProgress(100);
    setStatus("WORKSPACE READY");
    const timeout = window.setTimeout(() => setLoading(false), 520);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    localStorage.setItem("grandLumenSaved", JSON.stringify(saved));
  }, [saved]);
  useEffect(() => {
    localStorage.setItem("grandLumenProjects", JSON.stringify(projects));
  }, [projects]);
  useEffect(() => {
    localStorage.setItem("grandLumenResearchNotes", researchNotes);
  }, [researchNotes]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const email = localProfile?.email || session?.user.email;
    if (!email) return;
    const legacyImage = localStorage.getItem("grandLumenProfileImage") || "";
    const image = accountProfileImage(email) || localProfile?.profileImage || legacyImage;
    if (image) saveAccountProfileImage(email, image);
    if (legacyImage) localStorage.removeItem("grandLumenProfileImage");
    setProfilePicture(image);
    if (localProfile && image !== localProfile.profileImage) setLocalProfile(current => current ? { ...current, profileImage: image } : current);
  }, [localProfile?.email, session?.user.email]);

  const completeWelcomeTour = () => {
    setWelcomeTourOpen(false);
    if (localProfile?.email) {
      const accounts = JSON.parse(localStorage.getItem("grandLumenLocalAccounts") || "[]") as { email: string; onboardingPending?: boolean; [key: string]: unknown }[];
      localStorage.setItem("grandLumenLocalAccounts", JSON.stringify(accounts.map(account => account.email === localProfile.email ? { ...account, onboardingPending: false } : account)));
      const savedSession = JSON.parse(localStorage.getItem("grandLumenLocalSession") || "{}") as Record<string, unknown>;
      localStorage.setItem("grandLumenLocalSession", JSON.stringify({ ...savedSession, onboardingPending: false }));
      setLocalProfile(current => current ? { ...current, onboardingPending: false } : current);
    }
    if (session && supabase) {
      localStorage.setItem("grandLumenTourCompleted:" + session.user.id, "true");
      void supabase.auth.updateUser({ data: { grand_lumen_onboarding_pending: false, grand_lumen_onboarding_completed: true } }).catch(() => undefined);
    }
  };

  const requestEmailVerification = async () => {
    const email = session?.user.email;
    if (!supabase || !email) return;
    if (session.user.email_confirmed_at) {
      setVerificationMessage("This email address is already verified.");
      return;
    }
    setVerificationBusy(true);
    setVerificationMessage("");
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: window.location.origin + window.location.pathname }
      });
      if (resendError) throw resendError;
      setVerificationMessage("Verification email sent. Open the message and follow its link to verify your address.");
    } catch (reason) {
      setVerificationMessage(reason instanceof Error ? reason.message : "Could not send a verification email.");
    } finally {
      setVerificationBusy(false);
    }
  };

  const refreshEmailVerification = async () => {
    if (!supabase || !session) return;
    setVerificationBusy(true);
    setVerificationMessage("");
    try {
      const { data, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      setSession(current => current ? { ...current, user: data.user } : current);
      setVerificationMessage(data.user.email_confirmed_at ? "Your email address is verified." : "Your email address is not verified yet.");
    } catch (reason) {
      setVerificationMessage(reason instanceof Error ? reason.message : "Could not refresh verification status.");
    } finally {
      setVerificationBusy(false);
    }
  };

  const handleLogout = async () => {
    if (welcomeTourOpen) completeWelcomeTour();
    if (session && supabase) {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) { alert(signOutError.message); return; }
    } else {
      localStorage.removeItem("grandLumenLocalSession");
      setLocalProfile(null);
      setGuestMode(false);
    }
    setWelcomeTourOpen(false);
    setProfilePicture("");
    setSession(null);
    setSection("Home");
  };

  const exportWorkspace = () => {
    const workspace: Record<string, unknown> = { exportedAt: new Date().toISOString(), application: "Grand-Lumen", version: "1.0", savedItems: saved, projects, theme };
    Object.keys(localStorage).filter(key => key.startsWith("grandLumen") && !["grandLumenLocalAccounts", "grandLumenLocalSession"].includes(key)).forEach(key => {
      try { workspace[key] = JSON.parse(localStorage.getItem(key) || "null"); } catch { workspace[key] = localStorage.getItem(key); }
    });
    const blob = new Blob([JSON.stringify(workspace, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "grand-lumen-workspace-" + new Date().toISOString().slice(0, 10) + ".json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

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
      setError(connectionAwareMessage(e, "Search could not be completed."));
    } finally {
      setBusy(false);
    }
  }

  async function runResearchTopic(value = query) {
    if (!value.trim()) { setError("Enter a topic to research."); return; }
    setResearchBusy(true);
    setError("");
    setResearchResults([]);
    try {
      const items = await researchTopic(value.trim());
      setResearchResults(items);
      if (!items.length) setError("No readable explanations were found. Try another topic.");
    } catch (reason) {
      setError(connectionAwareMessage(reason, "Research could not be completed."));
    } finally {
      setResearchBusy(false);
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
      setError(connectionAwareMessage(e, "Media search could not be completed."));
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
      setError(connectionAwareMessage(e, "The tool could not complete this request."));
    } finally {
      setBusy(false);
    }
  }

  function selectSection(value: Section) {
    if (value !== section) recordActivity("Opened " + value, value);
    setSection(value);
    setMobileMenu(false);
    setError("");
    setResults([]);
    setToolOutput(null);
  }

  const heading: Record<Section, string> = {
    "Lumen Hub": "One workspace. More possibilities.",
    Home: "Explore beyond.",
    Search: "Find what matters.",
    Research: "Think deeper.",
    News: "The world, in view.",
    Images: "A visual universe.",
    Videos: "Watch and discover.",
    Maps: "Explore the world.",
    "Code Lab": "Build anything.",
    Learn: "Knowledge, expanded.",
    "API Library": "Connect the world.",
    Tools: "Tools for curious minds.",
    Scanner: "Scan the physical world.",
    Share: "Send it across.",
    Saved: "Your knowledge vault.",
    "Activity Digest": "Your workspace, remembered.",
    Projects: "Your creation space.",
    "Creative Studio": "Create beyond limits.",
    Messages: "Connect and communicate.",
    Team: "Collaborate beyond boundaries.",
    Settings: "Shape your workspace."
  };

  if (!authReady) return <div className="auth-boot"><div className="portal-brand-mark"><img src={`${import.meta.env.BASE_URL}icons/grand-lumen-icon.svg`} alt="Grand-Lumen" /></div><span>SECURING YOUR WORKSPACE</span></div>;
  if (!session && !guestMode) return <PublicPortal onGuest={(profile) => { if (profile) { setLocalProfile(profile); setWelcomeTourOpen(profile.onboardingPending === true); } setGuestMode(true); }} />;

  return (
    <>
      {loading && <div id="lumen-loading-screen">
        <div className="ls-logo">LUMEN<span>.</span></div>
        <div className="ls-spinner-container"><div className="ls-spinner-ring" /><div className="ls-spinner-core" /></div>
        <div className="ls-progress-bar-bg"><div className="ls-progress-bar-fill" style={{ width: progress + "%" }} /></div>
        <div className="ls-status-text">{status}</div>
        <div className="ls-credit">A NEW WORLD OF POSSIBILITIES</div>
      </div>}
      <GlobalReminderMonitor />
      <div className={theme === "light" ? "app-shell theme-light" : "app-shell theme-dark"} style={{ "--gl-font-scale": fontScale, "--gl-interface-scale": interfaceScale, "--gl-font-family": fontFamily, "--gl-font-weight": fontWeight } as React.CSSProperties}>
        {appLanguage !== "en" && <button className="language-default-fab" onClick={resetToEnglish} aria-label="Switch back to English"><Globe2 size={15} /><span>English</span><ArrowRight size={13} /></button>}
        <aside className={mobileMenu ? "sidebar open" : "sidebar"}>
          <div className="brand"><span className="brand-mark"><img src={`${import.meta.env.BASE_URL}icons/grand-lumen-icon.svg`} alt="Grand-Lumen" /></span><div><strong>GRAND-LUMEN</strong><small>EXPLORE BEYOND</small></div></div>
          <div className="workspace-label">WORKSPACE</div>
          <nav className="side-nav">
            {sections.map(item => {
              const Icon = item.icon;
              return <button key={item.name} className={section === item.name ? "nav-item active" : "nav-item"} onClick={() => selectSection(item.name)}><Icon size={17} /><span>{item.name}</span>{item.name === "Saved" && saved.length > 0 && <i>{saved.length}</i>}</button>;
            })}
          </nav>
          <div className="sidebar-bottom"><div className="creator-chip">{(session?.user.user_metadata?.avatar_url || localProfile?.profileImage || profilePicture) ? <img className="creator-avatar" src={session?.user.user_metadata?.avatar_url || localProfile?.profileImage || profilePicture} alt="Profile"/> : <span>{(session?.user.email || localProfile?.email || "GL").slice(0,2).toUpperCase()}</span>}<div><b>{session?.user.user_metadata?.full_name || localProfile?.fullName || "Grand-Lumen member"}</b><small>{session?.user.email || localProfile?.email || "Local browser session"}</small></div></div><span className="version">FOUNDATION 1.0</span></div>
        </aside>
        <main className="main-area">
          <header className="topbar">
            <button className="icon-button mobile-only" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Toggle navigation"><Menu size={19} /></button>
            <div className="breadcrumb"><span>GRAND-LUMEN</span><ArrowRight size={13} /><b>{section.toUpperCase()}</b></div>
            <div className="top-actions"><span className="system-status"><i /> SYSTEM READY</span><div className="desktop-alert-center"><AlertCenter /></div><span className="signed-in-email">{session?.user.email || localProfile?.email || "LOCAL WORKSPACE"}</span><button className="icon-button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">{theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}</button><button className="icon-button" onClick={() => void handleLogout()} aria-label="Sign out"><LogOut size={16} /></button></div>
          </header>
          <div className="content-wrap">
            {section === "Lumen Hub" && <section><PageTitle eyebrow="GLOBAL DIGITAL UTILITY PLATFORM" title={heading["Lumen Hub"]} description="Connected knowledge, everyday utilities, productivity, learning and accessibility tools. AI is intentionally excluded from this release."/><ExpansionHub language={appLanguage} userId={session?.user.id || ""} onOpenScanner={() => selectSection("Scanner")}/></section>}
            {section === "Home" && <section>
              <div className="hero-block"><div className="eyebrow"><Sparkles size={13} /> YOUR EXPANDED DIGITAL UNIVERSE</div><h1>Explore beyond<br /><span>what you know.</span></h1><p>One workspace for discovery, research, learning, development and creation. Your next idea starts here.</p><div className="hero-search"><Search size={19} /><input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && runSearch()} placeholder="Search knowledge, ideas, technology..." /><button onClick={() => { selectSection("Search"); runSearch(); }}>Explore <ArrowRight size={15} /></button></div><div className="quick-tags"><button onClick={() => { setQuery("artificial intelligence"); selectSection("Search"); }}>Artificial intelligence</button><button onClick={() => { setQuery("space exploration"); selectSection("Search"); }}>Space exploration</button><button onClick={() => { setQuery("web development"); selectSection("Search"); }}>Web development</button></div></div>
              <div className="section-heading"><div><span className="eyebrow">THE WORKSPACE</span><h2>Everything in one orbit.</h2></div><span className="muted">12 connected spaces</span></div>
              <div className="feature-grid">{[{n:"Research Studio",d:"Explore subjects, collect sources and build understanding.",i:FlaskConical,s:"Research"},{n:"Code Lab",d:"Experiment with 15 programming and markup languages.",i:Code2,s:"Code Lab"},{n:"API Library",d:"Discover open data and connect useful services.",i:Database,s:"API Library"},{n:"Learning Hub",d:"Build skills through guided, practical lessons.",i:GraduationCap,s:"Learn"},{n:"Visual Discovery",d:"Explore visual ideas and media collections.",i:Image,s:"Images"},{n:"Smart Tools",d:"Use calculators, dictionaries and live data utilities.",i:Zap,s:"Tools"}].map(card => { const Icon = card.i; return <button className="feature-card" key={card.n} onClick={() => selectSection(card.s as Section)}><span className="feature-icon"><Icon size={20} /></span><span className="feature-title">{card.n}</span><span className="feature-description">{card.d}</span><ArrowRight className="feature-arrow" size={16} /></button>; })}</div>
              <article className="marketlink-promo">
                <div className="marketlink-promo-mark"><span>ML</span></div>
                <div className="marketlink-promo-copy">
                  <span className="marketlink-promo-kicker">FEATURED PROJECT · MARKETPLACE</span>
                  <h2>Discover. Connect. Trade.</h2>
                  <p>Meet MarketLink, a marketplace experience designed to bring buyers and sellers closer. Explore products, connect with sellers and discover new opportunities.</p>
                  <a className="marketlink-promo-link" href="https://marketlink-ml.vercel.app" target="_blank" rel="noopener noreferrer">Explore MarketLink <ArrowUpRight size={16} /></a>
                </div>
                <div className="marketlink-promo-orbit" aria-hidden="true"><span /><span /><span /></div>
              </article>
              <div className="stats-strip"><div><b>15</b><span>LANGUAGE TRACKS</span></div><div><b>20+</b><span>API CATALOGUE</span></div><div><b>06</b><span>LIVE DATA TOOLS</span></div><div><b>{saved.length.toString().padStart(2,"0")}</b><span>SAVED ITEMS</span></div></div>
            </section>}
            {section === "Search" && <section><PageTitle eyebrow="DISCOVERY ENGINE" title={heading.Search} description="Search across knowledge sources and developer communities without leaving your workspace." /><div className="search-panel"><Search size={18} /><input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && runSearch()} placeholder="What would you like to discover?" /><button onClick={() => runSearch()} disabled={busy}>Search</button></div><div className="filter-row"><button onClick={() => runSearch("all")}>All sources</button><button onClick={() => runSearch("wiki")}>Wikipedia</button><button onClick={() => runSearch("hn")}>Hacker News</button></div><Results items={results} saved={saved} onSave={toggleSave} onShare={item => openShare(item.title + "\n\n" + item.description + "\n\n" + item.url)} busy={busy} error={error} /></section>}
            {section === "Scanner" && <section><PageTitle eyebrow="CAMERA TOOLS" title={heading.Scanner} description="Scan QR codes and common product barcodes using your device camera."/><BarcodeScanner/></section>}
            {section === "Share" && <section><PageTitle eyebrow="DEVICE-TO-DEVICE TRANSFER" title={heading.Share} description="Share files, pictures, videos, links, research results and code with a connected device."/><ShareWorkspace initialText={shareDraft}/></section>}
            {section === "Messages" && <section><PageTitle eyebrow="LUMEN MESSAGES" title={heading.Messages} description="Find answers to questions about Grand Lumen."/><MessagesWorkspace session={session}/></section>}
            {section === "Team" && <section><PageTitle eyebrow="TEAM COLLABORATION" title={heading.Team} description="Connect with members, approve invitations and collaborate through private conversations."/><TeamWorkspace userId={session?.user.id || ""} email={session?.user.email || ""}/><div className="team-sheets-launch"><div><span className="eyebrow">BUSINESS WORKSPACE</span><h3>Lumen Sheets</h3><p>Create spreadsheets for business records, budgets and account registers.</p></div><button className="team-primary" onClick={() => selectSection("Lumen Hub")}>Open Lumen Hub</button></div></section>}
            {section === "Research" && <section><PageTitle eyebrow="RESEARCH STUDIO" title={heading.Research} description="Explore a topic and read clear explanations directly inside Grand-Lumen."/><div className="research-grid"><div className="glass-card"><span className="eyebrow">EXPLORE A TOPIC</span><h3>What do you want to understand?</h3><input value={query} onChange={e => setQuery(e.target.value)} placeholder="For example: renewable energy" onKeyDown={e => e.key === "Enter" && void runResearchTopic()}/><button className="solid-button" onClick={() => void runResearchTopic()} disabled={researchBusy}>{researchBusy ? "Preparing your research…" : "Explain this topic"} <ArrowRight size={15}/></button><div className="research-topics">{["Renewable energy","Artificial intelligence","African history","Human nervous system"].map(topic => <button key={topic} onClick={() => { setQuery(topic); void runResearchTopic(topic); }}>{topic}</button>)}</div></div><div className="glass-card"><span className="eyebrow">RESEARCH NOTEBOOK</span><h3>Your notes</h3><textarea value={researchNotes} onChange={e => setResearchNotes(e.target.value)} placeholder="Write what you have learned, questions and ideas…"/><div className="note-footer"><span>Saved on this device automatically</span><button onClick={() => navigator.clipboard?.writeText(researchNotes)}><Copy size={14}/> Copy notes</button></div></div></div>{researchBusy && <div className="loading-state"><span/><span/><span/></div>}{error && <p className="error-text">{error}</p>}{researchResults.length > 0 && <div className="research-answer-list">{researchResults.map((item,index) => <article className="glass-card research-answer" key={item.title}><span className="eyebrow">EXPLANATION {String(index+1).padStart(2,"0")}</span><h3>{item.title}</h3><p>{item.extract}</p><button className="quiet-button" onClick={() => setResearchNotes(notes => notes + (notes ? "\n\n" : "") + item.title + "\n" + item.extract)}><Plus size={14}/> Add to notes</button><button className="quiet-button" onClick={() => openShare(item.title + "\n\n" + item.extract + "\n\n" + item.url)}><Share2 size={14}/> Share explanation</button></article>)}</div>}<div className="info-banner"><BookOpen size={18}/><span>Research presents readable topic explanations here. Use the original article when you need to verify details or explore further.</span></div></section>}{section === "News" && <section><PageTitle eyebrow="GLOBAL NEWS DESK" title={heading.News} description="Search current headlines and recent reports from publishers around the world."/><NewsWorkspace /></section>}
            {section === "Images" && <section><PageTitle eyebrow="VISUAL DISCOVERY" title={heading.Images} description="Search openly licensed image collections and view discoveries directly in Grand-Lumen." /><div className="search-panel"><Image size={18} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search images, places, science, design..." onKeyDown={e => e.key === "Enter" && runMediaSearch("images")} /><button onClick={() => runMediaSearch("images")} disabled={mediaBusy}>{mediaBusy ? "Searching..." : "Search images"}</button></div><div className="quick-tags">{["Nature","Architecture","Space","Technology","African art"].map(tag => <button key={tag} onClick={() => { setQuery(tag); runMediaSearch("images", tag); }}>{tag}</button>)}</div><MediaResults items={mediaResults} busy={mediaBusy} error={error} kind="images" onSave={toggleSave} onShare={item => openShare(item.title + "\n" + item.description + "\nImage: " + (item.image || "") + "\n" + item.url)} /><div className="info-banner"><ShieldCheck size={18} /><span>Images are retrieved from Wikimedia Commons. Check each file page for its licence and attribution requirements before reuse.</span></div></section>}
            {section === "Videos" && <section><PageTitle eyebrow="VIDEO DISCOVERY" title={heading.Videos} description="Search public video collections and preview available items inside your workspace." /><div className="search-panel"><Video size={18} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search documentaries, tutorials, science..." onKeyDown={e => e.key === "Enter" && runMediaSearch("videos")} /><button onClick={() => runMediaSearch("videos")} disabled={mediaBusy}>{mediaBusy ? "Searching..." : "Search videos"}</button></div><div className="quick-tags">{["Science","Technology","History","Education"].map(tag => <button key={tag} onClick={() => { setQuery(tag); runMediaSearch("videos", tag); }}>{tag}</button>)}</div><MediaResults items={mediaResults} busy={mediaBusy} error={error} kind="videos" onSave={toggleSave} onShare={item => openShare(item.title + "\n" + item.description + "\nVideo: " + item.url)} /></section>}
            {section === "Maps" && <section><PageTitle eyebrow="LOCATION & NAVIGATION" title={heading.Maps} description="Explore places with Google Maps, search destinations and use your device location when you choose to share it." /><MapWorkspace /></section>}
            {section === "Code Lab" && <section className="code-section"><PageTitle eyebrow="PROFESSIONAL DEVELOPMENT ENVIRONMENT" title="Build beyond limits." description="A multi-file coding workspace with project explorer, editor tabs, local terminal, live browser preview and project export."/><CodeStudioWorkspace /></section>}{section === "Learn" && <section><PageTitle eyebrow="GRAND-LUMEN ACADEMY" title="Learn by doing." description="Ten guided courses with lessons, examples and separate practice activities."/><LearnWorkspace/></section>}{section === "API Library" && <section><PageTitle eyebrow="INTEGRATION DIRECTORY" title={heading["API Library"]} description="A curated catalogue of public APIs and developer services for in-app experiences." /><div className="api-search"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find an API or capability..." /></div><div className="api-categories">{["All","Knowledge","Technology","Environment","Finance","Development","Science","Images","Media","AI","Language","Geography","Food","Utilities","Entertainment","Research","News"].map(item => <button className={apiFilter === item ? "selected" : ""} key={item} onClick={() => setApiFilter(item)}>{item}</button>)}</div><div className="api-grid">{filteredApis.map(item => <div className="api-card" key={item[0]}><div className="api-card-top"><span className="api-symbol"><Database size={17} /></span><span className={item[3] === "No key" ? "keyless" : "key-needed"}>{item[3]}</span></div><h3>{item[0]}</h3><p>{item[1]}</p><div className="api-card-bottom"><span>{item[2]}</span><div className="api-card-actions"><a className="api-source-link" href={apiSourceUrls[item[0]]} target="_blank" rel="noopener noreferrer" aria-label={`Open ${item[0]} official source documentation`}>Source link <ExternalLink size={13} /></a><button onClick={() => { setQuery(item[0]); setToolInput(item[0]); selectSection("Tools"); }}>Explore <ArrowRight size={13} /></button></div></div></div>)}</div></section>}
            {section === "Tools" && <section className={toolFocused ? "tools-section tools-section-focused" : "tools-section"}><PageTitle eyebrow="UTILITY DECK" title={heading.Tools} description="A set of connected utilities that return useful information inside Grand-Lumen." /><div className={toolFocused ? "tool-layout tool-layout-focused" : "tool-layout"}><div className="tool-list">{toolCards.map(([name,detail,Icon]) => <button className={tool === name ? "tool-option active" : "tool-option"} key={name} onClick={() => { setTool(name); setToolOutput(null); setError(""); setToolFocused(true); }}><Icon size={17} /><span><b>{name}</b><small>{detail}</small></span><ChevronDown size={14} /></button>)}</div><div className="glass-card tool-workspace">{toolFocused && <button className="tool-focus-back" onClick={() => setToolFocused(false)}><ArrowLeft size={16} /> Back to tools</button>}{tool === "Alerts" ? <ReminderToolsWorkspace /> : tool === "Calculator" ? <CalculatorWorkspace /> : tool === "Graph Studio" ? <GraphWorkspace /> : <><span className="eyebrow">ACTIVE UTILITY</span><h3>{tool}</h3>{tool === "Currency" && <div className="currency-row"><select value={currencyBase} onChange={e => setCurrencyBase(e.target.value)}>{["USD","GHS","EUR","GBP","NGN","CAD","JPY","INR","ZAR"].map(x => <option key={x}>{x}</option>)}</select><ArrowRight size={16} /><select value={currencyTarget} onChange={e => setCurrencyTarget(e.target.value)}>{["GHS","USD","EUR","GBP","NGN","CAD","JPY","INR","ZAR"].map(x => <option key={x}>{x}</option>)}</select></div>}<div className="tool-input-row"><input value={toolInput} onChange={e => setToolInput(e.target.value)} onKeyDown={e => e.key === "Enter" && runTool()} placeholder={tool === "Calculator" ? "Example: (25 * 4) / 2" : tool === "Weather" ? "Enter a city, e.g. Accra" : tool === "Pokédex" ? "Enter a Pokémon name" : tool === "Public Holidays" ? "Country code, e.g. GH" : "Enter a word"} /><button className="solid-button" onClick={runTool} disabled={busy}>{busy ? "Working..." : "Run tool"}</button></div>{error && <p className="error-text">{error}</p>}<ToolOutput output={toolOutput} tool={tool} /></>}</div></div></section>}
            {section === "Saved" && <section><PageTitle eyebrow="PERSONAL KNOWLEDGE VAULT" title={heading.Saved} description="Keep useful discoveries close. Saved items remain in this browser." /><div className="saved-list"><Results items={saved} saved={saved} onSave={toggleSave} onShare={item => openShare(item.title + "\n\n" + item.description + "\n\n" + item.url)} busy={false} error="" /></div>{!saved.length && <EmptyState title="Your vault is ready." detail="Save search results to build your personal knowledge collection." />}</section>}
            {section === "Activity Digest" && <section><PageTitle eyebrow="WORKSPACE ACTIVITY" title={heading["Activity Digest"]} description="Review your recorded Grand Lumen activity and create summaries to copy, share or save."/><ActivityDigest entries={activityEntries} storageKey={activityStorageKey} onEntriesChange={next => { setActivityEntries(next); try { localStorage.setItem(activityStorageKey, JSON.stringify(next)); } catch { setError("Activity records could not be saved on this device."); } }} verifyPassword={verifyActivityPassword}/></section>}
            {section === "Creative Studio" && <section><PageTitle eyebrow="LUMEN CREATIVE" title="Creative Studio" description="Edit photographs and video clips with detailed controls, then export your finished work."/><CreativeStudio/></section>}{section === "Projects" && <section><PageTitle eyebrow="PROJECT MANAGEMENT" title={heading.Projects} description="Keep track of ideas and projects you are developing." /><div className="project-create"><input value={projectName} onChange={e => setProjectName(e.target.value)} onKeyDown={e => e.key === "Enter" && projectName.trim() && (setProjects([projectName.trim(), ...projects]), setProjectName(""))} placeholder="Name a project or idea..." /><button className="solid-button" onClick={() => { if (projectName.trim()) { setProjects([projectName.trim(), ...projects]); setProjectName(""); } }}><Plus size={15} /> Add project</button></div><div className="project-grid">{projects.map((name,index) => <div className="glass-card project-card" key={name + index}><span className="feature-icon"><Layers3 size={19} /></span><h3>{name}</h3><span className="muted">PERSONAL PROJECT</span><button onClick={() => setProjects(projects.filter((_,i) => i !== index))}>Remove <X size={13} /></button></div>)}</div>{!projects.length && <EmptyState title="A space for your next big idea." detail="Create your first project to start organising your work." />}</section>}
            {section === "Settings" && <section><PageTitle eyebrow="PREFERENCES" title={heading.Settings} description="Manage your profile, appearance and local workspace preferences." /><div className="settings-card profile-settings-card"><div className="profile-settings-preview">{(localProfile?.profileImage || profilePicture) ? <img src={localProfile?.profileImage || profilePicture} alt="Your profile"/> : <span>{(localProfile?.fullName || session?.user.email || "GL").slice(0,2).toUpperCase()}</span>}</div><div className="profile-settings-copy"><b>Profile photograph</b><p>Choose a picture to represent your Grand-Lumen account on this device.</p><label className="quiet-button profile-upload-button"><Upload size={14}/> Upload profile picture<input type="file" accept="image/*" onChange={event => { const input = event.currentTarget; const file = input.files?.[0]; if (!file) return; if (file.size > 3 * 1024 * 1024) { alert("Choose an image smaller than 3 MB."); return; } const reader = new FileReader(); reader.onload = () => { const image = String(reader.result || ""); if (localProfile) { const updated = { ...localProfile, profileImage: image }; setLocalProfile(updated); localStorage.setItem("grandLumenLocalSession", JSON.stringify(updated)); saveAccountProfileImage(localProfile.email, image); setProfilePicture(image); } else if (session?.user.email) { saveAccountProfileImage(session.user.email, image); setProfilePicture(image); } }; reader.readAsDataURL(file); input.value = ""; }}/></label>{(localProfile?.profileImage || profilePicture) && <button className="quiet-button" onClick={() => { if (localProfile) { const updated = { ...localProfile, profileImage: undefined }; setLocalProfile(updated); localStorage.setItem("grandLumenLocalSession", JSON.stringify(updated)); saveAccountProfileImage(localProfile.email, ""); } else if (session?.user.email) { saveAccountProfileImage(session.user.email, ""); } setProfilePicture(""); }}>Remove picture</button>}</div></div>{session && supabase && <div className="settings-card email-verification-card"><div><b>Email verification</b><p>{session.user.email_confirmed_at ? "Your account email is verified." : "Your account is active. You can verify your email whenever you need to."}</p><span className={session.user.email_confirmed_at ? "email-verification-status verified" : "email-verification-status pending"}>{session.user.email_confirmed_at ? "Verified" : "Not verified"}</span>{verificationMessage && <small className="email-verification-message">{verificationMessage}</small>}</div><div className="email-verification-actions">{!session.user.email_confirmed_at && <button className="quiet-button" onClick={() => void requestEmailVerification()} disabled={verificationBusy}><Mail size={14}/>{verificationBusy ? "Please wait…" : "Send verification email"}</button>}<button className="quiet-button" onClick={() => void refreshEmailVerification()} disabled={verificationBusy}>Refresh status</button></div></div>}<div className="settings-card install-settings-card"><div className="install-settings-icon"><Smartphone size={22}/></div><div className="install-settings-copy"><b>Install Grand-Lumen</b><p>Install the workspace directly on this device. Installation is optional and never forced.</p>{installHelp && <small>{installHelp}</small>}</div><button className="solid-button" onClick={() => void installGrandLumen()} disabled={isInstalled}><Download size={15}/>{isInstalled ? "Installed" : "Install app"}</button></div><div className="settings-preferences"><div className="settings-preferences-heading"><div><b>Display & typography</b><p>Control the size and style of text and the app interface on this device.</p></div><button className="quiet-button" onClick={() => { setFontScale(1); setInterfaceScale(1); setFontFamily("Manrope, sans-serif"); setFontWeight("normal"); }}>Reset</button></div><div className="preference-control"><div className="preference-label"><label htmlFor="gl-font-scale">Text size</label><strong>{Math.round(fontScale * 100)}%</strong></div><input id="gl-font-scale" type="range" min="0.85" max="1.3" step="0.05" value={fontScale} onChange={event => setFontScale(Number(event.target.value))}/><div className="preference-range-labels"><span>Smaller</span><span>Default</span><span>Larger</span></div></div><div className="preference-control"><div className="preference-label"><label htmlFor="gl-interface-scale">App screen scale</label><strong>{Math.round(interfaceScale * 100)}%</strong></div><input id="gl-interface-scale" type="range" min="0.85" max="1.15" step="0.05" value={interfaceScale} onChange={event => setInterfaceScale(Number(event.target.value))}/><div className="preference-range-labels"><span>Compact</span><span>Default</span><span>Spacious</span></div></div><div className="preference-control"><label htmlFor="gl-font-family">Font style</label><select id="gl-font-family" value={fontFamily} onChange={event => { const value = event.target.value; setFontFamily(value); document.documentElement.style.setProperty("--gl-font-family", value); document.querySelector<HTMLElement>(".app-shell")?.style.setProperty("--gl-font-family", value); }}><option value="Manrope, sans-serif">Manrope · Modern</option><option value="Arial, sans-serif">Arial · Classic</option><option value="Georgia, serif">Georgia · Serif</option><option value="'DM Mono', monospace">DM Mono · Monospace</option><option value="system-ui, sans-serif">System default</option></select></div><div className="preference-control"><label htmlFor="gl-font-weight">Text weight</label><select id="gl-font-weight" value={fontWeight} onChange={event => { const value = event.target.value; setFontWeight(value); document.documentElement.style.setProperty("--gl-font-weight", value); document.querySelector<HTMLElement>(".app-shell")?.style.setProperty("--gl-font-weight", value); }}><option value="normal">Regular</option><option value="500">Medium</option><option value="600">Semi-bold</option><option value="700">Bold</option></select></div><div className="preference-preview"><span>PREVIEW</span><strong>Explore beyond. Build what comes next.</strong><p>Your display preferences are saved automatically on this device.</p></div></div><div className="settings-card language-settings-card"><div><b>App language</b><p>Choose from more than 100 languages. Grand-Lumen uses English by default and remembers your selection on this device.</p></div><div className="language-setting-control"><input list="gl-app-language-options" value={languageSearch} onChange={event => { setLanguageSearch(event.target.value); const selected = appLanguages.find(language => language.name.toLowerCase() === event.target.value.trim().toLowerCase()); if (selected) { localStorage.setItem("grandLumenLanguageChosen", "true"); setAppLanguage(selected.code); } }} placeholder="Search languages..." aria-label="Search app languages"/><datalist id="gl-app-language-options">{appLanguages.map(language => <option key={language.code} value={language.name}/>)}</datalist><span>{appLanguages.find(language => language.code === appLanguage)?.name || "English"} selected · Translation by Google</span><button className="quiet-button" onClick={resetToEnglish}>Use English</button></div></div><div className="settings-card"><div><b>Appearance</b><p>Choose the interface theme.</p></div><div className="theme-switch"><button className={theme === "dark" ? "selected" : ""} onClick={() => setTheme("dark")}><Moon size={15} /> Dark</button><button className={theme === "light" ? "selected" : ""} onClick={() => setTheme("light")}><Sun size={15} /> Light</button></div></div><div className="settings-card"><div><b>Clear workspace data</b><p>Remove saved items, projects, research notes, Code Lab files and activity records from this browser. Your account, password and sign-in session will remain intact.</p></div><button className="quiet-button" onClick={() => { setClearDataPassword(""); setClearDataError(""); setClearDataOpen(true); }}><LockKeyhole size={14}/> Clear workspace data</button></div><div className="settings-card"><div><b>Export workspace</b><p>Download your saved items, projects and available Grand-Lumen workspace data as a JSON backup. Account passwords are never included.</p></div><button className="quiet-button" onClick={exportWorkspace}><Download size={15}/> Export workspace</button></div><div className="settings-card settings-danger-card"><div><b>Sign out</b><p>End your current Grand-Lumen session on this device.</p></div><button className="quiet-button" onClick={() => void handleLogout()}><LogOut size={15}/> Log out</button></div><div className="settings-card about-grand-lumen"><div><b>About Grand-Lumen</b><p>Grand-Lumen is a connected digital space for discovery, learning, research and creation.</p><strong>Built by Emmanuel Pobee Okpoti - Inventor and student Leader.</strong><a href="https://wa.me/233203446793" target="_blank" rel="noreferrer" className="about-whatsapp-link">Connect via 0203446793 <ExternalLink size={14}/></a></div><span className="version">v1.0.0</span></div>{clearDataOpen && <div className="clear-data-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !clearDataBusy) setClearDataOpen(false); }}><section className="clear-data-dialog" role="dialog" aria-modal="true" aria-labelledby="clear-data-title"><div className="clear-data-icon"><LockKeyhole size={21}/></div><button className="clear-data-close" type="button" onClick={() => { if (!clearDataBusy) setClearDataOpen(false); }} aria-label="Close"><X size={18}/></button><span className="eyebrow">OWNER VERIFICATION</span><h2 id="clear-data-title">Clear workspace data?</h2><p>This permanently removes saved items, projects, research notes, Code Lab files and activity records from this browser. Your Grand-Lumen account and current sign-in will not be deleted.</p><label htmlFor="clear-data-password">Confirm your account password</label><input id="clear-data-password" type="password" autoComplete="current-password" value={clearDataPassword} onChange={event => { setClearDataPassword(event.target.value); setClearDataError(""); }} onKeyDown={event => { if (event.key === "Enter" && clearDataPassword && !clearDataBusy) void clearWorkspaceData(); }} placeholder="Enter your password" disabled={clearDataBusy}/>{clearDataError && <div className="clear-data-error" role="alert">{clearDataError}</div>}<div className="clear-data-actions"><button className="quiet-button" type="button" onClick={() => { setClearDataOpen(false); setClearDataPassword(""); setClearDataError(""); }} disabled={clearDataBusy}>Cancel</button><button className="clear-data-confirm" type="button" onClick={() => void clearWorkspaceData()} disabled={!clearDataPassword || clearDataBusy}>{clearDataBusy ? "Verifying…" : "Verify & clear data"}</button></div><small>Password is checked against the account currently signed in. No password is stored by this confirmation form.</small></section></div>}</section>}
          </div>
          <footer className="app-footer"><span>GRAND-LUMEN</span><span>EXPLORE BEYOND · BUILD WHAT COMES NEXT</span><span>FOUNDATION 1.0</span></footer>
        </main>
      </div>
      {!loading && welcomeTourOpen && <WelcomeTour name={session?.user.user_metadata?.full_name || localProfile?.fullName || session?.user.email || "explorer"} onComplete={completeWelcomeTour} />}
    </>
  );
}


function evaluateExpression(source: string): number {
  const tokens = source.match(/(?:\d+(?:\.\d*)?|\.\d+)|(?:[a-zA-Z]+)|[()+\-*/%^!]/g) || [];
  let position = 0;
  const peek = () => tokens[position];
  const take = () => tokens[position++];
  const factorial = (value: number) => {
    if (!Number.isInteger(value) || value < 0 || value > 170) throw new Error("Factorial requires a whole number from 0 to 170.");
    let result = 1;
    for (let index = 2; index <= value; index += 1) result *= index;
    return result;
  };
  const primary = (): number => {
    const token = take();
    if (!token) throw new Error("Complete the expression.");
    if (token === "+") return primary();
    if (token === "-") return -primary();
    if (token === "(") {
      const value = addition();
      if (take() !== ")") throw new Error("Missing closing bracket.");
      return value;
    }
    if (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) return Number(token);
    if (token === "pi") return Math.PI;
    if (token === "e") return Math.E;
    if (["sin","cos","tan","sqrt","ln","log","abs"].includes(token)) {
      if (take() !== "(") throw new Error("Use brackets after " + token + ".");
      const value = addition();
      if (take() !== ")") throw new Error("Missing closing bracket.");
      if (token === "sin") return Math.sin(value * Math.PI / 180);
      if (token === "cos") return Math.cos(value * Math.PI / 180);
      if (token === "tan") return Math.tan(value * Math.PI / 180);
      if (token === "sqrt") return Math.sqrt(value);
      if (token === "ln") return Math.log(value);
      if (token === "log") return Math.log10(value);
      return Math.abs(value);
    }
    throw new Error("Unrecognised value: " + token);
  };
  const power = (): number => {
    let value = primary();
    if (peek() === "!") {
      take();
      value = factorial(value);
    }
    if (peek() === "^") {
      take();
      value = Math.pow(value, power());
    }
    return value;
  };
  const multiplication = (): number => {
    let value = power();
    while (["*","/","%"].includes(peek() || "")) {
      const operator = take();
      const next = power();
      if (operator === "*") value *= next;
      if (operator === "/") value /= next;
      if (operator === "%") value %= next;
    }
    return value;
  };
  const addition = (): number => {
    let value = multiplication();
    while (peek() === "+" || peek() === "-") {
      const operator = take();
      const next = multiplication();
      value = operator === "+" ? value + next : value - next;
    }
    return value;
  };
  const result = addition();
  if (position !== tokens.length) throw new Error("Check the expression near " + tokens[position] + ".");
  if (!Number.isFinite(result)) throw new Error("This expression has no finite real result.");
  return Number(result.toPrecision(12));
}

function CalculatorWorkspace() {
  const [expression, setExpression] = useState("");
  const [display, setDisplay] = useState("0");
  const [history, setHistory] = useState<{ expression: string; result: string }[]>([]);
  const [justSolved, setJustSolved] = useState(false);
  const [error, setError] = useState("");
  const keys = [
    ["AC","clear"],["DEL","delete"],["(","function"],[")","function"],["÷","operator"],
    ["sin","function"],["cos","function"],["tan","function"],["√","function"],["×","operator"],
    ["7","number"],["8","number"],["9","number"],["%","operator"],["−","operator"],
    ["4","number"],["5","number"],["6","number"],["x²","function"],["+","operator"],
    ["1","number"],["2","number"],["3","number"],["π","constant"],["=","equals"],
    ["0","number"],[".","number"],["±","function"],["log","function"],["ln","function"]
  ];
  const insert = (key: string) => {
    setError("");
    if (key === "AC") {
      setExpression("");
      setDisplay("0");
      setJustSolved(false);
      return;
    }
    if (key === "DEL") {
      const next = expression.slice(0, -1);
      setExpression(next);
      setDisplay(next || "0");
      setJustSolved(false);
      return;
    }
    if (key === "=") {
      if (!expression.trim()) return;
      try {
        const result = evaluateExpression(expression);
        const formatted = String(result);
        setDisplay(formatted);
        setHistory(items => [{ expression, result: formatted }, ...items].slice(0, 5));
        setExpression(formatted);
        setJustSolved(true);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Unable to calculate this expression.");
      }
      return;
    }
    if (key === "±") {
      const next = expression.startsWith("-") ? expression.slice(1) : "-" + expression;
      setExpression(next);
      setDisplay(next || "0");
      setJustSolved(false);
      return;
    }
    let value = key;
    if (key === "÷") value = "/";
    if (key === "×") value = "*";
    if (key === "−") value = "-";
    if (key === "π") value = "pi";
    if (key === "√") value = "sqrt(";
    if (key === "x²") value = "^2";
    if (["sin","cos","tan","log","ln"].includes(key)) value = key + "(";
    const next = justSolved && /^[0-9.]$/.test(key) ? key : expression + value;
    setExpression(next);
    setDisplay(next || "0");
    setJustSolved(false);
  };
  return <div className="calculator-shell">
    <div className="calculator-top"><div><span className="eyebrow">GRAND-LUMEN · PRECISION TOOLS</span><h3>Scientific calculator</h3></div><span className="calculator-live"><i /> READY</span></div>
    <div className="calculator-display"><span> {expression || "READY"} </span><strong>{display}</strong>{error && <small>{error}</small>}</div>
    <div className="calculator-keypad">{keys.map(([label,type],index) => <button key={label + index} className={"calc-key calc-" + type + (label === "=" ? " calc-equals" : "") + (label === "0" ? " calc-zero" : "")} onClick={() => insert(label)}>{label}</button>)}</div>
    <div className="calculator-foot"><span>DEG · REAL-TIME EVALUATION</span><button onClick={() => { setExpression(""); setDisplay("0"); setHistory([]); setError(""); }}>Clear history</button></div>
    {history.length > 0 && <div className="calculator-history"><span className="eyebrow">RECENT CALCULATIONS</span>{history.map((item,index) => <button key={item.expression + index} onClick={() => { setExpression(item.expression); setDisplay(item.result); setJustSolved(true); }}><span>{item.expression}</span><b>{item.result}</b></button>)}</div>}
  </div>;
}

function MapWorkspace() {
  const [place, setPlace] = useState("");
  const [mapQuery, setMapQuery] = useState("Ghana");
  const [coordinates, setCoordinates] = useState("");
  const [locationStatus, setLocationStatus] = useState("Location access is off until you choose to use GPS.");
  const [locating, setLocating] = useState(false);
  const encoded = encodeURIComponent(mapQuery);
  const mapUrl = "https://www.google.com/maps?q=" + encoded + "&output=embed";
  const directionsUrl = "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(mapQuery);
  const searchPlace = () => {
    if (!place.trim()) return;
    setMapQuery(place.trim());
    setCoordinates("");
    setLocationStatus("Showing map results for " + place.trim() + ".");
  };
  const useGps = () => {
    if (!navigator.geolocation) {
      setLocationStatus("GPS location is not supported by this browser.");
      return;
    }
    setLocating(true);
    setLocationStatus("Requesting your location permission…");
    navigator.geolocation.getCurrentPosition(
      position => {
        const coords = position.coords.latitude.toFixed(6) + ", " + position.coords.longitude.toFixed(6);
        setCoordinates(coords);
        setMapQuery(coords);
        setLocationStatus("Your device location is now displayed on the map.");
        setLocating(false);
      },
      reason => {
        setLocationStatus(reason.code === 1 ? "Location permission was denied. You can still search for places manually." : "Your location could not be detected. Try again or search for a place.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  };
  return <div className="map-workspace">
    <div className="map-controls"><div className="map-search"><MapPin size={18} /><input value={place} onChange={event => setPlace(event.target.value)} onKeyDown={event => event.key === "Enter" && searchPlace()} placeholder="Search a city, landmark or address" /><button onClick={searchPlace}>Find place</button></div><button className="gps-button" onClick={useGps} disabled={locating}><LocateFixed size={16} />{locating ? "Locating…" : "Use my GPS"}</button></div>
    <div className="map-status"><span><i /> {locationStatus}</span>{coordinates && <b>{coordinates}</b>}</div>
    <div className="map-frame"><iframe title="Google Maps location explorer" src={mapUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen /></div>
    <div className="map-bottom"><div><b>Google Maps</b><span>Search places, explore the map and plan directions.</span></div><a href={directionsUrl} target="_blank" rel="noreferrer"><Navigation size={15} /> Directions <ExternalLink size={13} /></a></div>
  </div>;
}

function PageTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="page-title"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>;
}
function Results({ items, saved, onSave, onShare, busy, error }: { items: SearchItem[]; saved: SearchItem[]; onSave: (item: SearchItem) => void; onShare: (item: SearchItem) => void; busy: boolean; error: string }) {
  if (busy) return <div className="loading-state"><span /><span /><span /></div>;
  if (error) return <div className="error-text">{error}</div>;
  return <div className="results-list">{items.map((item,index) => <article className="result-item" key={item.url + index}><div className="result-source">{item.source}</div><a href={item.url} target="_blank" rel="noreferrer">{item.title} <ExternalLink size={13} /></a><p>{item.description}</p><button onClick={() => onSave(item)}>{saved.some(savedItem => savedItem.url === item.url) ? <Check size={14} /> : <Bookmark size={14} />}{saved.some(savedItem => savedItem.url === item.url) ? "Saved" : "Save"}</button><button onClick={() => onShare(item)}><Share2 size={14}/> Share</button></article>)}</div>;
}
function ToolOutput({ output, tool }: { output: any; tool: string }) {
  if (!output) return <div className="tool-empty"><Zap size={20} /><span>Results will appear here.</span></div>;
  if (tool === "Calculator") return <div className="tool-result"><span>RESULT</span><strong>{output.result}</strong></div>;
  if (tool === "Dictionary") return <div className="tool-result dictionary-result"><strong>{output[0]?.word}</strong>{output[0]?.phonetic && <p className="dictionary-phonetic">{output[0].phonetic}</p>}{output[0]?.origin && <section><b>Origin / etymology</b><p>{output[0].origin}</p></section>}{output[0]?.meanings?.map((meaning: any,index: number) => <section key={index} className="dictionary-meaning"><h4>{meaning.partOfSpeech}</h4>{meaning.definitions?.map((definition: any,definitionIndex: number) => <article key={definitionIndex}><p><b>Meaning {definitionIndex + 1}:</b> {definition.definition}</p>{definition.example && <p><b>Example sentence:</b> “{definition.example}”</p>}{definition.synonyms?.length > 0 && <p><b>Synonyms:</b> {definition.synonyms.join(", ")}</p>}{definition.antonyms?.length > 0 && <p><b>Antonyms:</b> {definition.antonyms.join(", ")}</p>}</article>)}{meaning.synonyms?.length > 0 && <p><b>More synonyms:</b> {meaning.synonyms.join(", ")}</p>}{meaning.antonyms?.length > 0 && <p><b>More antonyms:</b> {meaning.antonyms.join(", ")}</p>}</section>)}{output[0]?.sourceUrls?.length > 0 && <p><b>Sources:</b> {output[0].sourceUrls.map((url: string,index: number) => <a key={url} href={url} target="_blank" rel="noreferrer">Source {index + 1} </a>)}</p>}</div>;
  if (tool === "Weather") return <div className="tool-result"><strong>{output.location.name}, {output.location.country}</strong><div className="weather-number">{Math.round(output.data.current.temperature_2m)}°C</div><p>Feels like {Math.round(output.data.current.apparent_temperature)}°C · Humidity {output.data.current.relative_humidity_2m}% · Wind {output.data.current.wind_speed_10m} km/h</p></div>;
  if (tool === "Currency") return <div className="tool-result"><span>REFERENCE RATE</span><strong>{Object.values(output.rates || {})[0] as number} {Object.keys(output.rates || {})[0]}</strong><p>1 {output.base} · Date {output.date}</p></div>;
  if (tool === "Pokédex") return <div className="tool-result pokemon-result">{output.image && <img src={output.image} alt={output.name} />}<strong>{output.name} · #{output.id}</strong><p>Types: {output.types?.join(", ")} · Height: {output.height} · Weight: {output.weight}</p></div>;
  return <div className="holiday-results">{output.slice(0,12).map((holiday: any) => <div key={holiday.date}><b>{holiday.date}</b><span>{holiday.localName}</span></div>)}</div>;
}
function MediaResults({ items, busy, error, kind, onSave, onShare }: { items: SearchItem[]; busy: boolean; error: string; kind: "images" | "videos"; onSave: (item: SearchItem) => void; onShare: (item: SearchItem) => void }) {
  if (busy) return <div className="loading-state media-loading"><span /><span /><span /></div>;
  if (error) return <div className="error-text">{error}</div>;
  if (!items.length) return <EmptyState title={kind === "images" ? "Your visual search starts here." : "Find your next video."} detail="Search a topic to bring public media results into this workspace." />;
  return <div className="media-grid">{items.map((item, index) => <article className="media-card" key={item.url + index}>{kind === "images" && item.image ? <a href={item.url} target="_blank" rel="noreferrer"><img src={item.image} alt={item.title} loading="lazy" /></a> : <iframe title={item.title} src={item.url.replace("https://archive.org/details/", "https://archive.org/embed/")} loading="lazy" allow="fullscreen" /> }<div className="media-card-copy"><span className="result-source">{item.source}</span><b>{item.title}</b><p>{item.description}</p><button onClick={() => onSave(item)}><Bookmark size={13} /> Save</button><button onClick={() => onShare(item)}><Share2 size={13}/> Share</button><a href={item.url} target="_blank" rel="noreferrer">Source details <ExternalLink size={12} /></a></div></article>)}</div>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state"><Sparkles size={23} /><b>{title}</b><p>{detail}</p></div>;
}
function ArrowUpRightIcon() {
  return <ArrowRight className="tile-arrow" size={17} />;
}

export default App;