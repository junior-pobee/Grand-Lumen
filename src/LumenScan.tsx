import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { Aperture, Camera, Check, ChevronDown, Clapperboard, Copy, Download, FileImage, FileText, FlipHorizontal, ImagePlus, Maximize2, Mic, MicOff, Minimize2, Move, NotebookPen, QrCode, RotateCw, ScanLine, Share2, Sparkles, Sun, Trash2, Upload, Video, X } from "lucide-react";
import { createWorker } from "tesseract.js";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";
import "@tensorflow/tfjs-backend-cpu";
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
  images?: string[];
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

async function prepareOcrImage(file: File): Promise<Blob> {
  const image = new Image();
  const source = URL.createObjectURL(file);
  image.src = source;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("This page image could not be prepared for text recognition."));
  });
  const scale = Math.min(2.5, Math.max(1, 1800 / image.naturalWidth));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    URL.revokeObjectURL(source);
    throw new Error("Image processing is not available in this browser.");
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const grey = pixels.data[index] * 0.299 + pixels.data[index + 1] * 0.587 + pixels.data[index + 2] * 0.114;
    const enhanced = Math.max(0, Math.min(255, (grey - 128) * 1.35 + 128));
    pixels.data[index] = enhanced;
    pixels.data[index + 1] = enhanced;
    pixels.data[index + 2] = enhanced;
  }
  context.putImageData(pixels, 0, 0);
  URL.revokeObjectURL(source);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("The page image could not be enhanced.")), "image/png");
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

function FloatingScanIcon({ onScreenshot, onScan, onStudio }: { onScreenshot: () => void; onScan: () => void; onStudio: () => void }) {
  const [position, setPosition] = useState<Position>(() => {
    try {
      const saved = localStorage.getItem("grandLumenScanPosition");
      if (saved) return JSON.parse(saved) as Position;
    } catch {}
    return { x: Math.max(12, window.innerWidth - 88), y: Math.max(90, Math.round(window.innerHeight * 0.56)) };
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
        const centerX = current.x + 32;
        const centerY = current.y + 32;
        const distances = { left: centerX, right: window.innerWidth - centerX, top: centerY, bottom: window.innerHeight - centerY };
        const nearest = Object.entries(distances).sort((a, b) => a[1] - b[1])[0][0];
        const next = nearest === "left" ? { x: -32, y: Math.max(12, Math.min(window.innerHeight - 64, current.y)) } : nearest === "right" ? { x: window.innerWidth - 32, y: Math.max(12, Math.min(window.innerHeight - 64, current.y)) } : nearest === "top" ? { x: Math.max(12, Math.min(window.innerWidth - 64, current.x)), y: -24 } : { x: Math.max(12, Math.min(window.innerWidth - 64, current.x)), y: window.innerHeight - 32 };
        localStorage.setItem("grandLumenScanPosition", JSON.stringify(next));
        return next;
      });
    }, 13 * 1000);
  }, []);

  useEffect(() => {
    wake();
    const resize = () => setPosition(current => ({ x: Math.max(-24, Math.min(window.innerWidth - 24, current.x)), y: Math.max(-24, Math.min(window.innerHeight - 32, current.y)) }));
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
      const next = { x: Math.max(8, Math.min(window.innerWidth - 72, drag.current.left + dx)), y: Math.max(12, Math.min(window.innerHeight - 72, drag.current.top + dy)) };
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
    setPosition(current => {
      const next = { x: current.x < 0 ? 12 : current.x > window.innerWidth - 64 ? window.innerWidth - 72 : current.x, y: current.y > window.innerHeight - 64 ? window.innerHeight - 72 : current.y };
      localStorage.setItem("grandLumenScanPosition", JSON.stringify(next));
      return next;
    });
    setMenuOpen(value => !value);
    setScreenshotOpen(false);
  };

  return <>
    <div className={"gl-scan-float" + (dimmed ? " is-dimmed" : "")} style={{ left: position.x, top: position.y }}>
      <button ref={buttonRef} className="gl-scan-orb" aria-label="Open Lumen Scan" onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onClick={activate}>
        <QrCode size={42} strokeWidth={2.3}/>
      </button>
      {menuOpen && <div className={"gl-scan-menu" + (position.x < window.innerWidth / 2 ? " side-left" : "") + (position.y < window.innerHeight / 2 ? " below" : "")}>
        <button className="gl-scan-menu-feature" onClick={() => { onStudio(); setMenuOpen(false); }}><Clapperboard size={17}/> Creative Studio <span>PHOTO · VIDEO</span></button>
        <button onClick={() => { setScreenshotOpen(value => !value); wake(); }}><Camera size={16}/> Screenshot <ChevronDown size={13}/></button>
        {screenshotOpen && <div className="gl-scan-submenu">
          <button onClick={onScreenshot}>Screenshot app workspace</button>
        </div>}
        <button onClick={onScan}><ScanLine size={16}/> Scan documents & objects</button>
      </div>}
    </div>
  </>;
}

