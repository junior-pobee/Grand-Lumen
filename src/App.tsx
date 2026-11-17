import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Activity, ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, Atom, BookOpen, Bookmark, Boxes, Calculator, Check, CheckCircle2, ChevronDown, CircleHelp, Code2, Compass, Copy, Database, ExternalLink, Eye, EyeOff, FileText, FlaskConical, Globe2, GraduationCap, Image, Languages, Layers3, Library, LocateFixed, LockKeyhole, LogIn, LogOut, Mail, MapPin, Menu, Moon, MonitorSmartphone, Navigation, Play, Plus, Search, Settings, ShieldCheck, Sparkles, Sun, Terminal, UserRound, Video, Wallet, X, Zap, QrCode, ScanLine, Share2, Upload, Download, Smartphone } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import Peer from "peerjs";
import { supabase, supabaseConfigured } from "./auth";
import { getCurrency, getDictionary, getHoliday, getPokemon, getWeather, searchArchiveVideos, searchCommonsImages, searchHackerNews, searchWikipedia, type SearchItem } from "./api";

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

type Section = "Home" | "Search" | "Research" | "Images" | "Videos" | "Maps" | "Code Lab" | "Learn" | "API Library" | "Tools" | "Scanner" | "Share" | "Saved" | "Projects" | "Creative Studio" | "Settings";
const sections: { name: Section; icon: any; group: string }[] = [
  { name: "Home", icon: Compass, group: "Workspace" },
  { name: "Search", icon: Search, group: "Workspace" },
  { name: "Research", icon: FlaskConical, group: "Workspace" },
  { name: "Images", icon: Image, group: "Explore" },
  { name: "Videos", icon: Video, group: "Explore" },
  { name: "Maps", icon: MapPin, group: "Explore" },
  { name: "Code Lab", icon: Code2, group: "Create" },
  { name: "Learn", icon: GraduationCap, group: "Create" },
  { name: "API Library", icon: Database, group: "Discover" },
  { name: "Tools", icon: Calculator, group: "Discover" },
  { name: "Scanner", icon: ScanLine, group: "Discover" },
  { name: "Share", icon: Share2, group: "Discover" },
  { name: "Saved", icon: Bookmark, group: "Personal" },
  { name: "Projects", icon: Boxes, group: "Personal" },
  { name: "Creative Studio", icon: Image, group: "Create" },
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


type PortalMode = "about" | "signin" | "signup";

function PublicPortal({ onGuest }: { onGuest: (profile?: { fullName: string; email: string }) => void }) {
  const [mode, setMode] = useState<PortalMode>("about");
  return <div className="public-portal">
    <div className="portal-ambient portal-ambient-one" />
    <div className="portal-ambient portal-ambient-two" />
    <header className="portal-nav">
      <button className="portal-brand" onClick={() => setMode("about")}><span className="portal-brand-mark">L</span><span><b>GRAND-LUMEN</b><small>EXPLORE BEYOND</small></span></button>
      <nav><button className={mode === "about" ? "portal-nav-active" : ""} onClick={() => setMode("about")}>Overview</button><button onClick={() => setMode("signin")}>Sign in</button><button className="portal-nav-cta" onClick={() => setMode("signup")}>Create account <ArrowUpRight size={15} /></button></nav>
    </header>
    {mode === "about" ? <main className="portal-about">
      <section className="portal-hero">
        <div className="portal-copy"><span className="portal-kicker"><span /> A UNIVERSE FOR THE CURIOUS</span><h1>Think wider.<br /><span>Build beyond.</span></h1><p>Grand-Lumen is a connected digital environment for discovering knowledge, researching ideas, learning skills and creating things that matter.</p><div className="portal-actions"><button className="portal-primary" onClick={() => setMode("signup")}>Create your account <ArrowUpRight size={17} /></button><button className="portal-secondary" onClick={() => setMode("signin")}>Sign in <ArrowRight size={16} /></button></div><div className="portal-trust"><ShieldCheck size={16} /><span>A simple account to unlock your workspace on this device.</span></div></div>
        <div className="portal-visual"><div className="portal-orbit orbit-one" /><div className="portal-orbit orbit-two" /><div className="portal-orbit orbit-three" /><div className="portal-core"><span>L</span><small>GRAND<br />LUMEN</small></div><div className="portal-float portal-float-search"><Search size={16} /><span>Discovery</span></div><div className="portal-float portal-float-code"><Code2 size={16} /><span>Creation</span></div><div className="portal-float portal-float-learn"><BookOpen size={16} /><span>Learning</span></div></div>
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

function AuthPanel({ mode, onModeChange, onGuest }: { mode: "signin" | "signup"; onModeChange: (mode: PortalMode) => void; onGuest: (profile?: { fullName: string; email: string }) => void }) {
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
              data: { full_name: fullName.trim() },
              emailRedirectTo: window.location.origin + window.location.pathname
            }
          });
          if (error) throw error;
          if (data.session) setNotice("Your account is ready. Opening your workspace…", "success");
          else setNotice("Account created. Check your email for the confirmation link, then sign in.", "success");
        } else {
          const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
          if (error) throw error;
        }
      } else {
        const accounts = JSON.parse(localStorage.getItem("grandLumenLocalAccounts") || "[]") as { fullName: string; email: string; salt: string; passwordHash: string }[];
        const normalizedEmail = email.trim().toLowerCase();
        if (isSignup) {
          if (accounts.some(account => account.email === normalizedEmail)) throw new Error("An account with this email already exists. Sign in instead.");
          const salt = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(value => value.toString(16).padStart(2, "0")).join("");
          const passwordHash = await hashLocalPassword(password, salt);
          accounts.push({ fullName: fullName.trim(), email: normalizedEmail, salt, passwordHash });
          localStorage.setItem("grandLumenLocalAccounts", JSON.stringify(accounts));
          localStorage.setItem("grandLumenLocalSession", JSON.stringify({ fullName: fullName.trim(), email: normalizedEmail }));
          setNotice("Your local account is ready. Opening Grand-Lumen…", "success");
          window.setTimeout(() => onGuest({ fullName: fullName.trim(), email: normalizedEmail }), 250);
        } else {
          const account = accounts.find(item => item.email === normalizedEmail);
          if (!account || await hashLocalPassword(password, account.salt) !== account.passwordHash) throw new Error("Email or password is incorrect.");
          localStorage.setItem("grandLumenLocalSession", JSON.stringify({ fullName: account.fullName, email: account.email }));
          setNotice("Signed in. Opening Grand-Lumen…", "success");
          window.setTimeout(() => onGuest({ fullName: account.fullName, email: account.email }), 250);
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
    <section className="portal-auth-story"><button className="portal-brand" onClick={() => onModeChange("about")}><span className="portal-brand-mark">L</span><span><b>GRAND-LUMEN</b><small>EXPLORE BEYOND</small></span></button><div className="portal-story-copy"><span className="portal-kicker">YOUR NEXT CHAPTER STARTS HERE</span><h1>{isSignup ? "Create space for your next idea." : "Your world of discovery awaits."}</h1><p>Research, learn, explore and build from one connected digital workspace.</p><div className="portal-story-points"><span><CheckCircle2 size={17}/> One account across your devices</span><span><CheckCircle2 size={17}/> A workspace built for curiosity</span><span><CheckCircle2 size={17}/> Secure email and password access</span></div></div><div className="portal-story-footer">GRAND-LUMEN · EXPLORE BEYOND</div></section>
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

function BarcodeScanner({ onDetected }: { onDetected?: (value: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanning, setScanning] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [supported, setSupported] = useState(true);

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
    <div className="scanner-controls"><button className="solid-button" onClick={() => { setError(""); setScanning(value => !value); }}>{scanning ? "Stop camera" : "Start camera scanner"}</button><button className="quiet-button" onClick={() => { setValue(""); setError(""); }}>Clear result</button></div>
    {!supported && <p className="error-text">{error}</p>}
    {error && supported && <p className="error-text">{error}</p>}
    {value && <div className="scanner-result">{/^https?:\/\//i.test(value) ? <><span className="eyebrow">LINK QR CODE DETECTED</span><strong>This code contains a web link, not the picture files themselves.</strong><p>To receive pictures, connect both devices through Lumen Share and send the image files from the other device.</p><div><button className="quiet-button" onClick={() => navigator.clipboard?.writeText(value)}><Copy size={14}/> Copy link</button><button className="quiet-button" onClick={() => window.open(value, "_blank", "noopener,noreferrer")}>Open link</button></div></> : <><span className="eyebrow">SCANNED DEVICE CODE</span><strong>{value}</strong><div><button className="quiet-button" onClick={() => navigator.clipboard?.writeText(value)}><Copy size={14}/> Copy result</button><button className="quiet-button" onClick={() => onDetected?.(value)}>Use result</button></div></>}</div>}
    <p className="scanner-note">Camera access requires HTTPS and your permission. Scanning happens in this browser; camera frames are not uploaded by Grand-Lumen.</p>
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
  return <div className="creative-studio"><div className="studio-upload"><label className="solid-button"><Upload size={16}/> Import photo or video<input type="file" accept="image/*,video/*" onChange={event => { chooseFile(event.target.files?.[0]); event.currentTarget.value = ""; }}/></label><span>{file ? file.name : "Choose an image or video from your device"}</span></div>{!file ? <EmptyState title="Your creative workspace is ready." detail="Import a photo or video to access the editing tools."/> : <><div className="studio-preview">{kind === "image" ? <img src={source} alt="Editing preview" style={{filter:imageFilter,transform:`rotate(${rotation}deg) scaleX(${flip ? -1 : 1}) scale(${cropZoom / 100})`}}/> : <video ref={videoRef} src={source} controls playsInline onLoadedMetadata={event => { setVideoEnd(event.currentTarget.duration); }} style={{filter:imageFilter}}/>}</div><div className="studio-tools"><div className="studio-tool-head"><b>{kind === "image" ? "PHOTO LAB" : "VIDEO LAB"}</b><button className="quiet-button" onClick={() => { setBrightness(100); setContrast(100); setSaturation(100); setBlur(0); setCropZoom(100); setRotation(0); setFlip(false); setEffect("none"); setOverlayText(""); setSpeed(1); setMuted(false); }}>Reset edits</button></div><div className="studio-controls"><label>Brightness <output>{brightness}%</output><input type="range" min="0" max="200" value={brightness} onChange={event => setBrightness(Number(event.target.value))}/></label><label>Contrast <output>{contrast}%</output><input type="range" min="0" max="200" value={contrast} onChange={event => setContrast(Number(event.target.value))}/></label><label>Saturation <output>{saturation}%</output><input type="range" min="0" max="200" value={saturation} onChange={event => setSaturation(Number(event.target.value))}/></label><label>Soft focus <output>{blur}px</output><input type="range" min="0" max="12" value={blur} onChange={event => setBlur(Number(event.target.value))}/></label><label>Crop zoom <output>{cropZoom}%</output><input type="range" min="100" max="200" value={cropZoom} onChange={event => setCropZoom(Number(event.target.value))}/></label></div><div className="studio-actions"><label>Creative filter<select value={effect} onChange={event => setEffect(event.target.value)}><option value="none">Original</option><option value="mono">Monochrome</option><option value="warm">Warm film</option><option value="cool">Cool tone</option><option value="vintage">Vintage</option></select></label>{kind === "image" ? <><label>Add text overlay<input value={overlayText} onChange={event => setOverlayText(event.target.value)} placeholder="Type a caption"/></label><button className="quiet-button" onClick={() => setRotation(value => (value + 90) % 360)}>Rotate 90°</button><button className="quiet-button" onClick={() => setFlip(value => !value)}>Flip horizontal</button><button className="solid-button" onClick={() => void exportImage()}>Export edited image</button></> : <><label>Trim start <output>{videoStart.toFixed(1)}s</output><input type="range" min="0" max={Math.max(0,videoEnd)} step=".1" value={videoStart} onChange={event => setVideoStart(Math.min(Number(event.target.value),Math.max(0,videoEnd-.1)))}/></label><label>Trim end <output>{videoEnd.toFixed(1)}s</output><input type="range" min="0" max={videoRef.current?.duration || videoEnd || 1} step=".1" value={videoEnd} onChange={event => setVideoEnd(Math.max(Number(event.target.value),videoStart+.1))}/></label><label>Playback speed<select value={speed} onChange={event => { setSpeed(Number(event.target.value)); if(videoRef.current) videoRef.current.playbackRate=Number(event.target.value); }}><option value="0.5">0.5× slow</option><option value="0.75">0.75×</option><option value="1">1× normal</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2× fast</option></select></label><button className="quiet-button" onClick={() => {setMuted(value => !value); if(videoRef.current) videoRef.current.muted=!muted;}}>{muted ? "Unmute audio" : "Mute audio"}</button><button className="solid-button" disabled={exporting} onClick={() => void exportVideo()}>{exporting ? "Rendering clip…" : "Export trimmed video"}</button></>}</div></div></>}</div>;
}

function ShareWorkspace() {
  const peerRef = useRef<Peer | null>(null);
  const connectionRef = useRef<any>(null);
  const chunksRef = useRef<ArrayBuffer[]>([]);
  const incomingRef = useRef<{ name: string; type: string; size: number } | null>(null);
  const [peerId, setPeerId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("Starting secure connection service…");
  const [received, setReceived] = useState<{ name: string; url: string; size: number; type: string }[]>([]);
  const [sending, setSending] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [scanOpen, setScanOpen] = useState(false);

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
          if (message.kind === "file-start") {
            incomingRef.current = { name: message.name, type: message.type || "application/octet-stream", size: message.size };
            chunksRef.current = [];
            setStatus("Receiving " + message.name + "…");
          }
          if (message.kind === "file-end" && incomingRef.current) {
            const info = incomingRef.current;
            const blob = new Blob(chunksRef.current, { type: info.type });
            const url = URL.createObjectURL(blob);
            setReceived(items => [{ name: info.name, url, size: blob.size, type: info.type }, ...items]);
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
      <article className="glass-card share-card"><span className="eyebrow">STEP 2 · SCAN THEIR CODE</span><h3>Connect to the other phone</h3><p>Tap the button and point your camera at the other phone's square code.</p><div className="share-actions"><button className="solid-button" onClick={() => setScanOpen(value => !value)}><ScanLine size={15}/> {scanOpen ? "Close camera" : "Scan their QR code"}</button></div>{scanOpen && <BarcodeScanner onDetected={value => { setTargetId(value); setScanOpen(false); connectToDevice(value); }}/>}<details className="share-manual-connect"><summary>Can't scan? Enter the code instead</summary><input value={targetId} onChange={event => setTargetId(event.target.value)} placeholder="Paste the other phone's code"/><button className="quiet-button" onClick={connectToDevice} disabled={!targetId.trim() || connected}>Connect using code</button></details><div className={connected ? "share-status connected" : "share-status"}><i/>{connected ? "You are connected! Now choose something to send." : status}</div><div className="share-send-area"><span className="eyebrow">STEP 3 · PICK WHAT TO SEND</span><label className="share-file-button"><Upload size={16}/> {sending ? "Sending your files…" : "Choose photos, videos or files"}<input type="file" multiple disabled={sending} onChange={event => { setSelectedFiles(Array.from(event.target.files || [])); if (event.target.files?.length) setStatus(connected ? event.target.files.length + " file(s) selected. Ready to send." : event.target.files.length + " file(s) selected. Connect to the other device to send."); event.currentTarget.value = ""; }}/></label>{selectedFiles.length > 0 && <div className="share-selected-files"><div className="share-selected-heading"><b>{selectedFiles.length} file(s) selected</b><button className="quiet-button" type="button" onClick={() => setSelectedFiles([])}>Clear</button></div>{selectedFiles.map((file,index) => <div className="share-selected-file" key={file.name + file.lastModified + index}><span>{file.name}</span><small>{(file.size / 1024 / 1024).toFixed(2)} MB</small></div>)}<button className="solid-button share-send-button" type="button" disabled={!connected || sending} onClick={() => void sendFiles()}><Upload size={15}/>{sending ? "Sending…" : connected ? "Send now" : "Connect first to send"}</button></div>}</div></article>
    </div>
    <div className="glass-card share-received"><span className="eyebrow">YOUR RECEIVED FILES</span><h3>Things people sent you</h3>{received.length ? <div className="received-gallery">{received.map(file => <article className="received-item" key={file.url}>{file.type.startsWith("image/") ? <a className="received-preview" href={file.url} target="_blank" rel="noreferrer"><img src={file.url} alt={file.name}/></a> : file.type.startsWith("video/") ? <video className="received-preview" src={file.url} controls/> : <div className="received-file-icon"><FileText size={30}/></div>}<div className="received-item-info"><b>{file.name}</b><small>{(file.size / 1024 / 1024).toFixed(2)} MB</small><a href={file.url} download={file.name}><Download size={15}/> Save file</a></div></article>)}</div> : <p>Nothing has arrived yet. When someone sends you a picture, video or file, it will show up here.</p>}</div>
    <div className="share-disclaimer"><ShieldCheck size={16}/> Both phones must have Grand-Lumen open and be connected to the internet. Only scan a code from someone you want to connect with. Files travel directly between the connected devices.</div>
  </div>;
}

function App() {
  const [section, setSection] = useState<Section>("Home");
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [guestMode, setGuestMode] = useState(false);
  const [localProfile, setLocalProfile] = useState<{ fullName: string; email: string; profileImage?: string } | null>(null);
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
  const [projects, setProjects] = useState<string[]>(() => readWorkspaceData("grandLumenProjects", []));

  useEffect(() => {
    if (!supabase) {
      try {
        const localSession = localStorage.getItem("grandLumenLocalSession");
        if (localSession) {
          const profile = JSON.parse(localSession) as { fullName: string; email: string; profileImage?: string };
          setLocalProfile(profile);
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
        setSession(data.session);
        setAuthReady(true);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
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
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const handleLogout = async () => {
    if (session && supabase) {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) { alert(signOutError.message); return; }
    } else {
      localStorage.removeItem("grandLumenLocalSession");
      setLocalProfile(null);
      setGuestMode(false);
    }
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
    Maps: "Explore the world.",
    "Code Lab": "Build anything.",
    Learn: "Knowledge, expanded.",
    "API Library": "Connect the world.",
    Tools: "Tools for curious minds.",
    Scanner: "Scan the physical world.",
    Share: "Send it across.",
    Saved: "Your knowledge vault.",
    Projects: "Your creation space.",
    "Creative Studio": "Create beyond limits.",
    Settings: "Shape your workspace."
  };

  if (!authReady) return <div className="auth-boot"><div className="portal-brand-mark">L</div><span>SECURING YOUR WORKSPACE</span></div>;
  if (!session && !guestMode) return <PublicPortal onGuest={(profile) => { if (profile) setLocalProfile(profile); setGuestMode(true); }} />;

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
          <div className="sidebar-bottom"><div className="creator-chip">{(session?.user.user_metadata?.avatar_url || localProfile?.profileImage || profilePicture) ? <img className="creator-avatar" src={session?.user.user_metadata?.avatar_url || localProfile?.profileImage || profilePicture} alt="Profile"/> : <span>{(session?.user.email || localProfile?.email || "GL").slice(0,2).toUpperCase()}</span>}<div><b>{session?.user.user_metadata?.full_name || localProfile?.fullName || "Grand-Lumen member"}</b><small>{session?.user.email || localProfile?.email || "Local browser session"}</small></div></div><span className="version">FOUNDATION 1.0</span></div>
        </aside>
        <main className="main-area">
          <header className="topbar">
            <button className="icon-button mobile-only" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Toggle navigation"><Menu size={19} /></button>
            <div className="breadcrumb"><span>GRAND-LUMEN</span><ArrowRight size={13} /><b>{section.toUpperCase()}</b></div>
            <div className="top-actions"><span className="system-status"><i /> SYSTEM READY</span><span className="signed-in-email">{session?.user.email || localProfile?.email || "LOCAL WORKSPACE"}</span><button className="icon-button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">{theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}</button><button className="icon-button" onClick={() => void handleLogout()} aria-label="Sign out"><LogOut size={16} /></button></div>
          </header>
          <div className="content-wrap">
            {section === "Home" && <section>
              <div className="hero-block"><div className="eyebrow"><Sparkles size={13} /> YOUR EXPANDED DIGITAL UNIVERSE</div><h1>Explore beyond<br /><span>what you know.</span></h1><p>One workspace for discovery, research, learning, development and creation. Your next idea starts here.</p><div className="hero-search"><Search size={19} /><input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && runSearch()} placeholder="Search knowledge, ideas, technology..." /><button onClick={() => { selectSection("Search"); runSearch(); }}>Explore <ArrowRight size={15} /></button></div><div className="quick-tags"><button onClick={() => { setQuery("artificial intelligence"); selectSection("Search"); }}>Artificial intelligence</button><button onClick={() => { setQuery("space exploration"); selectSection("Search"); }}>Space exploration</button><button onClick={() => { setQuery("web development"); selectSection("Search"); }}>Web development</button></div></div>
              <div className="section-heading"><div><span className="eyebrow">THE WORKSPACE</span><h2>Everything in one orbit.</h2></div><span className="muted">12 connected spaces</span></div>
              <div className="feature-grid">{[{n:"Research Studio",d:"Explore subjects, collect sources and build understanding.",i:FlaskConical,s:"Research"},{n:"Code Lab",d:"Experiment with 15 programming and markup languages.",i:Code2,s:"Code Lab"},{n:"API Library",d:"Discover open data and connect useful services.",i:Database,s:"API Library"},{n:"Learning Hub",d:"Build skills through guided, practical lessons.",i:GraduationCap,s:"Learn"},{n:"Visual Discovery",d:"Explore visual ideas and media collections.",i:Image,s:"Images"},{n:"Smart Tools",d:"Use calculators, dictionaries and live data utilities.",i:Zap,s:"Tools"}].map(card => { const Icon = card.i; return <button className="feature-card" key={card.n} onClick={() => selectSection(card.s as Section)}><span className="feature-icon"><Icon size={20} /></span><span className="feature-title">{card.n}</span><span className="feature-description">{card.d}</span><ArrowRight className="feature-arrow" size={16} /></button>; })}</div>
              <div className="stats-strip"><div><b>15</b><span>LANGUAGE TRACKS</span></div><div><b>20+</b><span>API CATALOGUE</span></div><div><b>06</b><span>LIVE DATA TOOLS</span></div><div><b>{saved.length.toString().padStart(2,"0")}</b><span>SAVED ITEMS</span></div></div>
            </section>}
            {section === "Search" && <section><PageTitle eyebrow="DISCOVERY ENGINE" title={heading.Search} description="Search across knowledge sources and developer communities without leaving your workspace." /><div className="search-panel"><Search size={18} /><input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && runSearch()} placeholder="What would you like to discover?" /><button onClick={() => runSearch()} disabled={busy}>Search</button></div><div className="filter-row"><button onClick={() => runSearch("all")}>All sources</button><button onClick={() => runSearch("wiki")}>Wikipedia</button><button onClick={() => runSearch("hn")}>Hacker News</button></div><Results items={results} saved={saved} onSave={toggleSave} busy={busy} error={error} /></section>}
            {section === "Scanner" && <section><PageTitle eyebrow="CAMERA TOOLS" title={heading.Scanner} description="Scan QR codes and common product barcodes using your device camera."/><BarcodeScanner/></section>}
            {section === "Share" && <section><PageTitle eyebrow="DEVICE-TO-DEVICE TRANSFER" title={heading.Share} description="Pair devices with a QR scan and exchange files without uploading them to Grand-Lumen storage."/><ShareWorkspace/></section>}
            {section === "Research" && <section><PageTitle eyebrow="RESEARCH STUDIO" title={heading.Research} description="Create a research workspace, collect questions and develop structured notes." /><div className="research-grid"><div className="glass-card"><span className="eyebrow">START AN INQUIRY</span><h3>What are you investigating?</h3><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Enter a research topic..." /><button className="solid-button" onClick={() => { selectSection("Search"); runSearch("all"); }}>Find source material <ArrowRight size={15} /></button><div className="research-topics"><button onClick={() => setQuery("renewable energy")}>Renewable energy</button><button onClick={() => setQuery("neural networks")}>Neural networks</button><button onClick={() => setQuery("African history")}>African history</button></div></div><div className="glass-card"><span className="eyebrow">RESEARCH NOTEBOOK</span><h3>Working notes</h3><textarea value={researchNotes} onChange={e => setResearchNotes(e.target.value)} placeholder="Capture your questions, findings, hypotheses and references..." /><div className="note-footer"><span>Saved automatically in this session</span><button onClick={() => navigator.clipboard?.writeText(researchNotes)}><Copy size={14} /> Copy notes</button></div></div></div><div className="info-banner"><ShieldCheck size={18} /><span>Research results should be checked against original sources. Grand-Lumen keeps discovery and note-taking together; it does not replace source verification.</span></div></section>}
            {section === "Images" && <section><PageTitle eyebrow="VISUAL DISCOVERY" title={heading.Images} description="Search openly licensed image collections and view discoveries directly in Grand-Lumen." /><div className="search-panel"><Image size={18} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search images, places, science, design..." onKeyDown={e => e.key === "Enter" && runMediaSearch("images")} /><button onClick={() => runMediaSearch("images")} disabled={mediaBusy}>{mediaBusy ? "Searching..." : "Search images"}</button></div><div className="quick-tags">{["Nature","Architecture","Space","Technology","African art"].map(tag => <button key={tag} onClick={() => { setQuery(tag); runMediaSearch("images", tag); }}>{tag}</button>)}</div><MediaResults items={mediaResults} busy={mediaBusy} error={error} kind="images" onSave={toggleSave} /><div className="info-banner"><ShieldCheck size={18} /><span>Images are retrieved from Wikimedia Commons. Check each file page for its licence and attribution requirements before reuse.</span></div></section>}
            {section === "Videos" && <section><PageTitle eyebrow="VIDEO DISCOVERY" title={heading.Videos} description="Search public video collections and preview available items inside your workspace." /><div className="search-panel"><Video size={18} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search documentaries, tutorials, science..." onKeyDown={e => e.key === "Enter" && runMediaSearch("videos")} /><button onClick={() => runMediaSearch("videos")} disabled={mediaBusy}>{mediaBusy ? "Searching..." : "Search videos"}</button></div><div className="quick-tags">{["Science","Technology","History","Education"].map(tag => <button key={tag} onClick={() => { setQuery(tag); runMediaSearch("videos", tag); }}>{tag}</button>)}</div><MediaResults items={mediaResults} busy={mediaBusy} error={error} kind="videos" onSave={toggleSave} /></section>}
            {section === "Maps" && <section><PageTitle eyebrow="LOCATION & NAVIGATION" title={heading.Maps} description="Explore places with Google Maps, search destinations and use your device location when you choose to share it." /><MapWorkspace /></section>}
            {section === "Code Lab" && <section className="code-section"><PageTitle eyebrow="MULTI-LANGUAGE DEVELOPMENT" title={heading["Code Lab"]} description="A growing coding space with language starters and a live browser preview for HTML." /><div className="code-toolbar"><div><Terminal size={16} /><select value={codeLanguage} onChange={e => changeLanguage(e.target.value)}>{languages.map(language => <option key={language}>{language}</option>)}</select></div><button className="solid-button" onClick={() => setPreview(!preview)}><Play size={14} /> {preview ? "Hide preview" : "Run preview"}</button><button className="quiet-button" onClick={() => navigator.clipboard?.writeText(code)}><Copy size={14} /> Copy</button></div><div className="editor-layout"><div className="editor-panel"><div className="editor-header"><span><span className="live-dot" /> {codeLanguage.toLowerCase()} / main</span><span>{code.split("\n").length} lines</span></div><div className="code-editor-surface"><pre aria-hidden="true" dangerouslySetInnerHTML={{ __html: highlightCode(code) + "\n" }} /><textarea spellCheck={false} value={code} onChange={e => setCode(e.target.value)} onScroll={e => { const layer = e.currentTarget.previousElementSibling; if (layer) { layer.scrollTop = e.currentTarget.scrollTop; layer.scrollLeft = e.currentTarget.scrollLeft; } }} aria-label={codeLanguage + " editor"} /></div></div>{preview && <div className="preview-panel"><div className="editor-header"><span>LIVE PREVIEW</span><button onClick={() => setPreview(false)}><X size={14} /></button></div>{codeLanguage === "HTML" || codeLanguage === "JavaScript" ? <iframe title="Code preview" sandbox="allow-scripts" srcDoc={codeLanguage === "HTML" ? code : "<script>" + code.replace(/<\/script/gi, "<\\/script") + "<\/script>"} /> : <div className="preview-placeholder"><Code2 size={25} /><b>{codeLanguage} workspace</b><p>Editing and language starter are available. Native execution for this language will be connected through a secure runtime service.</p></div>}</div>}</div><div className="language-rail">{languages.map(language => <button className={codeLanguage === language ? "selected" : ""} key={language} onClick={() => changeLanguage(language)}>{language}</button>)}</div></section>}
            {section === "Learn" && <section><PageTitle eyebrow="LEARNING HUB" title={heading.Learn} description="Explore guided learning paths across web development, programming and digital knowledge." /><div className="learning-grid">{[{name:"Web foundations",detail:"HTML, CSS, JavaScript and responsive interfaces",level:"BEGINNER",language:"HTML · CSS · JS"},{name:"Programming concepts",detail:"Variables, logic, functions and data structures",level:"FOUNDATION",language:"Python · C · Java"},{name:"Modern development",detail:"Types, components, APIs and application architecture",level:"INTERMEDIATE",language:"TypeScript · React · Node"},{name:"Data and databases",detail:"Queries, records, relationships and analysis",level:"PRACTICAL",language:"SQL · Python"}].map((item,index) => <div className="glass-card learning-card" key={item.name}><span className="learning-number">0{index+1}</span><span className="eyebrow">{item.level}</span><h3>{item.name}</h3><p>{item.detail}</p><span className="language-tags">{item.language}</span><button onClick={() => { setCodeLanguage(item.name === "Web foundations" ? "HTML" : item.name === "Data and databases" ? "SQL" : item.name === "Programming concepts" ? "Python" : "TypeScript"); setCode(starterCode[item.name === "Web foundations" ? "HTML" : item.name === "Data and databases" ? "SQL" : item.name === "Programming concepts" ? "Python" : "TypeScript"]); selectSection("Code Lab"); }}>Open learning workspace <ArrowRight size={14} /></button></div>)}</div></section>}
            {section === "API Library" && <section><PageTitle eyebrow="INTEGRATION DIRECTORY" title={heading["API Library"]} description="A curated catalogue of public APIs and developer services for in-app experiences." /><div className="api-search"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find an API or capability..." /></div><div className="api-categories">{["All","Knowledge","Technology","Environment","Finance","Development","Science","Images","Media","AI","Language","Geography","Food","Utilities","Entertainment","Research","News"].map(item => <button className={apiFilter === item ? "selected" : ""} key={item} onClick={() => setApiFilter(item)}>{item}</button>)}</div><div className="api-grid">{filteredApis.map(item => <div className="api-card" key={item[0]}><div className="api-card-top"><span className="api-symbol"><Database size={17} /></span><span className={item[3] === "No key" ? "keyless" : "key-needed"}>{item[3]}</span></div><h3>{item[0]}</h3><p>{item[1]}</p><div className="api-card-bottom"><span>{item[2]}</span><button onClick={() => { setQuery(item[0]); setToolInput(item[0]); selectSection("Tools"); }}>Explore <ArrowRight size={13} /></button></div></div>)}</div></section>}
            {section === "Tools" && <section><PageTitle eyebrow="UTILITY DECK" title={heading.Tools} description="A set of connected utilities that return useful information inside Grand-Lumen." /><div className="tool-layout"><div className="tool-list">{toolCards.map(([name,detail,Icon]) => <button className={tool === name ? "tool-option active" : "tool-option"} key={name} onClick={() => { setTool(name); setToolOutput(null); setError(""); }}><Icon size={17} /><span><b>{name}</b><small>{detail}</small></span><ChevronDown size={14} /></button>)}</div><div className="glass-card tool-workspace">{tool === "Calculator" ? <CalculatorWorkspace /> : <><span className="eyebrow">ACTIVE UTILITY</span><h3>{tool}</h3>{tool === "Currency" && <div className="currency-row"><select value={currencyBase} onChange={e => setCurrencyBase(e.target.value)}>{["USD","GHS","EUR","GBP","NGN","CAD","JPY","INR","ZAR"].map(x => <option key={x}>{x}</option>)}</select><ArrowRight size={16} /><select value={currencyTarget} onChange={e => setCurrencyTarget(e.target.value)}>{["GHS","USD","EUR","GBP","NGN","CAD","JPY","INR","ZAR"].map(x => <option key={x}>{x}</option>)}</select></div>}<div className="tool-input-row"><input value={toolInput} onChange={e => setToolInput(e.target.value)} onKeyDown={e => e.key === "Enter" && runTool()} placeholder={tool === "Calculator" ? "Example: (25 * 4) / 2" : tool === "Weather" ? "Enter a city, e.g. Accra" : tool === "Pokédex" ? "Enter a Pokémon name" : tool === "Public Holidays" ? "Country code, e.g. GH" : "Enter a word"} /><button className="solid-button" onClick={runTool} disabled={busy}>{busy ? "Working..." : "Run tool"}</button></div>{error && <p className="error-text">{error}</p>}<ToolOutput output={toolOutput} tool={tool} /></>}</div></div></section>}
            {section === "Saved" && <section><PageTitle eyebrow="PERSONAL KNOWLEDGE VAULT" title={heading.Saved} description="Keep useful discoveries close. Saved items remain in this browser." /><div className="saved-list"><Results items={saved} saved={saved} onSave={toggleSave} busy={false} error="" /></div>{!saved.length && <EmptyState title="Your vault is ready." detail="Save search results to build your personal knowledge collection." />}</section>}
            {section === "Creative Studio" && <section><PageTitle eyebrow="LUMEN CREATIVE" title="Creative Studio" description="Edit photographs and video clips with detailed controls, then export your finished work."/><CreativeStudio/></section>}{section === "Projects" && <section><PageTitle eyebrow="PROJECT MANAGEMENT" title={heading.Projects} description="Keep track of ideas and projects you are developing." /><div className="project-create"><input value={projectName} onChange={e => setProjectName(e.target.value)} onKeyDown={e => e.key === "Enter" && projectName.trim() && (setProjects([projectName.trim(), ...projects]), setProjectName(""))} placeholder="Name a project or idea..." /><button className="solid-button" onClick={() => { if (projectName.trim()) { setProjects([projectName.trim(), ...projects]); setProjectName(""); } }}><Plus size={15} /> Add project</button></div><div className="project-grid">{projects.map((name,index) => <div className="glass-card project-card" key={name + index}><span className="feature-icon"><Layers3 size={19} /></span><h3>{name}</h3><span className="muted">PERSONAL PROJECT</span><button onClick={() => setProjects(projects.filter((_,i) => i !== index))}>Remove <X size={13} /></button></div>)}</div>{!projects.length && <EmptyState title="A space for your next big idea." detail="Create your first project to start organising your work." />}</section>}
            {section === "Settings" && <section><PageTitle eyebrow="PREFERENCES" title={heading.Settings} description="Manage your profile, appearance and local workspace preferences." /><div className="settings-card profile-settings-card"><div className="profile-settings-preview">{(localProfile?.profileImage || profilePicture) ? <img src={localProfile?.profileImage || profilePicture} alt="Your profile"/> : <span>{(localProfile?.fullName || session?.user.email || "GL").slice(0,2).toUpperCase()}</span>}</div><div className="profile-settings-copy"><b>Profile photograph</b><p>Choose a picture to represent your Grand-Lumen account on this device.</p><label className="quiet-button profile-upload-button"><Upload size={14}/> Upload profile picture<input type="file" accept="image/*" onChange={event => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 3 * 1024 * 1024) { alert("Choose an image smaller than 3 MB."); return; } const reader = new FileReader(); reader.onload = () => { const image = String(reader.result || ""); if (localProfile) { const updated = { ...localProfile, profileImage: image }; setLocalProfile(updated); localStorage.setItem("grandLumenLocalSession", JSON.stringify(updated)); } else if (session) { localStorage.setItem("grandLumenProfileImage", image); setProfilePicture(image); } }; reader.readAsDataURL(file); event.currentTarget.value = ""; }}/></label>{(localProfile?.profileImage || profilePicture) && <button className="quiet-button" onClick={() => { if (localProfile) { const updated = { ...localProfile, profileImage: undefined }; setLocalProfile(updated); localStorage.setItem("grandLumenLocalSession", JSON.stringify(updated)); } setProfilePicture(""); localStorage.removeItem("grandLumenProfileImage"); }}>Remove picture</button>}</div></div><div className="settings-card"><div><b>Appearance</b><p>Choose the interface theme.</p></div><div className="theme-switch"><button className={theme === "dark" ? "selected" : ""} onClick={() => setTheme("dark")}><Moon size={15} /> Dark</button><button className={theme === "light" ? "selected" : ""} onClick={() => setTheme("light")}><Sun size={15} /> Light</button></div></div><div className="settings-card"><div><b>Local workspace data</b><p>Saved items and projects are stored in this browser.</p></div><button className="quiet-button" onClick={() => { if (confirm("Clear saved items and projects from this browser?")) { setSaved([]); setProjects([]); } }}>Clear local data</button></div><div className="settings-card"><div><b>Export workspace</b><p>Download your saved items, projects and available Grand-Lumen workspace data as a JSON backup. Account passwords are never included.</p></div><button className="quiet-button" onClick={exportWorkspace}><Download size={15}/> Export workspace</button></div><div className="settings-card settings-danger-card"><div><b>Sign out</b><p>End your current Grand-Lumen session on this device.</p></div><button className="quiet-button" onClick={() => void handleLogout()}><LogOut size={15}/> Log out</button></div><div className="settings-card"><div><b>About Grand-Lumen</b><p>Foundation build · Modular React and TypeScript architecture.</p></div><span className="version">v1.0.0</span></div></section>}
          </div>
          <footer className="app-footer"><span>GRAND-LUMEN</span><span>EXPLORE BEYOND · BUILD WHAT COMES NEXT</span><span>FOUNDATION 1.0</span></footer>
        </main>
      </div>
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