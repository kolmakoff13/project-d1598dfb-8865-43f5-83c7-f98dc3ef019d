import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Mic, Square, Loader2, FileSpreadsheet, FileText, Pencil, Trash2, CheckCircle2, Clock, AlertTriangle, ListTodo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Toaster } from "@/components/ui/sonner";
import { processVoiceTask } from "@/lib/voice.functions";
import {
  computeStatus,
  loadTasks,
  PRIORITY_LABEL,
  saveTasks,
  STATUS_LABEL,
  type Task,
  type TaskStatus,
} from "@/lib/tasks-store";
import { exportExcel, exportWord } from "@/lib/exports";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ГолосЗадачи — задачи для команды из голосовых заметок" },
      {
        name: "description",
        content:
          "Диктуйте задачи голосом — приложение превратит речь в структурированную задачу со сроком, ответственным и статусом. Экспорт в Excel и Word.",
      },
      { property: "og:title", content: "ГолосЗадачи — задачи для команды" },
      {
        property: "og:description",
        content:
          "Голосовая расшифровка задач на русском, статусы, редактирование, экспорт в Excel/Word.",
      },
    ],
  }),
  component: Home,
});

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [filter, setFilter] = useState<"all" | TaskStatus>("all");
  const [editing, setEditing] = useState<Task | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const process = useServerFn(processVoiceTask);

  useEffect(() => {
    const loaded = loadTasks().map((t) => ({ ...t, status: computeStatus(t) }));
    setTasks(loaded);
  }, []);

  useEffect(() => {
    saveTasks(tasks);
  }, [tasks]);

  // Recompute overdue every minute
  useEffect(() => {
    const i = setInterval(() => {
      setTasks((prev) => prev.map((t) => ({ ...t, status: computeStatus(t) })));
    }, 60_000);
    return () => clearInterval(i);
  }, []);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mime });
        if (blob.size < 1000) {
          toast.error("Запись слишком короткая");
          return;
        }
        await handleTranscribe(blob, mime);
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch {
      toast.error("Нет доступа к микрофону");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  async function handleTranscribe(blob: Blob, mime: string) {
    setProcessing(true);
    try {
      const buf = await blob.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(buf);
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(
          null,
          Array.from(bytes.subarray(i, i + chunk)),
        );
      }
      const base64 = btoa(binary);
      const res = await process({ data: { audioBase64: base64, mimeType: mime } });
      const t: Task = {
        id: uid(),
        title: res.task.title || "Новая задача",
        description: res.task.description || "",
        assignee: res.task.assignee || "",
        dueDate: res.task.dueDate,
        priority: res.task.priority || "medium",
        status: "in_progress",
        createdAt: new Date().toISOString(),
        transcript: res.transcript,
      };
      t.status = computeStatus(t);
      setTasks((prev) => [t, ...prev]);
      toast.success("Задача создана");
    } catch (e) {
      console.error(e);
      toast.error("Не удалось обработать запись");
    } finally {
      setProcessing(false);
    }
  }

  function updateStatus(id: string, status: TaskStatus) {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: computeStatus({ ...t, status }) } : t)),
    );
  }
  function removeTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }
  function saveEdit(updated: Task) {
    setTasks((prev) =>
      prev.map((t) => (t.id === updated.id ? { ...updated, status: computeStatus(updated) } : t)),
    );
    setEditing(null);
  }

  const filtered = filter === "all" ? tasks : tasks.filter((t) => t.status === filter);
  const counts = {
    all: tasks.length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    overdue: tasks.filter((t) => t.status === "overdue").length,
    completed: tasks.filter((t) => t.status === "completed").length,
  };

  return (
    <div className="min-h-screen bg-background">
      <Toaster position="top-center" richColors />
      <header className="border-b border-border/60 bg-card/40 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 py-6 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground grid place-items-center">
            <ListTodo className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">ГолосЗадачи</h1>
            <p className="text-sm text-muted-foreground">
              Задачи из голоса — для рабочей команды
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8 space-y-8">
        {/* Recorder */}
        <Card className="p-8 flex flex-col items-center gap-4 border-2 border-dashed">
          <button
            onClick={recording ? stopRecording : startRecording}
            disabled={processing}
            className={`relative h-24 w-24 rounded-full grid place-items-center transition-all shadow-lg ${
              recording
                ? "bg-destructive text-destructive-foreground animate-pulse"
                : "bg-primary text-primary-foreground hover:scale-105"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
            aria-label={recording ? "Остановить запись" : "Начать запись"}
          >
            {processing ? (
              <Loader2 className="h-9 w-9 animate-spin" />
            ) : recording ? (
              <Square className="h-9 w-9" fill="currentColor" />
            ) : (
              <Mic className="h-10 w-10" />
            )}
          </button>
          <div className="text-center">
            <p className="font-medium">
              {processing
                ? "Обрабатываем запись…"
                : recording
                ? "Идёт запись — нажмите, чтобы остановить"
                : "Нажмите, чтобы продиктовать задачу"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Например: «Ивану — подготовить отчёт по продажам к пятнице, приоритет высокий»
            </p>
          </div>
        </Card>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <FilterBtn active={filter === "all"} onClick={() => setFilter("all")} label={`Все (${counts.all})`} />
            <FilterBtn
              active={filter === "in_progress"}
              onClick={() => setFilter("in_progress")}
              label={`В работе (${counts.in_progress})`}
            />
            <FilterBtn
              active={filter === "overdue"}
              onClick={() => setFilter("overdue")}
              label={`Просрочено (${counts.overdue})`}
            />
            <FilterBtn
              active={filter === "completed"}
              onClick={() => setFilter("completed")}
              label={`Завершено (${counts.completed})`}
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => exportExcel(tasks)}
              disabled={!tasks.length}
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" /> Excel
            </Button>
            <Button
              variant="outline"
              onClick={() => exportWord(tasks)}
              disabled={!tasks.length}
            >
              <FileText className="h-4 w-4 mr-2" /> Word
            </Button>
          </div>
        </div>

        {/* Task list */}
        <div className="space-y-3">
          {filtered.length === 0 && (
            <Card className="p-12 text-center text-muted-foreground">
              Задач пока нет. Продиктуйте первую задачу — она появится здесь.
            </Card>
          )}
          {filtered.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              onStatus={(s) => updateStatus(t.id, s)}
              onEdit={() => setEditing(t)}
              onDelete={() => removeTask(t.id)}
            />
          ))}
        </div>
      </main>

      <EditDialog task={editing} onClose={() => setEditing(null)} onSave={saveEdit} />
    </div>
  );
}

function FilterBtn({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card border-border hover:bg-accent"
      }`}
    >
      {label}
    </button>
  );
}

