export type ScanHistoryRow = {
  id: string;
  status: string;
  targets: string[];
  startedAt: Date | string;
};

export function ScanHistory({
  scans,
  selectedScanId,
  onSelect,
}: {
  scans: readonly ScanHistoryRow[];
  selectedScanId: string | null;
  onSelect: (id: string) => void;
}) {
  if (scans.length === 0) {
    return <p>No synced scans yet. Run a scan in the desktop app and click Sync to cloud.</p>;
  }

  return (
    <ul className="scan-list">
      {scans.map((row) => (
        <li key={row.id}>
          <button
            type="button"
            className={selectedScanId === row.id ? 'scan-item active' : 'scan-item'}
            onClick={() => {
              onSelect(row.id);
            }}
          >
            <strong>{row.status}</strong> — {row.targets.join(', ')}
            <span>{new Date(row.startedAt).toLocaleString()}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
