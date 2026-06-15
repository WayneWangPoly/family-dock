import { useCallback, useEffect, useMemo, useState } from "react";
import type { FamilyData } from "../lib/familyDataTypes";
import { loadFamilyData, subscribeToFamilyChanges } from "../lib/familyDataApi";
import { createDebouncedCallback } from "../lib/familyRealtime";
import type { FamilyRealtimeChange, RealtimeStatus } from "../lib/familyRealtime";

export function useFamilyData() {
  const [data, setData] = useState<FamilyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("idle");
  const [lastRealtimeChange, setLastRealtimeChange] =
    useState<FamilyRealtimeChange | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRefreshing(true);
      setErrorMessage(null);
      const nextData = await loadFamilyData();
      setData(nextData);
      return nextData;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : JSON.stringify(error);
      console.error("loadFamilyData error:", error);
      setErrorMessage(message);
      throw error;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const debouncedRefresh = useMemo(() => {
    return createDebouncedCallback(() => {
      setRealtimeStatus("connected");
      setLastRealtimeChange({
        table: "firebase",
        event: "UPDATE",
        record: null,
      });
      refresh().catch(() => {
        // refresh already stores error state
      });
    }, 550);
  }, [refresh]);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let alive = true;

    refresh()
      .then((loaded) => {
        if (!alive) return;
        setRealtimeStatus("connected");
        unsubscribe = subscribeToFamilyChanges(loaded.family.id, debouncedRefresh);
      })
      .catch(() => {
        setRealtimeStatus("error");
      });

    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, [refresh, debouncedRefresh]);

  return {
    data,
    loading,
    refreshing,
    errorMessage,
    refresh,
    realtimeStatus,
    lastRealtimeChange,
  };
}
