export type Lang = 'ar' | 'en';

const words = {
  ar: {
    product: 'لوحة الحضور', company: 'الشركة', departments: 'الأقسام', employees: 'الموظفون', events: 'سجل الأحداث', signOut: 'تسجيل الخروج', language: 'English',
    search: 'ابحث عن موظف', members: (n: number) => `${n} موظف`, companyName: 'زود', admin: 'مسؤول النظام', hr: 'الموارد البشرية',
    username: 'اسم المستخدم', password: 'كلمة المرور', signIn: 'دخول', badLogin: 'اسم المستخدم أو كلمة المرور غير صحيحة', locked: 'محاولات كثيرة، حاول بعد 15 دقيقة',
    range: 'الفترة', last7: 'آخر 7 أيام', last30: 'آخر 30 يومًا', last90: 'آخر 90 يومًا', thisMonth: 'هذا الشهر', thisYear: 'هذه السنة', custom: 'فترة مخصصة', from: 'من', to: 'إلى', apply: 'تطبيق',
    insideNow: 'داخل المبنى الآن', of: 'من', attendanceRate: 'نسبة الحضور', onTimeRate: 'الالتزام بالموعد', averageDay: 'متوسط وقت العمل', totalHours: 'إجمالي الساعات', lateDays: 'أيام التأخير', absentDays: 'أيام الغياب',
    averageOutside: 'متوسط الوقت خارج المبنى', averageBreaks: 'متوسط الخروج اليومي', overtime: 'ساعات إضافية', lateMinutes: 'دقائق التأخير', streak: 'أيام الالتزام المتتالية', bestStreak: 'أطول التزام',
    medianArrival: 'متوسط الوصول', medianDeparture: 'متوسط المغادرة', daysPresent: 'أيام الحضور', breaks: 'مرات الخروج', outside: 'خارج المبنى', insideTime: 'داخل المبنى',
    dailyAttendance: 'الحضور اليومي', dailyHours: 'الوقت داخل وخارج المبنى يوميًا', weeklyActivity: 'النشاط الأسبوعي', yearActivity: 'سجل الحضور خلال السنة',
    arrivals: 'أوقات الوصول', departures: 'أوقات المغادرة', doors: 'الأبواب الأكثر استخدامًا', people: 'الموظفون', timeline: 'الجدول اليومي', recentTaps: 'آخر التسجيلات',
    byDepartment: 'مقارنة الأقسام', byFunction: 'القطاعات', leaders: 'لوحة الشرف', mostPunctual: 'الأكثر التزامًا بالموعد', mostHours: 'الأكثر ساعات', longestStreak: 'أطول التزام متتالٍ', mostLate: 'الأكثر تأخيرًا', mostOutside: 'الأكثر وقتًا خارج المبنى', mostOvertime: 'الأكثر ساعات إضافية',
    onTime: 'في الوقت', late: 'تأخير أو نقص', absent: 'غياب', weekend: 'عطلة', noData: 'لا توجد بيانات', beforeRecording: 'قبل بدء التسجيل',
    less: 'أقل', more: 'أكثر', hoursAxis: 'ساعات', peopleInside: 'متوسط الموجودين', taps: 'تسجيلات', count: 'العدد', required: 'المطلوب',
    employee: 'الموظف', present: 'الحضور', avg: 'المتوسط', arrival: 'الوصول', hours: 'الساعات', status: 'الحالة', in: 'دخول', out: 'خروج',
    inside: 'بالداخل', left: 'غادر', notIn: 'لم يحضر', since: 'منذ', today: 'اليوم', noEmail: 'بلا بريد', email: 'مراسلة',
    rules: (start: string, grace: number, hours: string) => `الدوام يبدأ ${start} مع سماح ${grace} دقيقة، والمطلوب ${hours} يوميًا. الجمعة والسبت عطلة.`,
    recordingSince: (d: string) => `بدأ التسجيل في ${d}`, notFound: 'لم يتم العثور على الموظف',
    h: 'س', m: 'د', date: 'التاريخ', worked: 'مدة العمل', firstIn: 'أول دخول', lastOut: 'آخر خروج', exitNoEntry: 'خروج بلا دخول', noExit: 'بلا خروج',
    department: 'القسم', function: 'القطاع', title: 'المسمى الوظيفي', office: 'المكتب', employeeId: 'الرقم الوظيفي', allDepartments: 'كل الأقسام', allFunctions: 'كل القطاعات',
    importList: 'رفع قائمة الموظفين', importing: 'جارٍ الرفع…', imported: (n: number) => `تم تحديث ${n} موظف`, noDirectory: 'لم تُرفع قائمة الموظفين بعد. ارفع ملف Excel من زر "رفع قائمة الموظفين".',
    unmatched: (n: number) => `${n} بطاقة دخول غير موجودة في قائمة الموظفين`, insideOutside: 'داخل / خارج', rank: 'الترتيب', inDepartment: 'في القسم', perDay: 'يوميًا', minDays: 'من لديهم 3 أيام حضور على الأقل',
    dashboardOf: (n: string) => `لوحة ${n}`, back: 'رجوع', openDepartment: 'فتح القسم',
    settings: 'الإعدادات', workRules: 'قواعد الدوام', workStart: 'بداية الدوام', grace: 'مهلة التأخير', minutesUnit: 'دقيقة', requiredTime: 'ساعات العمل المطلوبة يوميًا', hoursUnit: 'ساعة', weekendDays: 'أيام العطلة الأسبوعية', save: 'حفظ', saving: 'جارٍ الحفظ…', saved: 'تم حفظ القواعد وتطبيقها على كل اللوحات', rulesHelp: 'تُستخدم هذه القواعد لتحديد الأخضر والأصفر والأحمر في كل الشاشات. يُعد الموظف متأخرًا إذا وصل بعد بداية الدوام مضافًا إليها المهلة.', preview: 'معاينة', lateAfter: (t: string) => `يُعد متأخرًا من وصل بعد ${t}`,
    activityLevels: { none: 'لا أحد', low: 'قليل', mid: 'متوسط', high: 'مزدحم' }, longestInside: 'الأطول داخل المبنى اليوم', nobodyInside: 'لا أحد داخل المبنى الآن', insideToday: 'وقتك داخل المبنى اليوم', attendanceMix: 'توزيع الحضور', weekOverview: 'نظرة على الأسبوع', arrivalWave: 'موجة الوصول', breakWave: 'الخروج للاستراحة', departureWave: 'موجة المغادرة', peopleN: (n: number) => `${n} موظف`, session: 'داخل المبنى', expectedDays: 'من الأيام المتوقعة', upload: 'رفع القائمة',
  },
  en: {
    product: 'Attendance', company: 'Company', departments: 'Departments', employees: 'Employees', events: 'Event ledger', signOut: 'Sign out', language: 'العربية',
    search: 'Search employees', members: (n: number) => `${n} members`, companyName: 'ZOOD', admin: 'Administrator', hr: 'Human Resources',
    username: 'Username', password: 'Password', signIn: 'Sign in', badLogin: 'Wrong username or password', locked: 'Too many attempts. Try again in 15 minutes.',
    range: 'Range', last7: 'Last 7 days', last30: 'Last 30 days', last90: 'Last 90 days', thisMonth: 'This month', thisYear: 'This year', custom: 'Custom range', from: 'From', to: 'To', apply: 'Apply',
    insideNow: 'Inside now', of: 'of', attendanceRate: 'Attendance rate', onTimeRate: 'On-time rate', averageDay: 'Average time inside', totalHours: 'Total hours', lateDays: 'Late days', absentDays: 'Absent days',
    averageOutside: 'Average time outside', averageBreaks: 'Average breaks a day', overtime: 'Overtime', lateMinutes: 'Minutes late', streak: 'Current on-time streak', bestStreak: 'Best streak',
    medianArrival: 'Typical arrival', medianDeparture: 'Typical departure', daysPresent: 'Days present', breaks: 'Breaks', outside: 'Outside', insideTime: 'Inside',
    dailyAttendance: 'Daily attendance', dailyHours: 'Time inside and outside per day', weeklyActivity: 'Weekly activity', yearActivity: 'Attendance over the year',
    arrivals: 'Arrival times', departures: 'Departure times', doors: 'Most used doors', people: 'Employees', timeline: 'Day timeline', recentTaps: 'Recent taps',
    byDepartment: 'Departments compared', byFunction: 'Functions', leaders: 'Leaderboard', mostPunctual: 'Most punctual', mostHours: 'Most hours', longestStreak: 'Longest on-time streak', mostLate: 'Most late', mostOutside: 'Most time outside', mostOvertime: 'Most overtime',
    onTime: 'On time', late: 'Late or short', absent: 'Absent', weekend: 'Weekend', noData: 'No data', beforeRecording: 'Before recording started',
    less: 'Less', more: 'More', hoursAxis: 'hours', peopleInside: 'Average inside', taps: 'taps', count: 'Count', required: 'Required',
    employee: 'Employee', present: 'Present', avg: 'Average', arrival: 'Arrival', hours: 'Hours', status: 'Status', in: 'In', out: 'Out',
    inside: 'Inside', left: 'Left', notIn: 'Not in', since: 'since', today: 'Today', noEmail: 'No email', email: 'Email',
    rules: (start: string, grace: number, hours: string) => `Work starts at ${start} with ${grace} minutes grace; ${hours} required per day. Friday and Saturday are off.`,
    recordingSince: (d: string) => `Recording started ${d}`, notFound: 'Employee not found',
    h: 'h', m: 'm', date: 'Date', worked: 'Worked', firstIn: 'First in', lastOut: 'Last out', exitNoEntry: 'Exit without entry', noExit: 'No exit tap',
    department: 'Department', function: 'Function', title: 'Job title', office: 'Office', employeeId: 'Employee ID', allDepartments: 'All departments', allFunctions: 'All functions',
    importList: 'Upload employee list', importing: 'Uploading…', imported: (n: number) => `${n} employees updated`, noDirectory: 'The employee list has not been uploaded yet. Use "Upload employee list" with the HR Excel file.',
    unmatched: (n: number) => `${n} door badges are not in the employee list`, insideOutside: 'Inside / outside', rank: 'Rank', inDepartment: 'in department', perDay: 'per day', minDays: 'People with at least 3 days present',
    dashboardOf: (n: string) => `${n} dashboard`, back: 'Back', openDepartment: 'Open department',
    settings: 'Settings', workRules: 'Work rules', workStart: 'Work starts at', grace: 'Late grace', minutesUnit: 'minutes', requiredTime: 'Required time per day', hoursUnit: 'hours', weekendDays: 'Weekend days', save: 'Save', saving: 'Saving…', saved: 'Rules saved and applied to every dashboard', rulesHelp: 'These rules decide green, yellow and red on every screen. Someone is late when they arrive after the start time plus the grace.', preview: 'Preview', lateAfter: (t: string) => `Arriving after ${t} counts as late`,
    activityLevels: { none: 'None', low: 'Some', mid: 'Busy', high: 'Peak' }, longestInside: 'Inside the longest today', nobodyInside: 'Nobody is inside right now', insideToday: 'Time inside today', attendanceMix: 'Attendance mix', weekOverview: 'Week overview', arrivalWave: 'Arrival wave', breakWave: 'Break wave', departureWave: 'Departure wave', peopleN: (n: number) => `${n} people`, session: 'Inside', expectedDays: 'of expected days', upload: 'Upload list',
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
