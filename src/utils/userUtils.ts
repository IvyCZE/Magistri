/**
 * Utility functions for user profile, names, and sanitization.
 */

export const isClassLikeName = (val?: string | null): boolean => {
  if (!val) return false;
  return /^\d\.[A-Za-z]/i.test(val.trim());
};

export const getSavedStudentName = (): string => {
  try {
    // 1. Direct explicit user-set display name or confirmed saved student name
    const custom = localStorage.getItem('b_user_display_name');
    if (custom && custom.trim() && !isClassLikeName(custom)) {
      return custom.trim();
    }

    // 2. Saved user profile in localStorage
    const rawProfile = localStorage.getItem('bakalari_user_profile');
    if (rawProfile) {
      const p = JSON.parse(rawProfile);
      if (p && p.name && p.name.trim() && !isClassLikeName(p.name)) {
        return p.name.trim();
      }
    }

    // 3. Cached student name from message recipients / relevant name
    const cachedName = localStorage.getItem('b_student_name_cache');
    if (cachedName && cachedName.trim() && !isClassLikeName(cachedName)) {
      return cachedName.trim();
    }

    // 4. Cached students list in b_cache_students
    const rawStudents = localStorage.getItem('b_cache_students');
    let userId = localStorage.getItem('b_user_id') || '';

    if (rawStudents) {
      const students = JSON.parse(rawStudents);
      if (Array.isArray(students)) {
        if (userId) {
          const match = students.find((s: any) => s.id === userId || s.id === `student-${userId}`);
          if (match && match.name && !isClassLikeName(match.name)) {
            return match.name.trim();
          }
        }
        // If there's only 1 student in the class cache and it's a valid name
        if (students.length === 1 && students[0].name && !isClassLikeName(students[0].name)) {
          return students[0].name.trim();
        }
      }
    }

    // 5. Look for student name in cached messages (RelevantName / recipientName)
    const rawMsgs = localStorage.getItem('b_cache_messages');
    if (rawMsgs) {
      const msgs = JSON.parse(rawMsgs);
      if (Array.isArray(msgs)) {
        for (const m of msgs) {
          const rel = m.relevantName || m.RelevantName;
          if (
            rel &&
            typeof rel === 'string' &&
            rel.trim() &&
            !isClassLikeName(rel) &&
            !rel.includes('Mgr.') &&
            !rel.includes('Ing.') &&
            !rel.includes('PhDr.') &&
            !rel.includes('RNDr.')
          ) {
            return rel.trim();
          }
        }
      }
    }
  } catch {}
  return '';
};
