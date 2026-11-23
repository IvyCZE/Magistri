/**
 * Whether a Komens message is unread. Real Bakaláři servers send `Read` (true once
 * the message was opened, here or in another app); the `Unread` flag is only
 * honoured when `Read` is missing, which is how the demo and test data come.
 */
export function isMessageUnread(m: Record<string, unknown> | null | undefined): boolean {
  if (!m) return false;
  const read = m.Read;
  if (read !== undefined && read !== null) {
    if (typeof read === 'string') return read.trim().toLowerCase() === 'false' || read.trim() === '0';
    return !read;
  }
  return Boolean(m.Unread);
}
