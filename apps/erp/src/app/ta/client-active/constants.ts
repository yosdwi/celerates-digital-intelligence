export const CLIENT_SUBMISSION_STATUSES = [
  ["sent_to_client", "Sent to Client"],
  ["client_reviewing", "Client Reviewing"],
  ["client_interview", "Client Interview"],
  ["client_accepted", "Client Accepted"],
  ["client_rejected", "Client Rejected"],
  ["on_hold", "On Hold"],
] as const;

export const CLIENT_SUBMISSION_LABELS: Record<string, string> = Object.fromEntries(CLIENT_SUBMISSION_STATUSES);

export const CLIENT_SUBMISSION_STYLES: Record<string, string> = {
  sent_to_client: "bg-blue-100 text-blue-700",
  client_reviewing: "bg-indigo-100 text-indigo-700",
  client_interview: "bg-amber-100 text-amber-700",
  client_accepted: "bg-green-100 text-green-700",
  client_rejected: "bg-red-100 text-red-700",
  on_hold: "bg-slate-200 text-slate-600",
};
