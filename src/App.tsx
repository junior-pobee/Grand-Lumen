import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Activity, Newspaper, ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, Atom, BookOpen, Bookmark, Boxes, Calculator, Check, CheckCircle2, ChevronDown, CircleHelp, Code2, Compass, Copy, Database, ExternalLink, Eye, EyeOff, FileText, FlaskConical, Globe2, GraduationCap, Image, Languages, Layers3, Library, LocateFixed, LockKeyhole, LogIn, LogOut, Mail, MapPin, Maximize2, Menu, Moon, MonitorSmartphone, Navigation, Play, Plus, Search, Send, Settings, ShieldCheck, Sparkles, Sun, Terminal, UserRound, Video, Wallet, X, Zap, QrCode, ScanLine, Share2, Upload, Download, Smartphone } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import Peer from "peerjs";
import { supabase, supabaseConfigured } from "./auth";
import { getCurrency, getDictionary, getHoliday, getPokemon, getWeather, researchTopic, searchArchiveVideos, searchCommonsImages, searchHackerNews, searchWikipedia, searchGlobalNews, type SearchItem, type NewsItem } from "./api";

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

type Section = "Home" | "Search" | "Research" | "News" | "Images" | "Videos" | "Maps" | "Code Lab" | "Learn" | "API Library" | "Tools" | "Scanner" | "Share" | "Saved" | "Projects" | "Creative Studio" | "Messages" | "Settings";
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
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: true });
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


