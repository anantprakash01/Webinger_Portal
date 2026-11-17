import { Link, useParams } from 'react-router-dom';
import { LuArrowLeft, LuMessageSquare } from 'react-icons/lu';
import { useProject } from '@/api/queries';
import { Card, PageHeader, PageSkeleton } from '@/components/ui';
import { HealthBadge, ProjectStatusBadge } from '@/components/status';
import { ActivityFeed, DeliverableList, LoadError, MilestoneTimeline, NotVisible, ProjectFacts, TeamList, isNotFound } from '@/components/projects';

/** Client view of a project. The API never sends internal tasks or internal activity to client roles. */
export function ClientProjectDetail() {
  const { id } = useParams();
  const { data: p, error, isPending, refetch } = useProject(id);

  if (isPending) return <PageSkeleton />;
  if (isNotFound(error)) return <NotVisible what="Project" backTo="/client/projects" backLabel="Back to your projects" />;
  if (error) return <LoadError error={error} onRetry={refetch} />;

  const waiting = p.deliverables.filter((d) => d.status === 'CLIENT_APPROVAL').length;

  return (
    <div className="page">
      <Link to="/client/projects" className="back-link">
        <LuArrowLeft aria-hidden /> All projects
      </Link>
      <PageHeader
        eyebrow={p.service}
        title={p.name}
        actions={
          <>
            {p.status === 'ACTIVE' ? <HealthBadge health={p.health} /> : <ProjectStatusBadge status={p.status} />}
            <Link to="/client/messages" className="btn btn--secondary btn--sm">
              <LuMessageSquare aria-hidden /> Message the team
            </Link>
          </>
        }
      />

      {waiting > 0 && (
        <div className="alert alert--info" role="status">
          <span style={{ flex: 1 }}>
            <strong>{waiting} deliverable{waiting === 1 ? ' is' : 's are'} waiting for your approval.</strong> Work continues once you approve or request changes.
          </span>
          <Link to="/client/approvals" className="btn btn--primary btn--sm">
            Review now
          </Link>
        </div>
      )}

      <ProjectFacts project={p} />

      <div className="grid grid--2">
        <Card title="Milestones">
          <MilestoneTimeline milestones={p.milestones} />
        </Card>
        <Card title="Deliverables">
          <DeliverableList deliverables={p.deliverables} milestones={p.milestones} approvalsLink="/client/approvals" />
        </Card>
        <Card title="Recent activity">
          <ActivityFeed activity={p.activity} />
        </Card>
        <div className="grid" style={{ alignContent: 'start' }}>
          <Card title="Project team">
            <TeamList team={p.team} />
          </Card>
          <Card title="Scope">
            <p className="small">{p.scope}</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
