import { useCallback, useEffect, useRef, useState } from 'react';
import { taskApi } from '../api/endpoints';

const DEFAULT_FILTERS = { status: '', category: '', priorityLevel: '', sortBy: 'occurredAt', sortOrder: 'desc', page: 1, limit: 20, includeIneligible: 'false' };
export function useTasks({ user }) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [data, setData] = useState({ tasks: [], pagination: null, highPriority: [], upcomingDeadlines: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const requestNumber = useRef(0);
  const loadAll = useCallback(async () => {
    const request = ++requestNumber.current;
    setLoading(true); setError(null);
    try {
      const [list, high, upcoming] = await Promise.all([taskApi.list(filters), taskApi.highPriority(), taskApi.upcoming()]);
      if (request === requestNumber.current) setData({
        tasks: list.data.tasks, pagination: list.data.pagination, highPriority: high.data, upcomingDeadlines: upcoming.data,
      });
    } catch (err) {
      if (request === requestNumber.current) setError(err.message || 'Failed to load tasks');
    } finally {
      if (request === requestNumber.current) setLoading(false);
    }
  }, [filters]);
  useEffect(() => {
    // Loading state accompanies a network request, not derived local state.
    // oxlint-disable-next-line react/set-state-in-effect
    loadAll();
    return () => { requestNumber.current += 1; };
  }, [loadAll, user.updatedAt]);
  const updateStatus = useCallback(async (taskId, status) => {
    const result = await taskApi.updateStatus(taskId, status);
    await loadAll();
    return result.data;
  }, [loadAll]);
  const reloadAfterSync = useCallback(async () => {
    if (filters.page !== 1) setFilters(prev => ({ ...prev, page: 1 }));
    else await loadAll();
  }, [filters.page, loadAll]);
  return {
    ...data, filters, setFilters: patch => setFilters(prev => ({ ...prev, ...patch, page: patch.page ?? 1 })),
    loading, error, reload: loadAll, reloadAfterSync, updateStatus,
  };
}
