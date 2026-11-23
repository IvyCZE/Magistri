/**
 * Newest mark first. The server lists a subject's marks oldest first, so for marks from the same day the
 * later entry of the answer is the newer one and goes up.
 */
export function newestMarksFirst<T extends { markDate: string }>(marks: readonly T[]): T[] {
  return marks
    .map((mark, index) => ({ mark, index }))
    .sort((a, b) => b.mark.markDate.localeCompare(a.mark.markDate) || b.index - a.index)
    .map(({ mark }) => mark);
}
