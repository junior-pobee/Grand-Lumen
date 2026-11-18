import { useEffect, useMemo, useState } from "react";
import { supabase } from "./auth";
import ExcelJS from "exceljs";

type Workbook = { id: string; owner_id: string; name: string; description: string; updated_at: string };
type Sheet = { id: string; workbook_id: string; name: string; position: number };
type Cell = { id?: string; sheet_id: string; cell_ref: string; value: string; formula: string | null; format: Record<string, unknown>; updated_by: string };
type Member = { id: string; display_name: string | null; email: string | null };

const columns = Array.from({ length: 12 }, (_, index) => String.fromCharCode(65 + index));
const rows = Array.from({ length: 30 }, (_, index) => index + 1);

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
    const result = range[1].toUpperCase() === "SUM" ? numeric.reduce((a, b) => a + b, 0) : range[1].toUpperCase() === "AVERAGE" ? numeric.length ? numeric.reduce((a, b) => a + b, 0) / numeric.length : 0 : range[1].toUpperCase() === "MIN" ? Math.min(...numeric) : range[1].toUpperCase() === "MAX" ? Math.max(...numeric) : numeric.filter(value => value !== 0).length;
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
  const [busy, setBusy] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [memberEmail, setMemberEmail] = useState("");

  const refreshWorkbooks = async () => {
    if (!supabase) return;
    const result = await supabase.from("grand_lumen_workbooks").select("*").order("updated_at", { ascending: false });
    if (result.error) setNotice(result.error.message);
    else setWorkbooks((result.data || []) as Workbook[]);
  };

  useEffect(() => { void refreshWorkbooks(); }, []);

  const loadWorkbook = async (item: Workbook) => {
    if (!supabase) return;
    setWorkbook(item);
    setSheet(null);
    setCells({});
    const result = await supabase.from("grand_lumen_sheets").select("*").eq("workbook_id", item.id).order("position");
    if (result.error) { setNotice(result.error.message); return; }
    const list = (result.data || []) as Sheet[];
    setSheets(list);
    if (list.length) await loadSheet(list[0]);
    else setSheet(null);
    const membership = await supabase.from("grand_lumen_workbook_members").select("member_id").eq("workbook_id", item.id);
    if (!membership.error && membership.data?.length) {
      const ids = membership.data.map((entry: { member_id: string }) => entry.member_id);
      const profileResult = await supabase.from("grand_lumen_profiles").select("id,display_name,email").in("id", ids);
      if (!profileResult.error) setMembers((profileResult.data || []) as Member[]);
    } else setMembers([]);
  };

  const loadSheet = async (item: Sheet) => {
    if (!supabase) return;
    setSheet(item);
    setSelected("A1");
    const result = await supabase.from("grand_lumen_sheet_cells").select("*").eq("sheet_id", item.id);
    if (result.error) { setNotice(result.error.message); return; }
    setCells(Object.fromEntries(((result.data || []) as Cell[]).map(cell => [cell.cell_ref, cell])));
  };

  const createWorkbook = async () => {
    if (!supabase || !newName.trim()) return;
    setBusy(true);
    const result = await supabase.from("grand_lumen_workbooks").insert({ owner_id: userId, name: newName.trim() }).select("*").single();
    if (result.error) setNotice(result.error.message);
    else {
      const created = result.data as Workbook;
      const firstSheet = await supabase.from("grand_lumen_sheets").insert({ workbook_id: created.id, name: "Sheet 1", position: 0 }).select("*").single();
      if (firstSheet.error) setNotice(firstSheet.error.message);
      else { await refreshWorkbooks(); await loadWorkbook(created); }
      setNewName("");
    }
    setBusy(false);
  };

  const saveCell = async () => {
    if (!supabase || !sheet) return;
    const formula = input.trim().startsWith("=") ? input.trim() : null;
    const value = formula ? "" : input;
    const record = { sheet_id: sheet.id, cell_ref: selected, value, formula, format: cells[selected]?.format || {}, updated_by: userId };
    const result = await supabase.from("grand_lumen_sheet_cells").upsert(record, { onConflict: "sheet_id,cell_ref" }).select("*").single();
    if (result.error) setNotice(result.error.message);
    else {
      setCells(current => ({ ...current, [selected]: result.data as Cell }));
      setNotice("Cell saved.");
    }
  };

  const addSheet = async () => {
    if (!supabase || !workbook) return;
    const name = "Sheet " + (sheets.length + 1);
    const result = await supabase.from("grand_lumen_sheets").insert({ workbook_id: workbook.id, name, position: sheets.length }).select("*").single();
    if (result.error) setNotice(result.error.message);
    else { setSheets(current => [...current, result.data as Sheet]); await loadSheet(result.data as Sheet); }
  };

  const addMember = async () => {
    if (!supabase || !workbook || !memberEmail.trim()) return;
    const profile = await supabase.from("grand_lumen_profiles").select("id,email,display_name").eq("email", memberEmail.trim().toLowerCase()).single();
    if (profile.error) { setNotice("No visible connected account was found for that email. Connect with the member in Team first."); return; }
    const result = await supabase.from("grand_lumen_workbook_members").insert({ workbook_id: workbook.id, member_id: profile.data.id, role: "editor" });
    if (result.error) setNotice(result.error.message);
    else { setMemberEmail(""); setNotice("Workbook shared with " + (profile.data.display_name || profile.data.email) + "."); await loadWorkbook(workbook); }
  };

  const exportXlsx = async () => {
    if (!supabase || !workbook) return;
    const workbookFile = new ExcelJS.Workbook();
    for (const tab of sheets) {
      const result = await supabase.from("grand_lumen_sheet_cells").select("*").eq("sheet_id", tab.id);
      if (result.error) { setNotice(result.error.message); return; }
      const worksheet = workbookFile.addWorksheet(tab.name.slice(0, 31));
      ((result.data || []) as Cell[]).forEach(cell => {
        const target = worksheet.getCell(cell.cell_ref);
        if (cell.formula) target.value = { formula: cell.formula.replace(/^=/, ""), result: tab.id === sheet?.id ? Number(calculated[cell.cell_ref]) || 0 : 0 };
        else target.value = cell.value;
      });
    }
    const buffer = await workbookFile.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = (workbook.name || "lumen-workbook") + ".xlsx";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importXlsx = async (file: File) => {
    if (!sheet || !workbook || !supabase) return;
    const workbookFile = new ExcelJS.Workbook();
    await workbookFile.xlsx.load(await file.arrayBuffer());
    const importedSheets = workbookFile.worksheets.slice(0, 12);
    if (!importedSheets.length) return;
    const updatedSheets = [...sheets];
    for (let sheetIndex = 0; sheetIndex < importedSheets.length; sheetIndex += 1) {
      const sourceSheet = importedSheets[sheetIndex];
      let targetSheet = sheetIndex === 0 ? sheet : null;
      if (!targetSheet) {
        let targetName = sourceSheet.name.slice(0, 80) || "Imported sheet";
        if (updatedSheets.some(item => item.name === targetName)) targetName = (targetName.slice(0, 65) + " " + (sheetIndex + 1)).slice(0, 80);
        const created = await supabase.from("grand_lumen_sheets").insert({ workbook_id: workbook.id, name: targetName, position: updatedSheets.length }).select("*").single();
        if (created.error) { setNotice(created.error.message); return; }
        targetSheet = created.data as Sheet;
        updatedSheets.push(targetSheet);
      }
      const inserts: Cell[] = [];
      sourceSheet.eachRow((row, rowNumber) => {
        if (rowNumber > 30) return;
        row.eachCell((source, columnNumber) => {
          if (columnNumber > 12) return;
          const cellRef = columns[columnNumber - 1] + rowNumber;
          const sourceValue = source.value;
          const formula = sourceValue && typeof sourceValue === "object" && "formula" in sourceValue ? "=" + String(sourceValue.formula) : null;
          const value = formula ? "" : source.text || String(sourceValue ?? "");
          inserts.push({ sheet_id: targetSheet!.id, cell_ref: cellRef, value, formula, format: {}, updated_by: userId });
        });
      });
      if (inserts.length) {
        const result = await supabase.from("grand_lumen_sheet_cells").upsert(inserts, { onConflict: "sheet_id,cell_ref" });
        if (result.error) { setNotice(result.error.message); return; }
      }
    }
    setSheets(updatedSheets);
    await loadSheet(sheet);
    setNotice("All worksheets imported. The first worksheet was placed in your currently selected sheet.");
  };

  const exportCsv = () => {
    const matrix = rows.map(row => columns.map(column => {
      const cell = cells[column + row];
      return cell?.formula ? "=" + cell.formula.replace(/^=/, "") : cell?.value || "";
    }));
    const csv = matrix.map(line => line.map(value => '"' + value.replace(/"/g, '""') + '"').join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = (workbook?.name || "lumen-workbook") + ".csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importCsv = async (file: File) => {
    if (!sheet || !supabase) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean).slice(0, 30);
    const records: Record<string, Cell> = {};
    const inserts = lines.flatMap((line, rowIndex) => {
      const values = line.match(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g) || [];
      return values.slice(0, 12).map((raw, colIndex) => {
        const value = raw.replace(/^,/, "").replace(/^"|"$/g, "").replace(/""/g, '"');
        const cellRef = columns[colIndex] + (rowIndex + 1);
        const cell = { sheet_id: sheet.id, cell_ref: cellRef, value, formula: value.startsWith("=") ? value : null, format: {}, updated_by: userId };
        records[cellRef] = cell as Cell;
        return cell;
      });
    });
    if (inserts.length) {
      const result = await supabase.from("grand_lumen_sheet_cells").upsert(inserts, { onConflict: "sheet_id,cell_ref" });
      if (result.error) setNotice(result.error.message);
      else { setCells(current => ({ ...current, ...records })); setNotice("CSV imported."); }
    }
  };

  const calculated = useMemo(() => {
    const values: Record<string, string> = {};
    Object.entries(cells).forEach(([ref, cell]) => {
      if (!cell.formula) values[ref] = cell.value;
      else {
        try { values[ref] = evaluateFormula(cell.formula, cells); }
        catch { values[ref] = "#ERROR"; }
      }
    });
    return values;
  }, [cells]);

  useEffect(() => {
    if (!supabase || !sheet) return;
    const channel = supabase.channel("lumen-sheet-live-" + sheet.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "grand_lumen_sheet_cells", filter: "sheet_id=eq." + sheet.id }, payload => {
        if (payload.eventType === "DELETE") {
          const removed = payload.old as Cell;
          setCells(current => {
            const next = { ...current };
            delete next[removed.cell_ref];
            return next;
          });
        } else {
          const updated = payload.new as Cell;
          setCells(current => ({ ...current, [updated.cell_ref]: updated }));
        }
      }).subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [sheet?.id]);

  useEffect(() => { setInput(cells[selected]?.formula || cells[selected]?.value || ""); }, [selected, cells]);

  if (!supabase) return <div className="sheets-workspace"><div className="team-empty"><h3>Cloud account required</h3><p>Sign in with your Grand Lumen cloud account to save business records and access them on other devices.</p></div></div>;

  return <div className="sheets-workspace">
    <div className="sheets-header"><div><span className="eyebrow">BUSINESS & RECORDS WORKSPACE</span><h2>Lumen Sheets</h2><p>Organise business records, budgets, account registers and calculations.</p></div><div className="sheets-toolbar"><button className="team-secondary" onClick={exportXlsx} disabled={!sheet}>Export Excel</button><label className="team-secondary sheets-import">Import Excel<input type="file" accept=".xlsx,.xls" onChange={event => { const file = event.target.files?.[0]; if (file) void importXlsx(file); event.currentTarget.value = ""; }} disabled={!sheet}/></label><button className="team-secondary" onClick={exportCsv} disabled={!sheet}>Export CSV</button></div></div>
    {notice && <div className="team-notice">{notice}</div>}
    <div className="sheets-create"><input value={newName} onChange={event => setNewName(event.target.value)} placeholder="New workbook name e.g. Business Accounts"/><button className="team-primary" onClick={() => void createWorkbook()} disabled={busy || !newName.trim()}>Create workbook</button></div>
    <div className="sheets-layout"><aside className="sheets-library"><h3>Your workbooks</h3>{workbooks.map(item => <button key={item.id} className={workbook?.id === item.id ? "active" : ""} onClick={() => void loadWorkbook(item)}><b>{item.name}</b><small>{new Date(item.updated_at).toLocaleDateString()}</small></button>)}{!workbooks.length && <p className="team-muted">No workbooks yet.</p>}</aside>
      <section className="sheets-editor">{workbook ? <><div className="sheets-book-title"><div><h3>{workbook.name}</h3><small>{members.length ? "Shared with " + members.length + " member(s)" : "Private workbook"}</small></div><button className="team-secondary" onClick={() => void addSheet()}>+ Add sheet</button></div><div className="sheets-tabs">{sheets.map(item => <button key={item.id} className={sheet?.id === item.id ? "active" : ""} onClick={() => void loadSheet(item)}>{item.name}</button>)}</div>{sheet && <><div className="sheets-cell-editor"><b>{selected}</b><input value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void saveCell(); }} placeholder="Enter a value or formula, e.g. =SUM(A1:A5)"/><button className="team-primary" onClick={() => void saveCell()}>Save cell</button></div><div className="sheets-grid-wrap"><table className="sheets-grid"><thead><tr><th></th>{columns.map(column => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row}><th>{row}</th>{columns.map(column => { const ref = column + row; return <td key={ref}><button className={selected === ref ? "selected" : ""} onClick={() => setSelected(ref)} title={cells[ref]?.formula || cells[ref]?.value || ref}>{calculated[ref] || ""}</button></td>; })}</tr>)}</tbody></table></div></>}</> : <div className="sheets-empty"><h3>Select or create a workbook</h3><p>Your spreadsheet records are saved securely to your Grand Lumen account.</p></div>}</section></div>
    {workbook && <section className="sheets-share"><div><b>Share workbook with a connected member</b><p>Only people already connected through Team can be added.</p></div><div><input type="email" value={memberEmail} onChange={event => setMemberEmail(event.target.value)} placeholder="Connected member's email"/><button className="team-primary" onClick={() => void addMember()}>Share</button></div></section>}
  </div>;
}
