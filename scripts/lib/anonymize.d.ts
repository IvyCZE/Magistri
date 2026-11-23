export function scrambleText(text: string): string;
export function createAnonymizer(): {
  run(documents: Record<string, unknown>): Record<string, any>;
  leaks(output: unknown, extraSensitive?: string[]): string[];
  leakLocations(output: unknown, extraSensitive?: string[]): { token: string; path: string }[];
};
