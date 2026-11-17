/**
 * Mock files API: the brand vault per client company, approved deliverables
 * (derived from approvals), version history, and short-lived download links.
 * Comments starting with "BACKEND:" are rules the Spring Boot service must enforce.
 */
import { ApiError } from '@/types';
import type { DownloadLink, FileDetail, FileFolder, FileItem, FileVersion, User } from '@/types';
import { approvals, projects } from './data';
import { downloadTokens, vaultFiles } from './data4';
import type { VaultFileRow } from './data4';
import { canSeeProject, forbidden, isAdminArea, isClient, isStaff, notFound } from './handlers';

const LINK_MINUTES = 5;

/** A deliverable file is an approved approval; its versions are the approval's versions. */
interface DerivedFile {
  id: string;
  organisationId: string;
  projectId: string;
  name: string;
  kind: 'IMAGE' | 'PDF';
  versions: FileVersion[];
}

function deliverableFiles(): DerivedFile[] {
  return approvals
    .filter((a) => a.status === 'APPROVED')
    .map((a) => ({
      id: `f-${a.id}`,
      organisationId: a.organisationId,
      projectId: a.projectId,
      name: `${a.title}.${a.kind === 'PDF' ? 'pdf' : 'png'}`,
      kind: a.kind,
      versions: a.versions.map((v) => ({
        number: v.number,
        sizeKb: 300 + v.number * 40,
        uploadedAt: v.submittedAt,
        uploadedBy: v.submittedBy,
        note: v.decision ? `${v.decision.status === 'APPROVED' ? 'Approved' : 'Changes requested'} by ${v.decision.byName}` : v.note,
        previewUrl: v.pages[0],
      })),
    }));
}

/**
 * BACKEND: clients see their own company's vault (CLIENT visibility only) and
 * deliverables of projects they can see. Staff: admin area everything; employees
 * the vaults and deliverables of client companies whose projects they work on.
 */
function canSeeVault(user: User, f: VaultFileRow) {
  if (isClient(user)) return f.organisationId === user.organisationId && f.visibility === 'CLIENT';
  if (isAdminArea(user)) return true;
  if (user.role === 'EMPLOYEE') return projects.some((p) => p.organisationId === f.organisationId && p.memberIds.includes(user.id));
  return false;
}
function canSeeDeliverable(user: User, f: DerivedFile) {
  const p = projects.find((x) => x.id === f.projectId);
  if (!p) return false;
  if (user.role === 'EMPLOYEE') return p.memberIds.includes(user.id);
  return canSeeProject(user, p);
}

const toItem = (f: VaultFileRow | DerivedFile, folder: FileFolder): FileItem => {
  const cur = f.versions[f.versions.length - 1];
  const projectId = 'projectId' in f ? f.projectId : undefined;
  return {
    id: f.id,
    name: f.name,
    folder,
    kind: f.kind,
    projectId,
    projectName: projectId ? projects.find((p) => p.id === projectId)?.name : undefined,
    currentVersion: cur.number,
    versionCount: f.versions.length,
    sizeKb: cur.sizeKb,
    updatedAt: cur.uploadedAt,
    updatedBy: cur.uploadedBy,
    previewUrl: cur.previewUrl,
  };
};

function all(user: User) {
  if (!isStaff(user) && !isClient(user)) throw forbidden();
  return [
    ...vaultFiles.filter((f) => canSeeVault(user, f)).map((f) => ({ row: f as VaultFileRow | DerivedFile, folder: f.folder as FileFolder })),
    ...deliverableFiles().filter((f) => canSeeDeliverable(user, f)).map((f) => ({ row: f as VaultFileRow | DerivedFile, folder: 'DELIVERABLES' as FileFolder })),
  ];
}

/** GET /files?folder= */
export function listFiles(user: User, q: { folder?: FileFolder } = {}): FileItem[] {
  return all(user)
    .filter((x) => !q.folder || x.folder === q.folder)
    .map((x) => toItem(x.row, x.folder))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function find(user: User, id: string) {
  const hit = all(user).find((x) => x.row.id === id);
  if (!hit) throw notFound('File');
  return hit;
}

/** GET /files/{id} */
export function getFile(user: User, id: string): FileDetail {
  const { row, folder } = find(user, id);
  return { ...toItem(row, folder), versions: [...row.versions].reverse() };
}

/** POST /files/{id}/link: a download link that works for 5 minutes. */
export function createDownloadLink(user: User, id: string, version?: number): DownloadLink {
  const { row } = find(user, id);
  const v = version === undefined ? row.versions[row.versions.length - 1] : row.versions.find((x) => x.number === version);
  if (!v) throw notFound('Version');
  const token = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  const expiresAt = Date.now() + LINK_MINUTES * 60_000;
  downloadTokens.set(token, { fileId: row.id, version: v.number, userId: user.id, expiresAt });
  return { url: `/files/download/${token}`, fileName: versionedName(row.name, v.number), expiresAt: new Date(expiresAt).toISOString() };
}

const versionedName = (name: string, n: number) => name.replace(/(\.[^.]+)?$/, (ext) => `-v${n}${ext}`);

/**
 * Demo only: what the signed link would return. Real files do not exist in the
 * prototype, so images download as their SVG preview and everything else as a note.
 */
export function resolveDownload(url: string): { fileName: string; mime: string; content: string } {
  const token = url.split('/').pop() ?? '';
  const t = downloadTokens.get(token);
  if (!t || t.expiresAt < Date.now()) throw new ApiError({ status: 410, title: 'Gone', detail: 'This download link has expired. Get a new one.' });
  const row = [...vaultFiles, ...deliverableFiles()].find((f) => f.id === t.fileId)!;
  const v = row.versions.find((x) => x.number === t.version)!;
  const base = versionedName(row.name, v.number);
  if (v.previewUrl?.startsWith('data:image/svg+xml')) {
    return { fileName: base.replace(/\.[^.]+$/, '') + '-preview.svg', mime: 'image/svg+xml', content: decodeURIComponent(v.previewUrl.split(',')[1]) };
  }
  return { fileName: base.replace(/\.[^.]+$/, '') + '-demo.txt', mime: 'text/plain', content: `Demo file for "${row.name}" version ${v.number}.\nIn the real portal this downloads the stored file.\n` };
}
