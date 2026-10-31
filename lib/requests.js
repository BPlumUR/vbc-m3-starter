import { appendFile, readFile, rename, unlink, writeFile } from "fs/promises";
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

// Every change to the CSV (new requests and status updates) runs through this
// one queue, one at a time, so two changes can never overwrite each other,
// interleave their writes, or hand out the same id.
let writeQueue = Promise.resolve();

function withWriteLock(work) {
  const task = writeQueue.then(work);
  writeQueue = task.catch(() => {});
  return task;
}

// Append a new request to the CSV and return it with its id.
// New requests always start with status "New".
export function addRequest({ requester_name, location, description, priority }) {
  return withWriteLock(async () => {
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
}

// Change one request's status. Returns the updated request, or null if no
// request has that id.
//
// Ids are row positions (the CSV has no id column), so this must never add,
// remove, or reorder rows. Descriptions may contain line breaks, so instead of
// editing a single line we parse the whole file, change one field, and write
// the whole file back with the same quoting, line endings, and row order.
// The new file is written to a temporary file first and then swapped in, so a
// crash part-way through can't leave a half-written CSV.
export function updateRequestStatus(id, status) {
  return withWriteLock(async () => {
    const original = await readFile(SEED_FILE, "utf8");
    const hasBom = original.startsWith("﻿");
    const text = hasBom ? original.slice(1) : original;
    const lineEnding = text.includes("\r\n") ? "\r\n" : "\n";

    const [header, ...rows] = parseCsv(text);
    const columns = header.map((name) => name.trim());
    const statusIndex = columns.indexOf("status");
    if (statusIndex === -1) {
      throw new Error("The data file has no status column.");
    }

    const row = rows[id - 1];
    if (!row) {
      return null;
    }

    const toRequest = () => {
      const request = { id };
      columns.forEach((column, i) => {
        request[column] = (row[i] ?? "").trim();
      });
      return request;
    };

    // Nothing to change: don't touch the file.
    if ((row[statusIndex] ?? "").trim() === status) {
      return toRequest();
    }

    row[statusIndex] = status;

    const output =
      (hasBom ? "﻿" : "") +
      [header, ...rows].map((r) => r.map(toCsvField).join(",")).join(lineEnding) +
      lineEnding;

    const tempFile = SEED_FILE + "." + process.pid + "." + Date.now() + ".tmp";
    try {
      await writeFile(tempFile, output, "utf8");
      await rename(tempFile, SEED_FILE);
    } catch (error) {
      await unlink(tempFile).catch(() => {});
      throw error;
    }

    return toRequest();
  });
}

// Newest first by created_at; when two requests share the exact same
// timestamp, the higher id (the one saved later) comes first.
// Used by both the table (GET /api/requests) and the CSV export.
export function sortNewestFirst(requests) {
  return [...requests].sort((a, b) => {
    const byTime = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return byTime !== 0 ? byTime : b.id - a.id;
  });
}

// Build CSV text: a header row of column names, then one row per record.
// Values with commas, quotes, or line breaks are quoted and escaped.
export function toCsv(records, columns) {
  const lines = [columns.map(toCsvField).join(",")];
  for (const record of records) {
    lines.push(columns.map((column) => toCsvField(record[column])).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}
