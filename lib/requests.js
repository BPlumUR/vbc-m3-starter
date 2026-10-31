import { createClient } from "@supabase/supabase-js";

// All request data lives in the Supabase table public.service_requests.
// (Previously this file read and wrote data/seed-requests.csv, which fails on
// Netlify because deployed files are read-only — see the Debug Log.)
//
// This module only ever runs on the server (inside the API route handlers).
// The secret key bypasses Row Level Security, so it must never be sent to the
// browser: no NEXT_PUBLIC_ prefix, never logged, never committed.

const TABLE = "service_requests";
const COLUMNS = "id, created_at, requester_name, location, description, priority, status";
const PAGE_SIZE = 1000; // Supabase returns at most 1000 rows per request by default.

let client = null;

// Create the Supabase client on first use (not at import time), so the app can
// still build without credentials and a missing setting gives a clear error.
function db() {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  const missing = [!url && "SUPABASE_URL", !key && "SUPABASE_SECRET_KEY"].filter(Boolean);
  if (missing.length > 0) {
    throw new Error("Supabase is not configured. Missing environment variable(s): " + missing.join(", "));
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

// Turn a Supabase error into a normal Error with a readable message. The route
// handlers log it and return their usual 500 JSON response.
function fail(action, error) {
  const detail = [error.code, error.message].filter(Boolean).join(" ");
  return new Error(`Supabase ${action} failed: ${detail}`);
}

// Postgres returns timestamps like "2026-07-16T14:20:00+00:00". Keep the API's
// existing format, "2026-07-16T14:20:00Z" (UTC, milliseconds only if present).
function formatTimestamp(value) {
  const date = new Date(value);
  if (isNaN(date.getTime())) return value;
  return date.toISOString().replace(/\.000Z$/, "Z");
}

function toRequest(row) {
  return {
    id: Number(row.id),
    created_at: formatTimestamp(row.created_at),
    requester_name: row.requester_name,
    location: row.location,
    description: row.description,
    priority: row.priority,
    status: row.status,
  };
}

// Every request, oldest id first. (Routes sort with sortNewestFirst.)
export async function getAllRequests() {
  const requests = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db()
      .from(TABLE)
      .select(COLUMNS)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw fail("read", error);
    requests.push(...data.map(toRequest));
    if (data.length < PAGE_SIZE) break;
  }
  return requests;
}

// Save a new request and return it with the id the database assigned.
// New requests always start with status "New".
export async function addRequest({ requester_name, location, description, priority }) {
  const { data, error } = await db()
    .from(TABLE)
    .insert({
      created_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      requester_name,
      location,
      description,
      priority,
      status: "New",
    })
    .select(COLUMNS)
    .single();
  if (error) throw fail("insert", error);
  return toRequest(data);
}

// Change one request's status. Returns the updated request, or null if no
// request has that id. Only the status column is ever changed.
export async function updateRequestStatus(id, status) {
  const { data, error } = await db()
    .from(TABLE)
    .update({ status })
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw fail("update", error);
  return data ? toRequest(data) : null;
}

// Quote a value for CSV if it contains a comma, quote, or line break.
function toCsvField(value) {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) {
    return '"' + text.replace(/"/g, '""') + '"';
  }
  return text;
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
