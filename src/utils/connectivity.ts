/**
 * The address Android itself uses to check that a network really reaches the internet. It answers
 * with an empty 204, so the probe costs next to nothing and sends no data about the user.
 */
export const CONNECTIVITY_PROBE_URL = 'https://www.gstatic.com/generate_204';

/**
 * `navigator.onLine` only knows that a network is attached, not that it works (mobile data switched
 * off behind Wi-Fi, a captive portal), and the browser events about it are unreliable in a WebView.
 * A request that gets any answer at all proves the internet is reachable; only a network failure or
 * a timeout proves it is not.
 */
export async function probeInternet(timeoutMs = 4000, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // no-cors: the answer is opaque, which is enough, and the host does not need to allow this origin.
    await fetchImpl(CONNECTIVITY_PROBE_URL, { mode: 'no-cors', cache: 'no-store', signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
