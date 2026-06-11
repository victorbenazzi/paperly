/** True on macOS, where the traffic lights overlay the top-left corner. */
export const isMac =
  typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent);
