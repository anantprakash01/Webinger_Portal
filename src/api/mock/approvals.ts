/**
 * Mock approvals API. Clients approve or request changes on deliverables;
 * staff can read approvals and reply with pinned comments.
 * Comments starting with "BACKEND:" are rules the Spring Boot service must enforce.
 */
import type {
  ApprovalDecisionInput,
  ApprovalDetail,
  ApprovalItem,
  ApprovalStatus,
  NewPinComment,
  PinComment,
  User,
} from '@/types';
import { approvals, CLIENT_NAME, nameOf, projects, tasks } from './data';
import type { ApprovalRow } from './data';
import { badRequest, canSeeProject, conflict, forbidden, isClient, isStaff, log, notFound } from './handlers';

const latest = (a: ApprovalRow) => a.versions[a.versions.length - 1];

function visible(user: User, a: ApprovalRow) {
  const p = projects.find((x) => x.id === a.projectId);
  return !!p && canSeeProject(user, p);
}

function find(user: User, id: string): ApprovalRow {
  // BACKEND: influencers and partners have no access to client approvals.
  if (!isStaff(user) && !isClient(user)) throw forbidden();
  const a = approvals.find((x) => x.id === id);
  if (!a || !visible(user, a)) throw notFound('Approval');
  return a;
}

const toItem = (a: ApprovalRow): ApprovalItem => {
  const v = latest(a);
  return {
    id: a.id,
    title: a.title,
    projectId: a.projectId,
    projectName: projects.find((p) => p.id === a.projectId)!.name,
    kind: a.kind,
    status: a.status,
    versionNumber: v.number,
    submittedAt: v.submittedAt,
    thumbnailUrl: v.pages[0],
    revisionsUsed: a.revisionsUsed,
    revisionsAllowed: a.revisionsAllowed,
    commentCount: a.comments.length,
  };
};

const toDetail = (a: ApprovalRow): ApprovalDetail => ({
  ...toItem(a),
  deliverableId: a.deliverableId,
  clientName: CLIENT_NAME[a.organisationId] ?? '',
  versions: a.versions,
  comments: [...a.comments].sort((x, y) => x.at.localeCompare(y.at)),
});

const ORDER: Record<ApprovalStatus, number> = { PENDING: 0, CHANGES_REQUESTED: 1, APPROVED: 2 };

/** GET /approvals */
export function listApprovals(user: User, q: { status?: ApprovalStatus; projectId?: string } = {}): ApprovalItem[] {
  if (!isStaff(user) && !isClient(user)) throw forbidden();
  return approvals
    .filter((a) => visible(user, a) && (!q.status || a.status === q.status) && (!q.projectId || a.projectId === q.projectId))
    .map(toItem)
    .sort((x, y) => ORDER[x.status] - ORDER[y.status] || y.submittedAt.localeCompare(x.submittedAt));
}

/** GET /approvals/{id} */
export function getApproval(user: User, id: string): ApprovalDetail {
  return toDetail(find(user, id));
}

/** POST /approvals/{id}/decision */
export function decideApproval(user: User, id: string, input: ApprovalDecisionInput): ApprovalDetail {
  const a = find(user, id);
  // BACKEND: only the client decides. Staff recording a decision made elsewhere is a later feature with its own audit entry.
  if (!isClient(user)) throw forbidden('Only the client can approve or request changes.');
  if (a.status !== 'PENDING') throw conflict('This has already been decided.');
  const v = latest(a);
  if (input.versionId !== v.id) throw conflict(`A newer version (v${v.number}) was sent. Refresh to see it.`);
  const note = input.note?.trim() ?? '';
  if (note.length > 2000) throw badRequest('Notes can be at most 2,000 characters.');
  if (input.decision !== 'APPROVE' && input.decision !== 'REQUEST_CHANGES') throw badRequest('Decision must be APPROVE or REQUEST_CHANGES.');
  if (input.decision === 'REQUEST_CHANGES' && note.length < 5) throw badRequest('Tell the team what to change.');

  const p = projects.find((x) => x.id === a.projectId)!;
  const d = p.deliverables.find((x) => x.id === a.deliverableId);
  const task = tasks.find((t) => t.deliverableId === a.deliverableId);
  const at = new Date().toISOString();

  if (input.decision === 'APPROVE') {
    v.decision = { status: 'APPROVED', byName: user.name, at, note: note || undefined };
    a.status = 'APPROVED';
    if (d) d.status = 'APPROVED';
    if (task) task.status = 'DONE';
    log(p.id, user, `Approved "${a.title}" (version ${v.number})`, 'CLIENT');
  } else {
    v.decision = { status: 'CHANGES_REQUESTED', byName: user.name, at, note };
    a.status = 'CHANGES_REQUESTED';
    a.revisionsUsed += 1;
    if (d) {
      d.status = 'IN_PROGRESS';
      d.revisionsUsed = a.revisionsUsed;
    }
    // Automation rule 7: reopen the task with the client's comments.
    if (task) {
      task.status = 'IN_PROGRESS';
      task.comments.push({ id: `cm${Date.now()}`, authorId: user.id, author: user.name, at, text: `Changes requested on v${v.number}: ${note}`, visibility: 'CLIENT' });
    }
    log(p.id, user, `Requested changes on "${a.title}" (version ${v.number})`, 'CLIENT');
    if (a.revisionsUsed > a.revisionsAllowed) {
      log(p.id, user, `Revision ${a.revisionsUsed} of ${a.revisionsAllowed} on "${a.title}": over the contract limit. ${nameOf(p.ownerId)} to discuss extra charges before work starts.`);
    }
  }
  return toDetail(a);
}

/** POST /approvals/{id}/comments */
export function addPinComment(user: User, id: string, input: NewPinComment): PinComment {
  const a = find(user, id);
  const v = latest(a);
  // BACKEND: pins go on the latest version only; older versions are history.
  if (input.versionId !== v.id) throw conflict(`Comments go on the latest version (v${v.number}).`);
  if (!Number.isInteger(input.page) || input.page < 0 || input.page >= v.pages.length) throw badRequest('That page does not exist.');
  if (!(input.x >= 0 && input.x <= 100 && input.y >= 0 && input.y <= 100)) throw badRequest('Pin position must be inside the image.');
  const text = input.text?.trim() ?? '';
  if (!text) throw badRequest('Write a comment first.');
  if (text.length > 1000) throw badRequest('Comments can be at most 1,000 characters.');
  const c: PinComment = {
    id: `pc${Date.now()}`,
    versionId: v.id,
    page: input.page,
    x: Math.round(input.x * 10) / 10,
    y: Math.round(input.y * 10) / 10,
    authorId: user.id,
    author: user.name,
    fromAgency: isStaff(user),
    at: new Date().toISOString(),
    text,
  };
  a.comments.push(c);
  return c;
}
