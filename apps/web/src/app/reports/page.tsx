import Link from 'next/link';
import { ReportDownloadForm } from './report-download-form';

export default function ReportsPage() {
  return (
    <main className="page">
      <h1>Reports</h1>
      <p className="lede">
        A consultant can download a branded PDF for a synced scan. The website does not scan a
        network. A workstation account cannot download reports.
      </p>
      <ReportDownloadForm />
      <p>
        <Link href="/sign-in">Sign in</Link>
      </p>
    </main>
  );
}
