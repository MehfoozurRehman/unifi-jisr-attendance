import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { config } from './config.js';
import { Store } from './store.js';
import { Attendance, summarizeDay } from './attendance.js';
import { analyze } from './analytics.js';
import { addStaff, authenticate, ensureStaff, loginBlocked, recordFailure, setStaffDisabled } from './staff.js';
import { directory, parseEmployeeWorkbook, saveDirectory } from './directory.js';

const at = (date: string, time: string) => Date.parse(`${date}T${time}:00+03:00`);
const rules = { ...config, WORK_START_MINUTES: 9 * 60, LATE_GRACE_MINUTES: 15, REQUIRED_MINUTES: 8 * 60, WEEKEND_DAYS: [5, 6] };
const later = at('2026-10-31', '12:00');

describe('breaks and time outside', () => {
  it('counts each return after stepping out as a break and sums the time outside', () => {
    const taps = [['08:50', 'in'], ['12:00', 'out'], ['12:40', 'in'], ['15:00', 'out'], ['15:10', 'in'], ['17:30', 'out']] as const;
    const day = summarizeDay('2026-10-28', taps.map(([t, d]) => ({ at: at('2026-10-28', t), direction: d })), rules, later);
    expect(day.breaks).toBe(2); expect(day.outsideMinutes).toBe(50); expect(day.minutes).toBe(8 * 60 + 40 - 50); expect(day.overtimeMinutes).toBe(0);
  });
  it('records minutes late from the start time', () => {
    const day = summarizeDay('2026-10-28', [{ at: at('2026-10-28', '09:40'), direction: 'in' }, { at: at('2026-10-28', '18:00'), direction: 'out' }], rules, later);
    expect(day.lateMinutes).toBe(40); expect(day.overtimeMinutes).toBe(20);
  });
});

describe('staff accounts', () => {
  it('signs in staff with a hashed password and rejects disabled accounts', () => {
    const s = new Store(':memory:'); ensureStaff(s);
    addStaff(s, 'hr.lead', 'HR Lead', 'hr', 'correct horse battery');
    expect(authenticate(s, 'hr.lead', 'correct horse battery', 'boot')?.role).toBe('hr');
    expect(authenticate(s, 'hr.lead', 'wrong password!!', 'boot')).toBeNull();
    const stored = (s.db.prepare('SELECT passwordHash FROM staff_users').get() as { passwordHash: string }).passwordHash;
    expect(stored.startsWith('scrypt$')).toBe(true); expect(stored).not.toContain('correct horse');
    setStaffDisabled(s, 'hr.lead', true);
    expect(authenticate(s, 'hr.lead', 'correct horse battery', 'boot')).toBeNull();
    s.close();
  });
  it('accepts the bootstrap admin password only until the first account exists', () => {
    const s = new Store(':memory:'); ensureStaff(s);
    expect(authenticate(s, 'admin', 'bootstrap-secret', 'bootstrap-secret')?.role).toBe('admin');
    addStaff(s, 'owner', 'Owner', 'admin', 'a much longer password');
    expect(authenticate(s, 'admin', 'bootstrap-secret', 'bootstrap-secret')).toBeNull();
    s.close();
  });
  it('locks a username after five failures', () => {
    const keys = ['u:locked-user-test', 'a:test-address'];
    for (let i = 0; i < 5; i++) recordFailure(keys);
    expect(loginBlocked(keys)).toBe(true);
  });
});

