# Module 3 Playbook Submission — Service Request Portal

**Name:** Brian Plummer
**Live URL:** https://morrowlane-requests.netlify.app
**Repo:** https://github.com/BPlumUR/vbc-m3-starter

## What I built

I built a web-based service request tracker for Morrowlane Workplace Solutions, a fictional company managing workplace service requests across multiple office locations. The application allows employees to submit requests with their name, office location, description and priority. Operations staff can view requests, change their status from New to In Progress or Complete, and monitor open requests, urgent requests and monthly completions through a dashboard. The application also exports request data to CSV for reporting. I used Claude to help build and debug the back-end functionality, with Supabase providing persistent database storage and Netlify hosting the live application.

## Debug Log

### Symptom

On the live site (https://morrowlane-requests.netlify.app), the page loaded, the summary tiles showed 10 / 2 / 0, the table listed all 23 requests, and CSV export worked. But when I submitted a valid new request, the live app returned **HTTP 500** and the form showed:

> "Could not save the request. Please try again."

- **What I expected:** The new request would save and appear in the table, which is what happens on my laptop at `localhost:3000`.
- **What actually happened:** The live `POST /api/requests` endpoint returned **HTTP 500** with `{"error":"Could not save the request. Please try again."}`. Nothing was saved, and after a refresh the table still showed 23 requests.

### What I asked Claude

First, I asked Claude to investigate the failure without changing any code, and I gave it the exact error message so it could test a specific idea: that the server couldn't write to the CSV file on Netlify.

> Step 7 live deployment test has reproduced a failure. Live URL: https://morrowlane-requests.netlify.app. The application loads correctly, the summary tiles display 10 / 2 / 0, and CSV export works. However, submitting a new request on the live Netlify application failed. Please investigate this failure without modifying any code yet. […] The exact error displayed on the live application was: "Could not save the request. Please try again." Investigate whether the POST endpoint returned HTTP 500 because the Netlify serverless function cannot write to data/seed-requests.csv.

Once Netlify's logs confirmed the cause, I set up the Supabase database myself. Then I asked Claude to move the app's storage from the CSV file to that database, with strict limits:

> Proceed with the Supabase backend migration. […] Keep all Supabase credentials server-side. Never expose, print, or commit the secret key. […] Do not alter the existing 23 database records during migration. […] Verify connection using read-only operations first. […] Stop after the read-only verification and build. Report any errors before making test inserts or updates.

After that, I approved each test step one at a time: one controlled save test, then status-change and persistence tests on that one test record only. Last, I asked Claude to commit and push only the four changed code files.

### Root cause

Netlify's function logs **confirmed** the cause. The same error was logged on October 31, 2026, at 3:44:38 PM, 3:44:42 PM, and 3:47:08 PM:

```
POST /api/requests failed: Error: EROFS: read-only file system, open '/var/task/data/seed-requests.csv'
```

My original back end saved each new request by adding a line to `data/seed-requests.csv`. On my laptop that's a normal file the app can write to. On Netlify, the back end runs as serverless functions, and the files deployed with the app (in `/var/task`) are **read-only**. The server could still *read* the CSV, which is why the table, tiles and export all worked. But when it tried to *write* a new row to `/var/task/data/seed-requests.csv`, the system refused with `EROFS` ("read-only file system"). The save code caught that error and returned HTTP 500 with "Could not save the request. Please try again."

Writing to Netlify's only writable folder (`/tmp`) wouldn't have fixed it. Each function copy has its own temporary storage that's wiped on restart or redeploy, so saved requests would randomly disappear. On a serverless host, a file inside the deployed app can't be shared, permanent storage.

**Supporting evidence: same code, same kind of request, different result.** Between the Netlify failures, I submitted a test request on my laptop and it saved. That showed the code and validation worked, and the problem was where the app was running.

| Where | Time (Oct 31, 2026) | Request | Result |
|---|---|---|---|
| Netlify (live) | 3:44:38 PM, 3:44:42 PM, 3:47:08 PM | Valid new request | **HTTP 500** — "Could not save the request. Please try again." — logged as `EROFS: read-only file system` |
| Laptop (`localhost:3000`) | 3:46:54 PM | "Netlify Test", Denver, Low, "Module 3 live deployment persistence test" | **HTTP 201** — saved as request #24 and added to the end of `data/seed-requests.csv` |

### Fix

I moved the app's storage from the CSV file to a Supabase (PostgreSQL) database:

1. **Created the database.** I made a `public.service_requests` table in Supabase with the same seven fields (`id`, `created_at`, `requester_name`, `location`, `description`, `priority`, `status`). It has Row Level Security turned on and database rules matching the app's validation.
2. **Imported the original 23 records.** I imported them with their original IDs (1–23) and reset the ID counter so new requests would continue from there.
3. **Migrated `lib/requests.js`.** Claude rewrote this file so the server reads, inserts and updates requests in Supabase instead of the CSV. The only other code change was one comment in `app/api/requests/route.js`. The API endpoints, validation rules, error messages, sorting, CSV export and front end all stayed the same.
4. **Configured environment variables.** I stored `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in `.env.local` on my laptop (Git ignores this file, so it's never committed) and in Netlify's environment variables. The key is used only on the server and is never sent to the browser.
5. **Deployed.** I committed the change as GitHub commit **`65c7663`** ("Fix Netlify persistence using Supabase") and deployed it to Netlify.

### Verification

**On my laptop (before deploying):**

| Test | Result |
|---|---|
| Read-only checks: database connection, record count, table data, summary tiles and CSV export all match the original data, with no records changed | **19/19 passed** |
| Save (POST) checks: one controlled test request returned HTTP 201 and was saved in Supabase | **12/12 passed** |
| Status change (PATCH) and persistence checks on that one test record: status updates, tile changes, the change surviving a server restart, and the original 23 records staying unchanged | **23/23 passed** |

**On the live Netlify site (after deploying commit `65c7663`):**

- I submitted a new request on the live app and it saved as **request ID 25**. The app no longer showed "Could not save the request. Please try again."
- I ran a SQL query in Supabase that independently confirmed request ID 25 was stored in the database.
- The dashboard showed **11 open requests, 2 urgent open requests and 1 completed this month**.
- The Netlify function logs I inspected showed no visible errors.

**Follow-up production tests (October 31, 2026):**

| # | What I did | Result |
|---|---|---|
| 1 | **Status update (PATCH):** On the live site, I changed the "Netlify Production Test" request (ID 25) from New to In Progress, then refreshed the browser. | **Passed.** The status stayed In Progress after the refresh. |
| 2 | **CSV export:** I downloaded the live CSV export. | **Passed.** It contained all 25 request records, including ID 25 with location Denver, priority Medium and status In Progress. |
| 3 | **Redeploy:** I triggered a fresh Netlify deployment of the existing `main` branch. | **Passed.** The deployment completed successfully and was Published. |
| 4 | **Persistence after redeploy:** After the redeployment, I refreshed the production app. | **Passed.** Request ID 25 still showed In Progress. |

Together, these tests confirm that on the live site, saving new requests (POST), updating statuses (PATCH) and CSV export all work. They also confirm the data now survives redeployments, which the original CSV-file storage could not do on Netlify.

## Test pass results

I ran all five checks on the live site (https://morrowlane-requests.netlify.app) on October 31, 2026.

| # | Check | What I did | Result | Fix made |
|---|---|---|---|---|
| 1 | Valid entry | Submitted a complete, valid request on the live site. | **PASS.** The request saved as ID 25. A SQL query in Supabase confirmed it was stored in the database. | The original live save failed (HTTP 500, `EROFS` read-only file system; see Debug Log). I fixed it by moving storage from the CSV file to Supabase (commit `65c7663`). |
| 2 | Empty form | Clicked Save with every field left empty. | **PASS.** The app showed "Requester name is required." No record was saved. | None needed. |
| 3 | Duplicate-ish | Submitted two identical "Duplicate Test" requests. | **PASS, actual behavior recorded.** Both were accepted and appeared in the table as IDs 26 and 27. The app does not detect duplicates. | No fix made. Duplicate prevention is not implemented; listed under Known limitations. |
| 4 | Absurd values | Entered a 120-character requester name and submitted. | **PASS.** The app rejected it: "Requester name must be 100 characters or fewer (you entered 120)." No record was saved. | None needed. |
| 5 | Hand-checked tile math | Exported the live CSV (27 records) and counted the statuses by hand: 6 New, 7 In Progress, 14 Complete. | **PASS.** By hand: Open requests = 13 (6 + 7), Urgent open = 2, Completed this month = 1. All three match the live dashboard. | None needed. |

## Known limitations

- **Duplicate requests are allowed.** I didn't build duplicate detection. In my live test, two identical "Duplicate Test" requests were both saved as separate records (IDs 26 and 27).
- **There is no login or role-based access.** Anyone who can open the app can submit requests and change any request's status. The app can't tell who someone is or limit what they're allowed to do.
- **Only the current status is stored.** When a status changes, the old value is overwritten. The app keeps no history of status changes and doesn't record who made them or when.
- **The database still contains fictional test records.** These include the requests I used to verify Supabase persistence (IDs 24 and 25) and duplicate behavior (IDs 26 and 27). They would need to be removed before real operational use.

## Assessment

For this assignment, I developed and tested a web-based service request tracker for Morrowlane Workplace Solutions, a fictional organization managing workplace service requests across multiple locations. The application allows users to submit requests, assign priorities, update statuses, monitor dashboard metrics, and export records to CSV.

Using Claude significantly accelerated development, particularly when implementing backend functionality, connecting the database, and troubleshooting errors. However, this assignment demonstrated that AI-generated code can appear functional without being ready for production.

My biggest challenge occurred after deploying the application to Netlify. The dashboard and CSV export worked, but submitting a new request returned an HTTP 500 error. Saving requests had worked correctly on my laptop, so the code initially appeared ready for deployment until I tested it on Netlify. Examining the function logs revealed that the application was attempting to write data to a read-only filesystem. Claude helped me understand the root cause and migrate storage from a CSV file to a Supabase PostgreSQL database.

After implementing the fix, I completed five live application tests covering valid submissions, empty fields, duplicate requests, excessive input lengths, and dashboard calculations. I also verified status updates, CSV exports, and data persistence after redeployment. The application passed these functional checks, although duplicate prevention and user authentication remain known limitations.

The most valuable lesson was learning to validate AI-generated work through actual testing rather than accepting successful builds or AI assurances. In future projects, I would specify hosting constraints, persistent storage requirements, security considerations, and acceptance tests at the beginning.
