export type Device = "microphone" | "camera";

const EVENT = "stepsight:blocked";

// Opens the "turn it on" sheet (components/PermissionHelp.tsx) from anywhere: a blocked request or a help button.
export function permissionHelp(device: Device) {
  window.dispatchEvent(new CustomEvent<Device>(EVENT, { detail: device }));
}

export function onPermissionHelp(fn: (device: Device) => void) {
  const listener = (e: Event) => fn((e as CustomEvent<Device>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

export const isBlocked = (error: unknown) => error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError");
