export async function GET() { return Response.json({ error: "Reminder dispatch disabled pending delivery/idempotency review" }, { status: 503 }); }
