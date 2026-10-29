export type Lang = 'ar' | 'en';

const words = {
  ar: {
    product: 'لوحة الحضور', events: 'سجل الأحداث', dashboard: 'لوحة الفريق', signOut: 'تسجيل الخروج', language: 'English',
    search: 'ابحث عن موظف', members: (n: number) => `${n} موظف`, team: 'فريق زود',
    range: 'الفترة', last7: 'آخر 7 أيام', last30: 'آخر 30 يومًا', last90: 'آخر 90 يومًا', thisMonth: 'هذا الشهر', thisYear: 'هذه السنة', custom: 'فترة مخصصة', from: 'من', to: 'إلى', apply: 'تطبيق',
    insideNow: 'داخل المبنى الآن', of: 'من', attendanceRate: 'نسبة الحضور', onTimeRate: 'الحضور في الوقت', averageDay: 'متوسط اليوم', totalHours: 'إجمالي الساعات', lateDays: 'أيام التأخير', absentDays: 'أيام الغياب',
    medianArrival: 'متوسط الوصول', medianDeparture: 'متوسط المغادرة', daysPresent: 'أيام الحضور',
    dailyAttendance: 'الحضور اليومي', dailyHours: 'ساعات العمل اليومية', weeklyActivity: 'النشاط الأسبوعي', yearActivity: 'سجل الحضور خلال السنة',
    arrivals: 'أوقات الوصول', departures: 'أوقات المغادرة', doors: 'الأبواب الأكثر استخدامًا', people: 'الموظفون', timeline: 'الجدول اليومي', recentTaps: 'آخر التسجيلات',
    onTime: 'في الوقت', late: 'تأخير أو نقص', absent: 'غياب', weekend: 'عطلة', noData: 'لا توجد بيانات', beforeRecording: 'قبل بدء التسجيل',
    less: 'أقل', more: 'أكثر', hoursAxis: 'ساعات', peopleInside: 'متوسط الموجودين', taps: 'تسجيلات', count: 'العدد', required: 'المطلوب',
    employee: 'الموظف', present: 'الحضور', avg: 'المتوسط', arrival: 'الوصول', hours: 'الساعات', status: 'الحالة', in: 'دخول', out: 'خروج',
    inside: 'بالداخل', left: 'غادر', notIn: 'لم يحضر', since: 'منذ', today: 'اليوم', noEmail: 'بلا بريد', email: 'مراسلة',
    back: 'العودة للفريق', rules: (start: string, grace: number, hours: string) => `الدوام يبدأ ${start} مع سماح ${grace} دقيقة، والمطلوب ${hours} يوميًا. الجمعة والسبت عطلة.`,
    recordingSince: (d: string) => `بدأ التسجيل في ${d}`, notFound: 'لم يتم العثور على الموظف', table: 'عرض كجدول', chart: 'عرض كرسم',
    h: 'س', m: 'د', date: 'التاريخ', worked: 'مدة العمل', firstIn: 'أول دخول', lastOut: 'آخر خروج', exitNoEntry: 'خروج بلا دخول', noExit: 'بلا خروج',
    department: 'القسم', manager: 'المدير', jisrPending: 'القسم والمدير يظهران بعد ربط جسر',
  },
  en: {
    product: 'Attendance', events: 'Event ledger', dashboard: 'Team dashboard', signOut: 'Sign out', language: 'العربية',
    search: 'Search employees', members: (n: number) => `${n} members`, team: 'ZOOD team',
    range: 'Range', last7: 'Last 7 days', last30: 'Last 30 days', last90: 'Last 90 days', thisMonth: 'This month', thisYear: 'This year', custom: 'Custom range', from: 'From', to: 'To', apply: 'Apply',
    insideNow: 'Inside now', of: 'of', attendanceRate: 'Attendance rate', onTimeRate: 'On-time rate', averageDay: 'Average day', totalHours: 'Total hours', lateDays: 'Late days', absentDays: 'Absent days',
    medianArrival: 'Typical arrival', medianDeparture: 'Typical departure', daysPresent: 'Days present',
    dailyAttendance: 'Daily attendance', dailyHours: 'Daily hours', weeklyActivity: 'Weekly activity', yearActivity: 'Attendance over the year',
    arrivals: 'Arrival times', departures: 'Departure times', doors: 'Most used doors', people: 'Employees', timeline: 'Day timeline', recentTaps: 'Recent taps',
    onTime: 'On time', late: 'Late or short', absent: 'Absent', weekend: 'Weekend', noData: 'No data', beforeRecording: 'Before recording started',
    less: 'Less', more: 'More', hoursAxis: 'hours', peopleInside: 'Average inside', taps: 'taps', count: 'Count', required: 'Required',
    employee: 'Employee', present: 'Present', avg: 'Average', arrival: 'Arrival', hours: 'Hours', status: 'Status', in: 'In', out: 'Out',
    inside: 'Inside', left: 'Left', notIn: 'Not in', since: 'since', today: 'Today', noEmail: 'No email', email: 'Email',
    back: 'Back to team', rules: (start: string, grace: number, hours: string) => `Work starts at ${start} with ${grace} minutes grace; ${hours} required per day. Friday and Saturday are off.`,
    recordingSince: (d: string) => `Recording started ${d}`, notFound: 'Employee not found', table: 'Show as table', chart: 'Show as chart',
    h: 'h', m: 'm', date: 'Date', worked: 'Worked', firstIn: 'First in', lastOut: 'Last out', exitNoEntry: 'Exit without entry', noExit: 'No exit tap',
    department: 'Department', manager: 'Manager', jisrPending: 'Department and manager appear once Jisr is connected',
  },
};
export type Words = typeof words.en;
export const t = (lang: Lang): Words => words[lang];

const loc = (lang: Lang) => (lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB');
const zone = 'Asia/Riyadh';
export const clock = (lang: Lang, instant: number | null) => instant ? new Intl.DateTimeFormat(loc(lang), { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(instant) : '—';
export const minuteClock = (minutes: number | null) => minutes === null ? '—' : `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
export const shortDate = (lang: Lang, date: string) => new Intl.DateTimeFormat(loc(lang), { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(Date.parse(`${date}T12:00:00Z`));
export const longDate = (lang: Lang, date: string) => new Intl.DateTimeFormat(loc(lang), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(Date.parse(`${date}T12:00:00Z`));
export const monthShort = (lang: Lang, date: string) => new Intl.DateTimeFormat(loc(lang), { month: 'short', timeZone: 'UTC' }).format(Date.parse(`${date}T12:00:00Z`));
export const weekdayShort = (lang: Lang, weekday: number) => new Intl.DateTimeFormat(loc(lang), { weekday: 'short', timeZone: 'UTC' }).format(Date.UTC(2026, 9, 25 + weekday));
export const todayLong = (lang: Lang) => new Intl.DateTimeFormat(loc(lang), { weekday: 'long', day: 'numeric', month: 'long', timeZone: zone }).format(new Date());
export const duration = (lang: Lang, minutes: number) => { const w = t(lang); const h = Math.floor(minutes / 60), m = Math.round(minutes % 60); return h ? `${h}${w.h} ${String(m).padStart(2, '0')}${w.m}` : `${m}${w.m}`; };
export const hoursOnly = (minutes: number) => (minutes / 60).toLocaleString('en', { maximumFractionDigits: minutes >= 6000 ? 0 : 1 });
export const percent = (value: number | null) => value === null ? '—' : `${Math.round(value * 100)}%`;
