export type Device = "microphone" | "camera";

const EVENT = "stepsight:blocked";

// Opens the "turn it on" sheet (components/PermissionHelp.tsx) from anywhere: a blocked request or a help button.
// reason: the browser's error name (NotAllowedError…), shown small so a stuck user can tell us what happened.
export function permissionHelp(device: Device, reason?: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { device, reason } }));
}

export function onPermissionHelp(fn: (device: Device, reason?: string) => void) {
  const listener = (e: Event) => {
    const { device, reason } = (e as CustomEvent<{ device: Device; reason?: string }>).detail;
    fn(device, reason);
  };
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

export const isBlocked = (error: unknown) => error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError");
