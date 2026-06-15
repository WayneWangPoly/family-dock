export type RealtimeStatus = "idle" | "connected" | "error" | "closed" | "subscribing" | "subscribed" | "channel_error" | "timed_out";

export type FamilyRealtimeChange = {
  table: string;
  event?: string;
  record?: unknown;
  payload?: unknown;
};

export function createDebouncedCallback(
  callback: () => void | Promise<void>,
  delayMs = 450,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let queued = false;

  async function run() {
    if (running) {
      queued = true;
      return;
    }

    running = true;

    try {
      await callback();
    } finally {
      running = false;

      if (queued) {
        queued = false;
        run();
      }
    }
  }

  return function debounced() {
    if (timer) clearTimeout(timer);

    timer = setTimeout(() => {
      timer = null;
      run();
    }, delayMs);
  };
}
