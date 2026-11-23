export const isNativePlatform = (): boolean =>
  typeof window !== 'undefined' &&
  Boolean((window as any).Capacitor?.isNativePlatform?.());
