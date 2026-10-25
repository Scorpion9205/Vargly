import {
  BookOpen,
  CalendarCheck,
  ClipboardCheck,
  Clock,
  FileText,
  MessageCircleQuestion,
  House,
  Megaphone,
  ReceiptIndianRupee,
  UserRound,
  type LucideIcon,
} from 'lucide-react';

export type StudentNavKey =
  | 'home'
  | 'attendance'
  | 'homework'
  | 'results'
  | 'materials'
  | 'doubts'
  | 'notices'
  | 'timetable'
  | 'fees'
  | 'profile';

export interface StudentNavItem {
  key: StudentNavKey;
  href: string;
  icon: LucideIcon;
  /** Shown only when the institute lets students see their fees */
  needsFees?: boolean;
  /** Shown only when the institute switched on AI doubt help */
  needsDoubts?: boolean;
}

/** The panel's pages. The first four sit in the bottom bar on a phone; the rest are under "More". */
export const STUDENT_NAV: StudentNavItem[] = [
  { key: 'home', href: '/student', icon: House },
  { key: 'attendance', href: '/student/attendance', icon: CalendarCheck },
  { key: 'homework', href: '/student/homework', icon: BookOpen },
  { key: 'results', href: '/student/results', icon: ClipboardCheck },
  { key: 'materials', href: '/student/materials', icon: FileText },
  { key: 'doubts', href: '/student/doubts', icon: MessageCircleQuestion, needsDoubts: true },
  { key: 'notices', href: '/student/notices', icon: Megaphone },
  { key: 'timetable', href: '/student/timetable', icon: Clock },
  { key: 'fees', href: '/student/fees', icon: ReceiptIndianRupee, needsFees: true },
  { key: 'profile', href: '/student/profile', icon: UserRound },
];

export const PRIMARY_COUNT = 4;

export function visibleNav(showFees: boolean, doubts = false): StudentNavItem[] {
  return STUDENT_NAV.filter((item) => (!item.needsFees || showFees) && (!item.needsDoubts || doubts));
}

/** Home matches only itself; the others match their own pages too */
export function isActive(item: StudentNavItem, pathname: string): boolean {
  if (item.href === '/student') return pathname === '/student';
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
