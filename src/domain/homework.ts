import type { Homework } from '../types/bakalari';
import { groupBySchoolWeek, isIsoDate } from './schoolWeeks';

export type HomeworkStatus = 'active' | 'overdue' | 'closed';

export function homeworkStatus(homework: Homework, today: string): HomeworkStatus {
  if (homework.done || homework.closed) return 'closed';
  return isIsoDate(homework.deadline) && homework.deadline < today ? 'overdue' : 'active';
}

export function homeworkWeeks(records: readonly Homework[], status: HomeworkStatus) {
  const order = status === 'active' ? 'asc' : 'desc';
  const due = (homework: Homework) => homework.deadline || '';
  const sorted = [...records].sort((a, b) => order === 'asc'
    ? due(a).localeCompare(due(b))
    : due(b).localeCompare(due(a)));
  return groupBySchoolWeek(sorted, due, order);
}
