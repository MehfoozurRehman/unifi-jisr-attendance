import ExcelJS from 'exceljs';
import type { Store } from './store.js';

// The HR employee list (uploaded as Excel). Only the fields the dashboard needs are stored:
// no mobile number, date of birth, nationality or parking.
export interface DirectoryEntry {
  employeeId: string; jisrId: string | null; nameAr: string | null; nameEn: string; titleAr: string | null; titleEn: string | null;
  function: string | null; department: string | null; email: string | null; officeNumber: string | null; officeType: string | null; active: boolean;
}

export function ensureDirectory(store: Store) {
  store.db.exec(`CREATE TABLE IF NOT EXISTS directory(
      employeeId TEXT PRIMARY KEY, jisrId TEXT, nameAr TEXT, nameEn TEXT NOT NULL, titleAr TEXT, titleEn TEXT,
      function TEXT, department TEXT, email TEXT, officeNumber TEXT, officeType TEXT, active INTEGER NOT NULL DEFAULT 1, importedAt INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS directory_email ON directory(lower(email));
    CREATE TABLE IF NOT EXISTS functions(nameEn TEXT PRIMARY KEY, nameAr TEXT);`);
}

const text = (value: ExcelJS.CellValue): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') return value.text.trim();           // hyperlink cell (emails)
    if ('richText' in value) return value.richText.map(r => r.text).join('').trim();
    if ('result' in value) return String(value.result ?? '').trim();                            // formula cell
    if (value instanceof Date) return value.toISOString();
  }
  return String(value).trim();
};
const rowsOf = (sheet: ExcelJS.Worksheet) => {
  const header: Record<number, string> = {};
  sheet.getRow(1).eachCell((cell, col) => { header[col] = text(cell.value).toLowerCase(); });
  const rows: Record<string, string>[] = [];
  sheet.eachRow((row, n) => { if (n === 1) return; const out: Record<string, string> = {}; row.eachCell({ includeEmpty: false }, (cell, col) => { if (header[col]) out[header[col]] = text(cell.value); }); if (Object.keys(out).length) rows.push(out); });
  return rows;
};
const pick = (row: Record<string, string>, ...names: string[]) => { for (const n of names) { const v = row[n.toLowerCase()]; if (v) return v; } return ''; };

export async function parseEmployeeWorkbook(buffer: ArrayBuffer | Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as ArrayBuffer);
  let entries: DirectoryEntry[] = []; const functions: { nameEn: string; nameAr: string }[] = [];
  for (const sheet of workbook.worksheets) {
    const rows = rowsOf(sheet);
    if (!rows.length) continue;
    if ('employee id' in rows[0] || 'employee name (english)' in rows[0]) {
      entries = rows.filter(r => pick(r, 'Employee ID') && pick(r, 'Employee Name (English)')).map(r => ({
        employeeId: pick(r, 'Employee ID'), jisrId: pick(r, 'Jisr ID') || null,
        nameAr: pick(r, 'Employee Name (Arabic)') || null, nameEn: pick(r, 'Employee Name (English)'),
        titleAr: pick(r, 'Job Title (Arabic)') || null, titleEn: pick(r, 'Job Title (English)') || null,
        function: pick(r, 'Function') || null, department: pick(r, 'Department') || null,
        email: pick(r, 'Email Address', 'Email').toLowerCase() || null,
        officeNumber: pick(r, 'Office Number') || null, officeType: pick(r, 'Office Type') || null, active: true,
      }));
    } else if ('function (english)' in rows[0]) {
      for (const r of rows) if (pick(r, 'Function (English)')) functions.push({ nameEn: pick(r, 'Function (English)'), nameAr: pick(r, 'Function (Arabic)') });
    }
  }
  if (!entries.length) throw new Error('No employee sheet found (expected columns "Employee ID" and "Employee Name (English)")');
  return { entries, functions };
}

/** Replaces the directory with the uploaded list; people missing from the new list are kept but marked inactive. */
export function saveDirectory(store: Store, entries: DirectoryEntry[], functions: { nameEn: string; nameAr: string }[], now: number) {
  ensureDirectory(store);
  return store.transaction(() => {
    store.db.exec('UPDATE directory SET active=0');
    const upsert = store.db.prepare(`INSERT INTO directory(employeeId,jisrId,nameAr,nameEn,titleAr,titleEn,function,department,email,officeNumber,officeType,active,importedAt)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,1,?) ON CONFLICT(employeeId) DO UPDATE SET jisrId=excluded.jisrId,nameAr=excluded.nameAr,nameEn=excluded.nameEn,titleAr=excluded.titleAr,titleEn=excluded.titleEn,
      function=excluded.function,department=excluded.department,email=excluded.email,officeNumber=excluded.officeNumber,officeType=excluded.officeType,active=1,importedAt=excluded.importedAt`);
    for (const e of entries) upsert.run(e.employeeId, e.jisrId, e.nameAr, e.nameEn, e.titleAr, e.titleEn, e.function, e.department, e.email, e.officeNumber, e.officeType, now);
    const fn = store.db.prepare('INSERT INTO functions(nameEn,nameAr) VALUES(?,?) ON CONFLICT(nameEn) DO UPDATE SET nameAr=excluded.nameAr');
    for (const f of functions) fn.run(f.nameEn, f.nameAr);
    store.set('directoryImportedAt', String(now));
    const duplicates = store.db.prepare("SELECT lower(email) AS email, count(*) AS n FROM directory WHERE active=1 AND email IS NOT NULL GROUP BY lower(email) HAVING n>1").all() as { email: string; n: number }[];
    return { imported: entries.length, functions: functions.length, duplicateEmails: duplicates.length };
  });
}

export function directory(store: Store): DirectoryEntry[] {
  ensureDirectory(store);
  return (store.db.prepare('SELECT * FROM directory WHERE active=1 ORDER BY nameEn').all() as any[]).map(r => ({ ...r, active: Boolean(r.active) }));
}
export function functionNames(store: Store): Record<string, string> {
  ensureDirectory(store);
  return Object.fromEntries((store.db.prepare('SELECT nameEn, nameAr FROM functions').all() as { nameEn: string; nameAr: string }[]).map(f => [f.nameEn, f.nameAr]));
}
