import { addRequest, getAllRequests } from "../../../lib/requests";

export const dynamic = "force-dynamic";

// GET /api/requests — every request, newest first.
export async function GET() {
  try {
    const requests = await getAllRequests();
    requests.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return Response.json({ requests }, { status: 200 });
  } catch (error) {
    console.error("GET /api/requests failed:", error);
    return Response.json(
      { error: "Could not load service requests. Please try again." },
      { status: 500 }
    );
  }
}

const FIELDS = ["requester_name", "location", "description", "priority"];
const LABELS = {
  requester_name: "Requester name",
  location: "Location",
  description: "Description",
  priority: "Priority",
};

// POST /api/requests — save a new request and return it.
// Full validation rules (allowed locations/priorities, length) come in the
// validation step; for now we only make sure all four fields are filled in.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "The request body must be valid JSON." },
      { status: 400 }
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json(
      { error: "The request body must be a JSON object." },
      { status: 400 }
    );
  }

  const cleaned = {};
  for (const field of FIELDS) {
    const value = typeof body[field] === "string" ? body[field].trim() : "";
    if (!value) {
      return Response.json(
        { error: LABELS[field] + " is required." },
        { status: 400 }
      );
    }
    cleaned[field] = value;
  }

  try {
    const saved = await addRequest(cleaned);
    return Response.json({ request: saved }, { status: 201 });
  } catch (error) {
    console.error("POST /api/requests failed:", error);
    return Response.json(
      { error: "Could not save the request. Please try again." },
      { status: 500 }
    );
  }
}
