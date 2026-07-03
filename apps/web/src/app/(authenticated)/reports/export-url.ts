import type { GroupBy } from '@/lib/services/reports';

export interface ExportUrlInput {
  format: 'pdf' | 'csv';
  from: string; // YYYY-MM-DD ('' allowed → param omitted)
  to: string; // YYYY-MM-DD ('' allowed → param omitted)
  allMembers: boolean;
  memberIds: string[]; // used only when allMembers is false
  groupBy: GroupBy;
}

/**
 * Smart default for the export grouping: when several people (or everyone) are
 * exported into one PDF, group by member so each person gets their own section
 * and subtotal; otherwise group by project.
 */
export function resolveExportGroupBy(allMembers: boolean, memberCount: number): GroupBy {
  return allMembers || memberCount > 1 ? 'member' : 'project';
}

/**
 * Builds the download URL for the existing report export routes. `member` is
 * omitted entirely when exporting all members, which makes the route include
 * every member (admin) or fall back to the caller's own entries (non-admin).
 */
export function buildExportUrl(input: ExportUrlInput): string {
  const qs = new URLSearchParams();
  if (input.from) qs.append('from', input.from);
  if (input.to) qs.append('to', input.to);
  if (!input.allMembers) {
    for (const id of input.memberIds) qs.append('member', id);
  }
  qs.append('groupBy', input.groupBy);
  return `/api/reports/export.${input.format}?${qs.toString()}`;
}
