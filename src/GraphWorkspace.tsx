import { useMemo, useState } from "react";
import { Activity, Download, Plus, RotateCcw, Table2, TrendingUp } from "lucide-react";

type Point = { x: number; y: number };
type Mode = "function" | "data";
type Preset = { name: string; equation: string; xLabel: string; yLabel: string; description: string };

const presets: Preset[] = [
  { name: "Uniform motion", equation: "2*x + 1", xLabel: "Time (s)", yLabel: "Displacement (m)", description: "Displacement against time. The gradient represents velocity." },
  { name: "Acceleration", equation: "0.5*2*x^2", xLabel: "Time (s)", yLabel: "Displacement (m)", description: "A quadratic displacement-time model for constant acceleration." },
  { name: "Ohm's law", equation: "5*x", xLabel: "Current (A)", yLabel: "Voltage (V)", description: "Voltage against current. The gradient represents resistance." },
  { name: "Hooke's law", equation: "12*x", xLabel: "Extension (m)", yLabel: "Force (N)", description: "Force against extension. The gradient represents the spring constant." },
  { name: "Radioactive decay", equation: "100*e^(-0.2*x)", xLabel: "Time", yLabel: "Remaining quantity", description: "An exponential decay model." },
  { name: "Simple harmonic motion", equation: "3*cos(2*pi*x)", xLabel: "Time (s)", yLabel: "Displacement (m)", description: "A cosine model. Trigonometric functions use degrees only when DEG mode is selected." },
  { name: "Velocity and time", equation: "3*x", xLabel: "Time (s)", yLabel: "Velocity (m/s)", description: "The gradient represents acceleration." },
  { name: "Boyle law", equation: "100/x", xLabel: "Volume", yLabel: "Pressure", description: "An inverse relationship at constant temperature." },
  { name: "Inverse square law", equation: "1/x^2", xLabel: "Distance", yLabel: "Relative intensity", description: "A common inverse-square relationship." },
  { name: "Wave profile", equation: "sin(2*pi*x)", xLabel: "Position", yLabel: "Amplitude", description: "A periodic wave profile." },
  { name: "Charles law", equation: "2*x", xLabel: "Absolute temperature (K)", yLabel: "Volume", description: "Volume is proportional to absolute temperature at constant pressure." }
];

