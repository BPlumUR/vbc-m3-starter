import { getAllRequests, sortNewestFirst, toCsv } from "../../../lib/requests";

export const dynamic = "force-dynamic";

const COLUMNS = [
  "id",
  "created_at",
  "requester_name",
  "location",
  "description",
  "priority",
  "status",
];

// GET /api/export — every request as a downloadable CSV file, newest first
// (same order as the table).
export async function GET() {
  try {
    const requests = sortNewestFirst(await getAllRequests());
    const csv = toCsv(requests, COLUMNS);

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="morrowlane-requests.csv"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("GET /api/export failed:", error);
    return Response.json(
      { error: "Could not export service requests. Please try again." },
      { status: 500 }
    );
  }
}