export default function LumenScan() {
  const [open, setOpen] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<"scan" | "studio">("scan");
  const [studioMediaUrl, setStudioMediaUrl] = useState("");
  const [studioMediaKind, setStudioMediaKind] = useState<"photo" | "video" | "">("");
  const [recording, setRecording] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<"environment" | "user">("environment");
  const [cameraExpanded, setCameraExpanded] = useState(false);
  const [photoRotation, setPhotoRotation] = useState(0);
  const [photoBrightness, setPhotoBrightness] = useState(100);
  const [photoContrast, setPhotoContrast] = useState(100);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [voiceUrl, setVoiceUrl] = useState("");
  const [qrResult, setQrResult] = useState("");
  const [qrBusy, setQrBusy] = useState(false);
  const [quickNotes, setQuickNotes] = useState(() => { try { return localStorage.getItem("grandLumenQuickNotes") || ""; } catch { return ""; } });
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const qrFileRef = useRef<HTMLInputElement>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const [mode, setMode] = useState<"document" | "object">("document");
  const [records, setRecords] = useState<ScanRecord[]>([]);
  const [selected, setSelected] = useState<ScanRecord | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraKind, setCameraKind] = useState<"document" | "object" | "photo" | "video">("document");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const refreshRecords = useCallback(async () => {
    try { setRecords(await readScanRecords()); } catch { setError("Local document storage is unavailable in this browser."); }
  }, []);

  useEffect(() => { void refreshRecords(); }, [refreshRecords]);

  useEffect(() => {
    try { localStorage.setItem("grandLumenQuickNotes", quickNotes); } catch { setError("Quick Notes could not be saved in this browser."); }
  }, [quickNotes]);

  useEffect(() => () => {
    voiceStreamRef.current?.getTracks().forEach(track => track.stop());
    if (voiceUrl) URL.revokeObjectURL(voiceUrl);
    if (studioMediaUrl) URL.revokeObjectURL(studioMediaUrl);
  }, [voiceUrl, studioMediaUrl]);

  useEffect(() => {
    if (selected?.kind === "object") {
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
    }
  }, [selected]);

  useEffect(() => {
    if (!cameraOn || !videoRef.current) return;
    let active = true;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: cameraFacing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: cameraKind === "video" }).then(stream => {
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
  }, [cameraOn, cameraKind, cameraFacing]);

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
    const capturedImage = await imageData(file);
    const record: ScanRecord = { id: crypto.randomUUID(), title: "Screenshot · " + new Date().toLocaleString(), text: "Screenshot captured. Choose Extract text to recognise any visible words, numbers or formulas.", createdAt: Date.now(), pageCount: 1, kind: "document", image: capturedImage, images: [capturedImage] };
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
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setCameraOn(false);
      await identifyObject(file);
      return;
    }
    if (cameraKind === "photo") {
      if (workspaceMode === "studio") {
        if (studioMediaUrl) URL.revokeObjectURL(studioMediaUrl);
        setStudioMediaUrl(URL.createObjectURL(file));
        setStudioMediaKind("photo");
        setCameraOn(false);
        setStatus("Photo captured. Preview or save it to your device.");
        return;
      }
      await saveScreenshot(file);
      setMode("document");
      setCameraOn(false);
      setOpen(true);
      return;
    }
    addFiles([file]);
    setCameraOn(false);
    setStatus("Page captured. Camera stopped; review the page and choose Recognise all pages when ready.");
  };

  const identifyObject = async (file: File) => {
    setBusy(true);
    setError("");
    setStatus("Loading object recognition model…");
    try {
      try {
        await tf.setBackend("webgl");
      } catch {
        await tf.setBackend("cpu");
      }
      await tf.ready();
      const model = await cocoSsd.load({ base: "lite_mobilenet_v2" });
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
      const capturedImage = await imageData(file);
      const record: ScanRecord = { id: crypto.randomUUID(), title: unique[0] ? "Object · " + unique[0] : "Unidentified object", text: description, createdAt: Date.now(), pageCount: 1, kind: "object", image: capturedImage, images: [capturedImage] };
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
      const pageImages = await Promise.all(files.map(file => imageData(file)));
      for (let index = 0; index < files.length; index += 1) {
        setStatus("Reading page " + (index + 1) + " of " + files.length + "…");
        const enhancedPage = await prepareOcrImage(files[index]);
        const result = await worker.recognize(enhancedPage);
        const recognisedText = result.data.text.replace(/\r/g, "").trim();
        pages.push("PAGE " + (index + 1) + "\n\n" + (recognisedText || "[No readable text detected on this page. The original page image is preserved above for review.]"));
      }
      const text = pages.join("\n\n--------------------------------\n\n");
      const record: ScanRecord = { id: crypto.randomUUID(), title: "Scanned document · " + new Date().toLocaleString(), text, createdAt: Date.now(), pageCount: files.length, kind: "document", image: pageImages[0], images: pageImages };
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
    setStatus("Choose the Grand-Lumen tab or screen to capture…");
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error("This browser does not support in-app screen capture. Use your device screenshot controls, then upload the image in Scan.");
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 1 }, audio: false });
      try {
        const track = stream.getVideoTracks()[0];
        if (!track) throw new Error("No screen was selected for capture.");
        const video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        await new Promise<void>((resolve, reject) => {
          video.onloadedmetadata = () => resolve();
          video.onerror = () => reject(new Error("The selected screen could not be opened."));
        });
        await video.play();
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        const width = video.videoWidth;
        const height = video.videoHeight;
        if (!width || !height) throw new Error("The selected screen has no capturable image.");
        const canvas = document.createElement("canvas");
        const scale = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Screenshot capture is unavailable in this browser.");
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
        if (!blob) throw new Error("The workspace screenshot could not be created.");
        await saveScreenshot(new File([blob], "Grand-Lumen-Screenshot-" + Date.now() + ".png", { type: "image/png" }));
        setMode("document");
        setOpen(true);
      } finally {
        stream.getTracks().forEach(track => track.stop());
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The workspace screenshot could not be captured.");
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

  const startCamera = (kind: "document" | "object" | "photo" | "video") => {
    setCameraKind(kind);
    setCameraOn(true);
    setError("");
    setOpen(true);
  };

  const openStudio = () => {
    if (studioMediaUrl) URL.revokeObjectURL(studioMediaUrl);
    setStudioMediaUrl("");
    setStudioMediaKind("");
    setWorkspaceMode("studio");
    setError("");
    setStatus("Choose photo or video capture to begin.");
    setCameraOn(false);
    setOpen(true);
  };

  const switchCamera = () => {
    if (recording) stopVideoRecording();
    setCameraFacing(current => current === "environment" ? "user" : "environment");
    setError("");
    setStatus("Switching camera…");
  };

  const startVoiceRecording = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("Voice recording is not supported by this browser.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceStreamRef.current = stream;
      voiceChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = event => { if (event.data.size) voiceChunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(voiceChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (voiceUrl) URL.revokeObjectURL(voiceUrl);
        setVoiceUrl(URL.createObjectURL(blob));
        setVoiceRecording(false);
        voiceStreamRef.current?.getTracks().forEach(track => track.stop());
        voiceStreamRef.current = null;
        setStatus("Voice recording ready. Play it back or save it.");
      };
      voiceRecorderRef.current = recorder;
      recorder.start();
      setVoiceRecording(true);
      setError("");
      setStatus("Voice recording in progress.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Microphone access was not granted.");
    }
  };

  const stopVoiceRecording = () => {
    if (voiceRecorderRef.current?.state === "recording") voiceRecorderRef.current.stop();
  };

  const saveVoiceRecording = () => {
    if (!voiceUrl) return;
    const anchor = document.createElement("a");
    anchor.href = voiceUrl;
    anchor.download = "Grand-Lumen-Voice-" + Date.now() + ".webm";
    anchor.click();
  };

  const scanQrImage = async (file: File) => {
    setQrBusy(true);
    setQrResult("");
    setError("");
    try {
      const Detector = (globalThis as unknown as { BarcodeDetector?: new (options?: { formats?: string[] }) => { detect: (source: ImageBitmap) => Promise<Array<{ rawValue: string; format: string }>> } }).BarcodeDetector;
      if (!Detector) throw new Error("QR decoding is not supported by this browser yet. Open this feature in a recent Chrome-based browser.");
      const bitmap = await createImageBitmap(file);
      const detector = new Detector({ formats: ["qr_code"] });
      const results = await detector.detect(bitmap);
      bitmap.close();
      if (!results.length) throw new Error("No QR code was found. Try a sharper, well-lit image with the full code visible.");
      setQrResult(results.map(item => item.rawValue).join("\n\n"));
      setStatus("QR code decoded inside Grand-Lumen.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The QR code could not be decoded.");
    } finally {
      setQrBusy(false);
    }
  };

  const saveEditedPhoto = async () => {
    if (!studioMediaUrl || studioMediaKind !== "photo") return;
    try {
      const image = new Image();
      image.src = studioMediaUrl;
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("The photo could not be opened for editing.")); });
      const sideways = Math.abs(photoRotation % 180) === 90;
      const canvas = document.createElement("canvas");
      canvas.width = sideways ? image.naturalHeight : image.naturalWidth;
      canvas.height = sideways ? image.naturalWidth : image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Photo editing is unavailable in this browser.");
      context.translate(canvas.width / 2, canvas.height / 2);
      context.rotate(photoRotation * Math.PI / 180);
      context.filter = "brightness(" + photoBrightness + "%) contrast(" + photoContrast + "%)";
      context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", .94));
      if (!blob) throw new Error("The edited photo could not be exported.");
      const anchor = document.createElement("a");
      anchor.href = URL.createObjectURL(blob);
      anchor.download = "Grand-Lumen-Edited-" + Date.now() + ".jpg";
      anchor.click();
      setStatus("Edited photo saved to your device.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Photo editing failed.");
    }
  };

  const startVideoRecording = () => {
    const stream = streamRef.current;
    if (!stream || typeof MediaRecorder === "undefined") {
      setError("Video recording is not supported by this browser.");
      return;
    }
    const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find(type => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    mediaChunksRef.current = [];
    recorder.ondataavailable = event => { if (event.data.size) mediaChunksRef.current.push(event.data); };
    recorder.onstop = () => {
      const blob = new Blob(mediaChunksRef.current, { type: recorder.mimeType || "video/webm" });
      setStudioMediaUrl(URL.createObjectURL(blob));
      setStudioMediaKind("video");
      setRecording(false);
      setCameraOn(false);
      setStatus("Video captured. Preview or save it to your device.");
    };
    mediaRecorderRef.current = recorder;
    recorder.start();
    setRecording(true);
    setStatus("Recording video. Select Stop recording when finished.");
  };

  const stopVideoRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
  };

  const saveStudioMedia = () => {
    if (!studioMediaUrl) return;
    const link = document.createElement("a");
    link.href = studioMediaUrl;
    link.download = studioMediaKind === "video" ? "Grand-Lumen-Creative-" + Date.now() + ".webm" : "Grand-Lumen-Creative-" + Date.now() + ".jpg";
    link.click();
  };

  return <>
    <FloatingScanIcon onScreenshot={captureScreen} onScan={() => { setWorkspaceMode("scan"); setMode("document"); setOpen(true); setError(""); }} onStudio={openStudio}/>
    {open && <div className="gl-scan-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) { if (recording) stopVideoRecording(); setOpen(false); setCameraOn(false); } }}>
      <section className="gl-scan-panel" role="dialog" aria-modal="true" aria-label={workspaceMode === "studio" ? "Creative Studio" : "Lumen Scan"}>
        <header className="gl-scan-header">
          <div><span className="gl-scan-kicker">{workspaceMode === "studio" ? <Clapperboard size={13}/> : <ScanLine size={13}/>} GRAND-LUMEN VISUAL INTELLIGENCE</span><h2>{workspaceMode === "studio" ? "Creative Studio" : "Lumen Scan"}</h2><p>{workspaceMode === "studio" ? "Capture photos and videos directly from your device camera." : "Capture, recognise, edit and keep visual information on this device."}</p></div>
          <button className="gl-scan-close" onClick={() => { if (!busy) { if (recording) stopVideoRecording(); setOpen(false); setCameraOn(false); } }} aria-label="Close Lumen Scan"><X size={19}/></button>
        </header>
        {workspaceMode === "studio" ? <div className="gl-studio-workspace">
          {!cameraOn && !studioMediaUrl && <div className="gl-studio-launch-grid">
            <button onClick={() => startCamera("photo")}><Aperture size={27}/><b>Take a picture</b><span>Capture a photo with your device camera.</span></button>
            <button onClick={() => setCameraFacing(current => current === "environment" ? "user" : "environment")}><FlipHorizontal size={27}/><b>Camera: {cameraFacing === "environment" ? "Back" : "Front"}</b><span>Choose which camera opens for your next capture.</span></button>
            <button onClick={() => startCamera("video")}><Video size={27}/><b>Record a video</b><span>Record a video with microphone audio when permission is granted.</span></button>
            <button onClick={() => void startVoiceRecording()} disabled={voiceRecording}><Mic size={27}/><b>Voice recorder</b><span>Record clear audio using your microphone.</span></button>
            <button onClick={() => qrFileRef.current?.click()}><QrCode size={27}/><b>QR scanner</b><span>Decode a QR image and show its content here.</span></button>
            <button onClick={() => setStatus("Quick Notes are ready below.")}><NotebookPen size={27}/><b>Quick Notes</b><span>Write and automatically save notes on this device.</span></button>
          </div>}
          <input ref={qrFileRef} type="file" accept="image/*" hidden onChange={event => { const file = event.target.files?.[0]; if (file) void scanQrImage(file); event.currentTarget.value = ""; }}/>
          {voiceRecording && <div className="gl-studio-audio-card"><span><MicOff size={17}/> Recording audio…</span><button className="gl-scan-primary" onClick={stopVoiceRecording}>Stop recording</button></div>}
          {voiceUrl && <div className="gl-studio-audio-card"><audio src={voiceUrl} controls/><button className="gl-scan-primary" onClick={saveVoiceRecording}><Download size={15}/> Save audio</button><button className="gl-scan-secondary" onClick={() => { URL.revokeObjectURL(voiceUrl); setVoiceUrl(""); }}>Discard</button></div>}
          {qrBusy && <div className="gl-scan-message">Decoding QR image…</div>}
          {qrResult && <div className="gl-studio-qr-result"><b>QR result</b><textarea readOnly value={qrResult}/><button className="gl-scan-secondary" onClick={() => void navigator.clipboard?.writeText(qrResult)}><Copy size={14}/> Copy result</button></div>}
          <div className="gl-studio-notes"><label htmlFor="gl-quick-notes">Quick Notes · saved automatically on this device</label><textarea id="gl-quick-notes" value={quickNotes} onChange={event => setQuickNotes(event.target.value)} placeholder="Write an idea, reminder or quick note…"/></div>
          {cameraOn && <div className={"gl-scan-camera-area" + (cameraExpanded ? " is-expanded" : "")}><video ref={videoRef} muted playsInline autoPlay/><div className="gl-scan-camera-actions"><button className="gl-scan-secondary" disabled={recording} onClick={switchCamera}><FlipHorizontal size={15}/> Switch to {cameraFacing === "environment" ? "front" : "back"}</button><button className="gl-scan-secondary" onClick={() => setCameraExpanded(value => !value)}>{cameraExpanded ? <Minimize2 size={15}/> : <Maximize2 size={15}/>} {cameraExpanded ? "Fit preview" : "Expand preview"}</button>{cameraKind === "video" ? recording ? <button className="gl-scan-primary" onClick={stopVideoRecording}>Stop recording</button> : <button className="gl-scan-primary" onClick={startVideoRecording}><Video size={16}/> Start recording</button> : <button className="gl-scan-primary" onClick={() => void captureCamera()}><Camera size={16}/> Take picture</button>}<button className="gl-scan-secondary" onClick={() => { if (recording) stopVideoRecording(); else setCameraOn(false); }}>Cancel</button></div></div>}
          {studioMediaUrl && <div className="gl-studio-preview">{studioMediaKind === "video" ? <video src={studioMediaUrl} controls playsInline/> : <><img src={studioMediaUrl} alt="Captured creative studio photo" style={{ transform: "rotate(" + photoRotation + "deg)", filter: "brightness(" + photoBrightness + "%) contrast(" + photoContrast + "%)" }}/><div className="gl-studio-edit-tools"><button className="gl-scan-secondary" onClick={() => setPhotoRotation(value => (value + 90) % 360)}><RotateCw size={14}/> Rotate</button><label><Sun size={14}/> Brightness <input type="range" min="50" max="160" value={photoBrightness} onChange={event => setPhotoBrightness(Number(event.target.value))}/></label><label>Contrast <input type="range" min="50" max="160" value={photoContrast} onChange={event => setPhotoContrast(Number(event.target.value))}/></label><button className="gl-scan-secondary" onClick={() => { setPhotoRotation(0); setPhotoBrightness(100); setPhotoContrast(100); }}>Reset edits</button></div></>}<div><button className="gl-scan-primary" onClick={studioMediaKind === "photo" ? () => void saveEditedPhoto() : saveStudioMedia}><Download size={15}/> Save {studioMediaKind === "photo" ? "edited photo" : "video"}</button><button className="gl-scan-secondary" onClick={() => { URL.revokeObjectURL(studioMediaUrl); setStudioMediaUrl(""); setStudioMediaKind(""); setPhotoRotation(0); setPhotoBrightness(100); setPhotoContrast(100); setStatus("Ready for another capture."); }}>New capture</button></div></div>}
          <p className="gl-scan-capability">Camera and microphone activate only after you choose a capture option. Recording is visible in the studio and stops when you finish or cancel.</p>
        </div> : <><div className="gl-scan-tabs">
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
            <button onClick={() => startCamera("photo")}><FileImage size={21}/><b>Capture photo</b><span>Take a page photo for document recognition</span></button>
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
        </>}
        {(status || error) && <div className={error ? "gl-scan-message is-error" : "gl-scan-message"} role="alert">{error || status}</div>}
        {selected && <div className="gl-scan-result" ref={resultRef}>
          <div className="gl-scan-result-heading"><div><span>RECOGNISED CONTENT</span><h3>{selected.title}</h3><small>{selected.pageCount} page{selected.pageCount === 1 ? "" : "s"} · {new Date(selected.createdAt).toLocaleString()}</small></div><button onClick={() => setSelected(null)} aria-label="Close result"><X size={16}/></button></div>
          {(selected.images?.length ? selected.images : selected.image ? [selected.image] : []).length > 0 && <div className="gl-scan-preview-list">{(selected.images?.length ? selected.images : selected.image ? [selected.image] : []).map((image,index) => <figure key={selected.id + "-page-" + index}><img className="gl-scan-preview" src={image} alt={"Original scanned page " + (index + 1)}/><figcaption>{selected.kind === "object" ? "Original object photo" : "Original page " + (index + 1)}</figcaption></figure>)}</div>}
          <textarea value={selected.text} onChange={event => updateSelectedText(event.target.value)} aria-label="Edit recognised text"/>
          <div className="gl-scan-result-actions">
            <button onClick={() => void navigator.clipboard?.writeText(selected.text)}><Copy size={14}/> Copy</button>
            {selected.image && <button onClick={() => { const link = document.createElement("a"); link.href = selected.image || ""; link.download = "Lumen-Screenshot-" + selected.id.slice(0, 8) + ".png"; link.click(); }}><Download size={14}/> Image</button>}
            {selected.image && selected.text.startsWith("Screenshot captured") && <><button onClick={() => { const blob = selected.image ? fetch(selected.image).then(response => response.blob()) : Promise.resolve(new Blob()); void blob.then(value => { addFiles([new File([value], "Lumen-Screenshot.png", { type: value.type || "image/png" })]); setSelected(null); setMode("document"); }); }}><ScanLine size={14}/> Extract text</button><button onClick={() => { setWorkspaceMode("studio"); setStudioMediaUrl(selected.image || ""); setStudioMediaKind("photo"); setPhotoRotation(0); setPhotoBrightness(100); setPhotoContrast(100); }}><Aperture size={14}/> Edit screenshot</button></>}
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
