// How an assisted field writes.
//
// The rhythm belongs here and not to whoever asks for the value: an agent says
// what to write, the field says how it appears, and two fields filled by the
// same agent must not each invent their own speed.

// Milliseconds between two characters. Slow enough to be read as writing rather
// than as a glitch, fast enough that a postal address does not become a wait.
export const ASSISTANCE_TYPING_DELAY_MS = 28;

// What a field pauses between two of its own steps — opening a list, moving to
// the option, choosing it — so a change made at once still reads as an act.
export const ASSISTANCE_STEP_DELAY_MS = 220;

export type AssistanceWriteOptions = {
  // Zero writes the whole value at once, which is what a test wants and what a
  // form being submitted under the animation gets.
  delayMs?: number;
  signal?: AbortSignal;
};

export const assistanceWait = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (ms <= 0 || signal?.aborted) {
      resolve();

      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });

/**
 * Hands the value over one character at a time.
 *
 * What to do with each state is the caller's business — set an input, redraw a
 * label — which is what lets the same writing serve a text field and anything
 * else that spells a value out. Aborted, it lands on the whole value rather than
 * stopping halfway: an interrupted assistance still leaves the field filled.
 */
export const assistanceWriteText = async (
  apply: (text: string) => void,
  value: string,
  options: AssistanceWriteOptions = {}
): Promise<void> => {
  const { delayMs = ASSISTANCE_TYPING_DELAY_MS, signal } = options;
  const text = value ?? '';

  if (delayMs <= 0 || signal?.aborted) {
    apply(text);

    return;
  }

  for (let length = 1; length <= text.length; length++) {
    if (signal?.aborted) {
      apply(text);

      return;
    }

    apply(text.slice(0, length));
    await assistanceWait(delayMs, signal);
  }

  apply(text);
};
