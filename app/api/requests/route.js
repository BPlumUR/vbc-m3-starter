import { addRequest, getAllRequests, sortNewestFirst } from "../../../lib/requests";

export const dynamic = "force-dynamic";

// GET /api/requests — every request, newest first.
export async function GET() {
  try {
    const requests = sortNewestFirst(await getAllRequests());
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

const LOCATIONS = ["Minneapolis", "Chicago", "Denver", "Austin"];
const PRIORITIES = ["Low", "Medium", "High", "Urgent"];
const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;

// Check the cleaned fields against the business rules. Returns a
// plain-English error naming the field, or null if everything is valid.
// Matching is exact (case-sensitive): "denver" is rejected.
function validate({ requester_name, location, description, priority }) {
  if (requester_name.length > MAX_NAME_LENGTH) {
    return `Requester name must be ${MAX_NAME_LENGTH} characters or fewer (you entered ${requester_name.length}).`;
  }
  if (!LOCATIONS.includes(location)) {
    return "Location must be Minneapolis, Chicago, Denver, or Austin.";
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer (you entered ${description.length}).`;
  }
  if (!PRIORITIES.includes(priority)) {
    return "Priority must be Low, Medium, High, or Urgent.";
  }
  return null;
}

// POST /api/requests — validate a new request on the server, then save it.
// The browser form's dropdowns and character counter are only a convenience;
// these checks are what actually keep bad data out of the database.
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

  // Rule 1: every field must be present, be text, and not be blank once
  // leading/trailing spaces are trimmed.
  const cleaned = {};
  for (const field of FIELDS) {
    const raw = body[field];
    if (raw !== undefined && raw !== null && typeof raw !== "string") {
      return Response.json(
        { error: LABELS[field] + " must be text." },
        { status: 400 }
      );
    }
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value) {
      return Response.json(
        { error: LABELS[field] + " is required." },
        { status: 400 }
      );
    }
    cleaned[field] = value;
  }

  // Rules 2–5: length limits and allowed values.
  const problem = validate(cleaned);
  if (problem) {
    return Response.json({ error: problem }, { status: 400 });
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
