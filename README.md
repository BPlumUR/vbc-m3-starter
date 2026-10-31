# Morrowlane Service Request Portal — Module 3 Starter

## The mission

Morrowlane Workplace Solutions is a workplace-operations company headquartered in Minneapolis, serving clients across four markets: Minneapolis, Chicago, Denver, and Austin. Client service requests arrive by email, by phone, and through a couple of different forms, and the Workplace Coordinators track all of it by hand — which means nobody can answer a question like "what's still open in Denver?" without digging through inboxes. You're the Regional Operations Manager, and you've had the front end of a Service Request Portal built: one page where a coordinator submits a request, sets a priority, updates status, and sees everything in one shared table.

The front end is done. **Your job in Module 3 is to build the entire back end** — the endpoints behind it, the validation, the CSV export, and the storage that keeps requests around after you deploy.

## How to run it

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

**The app looks finished, and it is intentionally non-functional.** Submitting the form fails with a friendly inline message and a 404 in the browser console. The tiles show "–". The table says there are no requests to show. That's all correct — none of the endpoints the page is calling exist yet. You are going to build them.

## The API contract the front end expects

This is the most important section in this README. The page is already written and already calling these five endpoints, with these exact URLs and these exact JSON shapes. If you build something that matches this contract, the front end lights up without you touching a line of it. Use this section as the source of truth when you prompt Claude.

Every request row has the same six fields plus an id: `id`, `created_at`, `requester_name`, `location`, `description`, `priority`, `status`.

### `GET /api/requests`

Returns every request, **newest first**.

```json
{
  "requests": [
    {
      "id": 22,
      "created_at": "2026-08-27T15:40:00Z",
      "requester_name": "Dana Whitfield",
      "location": "Minneapolis",
      "description": "HVAC making noise in suite 400",
      "priority": "High",
      "status": "Complete"
    }
  ]
}
```

Status code `200`.

### `POST /api/requests`

Creates a new request. Body:

```json
{
  "requester_name": "Dana Whitfield",
  "location": "Minneapolis",
  "description": "HVAC making noise in suite 400",
  "priority": "High"
}
```

Validation, all of it **on the server** — the browser dropdowns are a convenience, not a guarantee, and someone can always send a request without using your form:

- All four fields are required and must be non-empty after trimming whitespace.
- `location` must be one of exactly: **Minneapolis, Chicago, Denver, Austin**.
- `priority` must be one of exactly: **Low, Medium, High, Urgent**.
- `description` must be 500 characters or fewer.

On any validation failure, return `400` with a plain-English message that names the field, so the coordinator reading it knows what to fix:

```json
{ "error": "Location must be Minneapolis, Chicago, Denver, or Austin." }
```

On success, save the request with `status` set to `"New"` and return `201`:

```json
{ "request": { "id": 23, "created_at": "...", "requester_name": "...", "location": "...", "description": "...", "priority": "High", "status": "New" } }
```

### `PATCH /api/requests/[id]`

Updates one request's status. This is what the status dropdown in each table row calls. Body:

```json
{ "status": "In Progress" }
```

- `status` must be one of exactly: **New, In Progress, Complete**. Anything else → `400 {"error": "..."}`.
- An id that doesn't exist → `404 {"error": "..."}`.
- Success → `200 {"request": { ...the updated request... }}`.

### `GET /api/summary`

Feeds the three tiles at the top of the page.

```json
{ "open_requests": 9, "urgent_open": 2, "completed_this_month": 5 }
```

- **`open_requests`** — the number of requests whose status is *not* `Complete`.
- **`urgent_open`** — the number of open requests (status not `Complete`) whose priority is `Urgent`.
- **`completed_this_month`** — the number of requests with status `Complete` whose `created_at` falls in **the month of the most recent request in the data** — not the month it happens to be today. This keeps the tile meaningful no matter when someone runs the app.

Status code `200`.

### `GET /api/export`

The Export CSV link above the table. Returns the requests, newest first, as CSV — a header row plus one row per request — with:

- `Content-Type: text/csv`
- `Content-Disposition: attachment; filename="morrowlane-requests.csv"`

So the browser downloads a file instead of displaying text.

### Errors

Every handler should wrap its work in a try/catch and return clean JSON on an unexpected failure — `500 {"error": "..."}` — never an unhandled crash or a wall of stack trace. The page reads `error` off the JSON body and shows it to the user.

## The build path

Work through it in this order. Each step is one focused conversation with Claude; get each one working before you move to the next.

1. **The read side** — `GET /api/requests` and `GET /api/summary`, reading from the seed CSV. The table fills and the tiles light up.
2. **The write side** — `POST /api/requests`, so the form actually saves something.
3. **Validation** — the rules above, enforced on the server, with error messages a coordinator can read.
4. **CSV export** — `GET /api/export`, plus `PATCH /api/requests/[id]` for the status dropdown.
5. **Deploy to Netlify** — push to GitHub, connect the repo, get a live URL.
6. **Then something breaks.** On the live site, submit a request and refresh. Your data will vanish. Diagnosing *why* is the assignment — that's your debug log — and the fix is to migrate your storage to Supabase. Don't skip ahead; hitting this bug yourself is the point of the module.

## The data

`data/seed-requests.csv` is provided — 22 realistic requests. This is the starter data your endpoints should serve, so the app has something in it from the first minute. The columns are:

```
created_at,requester_name,location,description,priority,status
```

There's no `id` column on purpose — whatever stores your data will assign ids.

## About `.env.example`

`.env.example` lists two placeholder values, `SUPABASE_URL` and `SUPABASE_ANON_KEY`. **You won't need real values until the final step of the build path.** When you get there, copy the file (`cp .env.example .env.local`) and fill in the values from your own Supabase project.

`.env.local` holds your real keys. Never commit it — it's already in `.gitignore`, and it needs to stay there.

## What to submit

- [ ] Your **live Netlify URL** — the working app, deployed
- [ ] Your **GitHub repo link**
- [ ] A completed **`SUBMISSION.md`** — every section filled in, including the debug log (all five fields), the test pass table (all five checks), and the assessment
