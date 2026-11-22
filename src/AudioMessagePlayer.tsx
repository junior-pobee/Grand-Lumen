import { useRef, useState } from "react";
import { Pause, Play, Volume2 } from "lucide-react";

export default function AudioMessagePlayer({ src, name }: { src: string; name: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  const formatTime = (value: number) => {
    if (!Number.isFinite(value)) return "0:00";
    const minutes = Math.floor(value / 60);
    const seconds = Math.floor(value % 60).toString().padStart(2, "0");
    return minutes + ":" + seconds;
  };

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  return <div style={{ width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box", display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderRadius: 14, background: "var(--surface, rgba(255,255,255,.07))", overflow: "hidden" }}>
    <audio ref={audioRef} src={src} preload="metadata" onLoadedMetadata={event => setDuration(event.currentTarget.duration || 0)} onTimeUpdate={event => setCurrent(event.currentTarget.currentTime)} onEnded={() => setPlaying(false)} onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} />
    <button type="button" onClick={() => void togglePlayback()} aria-label={playing ? "Pause audio" : "Play audio"} style={{ flex: "0 0 42px", width: 42, height: 42, border: 0, borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--accent, #3988d8)", color: "#fff" }}>
      {playing ? <Pause size={19}/> : <Play size={19}/>}
    </button>
    <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <Volume2 size={15} style={{ flex: "0 0 auto", opacity: .75 }}/>
        <span style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name || "Voice message"}</span>
      </div>
      <input aria-label="Audio playback position" type="range" min={0} max={duration || 0} step={0.1} value={Math.min(current, duration || 0)} onChange={event => { const value = Number(event.target.value); if (audioRef.current) audioRef.current.currentTime = value; setCurrent(value); }} style={{ width: "100%", minWidth: 0, margin: 0, accentColor: "var(--accent, #3988d8)" }}/>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, opacity: .72, fontVariantNumeric: "tabular-nums" }}>
        <span>{formatTime(current)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  </div>;
}