describe('employee list import', () => {
  it('reads the HR workbook, keeps only needed fields, and drives analytics by department', async () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Employee Data');
    sheet.addRow(['Employee ID', 'Jisr ID', 'Employee Name (Arabic)', 'Employee Name (English)', 'Job Title (Arabic)', 'Job Title (English)', 'Function', 'Department', 'Email Address', 'Mobile Number', 'Date of Birth', 'Office Number', 'Office Type']);
    sheet.addRow(['ZE-001', '38', 'سارة', 'Sara Test', 'مديرة', 'Manager', 'Finance', 'Treasury', 'Sara@Example.com', '0500000000', 30000, '2050', 'OFFICE']);
    sheet.addRow(['ZE-002', '39', 'عمر', 'Omar Test', 'محلل', 'Analyst', 'Finance', 'Treasury', 'omar@example.com', '0500000001', 30001, '2051', 'WS']);
    const fns = wb.addWorksheet('Sheet1'); fns.addRow(['Function (English)', 'Function (Arabic)']); fns.addRow(['Finance', 'قطاع المالية']);
    const buffer = await wb.xlsx.writeBuffer();
    const { entries, functions } = await parseEmployeeWorkbook(buffer);
    expect(entries).toHaveLength(2); expect(entries[0].email).toBe('sara@example.com'); expect(functions[0].nameAr).toBe('قطاع المالية');
    expect(Object.keys(entries[0])).not.toContain('mobile'); expect(JSON.stringify(entries)).not.toContain('0500000000');
    const s = new Store(':memory:');
    expect(saveDirectory(s, entries, functions, Date.now()).imported).toBe(2);
    expect(directory(s).map(e => e.employeeId)).toEqual(['ZE-002', 'ZE-001']);
    const raw = (time: string, direction: string) => JSON.stringify({ id: 'access.unlocks.location_unlocked', device: 'r', device_name: 'Door', location_name: 'Door', user: 'u1', user_name: 'Sara', user_email: 'sara@example.com', time: String(at('2026-10-28', time) / 1000), direction, credential_type: 'FACE', admin: '', emergency_mode: '' });
    s.ingest(raw('08:55', 'entered'), at('2026-10-28', '18:00'), config); s.ingest(raw('17:05', 'exited'), at('2026-10-28', '18:00'), config);
    const result = analyze(s, new Attendance(s, rules), rules, '2026-10-28', '2026-10-28', { department: 'Treasury' }, later);
    expect(result.kpis.people).toBe(2); expect(result.kpis.attendanceRate).toBe(0.5);
    expect(result.departments[0]).toMatchObject({ name: 'Treasury', people: 2 });
    // Every employee on the list is returned, including those with no taps at all.
    expect(result.people.map(p => p.member.employeeId).sort()).toEqual(['ZE-001', 'ZE-002']);
    expect(result.people.find(p => p.member.employeeId === 'ZE-002')).toMatchObject({ present: 0, attendanceRate: 0 });
  });
  it('counts people who have not come in today once the start time has passed', async () => {
    const s = new Store(':memory:');
    saveDirectory(s, [
      { employeeId: 'A', jisrId: null, nameAr: null, nameEn: 'In Today', titleAr: null, titleEn: null, function: 'Ops', department: 'Floor', email: 'in@example.com', officeNumber: null, officeType: null, active: true },
      { employeeId: 'B', jisrId: null, nameAr: null, nameEn: 'Not In', titleAr: null, titleEn: null, function: 'Ops', department: 'Floor', email: 'out@example.com', officeNumber: null, officeType: null, active: true },
      { employeeId: 'C', jisrId: null, nameAr: null, nameEn: 'Empty Dept', titleAr: null, titleEn: null, function: 'Ops', department: 'Quiet', email: 'quiet@example.com', officeNumber: null, officeType: null, active: true },
    ], [], Date.now());
    s.ingest(JSON.stringify({ id: 'access.unlocks.location_unlocked', device: 'r', device_name: 'Door', location_name: 'Door', user: 'u1', user_name: 'In', user_email: 'in@example.com', time: String(at('2026-10-27', '08:50') / 1000), direction: 'entered', credential_type: 'FACE', admin: '', emergency_mode: '' }), at('2026-10-27', '08:51'), config);
    s.ingest(JSON.stringify({ id: 'access.unlocks.location_unlocked', device: 'r', device_name: 'Door', location_name: 'Door', user: 'u1', user_name: 'In', user_email: 'in@example.com', time: String(at('2026-10-28', '08:50') / 1000), direction: 'entered', credential_type: 'FACE', admin: '', emergency_mode: '' }), at('2026-10-28', '08:51'), config);
    const noon = at('2026-10-28', '12:00');
    const result = analyze(s, new Attendance(s, rules), rules, '2026-10-28', '2026-10-28', {}, noon);
    expect(result.people).toHaveLength(3); expect(result.departments.map(d => d.name).sort()).toEqual(['Floor', 'Quiet']);
    expect(result.departments.find(d => d.name === 'Floor')!.attendanceRate).toBe(0.5);
    expect(result.departments.find(d => d.name === 'Quiet')!.attendanceRate).toBe(0);
    const early = analyze(s, new Attendance(s, rules), rules, '2026-10-28', '2026-10-28', {}, at('2026-10-28', '08:55'));
    expect(early.departments.find(d => d.name === 'Quiet')!.attendanceRate).toBeNull();
    s.close();
  });
});
