export type ProjectType = 'software' | 'business';

export type BoardColumn = {
  label: string;
  color: string;
};

export const SOFTWARE_COLS: BoardColumn[] = [
  { label: 'Not Started', color: 'var(--col1)' },
  { label: 'In Development', color: 'var(--col2)' },
  { label: 'Uploading / Deploying', color: 'var(--col3)' },
  { label: 'Live / Hosted', color: 'var(--col4)' },
  { label: 'Marketing', color: 'var(--col5)' },
  { label: '🗑️ Bin', color: 'var(--col6)' }
];

export const BUSINESS_COLS: BoardColumn[] = [
  { label: 'Not Started', color: 'var(--col1)' },
  { label: 'In Progress', color: 'var(--col2)' },
  { label: 'Cashflow', color: 'var(--col4)' },
  { label: 'Marketing', color: 'var(--col5)' },
  { label: '🗑️ Bin', color: 'var(--col6)' }
];

export function getColumnsForType(projectType: ProjectType): BoardColumn[] {
  return projectType === 'business' ? BUSINESS_COLS : SOFTWARE_COLS;
}

export function normalizeStatusForType(status: number, projectType: ProjectType): number {
  const maxStatus = getColumnsForType(projectType).length - 1;
  if (Number.isNaN(status) || status < 0) return 0;
  return Math.min(status, maxStatus);
}

export function statusLabelFor(status: number, projectType: ProjectType): string {
  const columns = getColumnsForType(projectType);
  return columns[normalizeStatusForType(status, projectType)]?.label ?? 'Unknown';
}
