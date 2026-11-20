import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LuPencil, LuPlus, LuThumbsUp } from 'react-icons/lu';
import { useArticle, useArticleAction, useArticles } from '@/api/queries';
import { useAuth } from '@/auth/AuthContext';
import { Badge, Button, Card, Drawer, EmptyState, ErrorState, Input, PageHeader, PageSkeleton, SearchInput, Segmented } from '@/components/ui';
import { timeAgo } from '@/components/status';
import { FormError } from '@/pages/admin/finance/forms';

const CATS = { PROCESS: 'How we work', BRAND: 'Brand and files', TOOLS: 'Tools', CLIENTS: 'Clients', HR: 'People and HR' };

/** Plain text with "- " lists and "1. " steps, so articles need no editor library. */
function ArticleBody({ text }) {
  return text.split(/\n\s*\n/).map((block, i) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.every((l) => /^- /.test(l))) return <ul key={i}>{lines.map((l, j) => <li key={j}>{l.slice(2)}</li>)}</ul>;
    if (lines.every((l) => /^\d+\. /.test(l))) return <ol key={i}>{lines.map((l, j) => <li key={j}>{l.replace(/^\d+\. /, '')}</li>)}</ol>;
    return <p key={i}>{lines.join(' ')}</p>;
  });
}

/** Employee area (read) and admin area (read and write). Never shown to clients. */
export function KnowledgePage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'SUPER_ADMIN' || user?.role === 'MANAGER';
  const [params, setParams] = useSearchParams();
  const category = params.get('category') ?? 'ALL';
  const [text, setText] = useState(params.get('q') ?? '');
  const [q, setQ] = useState(text);
  useEffect(() => {
    const id = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(id);
  }, [text]);
  const { data, error, isPending, refetch } = useArticles({ q: q || undefined, category: category === 'ALL' ? undefined : category });
  const open = params.get('a');
  const editing = params.get('edit');
  const set = (k, v) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (v) next.set(k, v);
      else next.delete(k);
      return next;
    });

  if (isPending) return <PageSkeleton />;
  if (error) return <div className="page"><ErrorState message={error.message} onRetry={refetch} /></div>;
  return (
    <div className="page">
      <PageHeader
        eyebrow="How Webinger works"
        title="Knowledge base"
        actions={
          canEdit && (
            <Button onClick={() => set('edit', 'new')}>
              <LuPlus aria-hidden /> New article
            </Button>
          )
        }
      />
      <div className="toolbar">
        <SearchInput label="Search articles" value={text} onChange={setText} placeholder="Search titles and text" />
      </div>
      <Segmented label="Categories" value={category} onChange={(v) => set('category', v === 'ALL' ? undefined : v)} options={[{ value: 'ALL', label: 'All' }, ...Object.entries(CATS).map(([value, label]) => ({ value, label }))]} />
      {data.length === 0 ? (
        <Card>
          <EmptyState title="No articles match">Try other words, or ask your manager to add one.</EmptyState>
        </Card>
      ) : (
        <div className="kb-grid">
          {data.map((a) => (
            <button key={a.id} type="button" className="card kb-card" onClick={() => set('a', a.id)}>
              <span className="small muted">{CATS[a.category]}</span>
              <span className="kb-card__title">{a.title}</span>
              <span className="small">{a.summary}</span>
              <span className="row small muted" style={{ marginTop: 'auto', flexWrap: 'wrap' }}>
                <LuThumbsUp aria-hidden /> {a.helpful} · updated {timeAgo(a.updatedAt)}
                {a.stale && <Badge tone="warn">Needs review</Badge>}
              </span>
            </button>
          ))}
        </div>
      )}
      <Drawer open={!!open} onClose={() => set('a', undefined)} title="Article">
        {open && <ArticleView id={open} canEdit={canEdit} onEdit={() => setParams({ edit: open })} />}
      </Drawer>
      <Drawer open={!!editing} onClose={() => set('edit', undefined)} title={editing === 'new' ? 'New article' : 'Edit article'}>
        {editing && <ArticleForm key={editing} id={editing === 'new' ? null : editing} onDone={(a) => setParams({ a: a.id })} />}
      </Drawer>
    </div>
  );
}

function ArticleView({ id, canEdit, onEdit }) {
  const { data: a, error, isPending, refetch } = useArticle(id);
  const action = useArticleAction();
  if (isPending) return <div className="skeleton" style={{ height: 300 }} />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  return (
    <article className="grid kb-article" style={{ gap: 12 }}>
      <span className="small muted">{CATS[a.category]}</span>
      <h3 className="lead-title">{a.title}</h3>
      <p className="small muted">
        Updated by {a.updatedBy}, {timeAgo(a.updatedAt)}
        {a.stale ? ' · not reviewed for 6 months' : ''}
      </p>
      <ArticleBody text={a.body} />
      {a.tags.length > 0 && (
        <div className="badge-row">
          {a.tags.map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
        </div>
      )}
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <Button variant={a.voted ? 'primary' : 'secondary'} size="sm" aria-pressed={a.voted} loading={action.isPending} onClick={() => action.mutate({ kind: 'helpful', id: a.id })}>
          <LuThumbsUp aria-hidden /> Helpful ({a.helpful})
        </Button>
        {canEdit && (
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <LuPencil aria-hidden /> Edit
          </Button>
        )}
      </div>
    </article>
  );
}

function ArticleForm({ id, onDone }) {
  const existing = useArticle(id);
  const action = useArticleAction();
  const [f, setF] = useState(null);
  useEffect(() => {
    if (f) return;
    if (!id) setF({ title: '', category: 'PROCESS', summary: '', body: '', tags: '' });
    else if (existing.data) setF({ ...existing.data, tags: existing.data.tags.join(', ') });
  }, [id, existing.data, f]);
  if (!f) return <div className="skeleton" style={{ height: 300 }} />;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form
      className="grid"
      style={{ gap: 14 }}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const body = { title: f.title, category: f.category, summary: f.summary, body: f.body, tags: f.tags.split(',') };
        action.mutate(id ? { kind: 'update', id, body } : { kind: 'create', body }, { onSuccess: onDone });
      }}
    >
      <FormError error={action.error} />
      <Input label="Title" value={f.title} onChange={set('title')} />
      <label className="field">
        <span className="field__label">Category</span>
        <select className="field__input" value={f.category} onChange={set('category')}>
          {Object.entries(CATS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <Input label="One-line summary" value={f.summary} onChange={set('summary')} />
      <label className="field">
        <span className="field__label">Article (blank line between paragraphs; "- " for bullets; "1. " for steps)</span>
        <textarea className="field__input" rows={10} value={f.body} onChange={set('body')} />
      </label>
      <Input label="Tags (comma separated)" value={f.tags} onChange={set('tags')} />
      <Button type="submit" loading={action.isPending}>
        Save article
      </Button>
    </form>
  );
}
