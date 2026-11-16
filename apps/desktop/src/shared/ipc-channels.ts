// Names of the IPC channels between the preload script and the main process. Both sides import
// them from here, so a typo cannot break the connection silently.
export const IPC_CHANNELS = {
  getAppInfo: "app:get-info",
} as const;
