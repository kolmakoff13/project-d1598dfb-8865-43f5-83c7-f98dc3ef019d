import { createServerFn } from "@tanstack/react-start";

interface ParsedTask {
  title: string;
  description: string;
  assignee: string;
  dueDate: string | null; // ISO date
  priority: "low" | "medium" | "high";
}

interface ProcessResult {
  transcript: string;
  task: ParsedTask;
}

export const processVoiceTask = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const data = input as { audioBase64: string; mimeType: string };
    if (!data?.audioBase64) throw new Error("audioBase64 required");
    return data;
  })
  .handler(async ({ data }): Promise<ProcessResult> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    // 1. Decode audio and transcribe
    const bin = atob(data.audioBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    const extMap: Record<string, string> = {
      "audio/webm": "webm",
      "audio/mp4": "mp4",
      "audio/mpeg": "mp3",
      "audio/wav": "wav",
      "audio/ogg": "ogg",
    };
    const ext = extMap[data.mimeType.split(";")[0]] ?? "webm";

    const fd = new FormData();
    fd.append("model", "openai/gpt-4o-mini-transcribe");
    fd.append("file", new Blob([bytes], { type: data.mimeType }), `rec.${ext}`);
    fd.append("language", "ru");

    const sttRes = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: fd,
    });
    if (!sttRes.ok) {
      const t = await sttRes.text();
      throw new Error(`Transcription failed: ${sttRes.status} ${t}`);
    }
    const sttJson = (await sttRes.json()) as { text: string };
    const transcript = (sttJson.text ?? "").trim();

    // If transcript is empty, return an empty task without invoking LLM
    if (!transcript) {
      return {
        transcript: "",
        task: {
          title: "",
          description: "",
          assignee: "",
          dueDate: null,
          priority: "medium",
        },
      };
    }


    const today = new Date().toISOString().slice(0, 10);
    const chatRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Ты помощник, который превращает голосовые заметки на русском языке в структурированные задачи для рабочей команды. Сегодня ${today}. Верни JSON строго по схеме без пояснений: {"title": string (краткий заголовок задачи, до 80 символов), "description": string (подробное описание), "assignee": string (имя ответственного или "" если не указан), "dueDate": string|null (срок в формате YYYY-MM-DD, вычисли из фраз "завтра", "через неделю", "к пятнице" и т.п. относительно сегодняшней даты; null если срок не указан), "priority": "low"|"medium"|"high" (по умолчанию "medium")}`,
          },
          { role: "user", content: transcript },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!chatRes.ok) {
      const t = await chatRes.text();
      throw new Error(`Parse failed: ${chatRes.status} ${t}`);
    }
    const chatJson = (await chatRes.json()) as {
      choices: { message: { content: string } }[];
    };
    const raw = chatJson.choices?.[0]?.message?.content ?? "{}";
    let task: ParsedTask;
    try {
      task = JSON.parse(raw) as ParsedTask;
    } catch {
      task = {
        title: transcript.slice(0, 80) || "Новая задача",
        description: transcript,
        assignee: "",
        dueDate: null,
        priority: "medium",
      };
    }

    return { transcript, task };
  });
