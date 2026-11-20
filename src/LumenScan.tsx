import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { Camera, Check, ChevronDown, Copy, Download, FileImage, FileText, ImagePlus, Move, QrCode, ScanLine, Share2, Sparkles, Trash2, Upload, X } from "lucide-react";
import { createWorker } from "tesseract.js";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import { jsPDF } from "jspdf";
import "./LumenScan.css";

type ScanRecord = {
  id: string;
  title: string;
  text: string;
  createdAt: number;
  pageCount: number;
  kind: "document" | "object";
  image?: string;
};

type Position = { x: number; y: number };

const DB_NAME = "grandLumenScanDB";
const STORE_NAME = "documents";

function openScanDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readScanRecords(): Promise<ScanRecord[]> {
  const database = await openScanDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result as ScanRecord[]).sort((a, b) => b.createdAt - a.createdAt));
    request.onerror = () => reject(request.error);
  });
}

async function writeScanRecord(record: ScanRecord): Promise<void> {
  const database = await openScanDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function deleteScanRecord(id: string): Promise<void> {
  const database = await openScanDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function imageData(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name.endsWith(".txt") ? name : name + ".txt";
  anchor.click();
  URL.revokeObjectURL(url);
}

function FloatingScanIcon({ onScreenshot, onScan }: { onScreenshot: () => void; onScan: () => void }) {
  const [position, setPosition] = useState<Position>(() => {
    try {
      const saved = localStorage.getItem("grandLumenScanPosition");
      if (saved) return JSON.parse(saved) as Position;
    } catch {}
    return { x: Math.max(12, window.innerWidth - 92), y: Math.max(90, Math.round(window.innerHeight * 0.56)) };
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [screenshotOpen, setScreenshotOpen] = useState(false);
  const [dimmed, setDimmed] = useState(false);
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const idleTimer = useRef<number | undefined>(undefined);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const wake = useCallback(() => {
    setDimmed(false);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => {
      setDimmed(true);
      setMenuOpen(false);
      setScreenshotOpen(false);
      setPosition(current => {
        const right = window.innerWidth - current.x - 68;
        const bottom = window.innerHeight - current.y - 68;
        const x = right < current.x ? window.innerWidth - 34 : -34;
        const y = bottom < current.y ? window.innerHeight - 34 : 12;
        const next = { x: Math.max(-34, Math.min(window.innerWidth - 34, x)), y: Math.max(12, Math.min(window.innerHeight - 34, y)) };
        localStorage.setItem("grandLumenScanPosition", JSON.stringify(next));
        return next;
      });
    }, 5000);
  }, []);

  useEffect(() => {
    wake();
    const resize = () => setPosition(current => ({ x: Math.max(-34, Math.min(window.innerWidth - 68, current.x)), y: Math.max(12, Math.min(window.innerHeight - 68, current.y)) }));
    window.addEventListener("resize", resize);
    return () => {
      window.clearTimeout(idleTimer.current);
      window.removeEventListener("resize", resize);
    };
  }, [wake]);

  const beginDrag = (event: PointerEvent<HTMLButtonElement>) => {
    wake();
    drag.current = { x: event.clientX, y: event.clientY, left: position.x, top: position.y, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!drag.current) return;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) drag.current.moved = true;
    if (drag.current.moved) {
      const next = { x: Math.max(8, Math.min(window.innerWidth - 76, drag.current.left + dx)), y: Math.max(12, Math.min(window.innerHeight - 76, drag.current.top + dy)) };
      setPosition(next);
      localStorage.setItem("grandLumenScanPosition", JSON.stringify(next));
    }
  };

  const endDrag = () => {
    const moved = drag.current?.moved;
    suppressClick.current = Boolean(moved);
    drag.current = null;
    if (moved) {
      setMenuOpen(false);
      setScreenshotOpen(false);
      wake();
    }
  };

  const activate = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    wake();
    setDimmed(false);
    setMenuOpen(value => !value);
    setScreenshotOpen(false);
  };

  return <>
    <div className={"gl-scan-float" + (dimmed ? " is-dimmed" : "")} style={{ left: position.x, top: position.y }}>
      <button ref={buttonRef} className="gl-scan-orb" aria-label="Open Lumen Scan" onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onClick={activate}>
        <QrCode size={35} strokeWidth={2.5}/>
      </button>
      {menuOpen && <div className="gl-scan-menu">
        <button onClick={() => { setScreenshotOpen(value => !value); wake(); }}><Camera size={16}/> Screenshot <ChevronDown size={13}/></button>
        {screenshotOpen && <div className="gl-scan-submenu">
          <button onClick={onScreenshot}>Capture screen</button>
          <button onClick={onScan}>Camera screenshot</button>
        </div>}
        <button onClick={onScan}><ScanLine size={16}/> Scan documents & objects</button>
      </div>}
    </div>
  </>;
}

export default function LumenScan() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"document" | "object">("document");
  const [records, setRecords] = useState<ScanRecord[]>([]);
  const [selected, setSelected] = useState<ScanRecord | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraKind, setCameraKind] = useState<"document" | "object" | "photo">("document");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshRecords = useCallback(async () => {
    try { setRecords(await readScanRecords()); } catch { setError("Local document storage is unavailable in this browser."); }
  }, []);

  useEffect(() => { void refreshRecords(); }, [refreshRecords]);

  useEffect(() => {
    if (!cameraOn || !videoRef.current) return;
    let active = true;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false }).then(stream => {
      if (!active) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        void videoRef.current.play();
      }
    }).catch(reason => {
      setError(reason instanceof Error ? reason.message : "Camera access is unavailable. Check camera permission.");
      setCameraOn(false);
    });
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [cameraOn]);

  const addFiles = (incoming: FileList | File[]) => {
    const images = Array.from(incoming).filter(file => file.type.startsWith("image/"));
    if (!images.length) {
      setError("Choose image files to scan.");
      return;
    }
    setFiles(current => [...current, ...images]);
    setError("");
  };

  const saveScreenshot = async (file: File) => {
    const record: ScanRecord = { id: crypto.randomUUID(), title: "Screenshot · " + new Date().toLocaleString(), text: "Screenshot captured. Choose Extract text to recognise any visible words, numbers or formulas.", createdAt: Date.now(), pageCount: 1, kind: "document", image: await imageData(file) };
    await writeScanRecord(record);
    setSelected(record);
    await refreshRecords();
    setStatus("Screenshot saved on this device.");
  };

  const captureCamera = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) {
      setError("The camera image could not be captured.");
      return;
    }
    const file = new File([blob], "Lumen-Scan-" + Date.now() + ".jpg", { type: "image/jpeg" });
    if (cameraKind === "object") {
      await identifyObject(file);
      return;
    }
    if (cameraKind === "photo") {
      await saveScreenshot(file);
      setMode("document");
      setCameraOn(false);
      setOpen(true);
      return;
    }
    addFiles([file]);
  };

  const identifyObject = async (file: File) => {
    setBusy(true);
    setError("");
    setStatus("Loading object recognition model…");
    try {
      const model = await cocoSsd.load();
      const image = new Image();
      image.src = URL.createObjectURL(file);
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("The captured image could not be opened."));
      });
      const predictions = await model.detect(image);
      URL.revokeObjectURL(image.src);
      const unique = [...new Set(predictions.filter(item => item.score > 0.35).map(item => item.class))];
      const description = unique.length ? "Detected: " + unique.join(", ") + ". Recognition confidence varies by object and image quality." : "No familiar object was confidently recognised. Try a clearer image with the object centred.";
      const record: ScanRecord = { id: crypto.randomUUID(), title: unique[0] ? "Object · " + unique[0] : "Unidentified object", text: description, createdAt: Date.now(), pageCount: 1, kind: "object", image: await imageData(file) };
      await writeScanRecord(record);
      setSelected(record);
      await refreshRecords();
      setStatus("Object recognition complete.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Object recognition could not complete. Connect to the internet to load the model.");
    } finally {
      setBusy(false);
      setCameraOn(false);
    }
  };

  const runDocumentScan = async () => {
    if (!files.length) {
      setError("Capture a page or choose one or more images first.");
      return;
    }
    setBusy(true);
    setError("");
    setStatus("Preparing text recognition…");
    let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
    try {
      worker = await createWorker("eng", 1, { logger: message => {
        if (message.status === "recognizing text") setStatus("Recognising text · " + Math.round(message.progress * 100) + "%");
        else setStatus(message.status);
      } });
      const pages: string[] = [];
      for (let index = 0; index < files.length; index += 1) {
        setStatus("Reading page " + (index + 1) + " of " + files.length + "…");
        const result = await worker.recognize(files[index]);
        pages.push("PAGE " + (index + 1) + "\n\n" + result.data.text.trim());
      }
      const text = pages.join("\n\n--------------------------------\n\n");
      if (!text.trim()) throw new Error("No readable text was found. Try brighter, sharper images.");
      const record: ScanRecord = { id: crypto.randomUUID(), title: "Scanned document · " + new Date().toLocaleString(), text, createdAt: Date.now(), pageCount: files.length, kind: "document", image: await imageData(files[0]) };
      await writeScanRecord(record);
      setSelected(record);
      setFiles([]);
      await refreshRecords();
      setStatus("Scan complete. Review and correct the extracted text.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Text recognition could not complete. Connect to the internet for the first engine download.");
    } finally {
      if (worker) await worker.terminate();
      setBusy(false);
    }
  };

  const captureScreen = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      stream.getTracks().forEach(track => track.stop());
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("The screen capture could not be created.");
      await saveScreenshot(new File([blob], "Grand-Lumen-Screenshot-" + Date.now() + ".png", { type: "image/png" }));
      setMode("document");
      setOpen(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Screen capture was cancelled or is not supported.");
      setOpen(true);
    }
  };

  const shareRecord = async (record: ScanRecord) => {
    const payload = { title: record.title, text: record.text };
    if (navigator.share) {
      try { await navigator.share(payload); } catch {}
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(record.text);
      setStatus("Text copied. You can paste it into another app or device.");
    }
  };

  const exportPdf = (record: ScanRecord) => {
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const lines = pdf.splitTextToSize(record.text, 180);
    let y = 18;
    pdf.setFontSize(15);
    pdf.text(record.title.slice(0, 90), 15, y);
    y += 10;
    pdf.setFontSize(10);
    lines.forEach((line: string) => {
      if (y > 282) {
        pdf.addPage();
        y = 16;
      }
      pdf.text(line, 15, y);
      y += 5;
    });
    pdf.save("Lumen-Scan-" + record.id.slice(0, 8) + ".pdf");
  };

  const updateSelectedText = (text: string) => {
    if (!selected) return;
    const next = { ...selected, text };
    setSelected(next);
    void writeScanRecord(next).then(refreshRecords);
  };

  const clearAllRecords = async () => {
    if (!window.confirm("Delete every saved Lumen Scan item from this device?")) return;
    const database = await openScanDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    setSelected(null);
    await refreshRecords();
    setStatus("All saved scans were cleared from this device.");
  };

  const removeRecord = async (record: ScanRecord) => {
    await deleteScanRecord(record.id);
    if (selected?.id === record.id) setSelected(null);
    await refreshRecords();
  };

  const startCamera = (kind: "document" | "object" | "photo") => {
    setCameraKind(kind);
    setCameraOn(true);
    setError("");
    setOpen(true);
  };

  return <>
    <FloatingScanIcon onScreenshot={captureScreen} onScan={() => { setMode("document"); setOpen(true); setError(""); }}/>
    {open && <div className="gl-scan-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) { setOpen(false); setCameraOn(false); } }}>
      <section className="gl-scan-panel" role="dialog" aria-modal="true" aria-label="Lumen Scan">
        <header className="gl-scan-header">
          <div><span className="gl-scan-kicker"><ScanLine size={13}/> GRAND-LUMEN VISUAL INTELLIGENCE</span><h2>Lumen Scan</h2><p>Capture, recognise, edit and keep visual information on this device.</p></div>
          <button className="gl-scan-close" onClick={() => { if (!busy) { setOpen(false); setCameraOn(false); } }} aria-label="Close Lumen Scan"><X size={19}/></button>
        </header>
        <div className="gl-scan-tabs">
          <button className={mode === "document" ? "active" : ""} onClick={() => { setMode("document"); setCameraOn(false); }}><FileText size={15}/> Document scan</button>
          <button className={mode === "object" ? "active" : ""} onClick={() => { setMode("object"); setCameraOn(false); }}><Sparkles size={15}/> Object recognition</button>
        </div>
        {cameraOn ? <div className="gl-scan-camera-area">
          <video ref={videoRef} muted playsInline/>
          <div className="gl-scan-camera-actions"><button className="gl-scan-primary" onClick={() => void captureCamera()}><Camera size={16}/> Capture {cameraKind === "object" ? "object" : "page"}</button><button className="gl-scan-secondary" onClick={() => setCameraOn(false)}>Cancel</button></div>
        </div> : mode === "document" ? <div className="gl-scan-document-area">
          <div className="gl-scan-capture-grid">
            <button onClick={() => startCamera("document")}><Camera size={21}/><b>Use camera</b><span>Photograph a page or question paper</span></button>
            <button onClick={() => fileInputRef.current?.click()}><ImagePlus size={21}/><b>Choose images</b><span>Add multiple pages from your device</span></button>
            <button onClick={() => startCamera("photo")}><FileImage size={21}/><b>Camera screenshot</b><span>Capture a picture and add it to the scan</span></button>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={event => { if (event.target.files) addFiles(event.target.files); event.currentTarget.value = ""; }}/>
          {files.length > 0 && <div className="gl-scan-queue"><div><b>{files.length} page{files.length === 1 ? "" : "s"} ready</b><button onClick={() => setFiles([])}><Trash2 size={14}/> Clear pages</button></div><div className="gl-scan-thumbs">{files.map((file,index) => <span key={file.name + index}><FileImage size={15}/>{file.name}</span>)}</div><button className="gl-scan-primary" disabled={busy} onClick={() => void runDocumentScan()}>{busy ? "Recognising…" : "Recognise all pages"}</button></div>}
          <p className="gl-scan-capability">Reads printed text, notes, numbers and visible mathematical or scientific symbols. Equations and diagram labels may need manual correction; complex diagrams are not reconstructed as editable drawings.</p>
        </div> : <div className="gl-scan-object-area">
          <div className="gl-scan-object-mark"><Sparkles size={31}/></div>
          <h3>Identify an object</h3><p>Use your camera to recognise common everyday objects and display their detected names in Grand Lumen.</p>
          <button className="gl-scan-primary" onClick={() => startCamera("object")}><Camera size={16}/> Open object camera</button>
          <small>Object recognition model downloads when first used and needs an internet connection to load. Recognition covers common model classes, not every possible object.</small>
        </div>}
        {(status || error) && <div className={error ? "gl-scan-message is-error" : "gl-scan-message"}>{error || status}</div>}
        {selected && <div className="gl-scan-result">
          <div className="gl-scan-result-heading"><div><span>RECOGNISED CONTENT</span><h3>{selected.title}</h3><small>{selected.pageCount} page{selected.pageCount === 1 ? "" : "s"} · {new Date(selected.createdAt).toLocaleString()}</small></div><button onClick={() => setSelected(null)} aria-label="Close result"><X size={16}/></button></div>
          {selected.image && <img className="gl-scan-preview" src={selected.image} alt="First scanned page or object"/>}
          <textarea value={selected.text} onChange={event => updateSelectedText(event.target.value)} aria-label="Edit recognised text"/>
          <div className="gl-scan-result-actions">
            <button onClick={() => void navigator.clipboard?.writeText(selected.text)}><Copy size={14}/> Copy</button>
            {selected.image && <button onClick={() => { const link = document.createElement("a"); link.href = selected.image || ""; link.download = "Lumen-Screenshot-" + selected.id.slice(0, 8) + ".png"; link.click(); }}><Download size={14}/> Image</button>}
            {selected.image && selected.text.startsWith("Screenshot captured") && <button onClick={() => { const blob = selected.image ? fetch(selected.image).then(response => response.blob()) : Promise.resolve(new Blob()); void blob.then(value => { addFiles([new File([value], "Lumen-Screenshot.png", { type: value.type || "image/png" })]); setSelected(null); setMode("document"); }); }}><ScanLine size={14}/> Extract text</button>}
            <button onClick={() => void shareRecord(selected)}><Share2 size={14}/> Share</button>
            <button onClick={() => downloadText("Lumen-Scan-" + selected.id.slice(0, 8), selected.text)}><Download size={14}/> TXT</button>
            <button onClick={() => exportPdf(selected)}><Download size={14}/> PDF</button>
            <button className="danger" onClick={() => void removeRecord(selected)}><Trash2 size={14}/> Delete</button>
          </div>
        </div>}
        <div className="gl-scan-library">
          <div><b>Saved scans</b><span>{records.length} stored on this device</span>{records.length > 0 && <button className="gl-scan-clear-all" onClick={() => void clearAllRecords()}><Trash2 size={12}/> Clear all</button>}</div>
          {records.length ? records.map(record => <button className={selected?.id === record.id ? "selected" : ""} key={record.id} onClick={() => { setSelected(record); setMode(record.kind); setError(""); }}><span>{record.kind === "object" ? <Sparkles size={15}/> : <FileText size={15}/>}<span><b>{record.title}</b><small>{record.pageCount} page{record.pageCount === 1 ? "" : "s"} · {new Date(record.createdAt).toLocaleDateString()}</small></span></span><Check size={14}/></button>) : <p>No saved scans yet. Your documents stay in this browser.</p>}
        </div>
        <footer className="gl-scan-footer"><span><Move size={13}/> Drag the floating scanner to reposition it.</span><button onClick={() => { setOpen(false); setCameraOn(false); }}>Done</button></footer>
      </section>
    </div>}
  </>;
}
