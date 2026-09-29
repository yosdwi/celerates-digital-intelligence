// Company Files: kinds (with default classes) and the session user's class access, for the upload form.
import { failure, relay, upstream } from "@/lib/files/bff";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return relay(await upstream("/kinds"));
  } catch (error) {
    return failure(error);
  }
}
