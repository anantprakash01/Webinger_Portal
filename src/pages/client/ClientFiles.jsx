import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LuCircleAlert, LuDownload, LuFile, LuFileText, LuLink, LuType } from 'react-icons/lu';
import { api } from '@/api/client';
import { useFile, useFiles } from '@/api/queries';
import { useAuth } from '@/auth/AuthContext';
import { Badge, Button, Card, Drawer, EmptyState, ErrorState, PageHeader, PageSkeleton, Segmented, formatDateLong } from '@/components/ui';
import { timeAgo } from '@/components/status';

const FOLDERS = [
  { value: 'ALL', label: 'All' },
  { value: 'LOGOS', label: 'Logos' },
  { value: 'FONTS', label: 'Fonts' },
  { value: 'GUIDELINES', label: 'Guidelines' },
  { value: 'PHOTOS', label: 'Photos' },
  { value: 'DELIVERABLES', label: 'Deliverables' },
];
const formatSize = (kb) => (kb >= 1024 * 1024 ? `${(kb / 1024 / 1024).toFixed(1)} GB` : kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`);

function KindIcon({ kind, size = 28 }) {
  if (kind === 'FONT') return <LuType size={size} aria-hidden />;
  if (kind === 'PDF' || kind === 'DOC') return <LuFileText size={size} aria-hidden />;
  return <LuFile size={size} aria-hidden />;
}

export function ClientFiles() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const folder = FOLDERS.some((f) => f.value === params.get('folder')) ? params.get('folder') : 'ALL';
  const openId = params.get('file');
  const { data, error, isPending, refetch } = useFiles();

  const set = (next) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(next)) v ? p.set(k, v) : p.delete(k);
        return p;
      },
      { replace: !('file' in next) },
    );

  if (isPending) return <PageSkeleton />;
  if (error) return <div className="page"><ErrorState message={error.message} onRetry={refetch} /></div>;

  const count = (f) => (f === 'ALL' ? data.length : data.filter((x) => x.folder === f).length);
  const shown = folder === 'ALL' ? data : data.filter((f) => f.folder === folder);

  return (
    <div className="page">
      <PageHeader eyebrow={user?.organisationName} title="Files & brand vault" />
      <p className="muted small" style={{ marginTop: -12 }}>
        Your brand kit and every approved deliverable, always the latest version. Download links work for 5 minutes.
      </p>

      <div className="toolbar">
        <Segmented
          label="Folder"
          value={folder}
          onChange={(v) => set({ folder: v === 'ALL' ? undefined : v })}
          options={FOLDERS.filter((f) => f.value === 'ALL' || count(f.value) > 0).map((f) => ({ ...f, label: `${f.label} (${count(f.value)})` }))}
        />
      </div>

      {shown.length === 0 ? (
        <Card>
          <EmptyState title="Nothing here yet">Approved work and brand files appear here as projects progress.</EmptyState>
        </Card>
      ) : (
        <div className="file-grid">
          {shown.map((f) => (
            <button key={f.id} type="button" className="card file-card" onClick={() => set({ file: f.id })}>
              <span className="file-card__preview">{f.previewUrl ? <img src={f.previewUrl} alt="" loading="lazy" /> : <KindIcon kind={f.kind} size={36} />}</span>
              <span className="file-card__body">
                <span className="file-card__name">{f.name}</span>
                <span className="list__meta">
                  v{f.currentVersion} · {formatSize(f.sizeKb)} · {timeAgo(f.updatedAt)}
                </span>
                {f.projectName && <span className="list__meta">{f.projectName}</span>}
              </span>
            </button>
          ))}
        </div>
      )}

      <Drawer open={!!openId} onClose={() => set({ file: undefined })} title={data.find((f) => f.id === openId)?.name ?? 'File'}>
        {openId && <FilePanel id={openId} />}
      </Drawer>
    </div>
  );
}

function FilePanel({ id }) {
  const { data: f, error, isPending, refetch } = useFile(id);
  if (isPending) return <div className="skeleton" style={{ height: 320 }} />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;
  return (
    <div className="grid" style={{ gap: 20 }}>
      <div className="file-preview">{f.previewUrl ? <img src={f.previewUrl} alt={`Preview of ${f.name}`} /> : <KindIcon kind={f.kind} size={56} />}</div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <Badge tone="ok">Current: v{f.currentVersion}</Badge>
        {f.projectName && <Badge>{f.projectName}</Badge>}
        <span className="list__meta">
          Updated by {f.updatedBy}, {timeAgo(f.updatedAt)}
        </span>
      </div>
      <DownloadButton fileId={f.id} version={f.currentVersion} primary label={`Download v${f.currentVersion}`} />
      <section>
        <h3 className="section-title">Version history</h3>
        <ol className="file-versions">
          {f.versions.map((v) => (
            <li key={v.number} className="file-versions__item">
              <div className="list__main">
                <div className="small" style={{ fontWeight: 600 }}>
                  Version {v.number} {v.number === f.currentVersion && <Badge tone="ok">Current</Badge>}
                </div>
                <div className="list__meta">
                  {v.uploadedBy} · {formatDateLong(v.uploadedAt.slice(0, 10))} · {formatSize(v.sizeKb)}
                </div>
                {v.note && <div className="small">{v.note}</div>}
              </div>
              {v.number !== f.currentVersion && <DownloadButton fileId={f.id} version={v.number} label="Download" />}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

/** Asks for a fresh signed link, then shows it with a countdown until it expires. */
function DownloadButton({ fileId, version, label, primary }) {
  const [link, setLink] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!link) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [link]);
  // Free the demo blob when the link expires or the panel closes.
  useEffect(() => () => link?.url.startsWith('blob:') && URL.revokeObjectURL(link.url), [link]);

  const get = async () => {
    setBusy(true);
    setErr(null);
    try {
      setLink(await api.files.link(fileId, version));
      setNow(Date.now());
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not create a link.');
    } finally {
      setBusy(false);
    }
  };

  const left = link ? Date.parse(link.expiresAt) - now : 0;
  const expired = link && left <= 0;

  if (!link || expired) {
    return (
      <div className="grid" style={{ gap: 6 }}>
        <Button variant={primary ? 'primary' : 'secondary'} size={primary ? 'md' : 'sm'} onClick={get} loading={busy}>
          <LuLink aria-hidden /> {expired ? 'Link expired: get a new one' : label}
        </Button>
        {err && (
          <span className="field__error" role="alert">
            <LuCircleAlert aria-hidden /> {err}
          </span>
        )}
      </div>
    );
  }
  const mm = Math.floor(left / 60_000);
  const ss = String(Math.floor((left % 60_000) / 1000)).padStart(2, '0');
  return (
    <div className="dl-link">
      <a href={link.url} download={link.fileName} className={`btn ${primary ? 'btn--primary' : 'btn--secondary btn--sm'}`}>
        <LuDownload aria-hidden /> {link.fileName}
      </a>
      <span className="list__meta" aria-live="off">
        Link expires in {mm}:{ss}
      </span>
    </div>
  );
}
