// Names of the IPC channels between the preload script and the main process. Both sides import
// them from here, so a typo cannot break the connection silently.
export const IPC_CHANNELS = {
  getAppInfo: "app:get-info",
  quit: "app:quit",
  readSlots: "saves:read-slots",
  writeSlot: "saves:write-slot",
  restoreBackup: "saves:restore-backup",
  deleteSlot: "saves:delete-slot",
} as const;