function MessagesWorkspace({ session }: { session: Session | null }) {
  const email = session?.user.email || "";
  const identities = session?.user.identities || [];
  const linkedIdentity = identities.find(identity => identity.provider === "google" || identity.provider === "azure");
  const provider = linkedIdentity?.provider as "google" | "azure" | undefined;
  const connectedEmail = String(linkedIdentity?.identity_data?.email || linkedIdentity?.identity_data?.preferred_username || email);
  const [recipient, setRecipient] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [draft, setDraft] = useState("");
  const [showCopies, setShowCopies] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState<"success" | "error" | "info">("info");
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const isOwner = email.toLowerCase() === "emmanuelpobee112@gmail.com";
  const providerName = provider === "google" ? "Gmail" : provider === "azure" ? "Outlook" : "";

  const setFeedback = (message: string, type: "success" | "error" | "info" = "info") => {
    setNotice(message);
    setNoticeType(type);
  };

  const connectProvider = async (target: "google" | "azure") => {
    if (!supabase || !session) {
      setFeedback("Sign in to your Grand-Lumen account before connecting an email account.", "info");
      return;
    }
    setBusy(true);
    setFeedback("");
    try {
      const scopes = target === "google"
        ? "https://www.googleapis.com/auth/gmail.send"
        : "email profile openid offline_access https://graph.microsoft.com/Mail.Send";
      const options: any = { scopes, redirectTo: window.location.origin + window.location.pathname };
      if (target === "google") options.queryParams = { access_type: "offline", prompt: "consent" };
      else options.queryParams = { prompt: "consent" };
      const { error } = await supabase.auth.linkIdentity({ provider: target, options } as any);
      if (error) throw error;
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : "The email account could not be connected.", "error");
      setBusy(false);
    }
  };

  const parseAddresses = (value: string) => value.split(/[;,]/).map(item => item.trim()).filter(Boolean);

  const encodeMail = (value: string) => {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  };

  const reconnectProvider = async () => {
    if (!supabase || !linkedIdentity || !provider) return;
    setBusy(true);
    try {
      const { error: unlinkError } = await supabase.auth.unlinkIdentity(linkedIdentity);
      if (unlinkError) throw unlinkError;
      sessionStorage.removeItem("grandLumenMailProviderToken");
      const scopes = provider === "google"
        ? "https://www.googleapis.com/auth/gmail.send"
        : "email profile openid offline_access https://graph.microsoft.com/Mail.Send";
      const options: any = { scopes, redirectTo: window.location.origin + window.location.pathname };
      options.queryParams = provider === "google" ? { access_type: "offline", prompt: "consent" } : { prompt: "consent" };
      const { error } = await supabase.auth.linkIdentity({ provider, options } as any);
      if (error) throw error;
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : "The email permission could not be refreshed.", "error");
      setBusy(false);
    }
  };

  const disconnectProvider = async () => {
    if (!supabase || !linkedIdentity) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.unlinkIdentity(linkedIdentity);
      if (error) throw error;
      sessionStorage.removeItem("grandLumenMailProviderToken");
      setFeedback("Email account disconnected from Grand-Lumen.", "success");
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : "The email account could not be disconnected.", "error");
    } finally {
      setBusy(false);
    }
  };

  const sendEmail = async () => {
    if (!session || !supabase || !provider) {
      setFeedback("Connect Gmail or Outlook before sending an email.", "info");
      return;
    }
    const toList = parseAddresses(recipient);
    const ccList = parseAddresses(cc);
    const bccList = parseAddresses(bcc);
    const allAddresses = [...toList, ...ccList, ...bccList];
    const validAddress = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
    if (!toList.length || allAddresses.some(address => !validAddress.test(address))) {
      setFeedback("Enter at least one valid recipient email address. Separate multiple addresses with commas.", "error");
      return;
    }
    if (!subject.trim() || !draft.trim()) {
      setFeedback("Add a subject and write your email before sending.", "error");
      return;
    }
    let savedToken: any = null;
    try { savedToken = JSON.parse(sessionStorage.getItem("grandLumenMailProviderToken") || "null"); } catch { savedToken = null; }
    const accessToken = savedToken
      ? (savedToken.provider === provider && savedToken.expiresAt > Date.now() ? savedToken.token : null)
      : session.provider_token;
    if (!accessToken) {
      setFeedback("Your email permission has expired. Disconnect and reconnect the account to authorize a fresh sending session.", "error");
      return;
    }
    setBusy(true);
    setFeedback("Sending your email…");
    try {
      let response: Response;
      if (provider === "google") {
        const headers = ["To: " + toList.join(", ")];
        if (ccList.length) headers.push("Cc: " + ccList.join(", "));
        if (bccList.length) headers.push("Bcc: " + bccList.join(", "));
        headers.push("Subject: " + subject.trim(), "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 8bit");
        const raw = headers.join("\\r\\n") + "\\r\\n\\r\\n" + draft.trim();
        response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
          method: "POST",
          headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
          body: JSON.stringify({ raw: encodeMail(raw) })
        });
      } else {
        const message: any = {
          subject: subject.trim(),
          body: { contentType: "Text", content: draft.trim() },
          toRecipients: toList.map(address => ({ emailAddress: { address } }))
        };
        if (ccList.length) message.ccRecipients = ccList.map(address => ({ emailAddress: { address } }));
        if (bccList.length) message.bccRecipients = bccList.map(address => ({ emailAddress: { address } }));
        response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
          method: "POST",
          headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
          body: JSON.stringify({ message, saveToSentItems: true })
        });
      }
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        const providerMessage = detail?.error?.message || detail?.error_description || "The email provider rejected the request.";
        throw new Error(providerMessage + " Reconnect your account if its permission has expired.");
      }
      setRecipient("");
      setCc("");
      setBcc("");
      setSubject("");
      setDraft("");
      setShowCopies(false);
      setFeedback("Email accepted by " + providerName + " for delivery.", "success");
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : "The email could not be sent. Please try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  const loadAnnouncements = async () => {
    if (!supabase || !email) return;
    const { data, error } = await supabase.from("grand_lumen_announcements").select("*").order("created_at", { ascending: false }).limit(30);
    if (!error) setAnnouncements(data || []);
  };

  useEffect(() => {
    void loadAnnouncements();
    if (!supabase || !email) return;
    const channel = supabase.channel("grand-lumen-mail-updates-" + session?.user.id).on("postgres_changes", { event: "*", schema: "public", table: "grand_lumen_announcements" }, () => void loadAnnouncements()).subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [email]);

  const publishAnnouncement = async () => {
    if (!supabase || !isOwner || !announcementTitle.trim() || !announcementBody.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("grand_lumen_announcements").insert({ title: announcementTitle.trim(), body: announcementBody.trim(), author_email: email });
    setFeedback(error ? error.message : "Your update has been published to Grand-Lumen.", error ? "error" : "success");
    if (!error) {
      setAnnouncementTitle("");
      setAnnouncementBody("");
      await loadAnnouncements();
    }
    setBusy(false);
  };

  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementBody, setAnnouncementBody] = useState("");

  if (!supabaseConfigured || !supabase || !email) return <div className="glass-card messaging-setup"><Mail size={24}/><h3>Sign in to use Grand-Lumen Mails</h3><p>Email connections are attached to a secure Grand-Lumen cloud account. Sign in first, then connect Gmail or Outlook.</p></div>;

  return <div className="mail-workspace">
    <section className="glass-card mail-compose-panel">
      <div className="mail-heading"><div><span className="eyebrow">GRAND-LUMEN MAILS</span><h3>Compose email</h3><p>Send directly through your own email account.</p></div><Mail size={24}/></div>
      <div className="mail-account-row">
        <div className="mail-account-mark">{provider === "google" ? "G" : provider === "azure" ? "O" : <Mail size={19}/>}</div>
        <div className="mail-account-info"><strong>{providerName || "No email account connected"}</strong><span>{provider ? connectedEmail : "Connect an account to start sending"}</span></div>
        {provider && <><span className="mail-connected-status"><CheckCircle2 size={14}/> Connected</span><button className="mail-disconnect-button" onClick={() => void reconnectProvider()} disabled={busy}>Refresh access</button><button className="mail-disconnect-button" onClick={() => void disconnectProvider()} disabled={busy}>Disconnect</button></>}
      </div>
      {!provider && <div className="mail-connect-options"><button className="mail-provider-button" onClick={() => void connectProvider("google")} disabled={busy}><span className="mail-google-mark">G</span><span><strong>Connect Gmail</strong><small>Authorize Grand-Lumen to send using Gmail</small></span><ArrowUpRight size={16}/></button><button className="mail-provider-button" onClick={() => void connectProvider("azure")} disabled={busy}><span className="mail-outlook-mark"><Mail size={18}/></span><span><strong>Connect Outlook</strong><small>Authorize Grand-Lumen to send using Outlook</small></span><ArrowUpRight size={16}/></button></div>}
      {provider && <div className="mail-connected-note"><ShieldCheck size={15}/> Your email password is never requested by Grand-Lumen. Sending uses the permission granted by {providerName}.</div>}
      <div className="mail-fields">
        <label>To<input type="text" value={recipient} onChange={event => setRecipient(event.target.value)} placeholder="recipient@example.com, another@example.com" disabled={!provider}/></label>
        <div className="mail-copy-toggle"><button type="button" onClick={() => setShowCopies(value => !value)} disabled={!provider}>{showCopies ? "Hide Cc and Bcc" : "Add Cc / Bcc"}</button></div>
        {showCopies && <><label>Cc<input type="text" value={cc} onChange={event => setCc(event.target.value)} placeholder="Copy recipients" disabled={!provider}/></label><label>Bcc<input type="text" value={bcc} onChange={event => setBcc(event.target.value)} placeholder="Blind copy recipients" disabled={!provider}/></label></>}
        <label>Subject<input type="text" value={subject} onChange={event => setSubject(event.target.value)} placeholder="Email subject" disabled={!provider}/></label>
        <label>Message<textarea value={draft} onChange={event => setDraft(event.target.value)} placeholder="Write your email here…" disabled={!provider}/></label>
        <div className="mail-compose-footer"><span>Sending from {provider ? connectedEmail : "no connected account"}</span><button className="solid-button" onClick={() => void sendEmail()} disabled={busy || !provider || !recipient.trim() || !subject.trim() || !draft.trim()}><Send size={15}/> {busy ? "Please wait…" : "Send email"}</button></div>
      </div>
      {notice && <div className={"mail-feedback " + noticeType}>{notice}</div>}
    </section>
    <aside className="glass-card mail-side-panel"><span className="eyebrow">EMAIL CONNECTIONS</span><h3>Your accounts</h3><p className="mail-side-copy">Connect one provider at a time. You can switch providers by disconnecting the current identity in your Grand-Lumen account settings.</p><div className="mail-provider-summary"><span className="mail-google-mark">G</span><div><strong>Google Gmail</strong><small>Gmail send permission</small></div><span>{provider === "google" ? "Active" : "Available"}</span></div><div className="mail-provider-summary"><span className="mail-outlook-mark"><Mail size={17}/></span><div><strong>Microsoft Outlook</strong><small>Microsoft Graph Mail.Send</small></div><span>{provider === "azure" ? "Active" : "Available"}</span></div><div className="mail-privacy-card"><LockKeyhole size={17}/><div><strong>Private by design</strong><p>Grand-Lumen requests sending permission only. It does not ask for your email password or read your inbox.</p></div></div><div className="mail-delivery-note">A successful response means Gmail or Outlook accepted the message for delivery. Final delivery depends on the recipient's mail service.</div>
      <div className="mail-updates"><span className="eyebrow">GRAND-LUMEN UPDATES</span><h3>What's new</h3>{announcements.length ? announcements.map(item => <article className="announcement-card" key={item.id}><small>{new Date(item.created_at).toLocaleString()} · {item.author_email}</small><h4>{item.title}</h4><p>{item.body}</p></article>) : <p>No updates have been published yet.</p>}{isOwner && <div className="announcement-composer"><span className="eyebrow">OWNER BROADCAST</span><h4>Publish an app update</h4><input value={announcementTitle} onChange={event => setAnnouncementTitle(event.target.value)} placeholder="Update title"/><textarea value={announcementBody} onChange={event => setAnnouncementBody(event.target.value)} placeholder="Write an announcement for Grand-Lumen users…"/><button className="solid-button" onClick={() => void publishAnnouncement()} disabled={busy || !announcementTitle.trim() || !announcementBody.trim()}>Publish update to all users</button></div>}</div>
    </aside>
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
  const course = academyCourses[courseIndex];
  const questions = course.practice;
  const score = questions.reduce((total, question, index) => total + (answers[index] === Number(question[4]) ? 1 : 0), 0);
  return <div className="academy-layout"><aside className="academy-course-list"><span className="eyebrow">10 LEARNING PATHS</span>{academyCourses.map((item,index) => <button className={courseIndex === index ? "active" : ""} key={item.title} onClick={() => { setCourseIndex(index); setLessonIndex(0); setMode("course"); setAnswers({}); setChecked(false); }}><span>{String(index+1).padStart(2,"0")}</span><div><b>{item.title}</b><small>{item.level}</small></div></button>)}</aside><div className="academy-content"><div className="academy-course-heading"><span className="eyebrow">COURSE {String(courseIndex+1).padStart(2,"0")} / 10</span><h2>{course.title}</h2><p>{course.summary}</p></div><div className="academy-tabs"><button className={mode === "course" ? "active" : ""} onClick={() => { setMode("course"); setChecked(false); }}>Course lessons</button><button className={mode === "practice" ? "active" : ""} onClick={() => { setMode("practice"); setChecked(false); }}>Separate practice</button></div>{mode === "course" ? <article className="academy-lesson"><span className="eyebrow">LESSON {lessonIndex+1} / {course.lessons.length}</span><h3>{course.lessons[lessonIndex][0]}</h3><p>{course.lessons[lessonIndex][1]}</p><div className="academy-lesson-nav"><button className="quiet-button" disabled={lessonIndex===0} onClick={() => setLessonIndex(value => value-1)}>Previous lesson</button><button className="solid-button" onClick={() => setLessonIndex(value => value === course.lessons.length-1 ? 0 : value+1)}>{lessonIndex===course.lessons.length-1 ? "Review course" : "Next lesson"} <ArrowRight size={14}/></button></div></article> : <article className="academy-practice"><span className="eyebrow">CHECK YOUR UNDERSTANDING</span><h3>Practice questions</h3>{questions.map((question,index) => <div className="academy-question" key={question[0]}><b>{index+1}. {question[0]}</b>{question.slice(1,4).map((option,optionIndex) => <label key={optionIndex}><input type="radio" name={"academy-"+courseIndex+"-"+index} checked={answers[index]===optionIndex} onChange={() => { setAnswers(current => ({...current,[index]:optionIndex})); setChecked(false); }}/>{option}</label>)}{checked && <small className={answers[index]===Number(question[4]) ? "correct" : "incorrect"}>{answers[index]===question[3] ? "Correct" : "Review this lesson and try again."}</small>}</div>)}<button className="solid-button" onClick={() => setChecked(true)} disabled={Object.keys(answers).length!==questions.length}>Check my answers</button>{checked && <div className="academy-score">You scored {score} out of {questions.length}.</div>}</article>}</div></div>;
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
      setError(reason instanceof Error ? reason.message : "News could not be loaded.");
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
  const [fontScale, setFontScale] = useState(() => Number(localStorage.getItem("grandLumenFontScale") || "1"));
  const [interfaceScale, setInterfaceScale] = useState(() => Number(localStorage.getItem("grandLumenInterfaceScale") || "1"));
  const [fontFamily, setFontFamily] = useState(() => localStorage.getItem("grandLumenFontFamily") || "Manrope, sans-serif");
  const [fontWeight, setFontWeight] = useState(() => localStorage.getItem("grandLumenFontWeight") || "normal");

  useEffect(() => {
    localStorage.setItem("grandLumenFontScale", String(fontScale));
    localStorage.setItem("grandLumenInterfaceScale", String(interfaceScale));
    localStorage.setItem("grandLumenFontFamily", fontFamily);
    localStorage.setItem("grandLumenFontWeight", fontWeight);
    document.documentElement.style.setProperty("--gl-font-scale", String(fontScale));
    document.documentElement.style.setProperty("--gl-interface-scale", String(interfaceScale));
    document.documentElement.style.setProperty("--gl-font-family", fontFamily);
    document.documentElement.style.setProperty("--gl-font-weight", fontWeight);
  }, [fontScale, interfaceScale, fontFamily, fontWeight]);
  const [apiFilter, setApiFilter] = useState("All");
  const [tool, setTool] = useState("Calculator");
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
    localStorage.setItem("grandLumenResearchNotes", researchNotes);
  }, [researchNotes]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    localStorage.setItem("grandLumenFontScale", String(fontScale));
    localStorage.setItem("grandLumenInterfaceScale", String(interfaceScale));
    localStorage.setItem("grandLumenFontFamily", fontFamily);
    localStorage.setItem("grandLumenFontWeight", fontWeight);
    document.documentElement.style.setProperty("--gl-font-scale", String(fontScale));
    document.documentElement.style.setProperty("--gl-interface-scale", String(interfaceScale));
    document.documentElement.style.setProperty("--gl-font-family", fontFamily);
    document.documentElement.style.setProperty("--gl-font-weight", fontWeight);
  }, [fontScale, interfaceScale, fontFamily, fontWeight]);

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
      setError(reason instanceof Error ? reason.message : "Research could not be completed.");
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
    Projects: "Your creation space.",
    "Creative Studio": "Create beyond limits.",
    Messages: "Connect and communicate.",
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
      <div className={theme === "light" ? "app-shell theme-light" : "app-shell theme-dark"} style={{ "--gl-font-scale": fontScale, "--gl-interface-scale": interfaceScale, "--gl-font-family": fontFamily, "--gl-font-weight": fontWeight } as React.CSSProperties}>
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
            {section === "Search" && <section><PageTitle eyebrow="DISCOVERY ENGINE" title={heading.Search} description="Search across knowledge sources and developer communities without leaving your workspace." /><div className="search-panel"><Search size={18} /><input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && runSearch()} placeholder="What would you like to discover?" /><button onClick={() => runSearch()} disabled={busy}>Search</button></div><div className="filter-row"><button onClick={() => runSearch("all")}>All sources</button><button onClick={() => runSearch("wiki")}>Wikipedia</button><button onClick={() => runSearch("hn")}>Hacker News</button></div><Results items={results} saved={saved} onSave={toggleSave} onShare={item => openShare(item.title + "\n\n" + item.description + "\n\n" + item.url)} busy={busy} error={error} /></section>}
            {section === "Scanner" && <section><PageTitle eyebrow="CAMERA TOOLS" title={heading.Scanner} description="Scan QR codes and common product barcodes using your device camera."/><BarcodeScanner/></section>}
            {section === "Share" && <section><PageTitle eyebrow="DEVICE-TO-DEVICE TRANSFER" title={heading.Share} description="Share files, pictures, videos, links, research results and code with a connected device."/><ShareWorkspace initialText={shareDraft}/></section>}
            {section === "Messages" && <section><PageTitle eyebrow="LUMEN MESSAGES" title={heading.Messages} description="Find people by email and have conversations across your devices."/><MessagesWorkspace session={session}/></section>}
            {section === "Research" && <section><PageTitle eyebrow="RESEARCH STUDIO" title={heading.Research} description="Explore a topic and read clear explanations directly inside Grand-Lumen."/><div className="research-grid"><div className="glass-card"><span className="eyebrow">EXPLORE A TOPIC</span><h3>What do you want to understand?</h3><input value={query} onChange={e => setQuery(e.target.value)} placeholder="For example: renewable energy" onKeyDown={e => e.key === "Enter" && void runResearchTopic()}/><button className="solid-button" onClick={() => void runResearchTopic()} disabled={researchBusy}>{researchBusy ? "Preparing your research…" : "Explain this topic"} <ArrowRight size={15}/></button><div className="research-topics">{["Renewable energy","Artificial intelligence","African history","Human nervous system"].map(topic => <button key={topic} onClick={() => { setQuery(topic); void runResearchTopic(topic); }}>{topic}</button>)}</div></div><div className="glass-card"><span className="eyebrow">RESEARCH NOTEBOOK</span><h3>Your notes</h3><textarea value={researchNotes} onChange={e => setResearchNotes(e.target.value)} placeholder="Write what you have learned, questions and ideas…"/><div className="note-footer"><span>Saved on this device automatically</span><button onClick={() => navigator.clipboard?.writeText(researchNotes)}><Copy size={14}/> Copy notes</button></div></div></div>{researchBusy && <div className="loading-state"><span/><span/><span/></div>}{error && <p className="error-text">{error}</p>}{researchResults.length > 0 && <div className="research-answer-list">{researchResults.map((item,index) => <article className="glass-card research-answer" key={item.title}><span className="eyebrow">EXPLANATION {String(index+1).padStart(2,"0")}</span><h3>{item.title}</h3><p>{item.extract}</p><button className="quiet-button" onClick={() => setResearchNotes(notes => notes + (notes ? "\n\n" : "") + item.title + "\n" + item.extract)}><Plus size={14}/> Add to notes</button><button className="quiet-button" onClick={() => openShare(item.title + "\n\n" + item.extract + "\n\n" + item.url)}><Share2 size={14}/> Share explanation</button></article>)}</div>}<div className="info-banner"><BookOpen size={18}/><span>Research presents readable topic explanations here. Use the original article when you need to verify details or explore further.</span></div></section>}{section === "News" && <section><PageTitle eyebrow="GLOBAL NEWS DESK" title={heading.News} description="Search current headlines and recent reports from publishers around the world."/><NewsWorkspace /></section>}
            {section === "Images" && <section><PageTitle eyebrow="VISUAL DISCOVERY" title={heading.Images} description="Search openly licensed image collections and view discoveries directly in Grand-Lumen." /><div className="search-panel"><Image size={18} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search images, places, science, design..." onKeyDown={e => e.key === "Enter" && runMediaSearch("images")} /><button onClick={() => runMediaSearch("images")} disabled={mediaBusy}>{mediaBusy ? "Searching..." : "Search images"}</button></div><div className="quick-tags">{["Nature","Architecture","Space","Technology","African art"].map(tag => <button key={tag} onClick={() => { setQuery(tag); runMediaSearch("images", tag); }}>{tag}</button>)}</div><MediaResults items={mediaResults} busy={mediaBusy} error={error} kind="images" onSave={toggleSave} onShare={item => openShare(item.title + "\n" + item.description + "\nImage: " + (item.image || "") + "\n" + item.url)} /><div className="info-banner"><ShieldCheck size={18} /><span>Images are retrieved from Wikimedia Commons. Check each file page for its licence and attribution requirements before reuse.</span></div></section>}
            {section === "Videos" && <section><PageTitle eyebrow="VIDEO DISCOVERY" title={heading.Videos} description="Search public video collections and preview available items inside your workspace." /><div className="search-panel"><Video size={18} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search documentaries, tutorials, science..." onKeyDown={e => e.key === "Enter" && runMediaSearch("videos")} /><button onClick={() => runMediaSearch("videos")} disabled={mediaBusy}>{mediaBusy ? "Searching..." : "Search videos"}</button></div><div className="quick-tags">{["Science","Technology","History","Education"].map(tag => <button key={tag} onClick={() => { setQuery(tag); runMediaSearch("videos", tag); }}>{tag}</button>)}</div><MediaResults items={mediaResults} busy={mediaBusy} error={error} kind="videos" onSave={toggleSave} onShare={item => openShare(item.title + "\n" + item.description + "\nVideo: " + item.url)} /></section>}
            {section === "Maps" && <section><PageTitle eyebrow="LOCATION & NAVIGATION" title={heading.Maps} description="Explore places with Google Maps, search destinations and use your device location when you choose to share it." /><MapWorkspace /></section>}
            {section === "Code Lab" && <section className="code-section"><PageTitle eyebrow="PROFESSIONAL DEVELOPMENT ENVIRONMENT" title="Build beyond limits." description="A multi-file coding workspace with project explorer, editor tabs, local terminal, live browser preview and project export."/><CodeStudioWorkspace /></section>}{section === "Learn" && <section><PageTitle eyebrow="GRAND-LUMEN ACADEMY" title="Learn by doing." description="Ten guided courses with lessons, examples and separate practice activities."/><LearnWorkspace/></section>}{section === "API Library" && <section><PageTitle eyebrow="INTEGRATION DIRECTORY" title={heading["API Library"]} description="A curated catalogue of public APIs and developer services for in-app experiences." /><div className="api-search"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find an API or capability..." /></div><div className="api-categories">{["All","Knowledge","Technology","Environment","Finance","Development","Science","Images","Media","AI","Language","Geography","Food","Utilities","Entertainment","Research","News"].map(item => <button className={apiFilter === item ? "selected" : ""} key={item} onClick={() => setApiFilter(item)}>{item}</button>)}</div><div className="api-grid">{filteredApis.map(item => <div className="api-card" key={item[0]}><div className="api-card-top"><span className="api-symbol"><Database size={17} /></span><span className={item[3] === "No key" ? "keyless" : "key-needed"}>{item[3]}</span></div><h3>{item[0]}</h3><p>{item[1]}</p><div className="api-card-bottom"><span>{item[2]}</span><button onClick={() => { setQuery(item[0]); setToolInput(item[0]); selectSection("Tools"); }}>Explore <ArrowRight size={13} /></button></div></div>)}</div></section>}
            {section === "Tools" && <section><PageTitle eyebrow="UTILITY DECK" title={heading.Tools} description="A set of connected utilities that return useful information inside Grand-Lumen." /><div className="tool-layout"><div className="tool-list">{toolCards.map(([name,detail,Icon]) => <button className={tool === name ? "tool-option active" : "tool-option"} key={name} onClick={() => { setTool(name); setToolOutput(null); setError(""); }}><Icon size={17} /><span><b>{name}</b><small>{detail}</small></span><ChevronDown size={14} /></button>)}</div><div className="glass-card tool-workspace">{tool === "Calculator" ? <CalculatorWorkspace /> : <><span className="eyebrow">ACTIVE UTILITY</span><h3>{tool}</h3>{tool === "Currency" && <div className="currency-row"><select value={currencyBase} onChange={e => setCurrencyBase(e.target.value)}>{["USD","GHS","EUR","GBP","NGN","CAD","JPY","INR","ZAR"].map(x => <option key={x}>{x}</option>)}</select><ArrowRight size={16} /><select value={currencyTarget} onChange={e => setCurrencyTarget(e.target.value)}>{["GHS","USD","EUR","GBP","NGN","CAD","JPY","INR","ZAR"].map(x => <option key={x}>{x}</option>)}</select></div>}<div className="tool-input-row"><input value={toolInput} onChange={e => setToolInput(e.target.value)} onKeyDown={e => e.key === "Enter" && runTool()} placeholder={tool === "Calculator" ? "Example: (25 * 4) / 2" : tool === "Weather" ? "Enter a city, e.g. Accra" : tool === "Pokédex" ? "Enter a Pokémon name" : tool === "Public Holidays" ? "Country code, e.g. GH" : "Enter a word"} /><button className="solid-button" onClick={runTool} disabled={busy}>{busy ? "Working..." : "Run tool"}</button></div>{error && <p className="error-text">{error}</p>}<ToolOutput output={toolOutput} tool={tool} /></>}</div></div></section>}
            {section === "Saved" && <section><PageTitle eyebrow="PERSONAL KNOWLEDGE VAULT" title={heading.Saved} description="Keep useful discoveries close. Saved items remain in this browser." /><div className="saved-list"><Results items={saved} saved={saved} onSave={toggleSave} onShare={item => openShare(item.title + "\n\n" + item.description + "\n\n" + item.url)} busy={false} error="" /></div>{!saved.length && <EmptyState title="Your vault is ready." detail="Save search results to build your personal knowledge collection." />}</section>}
            {section === "Creative Studio" && <section><PageTitle eyebrow="LUMEN CREATIVE" title="Creative Studio" description="Edit photographs and video clips with detailed controls, then export your finished work."/><CreativeStudio/></section>}{section === "Projects" && <section><PageTitle eyebrow="PROJECT MANAGEMENT" title={heading.Projects} description="Keep track of ideas and projects you are developing." /><div className="project-create"><input value={projectName} onChange={e => setProjectName(e.target.value)} onKeyDown={e => e.key === "Enter" && projectName.trim() && (setProjects([projectName.trim(), ...projects]), setProjectName(""))} placeholder="Name a project or idea..." /><button className="solid-button" onClick={() => { if (projectName.trim()) { setProjects([projectName.trim(), ...projects]); setProjectName(""); } }}><Plus size={15} /> Add project</button></div><div className="project-grid">{projects.map((name,index) => <div className="glass-card project-card" key={name + index}><span className="feature-icon"><Layers3 size={19} /></span><h3>{name}</h3><span className="muted">PERSONAL PROJECT</span><button onClick={() => setProjects(projects.filter((_,i) => i !== index))}>Remove <X size={13} /></button></div>)}</div>{!projects.length && <EmptyState title="A space for your next big idea." detail="Create your first project to start organising your work." />}</section>}
            {section === "Settings" && <section><PageTitle eyebrow="PREFERENCES" title={heading.Settings} description="Manage your profile, appearance and local workspace preferences." /><div className="settings-card profile-settings-card"><div className="profile-settings-preview">{(localProfile?.profileImage || profilePicture) ? <img src={localProfile?.profileImage || profilePicture} alt="Your profile"/> : <span>{(localProfile?.fullName || session?.user.email || "GL").slice(0,2).toUpperCase()}</span>}</div><div className="profile-settings-copy"><b>Profile photograph</b><p>Choose a picture to represent your Grand-Lumen account on this device.</p><label className="quiet-button profile-upload-button"><Upload size={14}/> Upload profile picture<input type="file" accept="image/*" onChange={event => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 3 * 1024 * 1024) { alert("Choose an image smaller than 3 MB."); return; } const reader = new FileReader(); reader.onload = () => { const image = String(reader.result || ""); if (localProfile) { const updated = { ...localProfile, profileImage: image }; setLocalProfile(updated); localStorage.setItem("grandLumenLocalSession", JSON.stringify(updated)); } else if (session) { localStorage.setItem("grandLumenProfileImage", image); setProfilePicture(image); } }; reader.readAsDataURL(file); event.currentTarget.value = ""; }}/></label>{(localProfile?.profileImage || profilePicture) && <button className="quiet-button" onClick={() => { if (localProfile) { const updated = { ...localProfile, profileImage: undefined }; setLocalProfile(updated); localStorage.setItem("grandLumenLocalSession", JSON.stringify(updated)); } setProfilePicture(""); localStorage.removeItem("grandLumenProfileImage"); }}>Remove picture</button>}</div></div><div className="settings-card install-settings-card"><div className="install-settings-icon"><Smartphone size={22}/></div><div className="install-settings-copy"><b>Install Grand-Lumen</b><p>Install the workspace directly on this device. Installation is optional and never forced.</p>{installHelp && <small>{installHelp}</small>}</div><button className="solid-button" onClick={() => void installGrandLumen()} disabled={isInstalled}><Download size={15}/>{isInstalled ? "Installed" : "Install app"}</button></div><div className="settings-preferences"><div className="settings-preferences-heading"><div><b>Display & typography</b><p>Control the size and style of text and the app interface on this device.</p></div><button className="quiet-button" onClick={() => { setFontScale(1); setInterfaceScale(1); setFontFamily("Manrope, sans-serif"); setFontWeight("normal"); }}>Reset</button></div><div className="preference-control"><div className="preference-label"><label htmlFor="gl-font-scale">Text size</label><strong>{Math.round(fontScale * 100)}%</strong></div><input id="gl-font-scale" type="range" min="0.85" max="1.3" step="0.05" value={fontScale} onChange={event => setFontScale(Number(event.target.value))}/><div className="preference-range-labels"><span>Smaller</span><span>Default</span><span>Larger</span></div></div><div className="preference-control"><div className="preference-label"><label htmlFor="gl-interface-scale">App screen scale</label><strong>{Math.round(interfaceScale * 100)}%</strong></div><input id="gl-interface-scale" type="range" min="0.85" max="1.15" step="0.05" value={interfaceScale} onChange={event => setInterfaceScale(Number(event.target.value))}/><div className="preference-range-labels"><span>Compact</span><span>Default</span><span>Spacious</span></div></div><div className="preference-control"><label htmlFor="gl-font-family">Font style</label><select id="gl-font-family" value={fontFamily} onChange={event => setFontFamily(event.target.value)}><option value="Manrope, sans-serif">Manrope · Modern</option><option value="Arial, sans-serif">Arial · Classic</option><option value="Georgia, serif">Georgia · Serif</option><option value="'DM Mono', monospace">DM Mono · Monospace</option><option value="system-ui, sans-serif">System default</option></select></div><div className="preference-control"><label htmlFor="gl-font-weight">Text weight</label><select id="gl-font-weight" value={fontWeight} onChange={event => setFontWeight(event.target.value)}><option value="normal">Regular</option><option value="500">Medium</option><option value="600">Semi-bold</option><option value="700">Bold</option></select></div><div className="preference-preview"><span>PREVIEW</span><strong>Explore beyond. Build what comes next.</strong><p>Your display preferences are saved automatically on this device.</p></div></div><div className="settings-card"><div><b>Appearance</b><p>Choose the interface theme.</p></div><div className="theme-switch"><button className={theme === "dark" ? "selected" : ""} onClick={() => setTheme("dark")}><Moon size={15} /> Dark</button><button className={theme === "light" ? "selected" : ""} onClick={() => setTheme("light")}><Sun size={15} /> Light</button></div></div><div className="settings-card"><div><b>Local workspace data</b><p>Saved items and projects are stored in this browser.</p></div><button className="quiet-button" onClick={() => { if (confirm("Clear saved items and projects from this browser?")) { setSaved([]); setProjects([]); } }}>Clear local data</button></div><div className="settings-card"><div><b>Export workspace</b><p>Download your saved items, projects and available Grand-Lumen workspace data as a JSON backup. Account passwords are never included.</p></div><button className="quiet-button" onClick={exportWorkspace}><Download size={15}/> Export workspace</button></div><div className="settings-card settings-danger-card"><div><b>Sign out</b><p>End your current Grand-Lumen session on this device.</p></div><button className="quiet-button" onClick={() => void handleLogout()}><LogOut size={15}/> Log out</button></div><div className="settings-card about-grand-lumen"><div><b>About Grand-Lumen</b><p>Grand-Lumen is a connected digital space for discovery, learning, research and creation.</p><strong>Built by Emmanuel Pobee Okpoti - Inventor and student Leader.</strong><a href="https://wa.me/233203446793" target="_blank" rel="noreferrer" className="about-whatsapp-link">Connect via 0203446793 <ExternalLink size={14}/></a></div><span className="version">v1.0.0</span></div></section>}
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
function Results({ items, saved, onSave, onShare, busy, error }: { items: SearchItem[]; saved: SearchItem[]; onSave: (item: SearchItem) => void; onShare: (item: SearchItem) => void; busy: boolean; error: string }) {
  if (busy) return <div className="loading-state"><span /><span /><span /></div>;
  if (error) return <div className="error-text">{error}</div>;
  return <div className="results-list">{items.map((item,index) => <article className="result-item" key={item.url + index}><div className="result-source">{item.source}</div><a href={item.url} target="_blank" rel="noreferrer">{item.title} <ExternalLink size={13} /></a><p>{item.description}</p><button onClick={() => onSave(item)}>{saved.some(savedItem => savedItem.url === item.url) ? <Check size={14} /> : <Bookmark size={14} />}{saved.some(savedItem => savedItem.url === item.url) ? "Saved" : "Save"}</button><button onClick={() => onShare(item)}><Share2 size={14}/> Share</button></article>)}</div>;
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