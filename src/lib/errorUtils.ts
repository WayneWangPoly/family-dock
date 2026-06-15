export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (typeof error === "object" && error !== null) {
    const anyError = error as {
      message?: unknown;
      error_description?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
    };

    const parts = [
      typeof anyError.message === "string" ? anyError.message : null,
      typeof anyError.error_description === "string" ? anyError.error_description : null,
      typeof anyError.details === "string" ? anyError.details : null,
      typeof anyError.hint === "string" ? anyError.hint : null,
      typeof anyError.code === "string" ? `Code: ${anyError.code}` : null,
    ].filter(Boolean);

    if (parts.length > 0) {
      return parts.join(" | ");
    }

    try {
      return JSON.stringify(error, null, 2);
    } catch {
      return Object.prototype.toString.call(error);
    }
  }

  return String(error);
}