function evaluateGraphExpression(source: string, x: number, angleUnit: "DEG" | "RAD"): number {
  const tokens = source.toLowerCase().replace(/\s+/g, "").match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[a-z]+|[()+\-*/%^!,]/g) || [];
  if (!tokens.length || tokens.join("") !== source.toLowerCase().replace(/\s+/g, "")) throw new Error("Use a valid mathematical expression.");
  let position = 0;
  const peek = () => tokens[position];
  const take = () => tokens[position++];
  const angle = (value: number) => angleUnit === "DEG" ? value * Math.PI / 180 : value;
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
    if (/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/.test(token)) return Number(token);
    if (token === "x") return x;
    if (token === "pi") return Math.PI;
    if (token === "e") return Math.E;
    const functions: Record<string, (v: number) => number> = {
      sin: v => Math.sin(angle(v)),
      cos: v => Math.cos(angle(v)),
      tan: v => Math.tan(angle(v)),
      asin: v => angleUnit === "DEG" ? Math.asin(v) * 180 / Math.PI : Math.asin(v),
      acos: v => angleUnit === "DEG" ? Math.acos(v) * 180 / Math.PI : Math.acos(v),
      atan: v => angleUnit === "DEG" ? Math.atan(v) * 180 / Math.PI : Math.atan(v),
      sqrt: Math.sqrt,
      abs: Math.abs,
      ln: Math.log,
      log: Math.log10,
      exp: Math.exp,
      floor: Math.floor,
      ceil: Math.ceil
    };
    if (functions[token]) {
      if (take() !== "(") throw new Error("Add brackets after " + token + ".");
      const value = addition();
      if (take() !== ")") throw new Error("Missing closing bracket.");
      return functions[token](value);
    }
    throw new Error("Unknown symbol: " + token);
  };
  const power = (): number => {
    let value = primary();
    if (peek() === "!") {
      take();
      if (!Number.isInteger(value) || value < 0 || value > 170) throw new Error("Factorial requires a whole number from 0 to 170.");
      let result = 1;
      for (let i = 2; i <= value; i += 1) result *= i;
      value = result;
    }
    if (peek() === "^") {
      take();
      value = Math.pow(value, power());
    }
    return value;
  };
  const multiplication = (): number => {
    let value = power();
    while (["*", "/", "%"].includes(peek() || "")) {
      const operator = take();
      const next = power();
      value = operator === "*" ? value * next : operator === "/" ? value / next : value % next;
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
  return result;
}

function parseRows(value: string): Point[] {
  return value.split(/[\n;]+/).map(line => line.trim()).filter(Boolean).map(line => {
    const parts = line.split(/[\s,]+/).filter(Boolean);
    if (parts.length < 2) throw new Error("Each data row needs an x value and a y value.");
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("Every coordinate must be a finite number.");
    return { x, y };
  });
}

function regression(points: Point[]) {
  if (points.length < 2) return null;
  const meanX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const meanY = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  const denominator = points.reduce((sum, p) => sum + (p.x - meanX) ** 2, 0);
  if (!denominator) return null;
  const slope = points.reduce((sum, p) => sum + (p.x - meanX) * (p.y - meanY), 0) / denominator;
  const intercept = meanY - slope * meanX;
  const total = points.reduce((sum, p) => sum + (p.y - meanY) ** 2, 0);
  const residual = points.reduce((sum, p) => sum + (p.y - (slope * p.x + intercept)) ** 2, 0);
  return { slope, intercept, r2: total === 0 ? 1 : 1 - residual / total };
}

export default function GraphWorkspace() {
  const [mode, setMode] = useState<Mode>("function");
  const [equation, setEquation] = useState("x^2 - 4");
  const [dataText, setDataText] = useState("0, 0\n1, 2\n2, 4\n3, 6\n4, 8");
  const [xMin, setXMin] = useState("-5");
  const [xMax, setXMax] = useState("5");
  const [yMin, setYMin] = useState("-5");
  const [yMax, setYMax] = useState("10");
  const [xLabel, setXLabel] = useState("x");
  const [yLabel, setYLabel] = useState("y");
  const [angleUnit, setAngleUnit] = useState<"DEG" | "RAD">("RAD");
  const [showFit, setShowFit] = useState(true);
  const [error, setError] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("");
  const [sampleX, setSampleX] = useState("2");
  const [sampleResult, setSampleResult] = useState<number | null>(null);
  const [functionAnalysis, setFunctionAnalysis] = useState<{ derivative: number; integral: number; roots: number[] } | null>(null);

  const bounds = useMemo(() => {
    const values = [Number(xMin), Number(xMax), Number(yMin), Number(yMax)];
    if (values.some(v => !Number.isFinite(v)) || values[0] >= values[1] || values[2] >= values[3]) return null;
    return { xMin: values[0], xMax: values[1], yMin: values[2], yMax: values[3] };
  }, [xMin, xMax, yMin, yMax]);

  const points = useMemo(() => {
    if (mode !== "data") return [];
    try { return parseRows(dataText); } catch { return []; }
  }, [dataText, mode]);

  const fit = useMemo(() => regression(points), [points]);

  const curve = useMemo(() => {
    if (mode !== "function" || !bounds) return [];
    const values: { x: number; y: number }[] = [];
    for (let i = 0; i <= 500; i += 1) {
      const x = bounds.xMin + (bounds.xMax - bounds.xMin) * i / 500;
      try {
        const y = evaluateGraphExpression(equation, x, angleUnit);
        values.push(Number.isFinite(y) && Math.abs(y) < 1e8 ? { x, y } : { x, y: NaN });
      } catch {
        return [];
      }
    }
    return values;
  }, [angleUnit, bounds, equation, mode]);

  const plotPoints = mode === "data" ? points : [];
  const fitLine = mode === "data" && fit && bounds ? [
    { x: bounds.xMin, y: fit.slope * bounds.xMin + fit.intercept },
    { x: bounds.xMax, y: fit.slope * bounds.xMax + fit.intercept }
  ] : [];

  const width = 900;
  const height = 520;
  const left = 76;
  const right = 24;
  const top = 24;
  const bottom = 62;
  const sx = (x: number) => left + ((x - (bounds?.xMin ?? -5)) / ((bounds?.xMax ?? 5) - (bounds?.xMin ?? -5))) * (width - left - right);
  const sy = (y: number) => top + (1 - ((y - (bounds?.yMin ?? -5)) / ((bounds?.yMax ?? 10) - (bounds?.yMin ?? -5)))) * (height - top - bottom);
  const tickValues = (min: number, max: number) => Array.from({ length: 9 }, (_, i) => min + (max - min) * i / 8);
  const path = curve.reduce((acc, point, index) => {
    if (!Number.isFinite(point.y) || !bounds || point.y < bounds.yMin - (bounds.yMax - bounds.yMin) * 4 || point.y > bounds.yMax + (bounds.yMax - bounds.yMin) * 4) return acc + " ";
    return acc + (index === 0 || !Number.isFinite(curve[index - 1]?.y) ? "M" : "L") + sx(point.x).toFixed(2) + "," + sy(point.y).toFixed(2) + " ";
  }, "");
  const pointPath = plotPoints.map(p => ({ ...p, cx: sx(p.x), cy: sy(p.y) }));
  const fitPath = fitLine.length ? "M" + fitLine.map(p => sx(p.x).toFixed(2) + "," + sy(p.y).toFixed(2)).join(" L") : "";

  const applyPreset = (name: string) => {
    const preset = presets.find(item => item.name === name);
    if (!preset) return;
    setSelectedPreset(name);
    setMode("function");
    setEquation(preset.equation);
    setXLabel(preset.xLabel);
    setYLabel(preset.yLabel);
    setError("");
  };

  const solveAtX = () => {
    try {
      const at = Number(sampleX);
      if (!Number.isFinite(at)) throw new Error("Enter a valid x-coordinate.");
      const value = evaluateGraphExpression(equation, at, angleUnit);
      if (!Number.isFinite(value)) throw new Error("The result is outside the real finite range.");
      const h = Math.max(0.000001, Math.abs(at) * 0.000001);
      const derivative = (evaluateGraphExpression(equation, at + h, angleUnit) - evaluateGraphExpression(equation, at - h, angleUnit)) / (2 * h);
      const lower = bounds?.xMin ?? -5;
      const upper = bounds?.xMax ?? 5;
      const slices = 1000;
      const dx = (upper - lower) / slices;
      let integral = 0;
      for (let i = 0; i <= slices; i += 1) {
        const y = evaluateGraphExpression(equation, lower + i * dx, angleUnit);
        if (!Number.isFinite(y)) throw new Error("The integral crosses a point where the function is undefined.");
        integral += (i === 0 || i === slices ? 0.5 : 1) * y * dx;
      }
      const roots: number[] = [];
      let previousX = lower;
      let previousY = evaluateGraphExpression(equation, previousX, angleUnit);
      for (let i = 1; i <= slices; i += 1) {
        const currentX = lower + i * dx;
        const currentY = evaluateGraphExpression(equation, currentX, angleUnit);
        if (Number.isFinite(previousY) && Number.isFinite(currentY)) {
          if (Math.abs(previousY) < 1e-8) roots.push(previousX);
          if (previousY * currentY < 0) {
            let left = previousX;
            let right = currentX;
            for (let iteration = 0; iteration < 45; iteration += 1) {
              const middle = (left + right) / 2;
              const middleY = evaluateGraphExpression(equation, middle, angleUnit);
              const leftY = evaluateGraphExpression(equation, left, angleUnit);
              if (leftY * middleY <= 0) right = middle;
              else left = middle;
            }
            roots.push((left + right) / 2);
          }
        }
        previousX = currentX;
        previousY = currentY;
      }
      setSampleResult(value);
      setFunctionAnalysis({ derivative, integral, roots: roots.filter((root, index) => index === 0 || Math.abs(root - roots[index - 1]) > 1e-4).slice(0, 12) });
      setError("");
    } catch (reason) {
      setSampleResult(null);
      setFunctionAnalysis(null);
      setError(reason instanceof Error ? reason.message : "Unable to evaluate this function.");
    }
  };

  const exportCsv = () => {
    const rows = mode === "data" ? points : curve.filter(p => Number.isFinite(p.y));
    const csv = "x,y\n" + rows.map(p => p.x + "," + p.y).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "grand-lumen-graph-data.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return <div className="gl-graph">
    <div className="gl-graph-head"><div><span className="eyebrow">LUMEN GRAPH STUDIO</span><h3>Mathematics & science graph solver</h3><p>Plot equations, analyse experimental data, calculate gradients and compare relationships.</p></div><button className="quiet-button" onClick={exportCsv}><Download size={15}/> Export CSV</button></div>
    <div className="gl-graph-tabs"><button className={mode === "function" ? "active" : ""} onClick={() => { setMode("function"); setError(""); }}><Activity size={15}/> Function plot</button><button className={mode === "data" ? "active" : ""} onClick={() => { setMode("data"); setError(""); }}><Table2 size={15}/> Experimental data</button></div>
    <div className="gl-graph-presets"><span>SCIENCE STARTERS</span>{presets.map(p => <button key={p.name} className={selectedPreset === p.name ? "selected" : ""} onClick={() => applyPreset(p.name)}>{p.name}</button>)}</div>
    <div className="gl-graph-layout">
      <div className="gl-graph-controls">
        {mode === "function" ? <label>Function <span>Use x as the independent variable</span><input value={equation} onChange={e => setEquation(e.target.value)} placeholder="e.g. 2*x^2 - 3*x + 1"/></label> : <label>Coordinate data <span>Enter x,y pairs separated by commas or new lines</span><textarea value={dataText} onChange={e => setDataText(e.target.value)} rows={8}/></label>}
        <div className="gl-graph-field-grid"><label>X minimum<input value={xMin} onChange={e => setXMin(e.target.value)}/></label><label>X maximum<input value={xMax} onChange={e => setXMax(e.target.value)}/></label><label>Y minimum<input value={yMin} onChange={e => setYMin(e.target.value)}/></label><label>Y maximum<input value={yMax} onChange={e => setYMax(e.target.value)}/></label></div>
        <div className="gl-graph-field-grid"><label>X-axis label<input value={xLabel} onChange={e => setXLabel(e.target.value)}/></label><label>Y-axis label<input value={yLabel} onChange={e => setYLabel(e.target.value)}/></label></div>
        {mode === "function" && <><label>Angle unit<select value={angleUnit} onChange={e => setAngleUnit(e.target.value as "DEG" | "RAD")}><option value="RAD">Radians</option><option value="DEG">Degrees</option></select></label><label>Evaluate at x<input value={sampleX} onChange={e => setSampleX(e.target.value)} inputMode="decimal"/></label><button className="solid-button" onClick={solveAtX}>Calculate y value</button>{sampleResult !== null && functionAnalysis && <div className="gl-graph-result"><span>FUNCTION ANALYSIS AT x = {sampleX}</span><b>y = {Number(sampleResult.toPrecision(8))}</b><span>Numerical gradient / derivative: {Number(functionAnalysis.derivative.toPrecision(7))}</span><span>Definite integral over [{xMin}, {xMax}]: {Number(functionAnalysis.integral.toPrecision(7))}</span><span>Approximate real roots in range: {functionAnalysis.roots.length ? functionAnalysis.roots.map(root => Number(root.toPrecision(6))).join(", ") : "No sign-changing roots detected"}</span></div>}</>}
        {mode === "data" && <><label className="gl-graph-check"><input type="checkbox" checked={showFit} onChange={e => setShowFit(e.target.checked)}/> Show line of best fit</label>{fit && showFit && <div className="gl-graph-result"><span>LINEAR REGRESSION</span><b>y = {Number(fit.slope.toPrecision(6))}x {fit.intercept < 0 ? "−" : "+"} {Math.abs(Number(fit.intercept.toPrecision(6)))}</b><span>Gradient: {Number(fit.slope.toPrecision(6))} · R²: {Number(fit.r2.toPrecision(5))}</span></div>}</>}
        {error && <p className="error-text">{error}</p>}
        {!bounds && <p className="error-text">Enter valid minimum and maximum values. Each minimum must be smaller than its maximum.</p>}
        {mode === "data" && <button className="quiet-button" onClick={() => setDataText(current => current + (current.trim() ? "\n" : "") + "5, 10")}><Plus size={14}/> Add sample row</button>}
        <button className="quiet-button" onClick={() => { setEquation("x^2 - 4"); setDataText("0, 0\n1, 2\n2, 4\n3, 6\n4, 8"); setXMin("-5"); setXMax("5"); setYMin("-5"); setYMax("10"); setXLabel("x"); setYLabel("y"); setSelectedPreset(""); setSampleResult(null); setFunctionAnalysis(null); setError(""); }}><RotateCcw size={14}/> Reset graph</button>
      </div>
      <div className="gl-graph-visual">
        <div className="gl-graph-visual-head"><b>{mode === "function" ? "FUNCTION GRAPH" : "DATA PLOT"}</b><span>{mode === "function" ? "y = " + equation : points.length + " data points"}</span></div>
        {mode === "function" && !curve.length && <div className="gl-graph-notice">Enter a valid function to display its curve.</div>}
        {mode === "data" && !points.length && <div className="gl-graph-notice">Enter coordinate pairs to plot your experiment.</div>}
        <svg className="gl-graph-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Cartesian graph">
          {bounds && <>
            {tickValues(bounds.xMin, bounds.xMax).map((v, i) => <g key={"x" + i}><line x1={sx(v)} x2={sx(v)} y1={top} y2={height - bottom} className="gl-grid-line"/><text x={sx(v)} y={height - bottom + 22} className="gl-axis-tick" textAnchor="middle">{Number(v.toPrecision(4))}</text></g>)}
            {tickValues(bounds.yMin, bounds.yMax).map((v, i) => <g key={"y" + i}><line x1={left} x2={width - right} y1={sy(v)} y2={sy(v)} className="gl-grid-line"/><text x={left - 12} y={sy(v) + 4} className="gl-axis-tick" textAnchor="end">{Number(v.toPrecision(4))}</text></g>)}
            {bounds.xMin <= 0 && bounds.xMax >= 0 && <line x1={sx(0)} x2={sx(0)} y1={top} y2={height - bottom} className="gl-axis-line"/>}
            {bounds.yMin <= 0 && bounds.yMax >= 0 && <line x1={left} x2={width - right} y1={sy(0)} y2={sy(0)} className="gl-axis-line"/>}
            {mode === "function" && <path d={path} className="gl-function-line"/>}
            {mode === "data" && showFit && <path d={fitPath} className="gl-fit-line"/>}
            {pointPath.map((p, i) => <g key={i}><circle cx={p.cx} cy={p.cy} r="6" className="gl-data-point"/><text x={p.cx + 9} y={p.cy - 9} className="gl-point-label">({p.x}, {p.y})</text></g>)}
            <text x={(left + width - right) / 2} y={height - 12} className="gl-axis-label" textAnchor="middle">{xLabel}</text>
            <text x="18" y={(top + height - bottom) / 2} className="gl-axis-label" textAnchor="middle" transform={`rotate(-90 18 ${(top + height - bottom) / 2})`}>{yLabel}</text>
          </>}
        </svg>
        {mode === "data" && fit && <div className="gl-graph-analysis"><span><TrendingUp size={14}/> Gradient / rate of change: <b>{Number(fit.slope.toPrecision(6))}</b></span><span>Y-intercept: <b>{Number(fit.intercept.toPrecision(6))}</b></span><span>Coefficient of determination: <b>{Number(fit.r2.toPrecision(5))}</b></span></div>}
        {mode === "function" && <p className="gl-graph-footnote">Supported: polynomial expressions, fractions, powers, roots, trigonometric and inverse trigonometric functions, logarithms, exponentials and absolute values. Trigonometric units follow the selected angle mode.</p>}
      </div>
    </div>
  </div>;
}
