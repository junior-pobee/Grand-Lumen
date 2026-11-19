import { useEffect, useMemo, useState } from "react";
import ExcelJS from "exceljs";

type Workbook = { id: string; owner_id: string; name: string; description: string; updated_at: string };
type Sheet = { id: string; workbook_id: string; name: string; position: number };
type Cell = { id?: string; sheet_id: string; cell_ref: string; value: string; formula: string | null; format: Record<string, unknown>; updated_by: string };
type StoredBook = { workbook: Workbook; sheets: Sheet[]; cells: Record<string, Record<string, Cell>> };

const columns = Array.from({ length: 12 }, (_, index) => String.fromCharCode(65 + index));
const rows = Array.from({ length: 30 }, (_, index) => index + 1);
const storageKey = (userId: string) => "grandLumenLocalSheets:" + userId;

function columnIndex(ref: string) {
  let value = 0;
  for (const char of ref.match(/^[A-Z]+/)?.[0] || "") value = value * 26 + char.charCodeAt(0) - 64;
  return value - 1;
}

function evaluateFormula(source: string, cells: Record<string, Cell>, stack = new Set<string>()): string {
  const expression = source.trim().replace(/^=/, "");
  const resolve = (ref: string): number => {
    if (stack.has(ref)) throw new Error("Circular formula");
    const cell = cells[ref];
    if (!cell) return 0;
    if (cell.formula) {
      const next = new Set(stack);
      next.add(ref);
      return Number(evaluateFormula(cell.formula, cells, next)) || 0;
    }
    return Number(cell.value) || 0;
  };
  const range = expression.match(/^(SUM|AVERAGE|MIN|MAX|COUNT)\(([A-Z]+[1-9][0-9]*):([A-Z]+[1-9][0-9]*)\)$/i);
  if (range) {
    const startCol = columnIndex(range[2]);
    const endCol = columnIndex(range[3]);
    const startRow = Number(range[2].match(/[0-9]+/)?.[0]);
    const endRow = Number(range[3].match(/[0-9]+/)?.[0]);
    const values: number[] = [];
    for (let row = Math.min(startRow, endRow); row <= Math.max(startRow, endRow); row += 1) {
      for (let col = Math.min(startCol, endCol); col <= Math.max(startCol, endCol); col += 1) values.push(resolve(columns[col] + row));
    }
    const numeric = values.filter(value => Number.isFinite(value));
    const kind = range[1].toUpperCase();
    const result = kind === "SUM" ? numeric.reduce((a, b) => a + b, 0) : kind === "AVERAGE" ? numeric.length ? numeric.reduce((a, b) => a + b, 0) / numeric.length : 0 : kind === "MIN" ? Math.min(...numeric) : kind === "MAX" ? Math.max(...numeric) : numeric.filter(value => value !== 0).length;
    return String(result);
  }
  const arithmetic = expression.replace(/\b([A-Z]{1,3}[1-9][0-9]*)\b/g, (_, ref: string) => String(resolve(ref)));
  if (!/^[0-9+*/().%\s-]+$/.test(arithmetic)) throw new Error("Use a cell reference or SUM, AVERAGE, MIN, MAX or COUNT range formula.");
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
  const [members] = useState<{ id: string; display_name: string | null; email: string | null }[]>([]);

  const readStore = (): StoredBook[] => {
    try { const value = JSON.parse(localStorage.getItem(storageKey(userId)) || "[]"); return Array.isArray(value) ? value : []; }
    catch { return []; }
  };

  const writeStore = (items: StoredBook[]) => {
    localStorage.setItem(storageKey(userId), JSON.stringify(items));
    setWorkbooks(items.map(item => item.workbook).sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
  };

  useEffect(() => {
    const items = readStore();
    setWorkbooks(items.map(item => item.workbook).sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
  }, [userId]);

  const persistCurrent = (nextCells: Record<string, Cell>, nextSheets = sheets, nextWorkbook = workbook) => {
    if (!nextWorkbook) return;
    const items = readStore();
    const index = items.findIndex(item => item.workbook.id === nextWorkbook.id);
    if (index < 0) return;
    items[index] = { workbook: { ...nextWorkbook, updated_at: new Date().toISOString() }, sheets: nextSheets, cells: { ...items[index].cells, [sheet?.id || nextSheets[0]?.id]: nextCells } };
    writeStore(items);
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
    setMembers([]);
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
    writeStore(items);
    setWorkbook(created);
    setSheets([firstSheet]);
    setSheet(firstSheet);
    setCells({});
    setSelected("A1");
    setNewName("");
    setNotice("Workbook created and saved on this device.");
  };

  const saveCell = () => {
    if (!sheet) return;
    const formula = input.trim().startsWith("=") ? input.trim() : null;
    const next = { ...cells, [selected]: { sheet_id: sheet.id, cell_ref: selected, value: formula ? "" : input, formula, format: {}, updated_by: userId } };
    setCells(next);
    persistCurrent(next);
    setNotice("Cell saved on this device.");
  };

  const addSheet = () => {
    if (!workbook) return;
    const item: Sheet = { id: crypto.randomUUID(), workbook_id: workbook.id, name: "Sheet " + (sheets.length + 1), position: sheets.length };
    const nextSheets = [...sheets, item];
    setSheets(nextSheets);
    setSheet(item);
    setCells({});
    const items = readStore();
    const index = items.findIndex(entry => entry.workbook.id === workbook.id);
    if (index >= 0) { items[index].sheets = nextSheets; items[index].cells[item.id] = {}; writeStore(items); }
  };

  const exportXlsx = async () => {
    if (!workbook) return;
    const stored = readStore().find(entry => entry.workbook.id === workbook.id);
    if (!stored) return;
    const file = new ExcelJS.Workbook();
    for (const tab of stored.sheets) {
      const worksheet = file.addWorksheet(tab.name.slice(0, 31));
      Object.values(stored.cells[tab.id] || {}).forEach(cell => {
        const target = worksheet.getCell(cell.cell_ref);
        if (cell.formula) target.value = { formula: cell.formula.replace(/^=/, "") };
        else target.value = cell.value;
      });
    }
    const buffer = await file.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = workbook.name + ".xlsx"; anchor.click(); URL.revokeObjectURL(url);
  };

  const importXlsx = async (file: File) => {
    if (!sheet || !workbook) return;
    const imported = new ExcelJS.Workbook();
    await imported.xlsx.load(await file.arrayBuffer());
    const items = readStore();
    const index = items.findIndex(entry => entry.workbook.id === workbook.id);
    if (index < 0) return;
    const nextSheets = [...sheets];
    for (let sheetIndex = 0; sheetIndex < imported.worksheets.length && sheetIndex < 12; sheetIndex += 1) {
      const source = imported.worksheets[sheetIndex];
      let target = sheetIndex === 0 ? sheet : nextSheets.find(item => item.name === source.name);
      if (!target) {
        target = { id: crypto.randomUUID(), workbook_id: workbook.id, name: source.name.slice(0, 80), position: nextSheets.length };
        nextSheets.push(target);
        items[index].cells[target.id] = {};
      }
      const records: Record<string, Cell> = {};
      source.eachRow((row, rowNumber) => {
        if (rowNumber > 30) return;
        row.eachCell((sourceCell, columnNumber) => {
          if (columnNumber > 12) return;
          const ref = columns[columnNumber - 1] + rowNumber;
          const value = sourceCell.value;
          const formula = value && typeof value === "object" && "formula" in value ? "=" + String(value.formula) : null;
          records[ref] = { sheet_id: target!.id, cell_ref: ref, value: formula ? "" : sourceCell.text || String(value ?? ""), formula, format: {}, updated_by: userId };
        });
      });
      items[index].cells[target.id] = records;
    }
    items[index].sheets = nextSheets;
    items[index].workbook.updated_at = new Date().toISOString();
    writeStore(items);
    setSheets(nextSheets);
    setCells(items[index].cells[sheet.id] || {});
    setNotice("Excel workbook imported and saved locally.");
  };

  const exportCsv = () => {
    if (!sheet || !workbook) return;
    const matrix = rows.map(row => columns.map(column => { const cell = cells[column + row]; return cell?.formula ? "=" + cell.formula.replace(/^=/, "") : cell?.value || ""; }));
    const csv = matrix.map(line => line.map(value => '"' + value.replace(/"/g, '""') + '"').join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = workbook.name + ".csv"; anchor.click(); URL.revokeObjectURL(url);
  };

  const importCsv = async (file: File) => {
    if (!sheet) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean).slice(0, 30);
    const next = { ...cells };
    lines.forEach((line, rowIndex) => {
      const values = line.match(/(?:^|,)(?:"(?:[^"]|"")*"|[^,]*)/g) || [];
      values.slice(0, 12).forEach((raw, colIndex) => {
        const value = raw.replace(/^,/, "").replace(/^"|"$/g, "").replace(/""/g, '"');
        const ref = columns[colIndex] + (rowIndex + 1);
        next[ref] = { sheet_id: sheet.id, cell_ref: ref, value: value.startsWith("=") ? "" : value, formula: value.startsWith("=") ? value : null, format: {}, updated_by: userId };
      });
    });
    setCells(next);
    persistCurrent(next);
    setNotice("CSV imported and saved locally.");
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

  const shareWorkbook = () => setNotice("This workbook is stored locally on this device. Cloud sharing is unavailable in offline mode. Export the Excel file to share a copy.");

  return <div className="sheets-workspace">
    <div className="sheets-header"><div><span className="eyebrow">BUSINESS & RECORDS WORKSPACE</span><h2>Lumen Sheets</h2><p>Organise business records, budgets, account registers and calculations. Saved locally on this device.</p></div><div className="sheets-toolbar"><button className="team-secondary" onClick={() => void exportXlsx()} disabled={!workbook}>Export Excel</button><label className="team-secondary sheets-import">Import Excel<input type="file" accept=".xlsx,.xls" onChange={event => { const file = event.target.files?.[0]; if (file) void importXlsx(file); event.currentTarget.value = ""; }}/></label><button className="team-secondary" onClick={exportCsv} disabled={!sheet}>Export CSV</button></div></div>
    {notice && <div className="team-notice">{notice}</div>}
    <div className="sheets-create"><input value={newName} onChange={event => setNewName(event.target.value)} placeholder="New workbook name e.g. Business Accounts"/><button className="team-primary" onClick={createWorkbook} disabled={!newName.trim()}>Create workbook</button></div>
    <div className="sheets-layout"><aside className="sheets-library"><h3>Your workbooks</h3>{workbooks.map(item => <button key={item.id} className={workbook?.id === item.id ? "active" : ""} onClick={() => loadWorkbook(item)}><b>{item.name}</b><small>{new Date(item.updated_at).toLocaleDateString()}</small></button>)}{!workbooks.length && <p className="team-muted">No workbooks yet.</p>}</aside>
      <section className="sheets-editor">{workbook ? <><div className="sheets-book-title"><div><h3>{workbook.name}</h3><small>Private · Stored on this device</small></div><button className="team-secondary" onClick={shareWorkbook}>Share workbook</button><button className="team-secondary" onClick={addSheet}>+ Add sheet</button></div><div className="sheets-tabs">{sheets.map(item => <button key={item.id} className={sheet?.id === item.id ? "active" : ""} onClick={() => loadSheet(item)}>{item.name}</button>)}</div>{sheet && <><div className="sheets-cell-editor"><b>{selected}</b><input value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter") saveCell(); }} placeholder="Enter a value or formula, e.g. =SUM(A1:A5)"/><button className="team-primary" onClick={saveCell}>Save cell</button></div><div className="sheets-grid-wrap"><table className="sheets-grid"><thead><tr><th></th>{columns.map(column => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row}><th>{row}</th>{columns.map(column => { const ref = column + row; return <td key={ref}><button className={selected === ref ? "selected" : ""} onClick={() => setSelected(ref)} title={cells[ref]?.formula || cells[ref]?.value || ref}>{calculated[ref] || ""}</button></td>; })}</tr>)}</tbody></table></div></>}</> : <div className="sheets-empty"><h3>Select or create a workbook</h3><p>Your spreadsheet records are saved securely in this browser on this device.</p></div>}</section></div>
  </div>;
}
