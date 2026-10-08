import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="page">
      <header className="hero">
        <p className="eyebrow">SniffOutPro</p>
        <h1>Visual vulnerability assessment</h1>
        <p className="lede">
          Scans run on the desktop agent. Sync results to the web dashboard for history, diffs, and
          topology visualization.
        </p>
      </header>

      <section className="panel">
        <h2>Get started</h2>
        <ul>
          <li>
            <strong>Desktop:</strong> run a scan (live nmap or fixture), then Sync to cloud
          </li>
          <li>
            <strong>Web:</strong> <Link href="/sign-in">Sign in</Link> or{' '}
            <Link href="/sign-up">create an account</Link>, then{' '}
            <Link href="/dashboard">open the dashboard</Link> or{' '}
            <Link href="/organizations">manage an organization</Link>
          </li>
        </ul>
      </section>

      <footer className="footer">
        <small>Detection only. Scan targets you own or have written authorization to assess.</small>
      </footer>
    </main>
  );
}
