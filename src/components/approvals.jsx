import { useRef } from 'react';
import { LuChevronLeft, LuChevronRight, LuFileText, LuImage } from 'react-icons/lu';
import { Badge, Button, cx } from './ui';

const STATUS = {
  PENDING: ['warn', 'Waiting for you'],
  CHANGES_REQUESTED: ['info', 'Changes requested'],
  APPROVED: ['ok', 'Approved'],
};
/** `staff` switches the PENDING label to the agency's point of view. */
export const ApprovalStatusBadge = ({ status, staff }) => (
  <Badge tone={STATUS[status][0]}>{staff && status === 'PENDING' ? 'With client' : STATUS[status][1]}</Badge>
);

export const KindIcon = ({ kind }) => (kind === 'PDF' ? <LuFileText aria-hidden /> : <LuImage aria-hidden />);

/** "Revision 2 of 3", turning to a warning at the limit and danger beyond it. */
export function RevisionMeter({ used, allowed }) {
  const over = used > allowed;
  const at = used === allowed;
  return (
    <div className={cx('rev', at && 'rev--at', over && 'rev--over')} title="Change rounds used out of those included in your contract">
      <span className="rev__dots" aria-hidden>
        {Array.from({ length: Math.max(allowed, used) }, (_, i) => (
          <span key={i} className={cx('rev__dot', i < used && 'is-used', i >= allowed && 'is-extra')} />
        ))}
      </span>
      <span>
        {used} of {allowed} revisions used
        {over ? ' · extra rounds' : at ? ' · limit reached' : ''}
      </span>
    </div>
  );
}

/**
 * Shows one page of a version with its pins. In `placing` mode a click sets
 * the draft pin; `draft` is drawn as a hollow marker until it is saved.
 */
export function AssetViewer({ version, page, onPage, pins, activePin, onPinClick, placing, draft, onPlace }) {
  const frame = useRef(null);
  const pages = version.pages;

  const place = (e) => {
    if (!placing || !frame.current) return;
    const r = frame.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    onPlace({ x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) });
  };

  return (
    <div className="viewer">
      <div className={cx('viewer__stage', placing && 'is-placing')}>
        <div ref={frame} className="viewer__frame" onClick={place}>
          <img src={pages[page]} alt={`${version.fileName}, page ${page + 1} of ${pages.length}`} draggable={false} />
          {pins.map((p) => (
            <button
              key={p.id}
              type="button"
              className={cx('pin', p.fromAgency && 'pin--agency', activePin === p.id && 'is-active')}
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
              onClick={(e) => {
                e.stopPropagation();
                onPinClick(p.id);
              }}
              aria-label={`Comment ${p.n} by ${p.author}: ${p.text}`}
            >
              {p.n}
            </button>
          ))}
          {draft && draft.page === page && <span className="pin pin--draft" style={{ left: `${draft.x}%`, top: `${draft.y}%` }} aria-hidden />}
        </div>
      </div>
      {pages.length > 1 && (
        <div className="viewer__pager">
          <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Previous page">
            <LuChevronLeft aria-hidden />
          </Button>
          <div className="viewer__thumbs" role="tablist" aria-label="Pages">
            {pages.map((src, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === page}
                aria-label={`Page ${i + 1}`}
                className={cx('viewer__thumb', i === page && 'is-on')}
                onClick={() => onPage(i)}
              >
                <img src={src} alt="" />
              </button>
            ))}
          </div>
          <Button variant="secondary" size="sm" disabled={page === pages.length - 1} onClick={() => onPage(page + 1)} aria-label="Next page">
            <LuChevronRight aria-hidden />
          </Button>
          <span className="small muted">
            {page + 1} / {pages.length}
          </span>
        </div>
      )}
    </div>
  );
}
