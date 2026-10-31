import { updateRequestStatus } from "../../../../lib/requests";

export const dynamic = "force-dynamic";

const STATUSES = ["New", "In Progress", "Complete"];

// PATCH /api/requests/[id] — change one request's status.
// Only the status can change; any other fields in the body are ignored.
export async function PATCH(request, { params }) {
  // Next.js 15: route params are a Promise and must be awaited.
  const { id: rawId } = await params;

  // A positive whole number with no leading zeros, signs, or decimals.
  if (!/^[1-9]\d*$/.test(rawId) || !Number.isSafeInteger(Number(rawId))) {
    return Response.json(
      { error: "Request ID must be a positive whole number." },
      { status: 400 }
    );
  }
  const id = Number(rawId);

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

  // Trim surrounding spaces, then require an exact (case-sensitive) match.
  const status = typeof body.status === "string" ? body.status.trim() : "";
  if (!STATUSES.includes(status)) {
    return Response.json(
      { error: "Status must be New, In Progress, or Complete." },
      { status: 400 }
    );
  }

  try {
    const updated = await updateRequestStatus(id, status);
    if (!updated) {
      return Response.json(
        { error: `Request ${id} was not found.` },
        { status: 404 }
      );
    }
    return Response.json({ request: updated }, { status: 200 });
  } catch (error) {
    console.error(`PATCH /api/requests/${rawId} failed:`, error);
    return Response.json(
      { error: "Could not update that status. Please try again." },
      { status: 500 }
    );
  }
}
