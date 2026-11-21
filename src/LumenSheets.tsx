import { useEffect, useMemo, useRef, useState } from "react";
import ExcelJS from "exceljs";
import { supabase } from "./auth";

type Workbook = { id: string; owner_id: string; name: string; description: string; updated_at: string };
type Sheet = { id: string; workbook_id: string; name: string; position: number };
type Cell = { id?: string; sheet_id: string; cell_ref: string; value: string; formula: string | null; format: Record<string, unknown>; updated_by: string };
type StoredBook = { workbook: Workbook; sheets: Sheet[]; cells: Record<string, Record<string, Cell>> };
type SharedBook = { token: string; workbook_data: StoredBook; owner_id: string };

function columnName(index: number) { let value = index + 1; let name = ""; while (value > 0) { value -= 1; name = String.fromCharCode(65 + value % 26) + name; value = Math.floor(value / 26); } return name; }
const storageKey = (userId: string) => "grandLumenLocalSheets:" + userId;

function columnIndex(ref: string) {
  let value = 0;
  for (const char of ref.match(/^[A-Z]+/)?.[0] || "") value = value * 26 + char.charCodeAt(0) - 64;
  return value - 1;
}

function cellRef(row: number, column: number) { return columnName(column) + row; }

function evaluateFormula(source: string, cells: Record<string, Cell>, stack = new Set<string>()): string {
  const expression = source.trim().replace(/^=/, "");
  const resolve = (ref: string): number => {
    const key = ref.toUpperCase();
    if (stack.has(key)) throw new Error("Circular formula reference.");
    const cell = cells[key];
    if (!cell) return 0;
    if (cell.formula) {
      const next = new Set(stack);
      next.add(key);
      const result = Number(evaluateFormula(cell.formula, cells, next));
      if (!Number.isFinite(result)) throw new Error("Invalid referenced value.");
      return result;
    }
    const value = Number(cell.value);
    return cell.value.trim() === "" || !Number.isFinite(value) ? 0 : value;
  };
  const rangeValues = (range: string): number[] => {
    const match = range.toUpperCase().match(/^([A-Z]+[1-9][0-9]*):([A-Z]+[1-9][0-9]*)$/);
    if (!match) throw new Error("Invalid cell range.");
    const startCol = columnIndex(match[1]);
    const endCol = columnIndex(match[2]);
    const startRow = Number(match[1].match(/[0-9]+/)?.[0]);
    const endRow = Number(match[2].match(/[0-9]+/)?.[0]);
    const values: number[] = [];
    for (let row = Math.min(startRow, endRow); row <= Math.max(startRow, endRow); row += 1) {
      for (let col = Math.min(startCol, endCol); col <= Math.max(startCol, endCol); col += 1) values.push(resolve(cellRef(row, col)));
    }
    return values;
  };
  const fn = expression.match(/^(SUM|AVERAGE|MIN|MAX|COUNT|COUNTA|ABS|ROUND|SQRT|POWER)\((.*)\)$/i);
  if (fn) {
    const kind = fn[1].toUpperCase();
    const args = fn[2].split(",").map(value => value.trim());
    if (["SUM", "AVERAGE", "MIN", "MAX", "COUNT", "COUNTA"].includes(kind)) {
      const values = args.flatMap(arg => /^[A-Z]+[1-9][0-9]*:[A-Z]+[1-9][0-9]*$/i.test(arg) ? rangeValues(arg) : [resolve(arg.toUpperCase())]);
      const result = kind === "SUM" ? values.reduce((a, b) => a + b, 0) : kind === "AVERAGE" ? values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0 : kind === "MIN" ? Math.min(...values) : kind === "MAX" ? Math.max(...values) : values.length;
      return String(result);
    }
    const numbers = args.map(arg => Number(arg.replace(/^([A-Z]+[1-9][0-9]*)$/i, ref => String(resolve(ref)))));
    const result = kind === "ABS" ? Math.abs(numbers[0]) : kind === "ROUND" ? Number(numbers[0].toFixed(Math.max(0, Math.min(10, numbers[1] || 0)))) : kind === "SQRT" ? Math.sqrt(numbers[0]) : Math.pow(numbers[0], numbers[1]);
    if (!Number.isFinite(result)) throw new Error("Formula result is not a finite number.");
    return String(result);
  }
  const arithmetic = expression.replace(/\b([A-Z]{1,3}[1-9][0-9]*)\b/gi, (_, ref: string) => String(resolve(ref)));
  if (!/^[0-9+*/().%\s-]+$/.test(arithmetic)) throw new Error("Supported formulas: cell arithmetic, SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, ABS, ROUND, SQRT and POWER.");
  const tokens = arithmetic.match(/\d+(?:\.\d+)?|[()+*/%-]/g) || [];
  let index = 0;
  const primary = (): number => {
    const token = tokens[index++];
    if (token === "(") { const value = add(); if (tokens[index++] !== ")") throw new Error("Missing closing bracket."); return value; }
    if (token === "-") return -primary();
    if (token === "+") return primary();
    const number = Number(token);
    if (!Number.isFinite(number)) throw new Error("Invalid formula.");
    return number;
  };
  const multiply = (): number => { let value = primary(); while (["*", "/", "%"].includes(tokens[index])) { const op = tokens[index++]; const right = primary(); value = op === "*" ? value * right : op === "/" ? value / right : value % right; } return value; };
  const add = (): number => { let value = multiply(); while (["+", "-"].includes(tokens[index])) { const op = tokens[index++]; const right = multiply(); value = op === "+" ? value + right : value - right; } return value; };
  const result = add();
  if (index !== tokens.length || !Number.isFinite(result)) throw new Error("Formula could not be evaluated.");
  return String(result);
}

