import { cache } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { assertPilotActor } from "@/lib/access-policy";
export const requirePilotActor = cache(async () => {
  const session = await getServerSession(authOptions);
  return assertPilotActor(session?.user as Parameters<typeof assertPilotActor>[0]);
});
