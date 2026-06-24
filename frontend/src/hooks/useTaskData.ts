import { useCallback, useState } from "react";
import { TaskAPI } from "@/lib/api/taskApi";
import api from "@/lib/api";
import { normalizeTaskFromApi } from "@/lib/tasks/normalizeTaskFromApi";
import { TaskData, CreateTaskData, TaskListFilters } from "@/types/task";
import { useTaskStore } from "@/lib/taskStore";

type TaskFetchParams = TaskListFilters & {
  content_type?: string;
  object_id?: string;
  page?: number;
};

const taskErrorMessage = (err: unknown, fallback: string) => {
  const apiData = (err as any)?.response?.data;
  if (typeof apiData === "string") return apiData;
  if (apiData?.detail) return String(apiData.detail);
  if (apiData?.error) return String(apiData.error);
  if ((err as any)?.message) return String((err as any).message);
  return fallback;
};

export const useTaskData = () => {
  const {
    tasks,
    currentTask,
    setTasks,
    setCurrentTask,
    updateTask,
    addTask,
  } = useTaskStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [lastParams, setLastParams] = useState<TaskFetchParams | undefined>(
    undefined,
  );

  // Get all tasks with optional filters
  const fetchTasks = useCallback(
    async (params?: TaskFetchParams) => {
      // Record the last request parameters
      setLastParams(params || undefined);

      try {
        setLoading(true);
        setError(null);

        // Fetch all pages of tasks
        let allTasks: any[] = [];
        let nextUrl: string | null = null;
        let page = 1;

        do {
          let response: any;

          try {
            if (nextUrl) {
              // Extract relative path+query to avoid mixed-content errors when
              // the backend returns an absolute HTTP URL on an HTTPS page.
              const parsed = new URL(nextUrl, window.location.origin);
              response = await api.get(parsed.pathname + parsed.search);
            } else {
              // Otherwise, use TaskAPI with params and page number
              const requestParams = { ...params, page };
              response = await TaskAPI.getTasks(requestParams);
            }
          } catch (err) {
            // The task list can change while we are walking paginated results.
            // If a later page disappears, keep the pages already fetched.
            if (allTasks.length > 0 && /invalid page/i.test(taskErrorMessage(err, ""))) {
              break;
            }
            throw err;
          }

          const responseData: any = response.data;
          const tasks =
            responseData.results ||
            (Array.isArray(responseData) ? responseData : []);
          allTasks = allTasks.concat(tasks);

          nextUrl = responseData.next || null;
          page++;

          // Safety limit to prevent infinite loops
          if (page > 100) break;
        } while (nextUrl);

        const normalized = allTasks.map((row) => normalizeTaskFromApi(row));
        setTasks(normalized);
        return normalized;
      } catch (err) {
        setError(taskErrorMessage(err, "Failed to load tasks"));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [setTasks],
  );

  // Get a specific task by ID
  const fetchTask = useCallback(
    async (taskId: number | string): Promise<TaskData> => {
      try {
        setLoading(true);
        setError(null);
        const response = await TaskAPI.getTask(taskId);
        const task = response.data;
        setCurrentTask(task);
        return task;
      } catch (err) {
        setError(taskErrorMessage(err, "Failed to load task"));
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [setCurrentTask],
  );

  // Force create a new task
  const createTask = useCallback(
    async (taskData: CreateTaskData): Promise<TaskData> => {
      setLoading(true);
      setError(null);

      try {
        const response = await TaskAPI.createTask(taskData);
        const newTask = response.data as TaskData;

        addTask(newTask);
        return newTask;
      } catch (err) {
        // Use the fallback interface to try again
        try {
          const forceResponse = await TaskAPI.forceCreateTask(taskData);
          const newTask = forceResponse.data as TaskData;

          addTask(newTask);
          return newTask;
        } catch (forceErr) {
          setError(taskErrorMessage(forceErr, "Failed to create task"));
          throw forceErr;
        }
      } finally {
        setLoading(false);
      }
    },
    [addTask],
  );

  // Reload tasks function for manual refresh
  const reloadTasks = useCallback(async () => {
    await fetchTasks(lastParams);
  }, [fetchTasks, lastParams]);

  return {
    tasks,
    currentTask,
    loading,
    error,
    fetchTasks,
    fetchTask,
    createTask,
    updateTask,
    reloadTasks,
  };
};
