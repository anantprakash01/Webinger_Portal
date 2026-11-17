/**
 * Placeholder wordmark in the spirit of the webinger.in logo.
 * Replace with the real logo file: put it in /public/logo.svg and render
 * <img src="/logo.svg" alt="Webinger" height={height} /> instead.
 */
export function Logo({ height = 28, inverse = false }) {
  return (
    <span
      aria-label="Webinger"
      role="img"
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        fontSize: height,
        fontWeight: 800,
        letterSpacing: '-0.03em',
        lineHeight: 1,
        color: inverse ? '#fff' : 'var(--ink)',
      }}
    >
      <span style={{ color: 'var(--brand-red)', fontStyle: 'italic', marginRight: 1 }}>W</span>
      <span>ebinger</span>
    </span>
  );
}
