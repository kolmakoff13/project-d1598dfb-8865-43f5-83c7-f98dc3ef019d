export type TaskStatus = "in_progress" | "overdue" | "completed";

export interface Task {
  id: string;
  title: string;
  description: string;
  assignee: string;
  dueDate: string | null;
  priority: "low" | "medium" | "high";
  status: TaskStatus;
  createdAt: string;
  transcript?: string;
}

const KEY = "voice-tasks-v1";

export function loadTasks(): Task[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Task[];
  } catch {
    return [];
  }
}

export function saveTasks(tasks: Task[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(tasks));
}

export function computeStatus(t: Task): TaskStatus {
  if (t.status === "completed") return "completed";
  if (t.dueDate) {
    const due = new Date(t.dueDate + "T23:59:59");
    if (due.getTime() < Date.now()) return "overdue";
  }
  return "in_progress";
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  in_progress: "В работе",
  overdue: "Просрочено",
  completed: "Завершено",
};

export const PRIORITY_LABEL: Record<Task["priority"], string> = {
  low: "Низкий",
  medium: "Средний",
  high: "Высокий",
};
