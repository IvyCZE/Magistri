import { ArrowRightLeft, Ban, CalendarPlus, GraduationCap, MapPin } from 'lucide-react';

export const lessonChangeStyles = {
  canceled: {
    Icon: Ban,
    background: 'bg-rose-500/15',
    color: 'text-rose-700 dark:text-rose-300',
  },
  added: {
    Icon: CalendarPlus,
    background: 'bg-emerald-500/15',
    color: 'text-emerald-700 dark:text-emerald-300',
  },
  room: {
    Icon: MapPin,
    background: 'bg-sky-500/15',
    color: 'text-sky-700 dark:text-sky-300',
  },
  substitution: {
    Icon: ArrowRightLeft,
    background: 'bg-amber-500/15',
    color: 'text-amber-700 dark:text-amber-300',
  },
  subject: {
    Icon: ArrowRightLeft,
    background: 'bg-amber-500/15',
    color: 'text-amber-700 dark:text-amber-300',
  },
  course: {
    Icon: GraduationCap,
    background: 'bg-violet-500/15 hover:bg-violet-500/25',
    color: 'text-violet-700 dark:text-violet-300',
  },
};
