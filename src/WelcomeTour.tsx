import { useEffect, useRef, useState } from "react";
import { ArrowRight, Sparkles, X } from "lucide-react";

type WelcomeTourProps = {
  name: string;
  onComplete: () => void;
};

const tourSteps = [
  { title: "Your Home dashboard", description: "Start here for a quick view of Grand-Lumen, featured spaces, useful shortcuts and a direct route into discovery." },
  { title: "Search", description: "Find knowledge and technology discussions from connected sources, then save or share useful results." },
  { title: "Research", description: "Explore topics through readable explanations, collect useful findings and keep your own research notes." },
  { title: "News", description: "Explore current headlines and reports from publishers around the world." },
  { title: "Images", description: "Discover visual references from public image collections and save useful finds." },
  { title: "Videos", description: "Search public video collections and preview available videos inside your workspace." },
  { title: "Maps", description: "Search places, explore maps and request your device location when you choose." },
  { title: "Code Lab", description: "Create and edit projects with a code editor, project files, terminal tools and live previews." },
  { title: "Learn", description: "Build practical skills with guided courses, lessons, examples and practice activities." },
  { title: "API Library", description: "Discover APIs and developer services that can power features in your own projects." },
  { title: "Tools", description: "Use the calculator, graph studio, dictionary, weather, currency, Pokédex, holidays and reminders." },
  { title: "Scanner", description: "Use your device camera to scan supported QR codes and barcodes." },
  { title: "Share", description: "Transfer links, files, images, videos, research and code between connected devices." },
  { title: "Messages", description: "Find guidance and answers about using Grand-Lumen." },
  { title: "Team", description: "Connect with other members, manage invitations and collaborate in shared workspaces." },
  { title: "Saved", description: "Keep useful search discoveries together in your personal knowledge vault." },
  { title: "Activity Digest", description: "Review your workspace activity and create summaries of your progress." },
  { title: "Projects", description: "Organise ideas and keep track of the projects you are developing." },
  { title: "Creative Studio", description: "Work with photographs and video clips using the available creative editing tools." },
  { title: "Lumen Hub", description: "Explore the connected digital utility platform and its additional workspace experiences." },
  { title: "Settings", description: "Personalise your profile, display, language, theme, workspace data and account preferences." }
];

export default function WelcomeTour({ name, onComplete }: WelcomeTourProps) {
  const [step, setStep] = useState(-1);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);
  const [visibleText, setVisibleText] = useState(false);
  const total = tourSteps.length + 1;
  const current = step < 0
    ? { title: "Welcome to Grand-Lumen", description: `Welcome, ${name || "explorer"}. Your workspace is ready. Here's a quick introduction to help you find your way around.` }
    : tourSteps[step];

  useEffect(() => {
    setVisibleText(false);
    const reveal = window.setTimeout(() => setVisibleText(true), 80);
    const advance = window.setTimeout(() => {
      if (step < tourSteps.length - 1) setStep(value => value + 1);
      else onCompleteRef.current();
    }, 5200);
    return () => {
      window.clearTimeout(reveal);
      window.clearTimeout(advance);
    };
  }, [step]);

  const next = () => {
    if (step < tourSteps.length - 1) setStep(value => value + 1);
    else onCompleteRef.current();
  };

  return (
    <div className="gl-welcome-tour-layer" aria-live="polite">
      <section className="gl-welcome-tour" aria-label="Grand-Lumen welcome and feature tour">
        <div className="gl-welcome-tour-topline">
          <span><Sparkles size={14} /> GRAND-LUMEN GUIDE</span>
          <button type="button" onClick={onComplete} aria-label="Close introduction" title="Close introduction"><X size={17} /></button>
        </div>
        <div className="gl-welcome-tour-copy" key={step}>
          <span className="gl-welcome-tour-count">{step < 0 ? "WELCOME" : `FEATURE ${String(step + 1).padStart(2, "0")} OF ${tourSteps.length}`}</span>
          <h2 className={visibleText ? "is-visible" : ""}>{current.title}</h2>
          <p className={visibleText ? "is-visible" : ""}>{current.description}</p>
        </div>
        <div className="gl-welcome-tour-footer">
          <div className="gl-welcome-tour-progress" aria-label={`Introduction ${step + 2} of ${total}`}>
            <span style={{ width: `${((step + 2) / total) * 100}%` }} />
          </div>
          <div className="gl-welcome-tour-actions">
            <span>{step < 0 ? "A quick guided tour" : `${step + 2} / ${total}`}</span>
            <button type="button" onClick={next}>{step === tourSteps.length - 1 ? "Finish" : "Next"} <ArrowRight size={14} /></button>
          </div>
        </div>
      </section>
    </div>
  );
}