function parseCsv(source: string): string[][] {
  const delimiter = source.split(/\r?\n/, 1)[0]?.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === '"' && quoted && source[i + 1] === '"') { value += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) { row.push(value); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(value); rows.push(row); row = []; value = "";
    } else value += char;
  }
  if (value.length || row.length) { row.push(value); rows.push(row); }
  return rows;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function LumenSheets({ userId }: { userId: string }) {
  const [workbooks, setWorkbooks] = useState<Workbook[]>([]);
  const [workbook, setWorkbook] = useState<Workbook | null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [cells, setCells] = useState<Record<string, Cell>>({});
  const [selected, setSelected] = useState("A1");
  const [input, setInput] = useState("");
  const [newName, setNewName] = useState("");
  const [notice, setNotice] = useState("");
  const [rowCount, setRowCount] = useState(30);
  const [columnCount, setColumnCount] = useState(12);
  const [rowDraft, setRowDraft] = useState("30");
  const [columnDraft, setColumnDraft] = useState("12");
  const [expanded, setExpanded] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [scrollTop, setScrollTop] = useState(0);\n  const [scrollLeft, setScrollLeft] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const importExcelRef = useRef<HTMLInputElement>(null);
  const importCsvRef = useRef<HTMLInputElement>(null);
  const columns = useMemo(() => Array.from({ length: columnCount }, (_, index) => columnName(index)), [columnCount]);
  const firstVisibleRow = Math.max(1, Math.floor(scrollTop / 32) + 1);
  const visibleRowCount = 70;
  const visibleRows = Math.min(rowCount, firstVisibleRow + visibleRowCount - 1);
  const rows = useMemo(() => Array.from({ length: Math.max(0, visibleRows - firstVisibleRow + 1) }, (_, index) => firstVisibleRow + index), [firstVisibleRow, visibleRows]);

  const readStore = (): StoredBook[] => {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey(userId)) || "[]");
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  };

  const writeStore = (items: StoredBook[]) => {
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify(items));
      setWorkbooks(items.map(item => item.workbook).sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
      return true;
    } catch {
      setNotice("Storage is full or unavailable. Export this workbook before continuing.");
      return false;
    }
  };

  const persistCurrent = (nextCells: Record<string, Cell>, nextSheets = sheets, nextWorkbook = workbook, targetSheet = sheet) => {
    if (!nextWorkbook || !targetSheet) return false;
    const items = readStore();
    const index = items.findIndex(item => item.workbook.id === nextWorkbook.id);
    if (index < 0) return false;
    items[index] = { workbook: { ...nextWorkbook, updated_at: new Date().toISOString() }, sheets: nextSheets, cells: { ...items[index].cells, [targetSheet.id]: nextCells } };
    return writeStore(items);
  };

  const loadWorkbook = (item: Workbook) => {
    const stored = readStore().find(entry => entry.workbook.id === item.id);
    if (!stored) return;
    setWorkbook(stored.workbook);
    setSheets(stored.sheets);
    const activeSheet = stored.sheets[0] || null;
    setSheet(activeSheet);
    setCells(activeSheet ? stored.cells[activeSheet.id] || {} : {});
    setSelected("A1");
    setRowCount(30);
    setColumnCount(12);
    setRowDraft("30");
    setColumnDraft("12");
    setNotice("Workbook loaded from this device.");
  };

  const loadSheet = (item: Sheet) => {
    if (!workbook) return;
    const stored = readStore().find(entry => entry.workbook.id === workbook.id);
    setSheet(item);
    setCells(stored?.cells[item.id] || {});
    setSelected("A1");
  };

  const createWorkbook = () => {
    if (!newName.trim()) return;
    const now = new Date().toISOString();
    const created: Workbook = { id: crypto.randomUUID(), owner_id: userId, name: newName.trim(), description: "", updated_at: now };
    const firstSheet: Sheet = { id: crypto.randomUUID(), workbook_id: created.id, name: "Sheet 1", position: 0 };
    const items = readStore();
    items.push({ workbook: created, sheets: [firstSheet], cells: { [firstSheet.id]: {} } });
    if (!writeStore(items)) return;
    setWorkbook(created);
    setSheets([firstSheet]);
    setSheet(firstSheet);
    setCells({});
    setSelected("A1");
    setNewName("");
    setNotice("Workbook created. Changes save automatically on this device.");
  };

  const saveCell = (nextInput = input, ref = selected) => {
    if (!sheet) return;
    const formula = nextInput.trim().startsWith("=") ? nextInput.trim() : null;
    const next = { ...cells, [ref]: { sheet_id: sheet.id, cell_ref: ref, value: formula ? "" : nextInput, formula, format: cells[ref]?.format || {}, updated_by: userId } };
    setCells(next);
    persistCurrent(next);
    setNotice("All changes saved on this device.");
  };

  const moveSelection = (rowDelta: number, columnDelta: number) => {
    const match = selected.match(/^([A-Z]+)([0-9]+)$/);
    if (!match) return;
    const row = Math.max(1, Math.min(10000, Number(match[2]) + rowDelta));
    const col = Math.max(0, Math.min(499, columnIndex(match[1]) + columnDelta));
    const next = cellRef(row, col);
    setSelected(next);
    if (row > rowCount) { setRowCount(row); setRowDraft(String(row)); }
    if (col + 1 > columnCount) { setColumnCount(col + 1); setColumnDraft(String(col + 1)); }
  };

  const addSheet = () => {
    if (!workbook) return;
    const item: Sheet = { id: crypto.randomUUID(), workbook_id: workbook.id, name: "Sheet " + (sheets.length + 1), position: sheets.length };
    const nextSheets = [...sheets, item];
    const items = readStore();
    const index = items.findIndex(entry => entry.workbook.id === workbook.id);
    if (index < 0) return;
    items[index].sheets = nextSheets;
    items[index].cells[item.id] = {};
    if (!writeStore(items)) return;
    setSheets(nextSheets);
    setSheet(item);
    setCells({});
    setSelected("A1");
  };

  const importXlsx = async (file: File) => {
    if (!workbook) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) { setNotice("Please choose an .xlsx workbook. Legacy .xls files must first be saved as .xlsx."); return; }
    setImporting(true);
    try {
      const imported = new ExcelJS.Workbook();
      await imported.xlsx.load(await file.arrayBuffer());
      const items = readStore();
      const index = items.findIndex(entry => entry.workbook.id === workbook.id);
      if (index < 0) return;
      const nextSheets = [...items[index].sheets];
      const nextCells = { ...items[index].cells };
      for (const source of imported.worksheets) {
        let target = nextSheets.find(item => item.name.toLowerCase() === source.name.toLowerCase());
        if (!target) {
          target = { id: crypto.randomUUID(), workbook_id: workbook.id, name: source.name.slice(0, 80), position: nextSheets.length };
          nextSheets.push(target);
        }
        const records: Record<string, Cell> = {};
        source.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          row.eachCell({ includeEmpty: false }, (sourceCell, columnNumber) => {
            const ref = cellRef(rowNumber, columnNumber - 1);
            const value = sourceCell.value;
            const formula = value && typeof value === "object" && "formula" in value ? "=" + String(value.formula) : null;
            const raw = formula ? "" : sourceCell.text || String(value ?? "");
            records[ref] = { sheet_id: target!.id, cell_ref: ref, value: raw, formula, format: {}, updated_by: userId };
          });
        });
        nextCells[target.id] = records;
      }
      items[index] = { workbook: { ...items[index].workbook, updated_at: new Date().toISOString() }, sheets: nextSheets, cells: nextCells };
      if (!writeStore(items)) return;
      setSheets(nextSheets);
      const active = sheet && nextSheets.find(item => item.id === sheet.id) ? sheet : nextSheets[0];
      setSheet(active);
      setCells(active ? nextCells[active.id] || {} : {});
      const maxRow = Math.min(10000, Math.max(30, ...Object.values(nextCells[active?.id || ""] || {}).map(cell => Number(cell.cell_ref.match(/[0-9]+/)?.[0] || 1))));
      const maxCol = Math.min(500, Math.max(12, ...Object.values(nextCells[active?.id || ""] || {}).map(cell => columnIndex(cell.cell_ref) + 1)));
      setRowCount(maxRow); setRowDraft(String(maxRow)); setColumnCount(maxCol); setColumnDraft(String(maxCol));
      setNotice("Imported " + imported.worksheets.length + " worksheet(s), including all populated rows and columns.");
    } catch (error) {
      setNotice("Excel import failed: " + (error instanceof Error ? error.message : "The file could not be read."));
    } finally {
      setImporting(false);
    }
  };

  const exportXlsx = async () => {
    if (!workbook) return;
    setNotice("Preparing Excel workbook…");
    try {
      const stored = readStore().find(entry => entry.workbook.id === workbook.id);
      if (!stored) return;
      const file = new ExcelJS.Workbook();
      file.creator = "Grand-Lumen";
      file.created = new Date();
      for (const tab of stored.sheets) {
        const worksheet = file.addWorksheet(tab.name.slice(0, 31) || "Sheet");
        Object.values(stored.cells[tab.id] || {}).forEach(cell => {
          const target = worksheet.getCell(cell.cell_ref);
          if (cell.formula) target.value = { formula: cell.formula.replace(/^=/, "") };
          else target.value = cell.value;
        });
      }
      const buffer = await file.xlsx.writeBuffer();
      downloadBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), (workbook.name || "Workbook") + ".xlsx");
      setNotice("Excel workbook exported successfully.");
    } catch (error) {
      setNotice("Excel export failed: " + (error instanceof Error ? error.message : "Please try again."));
    }
  };

  const exportCsv = () => {
    if (!sheet || !workbook) return;
    const populated = Object.values(cells);
    const maxRow = Math.max(1, ...populated.map(cell => Number(cell.cell_ref.match(/[0-9]+/)?.[0] || 1)));
    const maxCol = Math.max(0, ...populated.map(cell => columnIndex(cell.cell_ref)));
    const matrix = Array.from({ length: maxRow }, (_, row) => Array.from({ length: maxCol + 1 }, (_, col) => {
      const cell = cells[cellRef(row + 1, col)];
      return cell?.formula ? "=" + cell.formula.replace(/^=/, "") : cell?.value || "";
    }));
    const csv = matrix.map(line => line.map(value => '"' + value.replace(/"/g, '""') + '"').join(",")).join("\r\n");
    downloadBlob(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }), (workbook.name || "Workbook") + "-" + sheet.name + ".csv");
    setNotice("Current worksheet exported as CSV.");
  };

  const importCsv = async (file: File) => {
    if (!sheet || !workbook) return;
    setImporting(true);
    try {
      const matrix = parseCsv(await file.text());
      const next: Record<string, Cell> = {};
      matrix.forEach((line, rowIndex) => line.forEach((value, colIndex) => {
        if (value !== "") {
          const ref = cellRef(rowIndex + 1, colIndex);
          const formula = value.startsWith("=") ? value : null;
          next[ref] = { sheet_id: sheet.id, cell_ref: ref, value: formula ? "" : value, formula, format: {}, updated_by: userId };
        }
      }));
      setCells(next);
      persistCurrent(next);
      const maxRow = Math.min(10000, Math.max(30, matrix.length));
      const maxCol = Math.min(500, Math.max(12, ...matrix.map(line => line.length)));
      setRowCount(maxRow); setRowDraft(String(maxRow)); setColumnCount(maxCol); setColumnDraft(String(maxCol));
      setNotice("CSV imported successfully with " + matrix.length + " row(s).");
    } catch (error) {
      setNotice("CSV import failed: " + (error instanceof Error ? error.message : "Please check the file."));
    } finally {
      setImporting(false);
    }
  };

  const calculated = useMemo(() => {
    const values: Record<string, string> = {};
    Object.entries(cells).forEach(([ref, cell]) => {
      if (!cell.formula) values[ref] = cell.value;
      else { try { values[ref] = evaluateFormula(cell.formula, cells); } catch { values[ref] = "#ERROR"; } }
    });
    return values;
  }, [cells]);

  useEffect(() => { setInput(cells[selected]?.formula || cells[selected]?.value || ""); }, [selected, cells]);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("lumen-sheet-share");
    if (!token || !supabase) return;
    let active = true;
    void supabase.rpc("get_lumen_sheet_share", { share_token: token }).then(({ data, error }) => {
      if (!active) return;
      if (error || !data) { setNotice("This shared workbook link is invalid or unavailable."); return; }
      const shared = data as StoredBook;
      const copy: StoredBook = { ...shared, workbook: { ...shared.workbook, id: crypto.randomUUID(), owner_id: userId, name: shared.workbook.name + " (shared copy)", updated_at: new Date().toISOString() }, sheets: shared.sheets.map((item, index) => ({ ...item, id: crypto.randomUUID(), workbook_id: "" + userId, position: index })) };
      copy.sheets = copy.sheets.map(item => ({ ...item, workbook_id: copy.workbook.id }));
      const remapped: Record<string, Record<string, Cell>> = {};
      shared.sheets.forEach((oldSheet, index) => {
        const nextSheet = copy.sheets[index];
        remapped[nextSheet.id] = Object.fromEntries(Object.entries(shared.cells[oldSheet.id] || {}).map(([ref, cell]) => [ref, { ...cell, sheet_id: nextSheet.id, updated_by: userId }]));
      });
      copy.cells = remapped;
      const items = readStore();
      if (!items.some(item => item.workbook.name === copy.workbook.name)) {
        items.push(copy);
        if (writeStore(items)) setNotice("A shared workbook copy has been added to your workbooks.");
      } else setNotice("This shared workbook is already in your workbooks.");
      window.history.replaceState({}, "", window.location.pathname + window.location.hash);
    });
    return () => { active = false; };
  }, [userId]);

  const applyDimensions = () => {
    const nextRows = Math.max(1, Math.min(10000, Math.floor(Number(rowDraft) || 1)));
    const nextColumns = Math.max(1, Math.min(500, Math.floor(Number(columnDraft) || 1)));
    setRowCount(nextRows); setColumnCount(nextColumns); setRowDraft(String(nextRows)); setColumnDraft(String(nextColumns));
    setNotice("Grid set to " + nextRows.toLocaleString() + " rows × " + nextColumns.toLocaleString() + " columns. Only visible rows are rendered.");
  };

  const shareWorkbook = async () => {
    if (!workbook || !supabase) { setNotice("Cloud sharing requires a configured Supabase connection and signed-in account."); return; }
    setSharing(true);
    try {
      const stored = readStore().find(entry => entry.workbook.id === workbook.id);
      if (!stored) return;
      const token = crypto.randomUUID();
      const { error } = await supabase.from("lumen_sheet_shares").insert({ token, owner_id: userId, workbook_data: stored });
      if (error) throw error;
      const url = new URL(window.location.href);
      url.searchParams.set("lumen-sheet-share", token);
      setShareUrl(url.toString());
      setNotice("Share link created. Anyone with this private link and an account can import a copy.");
    } catch (error) {
      setNotice("Sharing failed. Apply the Lumen Sheets database migration and check its access policies. " + (error instanceof Error ? error.message : ""));
    } finally {
      setSharing(false);
    }
  };

  const handleGridKey = (event: React.KeyboardEvent<HTMLButtonElement>, ref: string) => {
    if (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const match = ref.match(/^([A-Z]+)([0-9]+)$/);
      if (!match) return;
      const row = Number(match[2]) + (event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0);
      const col = columnIndex(match[1]) + (event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0);
      const safeRow = Math.max(1, Math.min(10000, row));
      const safeCol = Math.max(0, Math.min(499, col));
      const next = cellRef(safeRow, safeCol);
      setSelected(next);
      if (safeRow > rowCount) { setRowCount(safeRow); setRowDraft(String(safeRow)); }
      if (safeCol + 1 > columnCount) { setColumnCount(safeCol + 1); setColumnDraft(String(safeCol + 1)); }
      gridRef.current?.scrollTo({ top: (safeRow - 1) * 32, left: safeCol * 120, behavior: "auto" });
      window.requestAnimationFrame(() => gridRef.current?.querySelector<HTMLButtonElement>('[data-cell="' + next + '"]')?.focus());
    }
    if (event.key === "Enter" || event.key === "F2") { event.preventDefault(); document.querySelector<HTMLInputElement>(".sheets-cell-editor input")?.focus(); }
  };

  return <div className={"sheets-workspace" + (expanded ? " sheets-workspace-expanded" : "")}>
    <div className="sheets-header"><div><span className="eyebrow">BUSINESS & RECORDS WORKSPACE</span><h2>Lumen Sheets</h2><p>Organise records, budgets and calculations. Workbooks save automatically in this browser; export backups regularly.</p></div><div className="sheets-toolbar"><button className="team-secondary" onClick={() => void exportXlsx()} disabled={!workbook}>Export Excel</button><label className="team-secondary sheets-import">{importing ? "Importing…" : "Import Excel"}<input ref={importExcelRef} type="file" accept=".xlsx" disabled={importing} onChange={event => { const file = event.target.files?.[0]; if (file) void importXlsx(file); event.currentTarget.value = ""; }}/></label><button className="team-secondary" onClick={() => importCsvRef.current?.click()} disabled={!sheet || importing}>Import CSV</button><input ref={importCsvRef} type="file" accept=".csv,text/csv" hidden onChange={event => { const file = event.target.files?.[0]; if (file) void importCsv(file); event.currentTarget.value = ""; }}/><button className="team-secondary" onClick={exportCsv} disabled={!sheet}>Export CSV</button></div></div>
    {notice && <div className="team-notice">{notice}</div>}
    {shareUrl && <div className="sheets-share-link"><input readOnly value={shareUrl}/><button className="team-primary" onClick={() => { void navigator.clipboard.writeText(shareUrl); setNotice("Share link copied."); }}>Copy link</button></div>}
    <div className="sheets-create"><input value={newName} onChange={event => setNewName(event.target.value)} placeholder="New workbook name e.g. Business Accounts"/><button className="team-primary" onClick={createWorkbook} disabled={!newName.trim()}>Create workbook</button></div>
    <div className="sheets-layout"><aside className="sheets-library"><h3>Your workbooks</h3>{workbooks.map(item => <button key={item.id} className={workbook?.id === item.id ? "active" : ""} onClick={() => loadWorkbook(item)}><b>{item.name}</b><small>{new Date(item.updated_at).toLocaleDateString()}</small></button>)}{!workbooks.length && <p className="team-muted">No workbooks yet.</p>}</aside>
      <section className="sheets-editor">{workbook ? <><div className="sheets-book-title"><div><h3>{workbook.name}</h3><small>Private · Auto-saved on this device</small></div><div className="sheets-book-actions"><button className="team-secondary" onClick={() => setExpanded(value => !value)}>{expanded ? "Exit full screen" : "Expand workspace"}</button><button className="team-secondary" onClick={() => void shareWorkbook()} disabled={sharing}>{sharing ? "Creating link…" : "Share workbook"}</button><button className="team-secondary" onClick={addSheet}>+ Add sheet</button></div></div><div className="sheets-tabs">{sheets.map(item => <button key={item.id} className={sheet?.id === item.id ? "active" : ""} onClick={() => loadSheet(item)}>{item.name}</button>)}</div>{sheet && <><div className="sheets-dimensions"><label>Rows<input type="number" min="1" max="10000" value={rowDraft} onChange={event => setRowDraft(event.target.value)}/></label><label>Columns<input type="number" min="1" max="500" value={columnDraft} onChange={event => setColumnDraft(event.target.value)}/></label><button className="team-primary" onClick={applyDimensions}>Apply grid size</button><small>Up to 10,000 rows × 500 columns. The grid renders only visible rows to keep scrolling responsive.</small></div><div className="sheets-cell-editor"><b>{selected}</b><input value={input} onChange={event => setInput(event.target.value)} onBlur={() => { if (input !== (cells[selected]?.formula || cells[selected]?.value || "")) saveCell(); }} onKeyDown={event => { if (event.key === "Enter") { saveCell(); gridRef.current?.querySelector<HTMLButtonElement>('[data-cell="' + selected + '"]')?.focus(); } }} placeholder="Value or formula, e.g. =SUM(A1:A5)"/><button className="team-primary" onClick={() => saveCell()}>Save cell</button></div><div className="sheets-grid-wrap" ref={gridRef} onScroll={event => { setScrollTop(event.currentTarget.scrollTop); setScrollLeft(event.currentTarget.scrollLeft); }} onCopy={event => { const cell = cells[selected]; const text = cell?.formula || cell?.value || ""; event.clipboardData.setData("text/plain", text); event.preventDefault(); }} onPaste={event => { const text = event.clipboardData.getData("text/plain"); if (!text) return; event.preventDefault(); const matrix = parseCsv(text); const match = selected.match(/^([A-Z]+)([0-9]+)$/); if (!match) return; const startRow = Number(match[2]); const startCol = columnIndex(match[1]); const next = { ...cells }; matrix.forEach((line, rowOffset) => line.forEach((value, colOffset) => { const ref = cellRef(startRow + rowOffset, startCol + colOffset); const formula = value.startsWith("=") ? value : null; next[ref] = { sheet_id: sheet.id, cell_ref: ref, value: formula ? "" : value, formula, format: {}, updated_by: userId }; })); setCells(next); persistCurrent(next); setNotice("Pasted and saved " + matrix.length + " row(s)."); }}><table className="sheets-grid"><thead><tr><th></th>{firstVisibleColumn > 0 && <th aria-hidden="true" style={{width:firstVisibleColumn * 120,minWidth:firstVisibleColumn * 120,padding:0,border:0}}/>}{visibleColumns.map(column => <th key={column}>{column}</th>)}{firstVisibleColumn + visibleColumns.length < columnCount && <th aria-hidden="true" style={{width:(columnCount - firstVisibleColumn - visibleColumns.length) * 120,minWidth:(columnCount - firstVisibleColumn - visibleColumns.length) * 120,padding:0,border:0}}/>}</tr></thead><tbody>{firstVisibleRow > 1 && <tr aria-hidden="true"><td colSpan={visibleColumns.length + (firstVisibleColumn > 0 ? 2 : 1) + (firstVisibleColumn + visibleColumns.length < columnCount ? 1 : 0)} style={{height:(firstVisibleRow - 1) * 32,padding:0,border:0}}/></tr>}{rows.map(row => <tr key={row}><th>{row}</th>{firstVisibleColumn > 0 && <td aria-hidden="true" style={{width:firstVisibleColumn * 120,minWidth:firstVisibleColumn * 120,padding:0,border:0}}/>}{visibleColumns.map(column => { const ref = column + row; return <td key={ref}><button data-cell={ref} tabIndex={selected === ref ? 0 : -1} className={selected === ref ? "selected" : ""} onClick={() => setSelected(ref)} onKeyDown={event => handleGridKey(event, ref)} title={cells[ref]?.formula || cells[ref]?.value || ref}>{calculated[ref] ?? ""}</button></td>; })}{firstVisibleColumn + visibleColumns.length < columnCount && <td aria-hidden="true" style={{width:(columnCount - firstVisibleColumn - visibleColumns.length) * 120,minWidth:(columnCount - firstVisibleColumn - visibleColumns.length) * 120,padding:0,border:0}}/>}</tr>)}{visibleRows < rowCount && <tr aria-hidden="true"><td colSpan={visibleColumns.length + (firstVisibleColumn > 0 ? 2 : 1) + (firstVisibleColumn + visibleColumns.length < columnCount ? 1 : 0)} style={{height:(rowCount - visibleRows) * 32,padding:0,border:0}}/></tr>}</tbody></table></div></>}</> : <div className="sheets-empty"><h3>Select or create a workbook</h3><p>Your spreadsheet records are stored in this browser. Export Excel backups to move them between devices.</p></div>}</section></div>
  </div>;
}
