import { useCallback, useEffect, useRef, useState } from "react";

export interface Remote<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refresh: () => void;
}

/**
 * Load remote data whenever `path` changes. `fetcher` is re-read through a
 * ref so a refresh() never runs a stale closure.
 */
export function useData<T>(path: string | null, fetcher: () => Promise<T>): Remote<T> {
  const [state, setState] = useState<{ loading: boolean; data: T | null; error: string | null }>({
    loading: path !== null,
    data: null,
    error: null,
  });
  const [version, setVersion] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (path === null) {
      setState({ loading: false, data: null, error: null });
      return;
    }
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetcherRef
      .current()
      .then((data) => {
        if (alive) setState({ loading: false, data, error: null });
      })
      .catch((error: unknown) => {
        if (alive) {
          setState({
            loading: false,
            data: null,
            error: error instanceof Error ? error.message : "Request failed",
          });
        }
      });
    return () => {
      alive = false;
    };
  }, [path, version]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, refresh };
}

export interface Action {
  busy: boolean;
  error: string | null;
  /** Run a mutation; resolves true on success. */
  run: (fn: () => Promise<unknown>) => Promise<boolean>;
  clearError: () => void;
}

/** Small state holder for one-off mutations (approve, seal, verify, ...). */
export function useAction(): Action {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  const clearError = useCallback(() => setError(null), []);
  return { busy, error, run, clearError };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed";
}
