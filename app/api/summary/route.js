import { getAllRequests } from "../../../lib/requests";

export const dynamic = "force-dynamic";

// "YYYY-MM" in UTC, so the month never shifts with the server's time zone.
function monthKey(timestamp) {
  const date = new Date(timestamp);
  return date.getUTCFullYear() + "-" + String(date.getUTCMonth() + 1).padStart(2, "0");
}

// GET /api/summary — the three tiles at the top of the page.
export async function GET() {
  try {
    const requests = await getAllRequests();

    const open = requests.filter((r) => r.status !== "Complete");
    const urgentOpen = open.filter((r) => r.priority === "Urgent");

    // "This month" means the month of the most recent request in the data,
    // not today's date, so the tile stays meaningful whenever the app runs.
    let completedThisMonth = 0;
    if (requests.length > 0) {
      const newest = requests.reduce((latest, r) =>
        new Date(r.created_at) > new Date(latest.created_at) ? r : latest
      );
      const targetMonth = monthKey(newest.created_at);
      completedThisMonth = requests.filter(
        (r) => r.status === "Complete" && monthKey(r.created_at) === targetMonth
      ).length;
    }

    return Response.json(
      {
        open_requests: open.length,
        urgent_open: urgentOpen.length,
        completed_this_month: completedThisMonth,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("GET /api/summary failed:", error);
    return Response.json(
      { error: "Could not load the summary. Please try again." },
      { status: 500 }
    );
  }
}
