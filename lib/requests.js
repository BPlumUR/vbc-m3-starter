import { appendFile, readFile } from "fs/promises";
import path from "path";

const SEED_FILE = path.join(process.cwd(), "data", "seed-requests.csv");

// Split CSV text into rows of fields. Handles quoted fields that contain
// commas, escaped quotes (""), and Windows or Unix line endings.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((value) => value.trim() !== ""));
}

// Read every request from the seed CSV. Ids are assigned in file order
// (oldest row = 1) because the CSV has no id column.
export async function getAllRequests() {
  const text = await readFile(SEED_FILE, "utf8");
  const [header, ...rows] = parseCsv(text.replace(/^﻿/, ""));
  const columns = header.map((name) => name.trim());

  return rows.map((values, index) => {
    const request = { id: index + 1 };
    columns.forEach((column, i) => {
      request[column] = (values[i] ?? "").trim();
    });
    return request;
  });
}

// Quote a value for CSV if it contains a comma, quote, or line break.
function toCsvField(value) {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) {
    return '"' + text.replace(/"/g, '""') + '"';
  }
  return text;
}

// Saves run one at a time so two quick submissions can't get the same id
// or interleave their writes.
let writeQueue = Promise.resolve();

// Append a new request to the CSV and return it with its id.
// New requests always start with status "New".
export function addRequest({ requester_name, location, description, priority }) {
  const task = writeQueue.then(async () => {
    const text = await readFile(SEED_FILE, "utf8");
    const existing = await getAllRequests();
    const lineEnding = text.includes("\r\n") ? "\r\n" : "\n";
    const needsLeadingBreak = text.length > 0 && !/[\r\n]$/.test(text);

    const request = {
      id: existing.length + 1,
      created_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      requester_name,
      location,
      description,
      priority,
      status: "New",
    };

    const line = [
      request.created_at,
      request.requester_name,
      request.location,
      request.description,
      request.priority,
      request.status,
    ]
      .map(toCsvField)
      .join(",");

    await appendFile(
      SEED_FILE,
      (needsLeadingBreak ? lineEnding : "") + line + lineEnding,
      "utf8"
    );
    return request;
  });

  writeQueue = task.catch(() => {});
  return task;
}
