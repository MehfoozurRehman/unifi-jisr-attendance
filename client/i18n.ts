export type Lang = 'ar' | 'en';

const words = {
  ar: {
    brand: 'زود', product: 'الحضور والانصراف', ledger: 'سجل الأحداث', month: 'الشهر', year: 'السنة', team: 'متابعة الفريق',
    language: 'English', signOut: 'تسجيل الخروج', choosePerson: 'اختر موظفًا', searchPerson: 'ابحث بالاسم أو البريد',
    monthTitle: 'حضور الشهر', yearTitle: 'حضور السنة', teamTitle: 'متابعة الفريق',
    present: 'أيام الحضور', onTime: 'في الوقت', lateShort: 'تأخير أو نقص', absent: 'غياب', totalHours: 'إجمالي الساعات', averageDay: 'متوسط اليوم',
    legendGreen: 'في الوقت ودوام كامل', legendYellow: 'تأخير أو ساعات أقل', legendRed: 'غياب أو بلا تسجيل خروج', legendOff: 'عطلة نهاية الأسبوع', legendToday: 'اليوم', legendUntracked: 'قبل بدء التسجيل',
    firstIn: 'أول دخول', lastOut: 'آخر خروج', worked: 'مدة الدوام', taps: 'التسجيلات', in: 'دخول', out: 'خروج',
    late: 'متأخر', short: 'ساعات أقل', missingOut: 'لا يوجد تسجيل خروج', missingIn: 'خروج بلا تسجيل دخول', insideNow: 'داخل المبنى الآن', noTaps: 'لا توجد تسجيلات في هذا اليوم',
    pickDay: 'اختر يومًا لعرض التفاصيل', insideCount: 'داخل الآن', leftCount: 'غادروا', notInCount: 'لم يحضروا بعد',
    person: 'الموظف', today: 'اليوم', thisMonth: 'هذا الشهر', hours: 'الساعات', avg: 'المتوسط',
    since: 'منذ', leftAt: 'غادر', notIn: 'لم يحضر', allDepartments: 'كل الأقسام', allManagers: 'كل المديرين', noPeople: 'لا يوجد موظفون لهذا العرض',
    rules: (start: string, grace: number, hours: string) => `يبدأ الدوام ${start} مع سماح ${grace} دقيقة، والمطلوب ${hours} يوميًا.`,
    teamNote: 'تظهر الأقسام والمديرون من جسر بعد ربط مفتاح جسر.', noEmail: 'بلا بريد', openMonth: 'عرض الشهر',
    h: 'س', m: 'د', prev: 'السابق', next: 'التالي',
  },
  en: {
    brand: 'ZOOD', product: 'Attendance', ledger: 'Event ledger', month: 'Month', year: 'Year', team: 'Team monitor',
    language: 'العربية', signOut: 'Sign out', choosePerson: 'Choose an employee', searchPerson: 'Search by name or email',
    monthTitle: 'Monthly attendance', yearTitle: 'Yearly attendance', teamTitle: 'Team monitor',
    present: 'Days present', onTime: 'On time', lateShort: 'Late or short', absent: 'Absent', totalHours: 'Total hours', averageDay: 'Average day',
    legendGreen: 'On time, full day', legendYellow: 'Late or short hours', legendRed: 'Absent or no exit tap', legendOff: 'Weekend', legendToday: 'Today', legendUntracked: 'Before recording started',
    firstIn: 'First in', lastOut: 'Last out', worked: 'Time worked', taps: 'Taps', in: 'In', out: 'Out',
    late: 'Late', short: 'Short hours', missingOut: 'No exit tap', missingIn: 'Exit without an entry tap', insideNow: 'Inside now', noTaps: 'No taps on this day',
    pickDay: 'Pick a day to see its details', insideCount: 'Inside now', leftCount: 'Left', notInCount: 'Not in yet',
    person: 'Employee', today: 'Today', thisMonth: 'This month', hours: 'Hours', avg: 'Average',
    since: 'since', leftAt: 'Left', notIn: 'Not in', allDepartments: 'All departments', allManagers: 'All managers', noPeople: 'No employees for this view',
    rules: (start: string, grace: number, hours: string) => `Work starts at ${start} with ${grace} minutes grace; ${hours} required per day.`,
    teamNote: 'Departments and managers come from Jisr once the Jisr key is connected.', noEmail: 'No email', openMonth: 'Open month',
    h: 'h', m: 'm', prev: 'Previous', next: 'Next',
  },
};
export type Words = typeof words.en;
export const t = (lang: Lang): Words => words[lang];

const locale = (lang: Lang) => (lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB');
const zone = 'Asia/Riyadh';
export const clock = (lang: Lang, instant: number | null) => instant ? new Intl.DateTimeFormat(locale(lang), { timeZone: zone, hour: '2-digit', minute: '2-digit' }).format(instant) : '—';
export const monthName = (lang: Lang, year: number, month: number) => new Intl.DateTimeFormat(locale(lang), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(year, month - 1, 15));
export const shortMonth = (lang: Lang, month: number) => new Intl.DateTimeFormat(locale(lang), { month: 'short', timeZone: 'UTC' }).format(Date.UTC(2026, month - 1, 15));
export const weekdayNames = (lang: Lang) => Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale(lang), { weekday: 'short', timeZone: 'UTC' }).format(Date.UTC(2026, 9, 25 + i)));
export const longDate = (lang: Lang, date: string) => new Intl.DateTimeFormat(locale(lang), { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(Date.parse(`${date}T12:00:00Z`));
export const duration = (lang: Lang, minutes: number) => { const w = t(lang); const h = Math.floor(minutes / 60), m = minutes % 60; return h ? `${h}${w.h} ${String(m).padStart(2, '0')}${w.m}` : `${m}${w.m}`; };
export const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
