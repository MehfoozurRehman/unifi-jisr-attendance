// Dev only: fills a SEPARATE database with fictional employees and taps so the dashboard can be judged with history.
// Usage: npx tsx scripts/seed-demo.ts <path/to/demo.sqlite> [people=36] [days=150]
// Never point this at the real ledger.
import { config } from '../src/config.js';
import { Store } from '../src/store.js';
import { saveDirectory } from '../src/directory.js';

const [path, peopleArg = '36', daysArg = '150'] = process.argv.slice(2);
if (!path || /attendance\.sqlite$/.test(path) && !/demo/i.test(path)) { console.error('Give a demo database path (must contain "demo")'); process.exit(2); }
const people = Number(peopleArg), days = Number(daysArg);
const names = ['Sara Alharbi', 'Omar Alqahtani', 'Lina Alotaibi', 'Fahad Alshehri', 'Noura Alsubaie', 'Khalid Aldossari', 'Reem Alzahrani', 'Yousef Alghamdi', 'Hessa Almutairi', 'Majed Alenezi', 'Dana Alamri', 'Turki Alrashidi', 'Maha Alshammari', 'Saud Alqarni', 'Joud Albaqami', 'Nasser Alanazi', 'Rana Alharthi', 'Abdullah Alyami', 'Layan Alsahli', 'Faisal Alobaidi'];
const doors = [['Ground Floor Maindoor-Entry', 'Ground Floor Maindoor-Exit'], ['Basement Door-Entry', 'Basement Door-Exit'], ['First Floor-Main Door', 'First Floor-Main Door-Exit']];
const demoConfig = { ...config, MAX_EVENT_AGE_MS: 10 * 365 * 86_400_000 };
let seed = 7; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const normal = (mean: number, sd: number) => mean + sd * Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
const store = new Store(path);
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
const nowMs = Date.now();
let count = 0;
for (let p = 0; p < people; p++) {
  const name = `${names[p % names.length]}${p >= names.length ? ` ${Math.floor(p / names.length) + 1}` : ''}`;
  const email = `demo${String(p + 1).padStart(2, '0')}@example.com`, user = `demo-user-${p + 1}`;
  const punctual = rand(), [entry, exit] = doors[p % doors.length];
  for (let d = days; d >= 0; d--) {
    const date = new Date(Date.parse(`${today}T12:00:00Z`) - d * 86_400_000).toISOString().slice(0, 10);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (weekday === 5 || weekday === 6 || rand() < 0.06) continue; // weekend or absent
    const base = Date.parse(`${date}T00:00:00+03:00`);
    const arrive = Math.round(normal(8 * 60 + 40 + (1 - punctual) * 50, 18)), leave = Math.round(normal(17 * 60 + 10, 35));
    const taps: [number, string][] = [[arrive, 'entered']];
    if (rand() < 0.4) { const out = Math.round(normal(12 * 60 + 30, 20)); taps.push([out, 'exited'], [out + Math.round(normal(45, 10)), 'entered']); }
    if (rand() > 0.04 || d === 0) taps.push([leave, 'exited']);
    for (const [minute, direction] of taps) {
      const at = base + minute * 60_000; if (at > nowMs) continue;
      store.ingest(JSON.stringify({ id: 'access.unlocks.location_unlocked', device: `demo-${direction}`, device_name: direction === 'entered' ? entry : exit, location_name: direction === 'entered' ? entry : exit, user, user_name: name, user_email: email, time: String(Math.floor(at / 1000)), direction, credential_type: 'NFC', admin: '', emergency_mode: '' }), at + 1000, demoConfig);
      count++;
    }
  }
}
// A fictional employee list so department and function views have structure.
const orgs: [string, string, string][] = [['Executive', 'الإدارة التنفيذية', 'Executive Office'], ['Finance', 'قطاع المالية', 'Treasury'], ['Finance', 'قطاع المالية', 'Accounting'], ['Development', 'قطاع التطوير', 'Projects'], ['Development', 'قطاع التطوير', 'Design'], ['Shared Services', 'الخدمات المشتركة', 'IT'], ['Shared Services', 'الخدمات المشتركة', 'HR']];
const titles = ['Manager', 'Senior Specialist', 'Specialist', 'Analyst', 'Coordinator'];
saveDirectory(store, Array.from({ length: people }, (_, p) => {
  const [fn, , department] = orgs[p % orgs.length];
  const name = `${names[p % names.length]}${p >= names.length ? ` ${Math.floor(p / names.length) + 1}` : ''}`;
  return { employeeId: `DEMO-${String(p + 1).padStart(3, '0')}`, jisrId: null, nameAr: null, nameEn: name, titleAr: null, titleEn: titles[p % titles.length], function: fn, department, email: `demo${String(p + 1).padStart(2, '0')}@example.com`, officeNumber: String(2000 + p), officeType: p % 3 ? 'WS' : 'OFFICE', active: true };
}), [...new Map(orgs.map(([en, ar]) => [en, { nameEn: en, nameAr: ar }])).values()], Date.now());
store.close();
console.log(`demo: ${people} fictional people, ${count} taps over ${days} days -> ${path}`);
