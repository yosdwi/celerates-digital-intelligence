/** Internal SQL fragments only. All arguments are code-owned column expressions;
 * never pass request values here. Submission policy v1, Asia/Jakarta, strict >.
 */
export function derivedSubmissionOverdue(
  status: string,
  month: string,
  clock: string,
) {
  return `((${status} IS NULL OR ${status}='planned') AND (date_trunc('month',${month}::timestamp)+interval '1 month 14 days') < (${clock} AT TIME ZONE 'Asia/Jakarta'))`;
}
