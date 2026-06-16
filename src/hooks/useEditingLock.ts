// Editing locks are disabled in the current Firebase workflow.
// The Firebase consumer version does not expose editing locks or lock controls.
export function useEditingLock(_args?: unknown) {
  return {
    lock: null,
    loading: false,
    busy: false,
    errorMessage: null,
    isLockedByMe: false,
    isLockedByOther: false,
    lockedByName: null as string | null,
    acquire: async () => undefined,
    release: async () => undefined,
    startEditing: async () => undefined,
    stopEditing: async () => undefined,
    heartbeat: async () => undefined,
  };
}