function StatusBadge({ status }: { status: TaskStatus }) {
  const cfg = {
    in_progress: { icon: Clock, cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30" },
    overdue: { icon: AlertTriangle, cls: "bg-destructive/15 text-destructive border-destructive/30" },
    completed: { icon: CheckCircle2, cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" },
  }[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.cls}`}>
      <Icon className="h-3.5 w-3.5" />
      {STATUS_LABEL[status]}
    </span>
  );
}

function TaskCard({
  task,
  onStatus,
  onEdit,
  onDelete,
}: {
  task: Task;
  onStatus: (s: TaskStatus) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <StatusBadge status={task.status} />
            <Badge variant="secondary">{PRIORITY_LABEL[task.priority]}</Badge>
            {task.dueDate && (
              <Badge variant="outline">до {task.dueDate}</Badge>
            )}
            {task.assignee && <Badge variant="outline">@ {task.assignee}</Badge>}
          </div>
          <h3 className="font-semibold text-base leading-snug">{task.title}</h3>
          {task.description && (
            <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
              {task.description}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          <Select value={task.status} onValueChange={(v) => onStatus(v as TaskStatus)}>
            <SelectTrigger className="w-[150px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="in_progress">В работе</SelectItem>
              <SelectItem value="overdue">Просрочено</SelectItem>
              <SelectItem value="completed">Завершено</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex gap-1 justify-end">
            <Button size="icon" variant="ghost" onClick={onEdit} aria-label="Редактировать">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={onDelete} aria-label="Удалить">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function EditDialog({
  task,
  onClose,
  onSave,
}: {
  task: Task | null;
  onClose: () => void;
  onSave: (t: Task) => void;
}) {
  const [draft, setDraft] = useState<Task | null>(task);
  useEffect(() => setDraft(task), [task]);
  if (!draft) return null;

  return (
    <Dialog open={!!task} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Редактировать задачу</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Заголовок</Label>
            <Input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </div>
          <div>
            <Label>Описание</Label>
            <Textarea
              rows={4}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Ответственный</Label>
              <Input
                value={draft.assignee}
                onChange={(e) => setDraft({ ...draft, assignee: e.target.value })}
              />
            </div>
            <div>
              <Label>Срок</Label>
              <Input
                type="date"
                value={draft.dueDate ?? ""}
                onChange={(e) => setDraft({ ...draft, dueDate: e.target.value || null })}
              />
            </div>
            <div>
              <Label>Приоритет</Label>
              <Select
                value={draft.priority}
                onValueChange={(v) => setDraft({ ...draft, priority: v as Task["priority"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Низкий</SelectItem>
                  <SelectItem value="medium">Средний</SelectItem>
                  <SelectItem value="high">Высокий</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Статус</Label>
              <Select
                value={draft.status}
                onValueChange={(v) => setDraft({ ...draft, status: v as TaskStatus })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_progress">В работе</SelectItem>
                  <SelectItem value="overdue">Просрочено</SelectItem>
                  <SelectItem value="completed">Завершено</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={() => onSave(draft)}>Сохранить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
