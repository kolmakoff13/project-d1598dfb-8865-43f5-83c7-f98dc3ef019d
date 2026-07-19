import * as XLSX from "xlsx";
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  HeadingLevel,
  WidthType,
  BorderStyle,
  ShadingType,
  AlignmentType,
} from "docx";
import { PRIORITY_LABEL, STATUS_LABEL, type Task } from "./tasks-store";

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportExcel(tasks: Task[]) {
  const rows = tasks.map((t, i) => ({
    "№": i + 1,
    Заголовок: t.title,
    Описание: t.description,
    Ответственный: t.assignee || "—",
    Срок: t.dueDate || "—",
    Приоритет: PRIORITY_LABEL[t.priority],
    Статус: STATUS_LABEL[t.status],
    Создано: new Date(t.createdAt).toLocaleString("ru-RU"),
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 5 },
    { wch: 30 },
    { wch: 50 },
    { wch: 18 },
    { wch: 12 },
    { wch: 10 },
    { wch: 12 },
    { wch: 20 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Задачи");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  download(
    new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `tasks-${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}

const border = { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };

function cell(text: string, opts: { header?: boolean; width: number } = { width: 1500 }) {
  return new TableCell({
    borders,
    width: { size: opts.width, type: WidthType.DXA },
    shading: opts.header
      ? { fill: "1F2937", type: ShadingType.CLEAR, color: "auto" }
      : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            bold: opts.header,
            color: opts.header ? "FFFFFF" : "000000",
            size: 20,
          }),
        ],
      }),
    ],
  });
}

export async function exportWord(tasks: Task[]) {
  const widths = [500, 2200, 3200, 1600, 1100, 900, 1100];
  const header = new TableRow({
    children: [
      "№",
      "Заголовок",
      "Описание",
      "Ответственный",
      "Срок",
      "Приоритет",
      "Статус",
    ].map((t, i) => cell(t, { header: true, width: widths[i] })),
  });
  const rows = tasks.map(
    (t, i) =>
      new TableRow({
        children: [
          cell(String(i + 1), { width: widths[0] }),
          cell(t.title, { width: widths[1] }),
          cell(t.description, { width: widths[2] }),
          cell(t.assignee || "—", { width: widths[3] }),
          cell(t.dueDate || "—", { width: widths[4] }),
          cell(PRIORITY_LABEL[t.priority], { width: widths[5] }),
          cell(STATUS_LABEL[t.status], { width: widths[6] }),
        ],
      }),
  );

  const totalWidth = widths.reduce((a, b) => a + b, 0);

  const doc = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 22 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 16838, height: 11906, orientation: undefined },
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "Список задач команды", bold: true, size: 32 })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: `Сформировано: ${new Date().toLocaleString("ru-RU")}`,
                italics: true,
                size: 20,
                color: "666666",
              }),
            ],
          }),
          new Paragraph({ children: [new TextRun("")] }),
          new Table({
            width: { size: totalWidth, type: WidthType.DXA },
            columnWidths: widths,
            rows: [header, ...rows],
          }),
        ],
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  download(blob, `tasks-${new Date().toISOString().slice(0, 10)}.docx`);
}
