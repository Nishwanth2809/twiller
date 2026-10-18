import Link from "next/link";
import ScrollProgress from "@/components/ScrollProgress";

export const metadata = {
  title: "Cookie Policy — Twiller",
  description: "Twiller Cookie Policy",
};

export default function CookiesPage() {
  return (
    <>
    <ScrollProgress />
    <div className="min-h-screen bg-bg text-text">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="mb-8">
          <Link href="/" className="text-primary hover:underline text-sm">← Back to Twiller</Link>
        </div>

        <h1 className="text-3xl font-bold mb-2">Cookie Policy</h1>
        <p className="text-text-muted text-sm mb-10">Last updated: October 2026</p>

        <div className="space-y-8 text-text leading-relaxed">
          <section>
            <h2 className="text-xl font-bold text-text mb-3">What Are Cookies?</h2>
            <p>
              Cookies are small text files stored on your device by a website or its service providers. Twiller does not currently provide a general cookie-based preferences setting.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-text mb-3">How Twiller Uses Cookies</h2>
            <div className="space-y-4">
              <div className="bg-surface rounded-xl p-4 border border-border">
                <h3 className="font-semibold text-text mb-1">🔐 Essential Cookies</h3>
                <p className="text-sm">
                  Firebase Authentication manages the signed-in browser session. Its persistence mechanism can use browser-managed storage and is controlled by Firebase and the browser.
                </p>
              </div>
              <div className="bg-surface rounded-xl p-4 border border-border">
                <h3 className="font-semibold text-text mb-1">⚙️ Preference Cookies</h3>
                <p className="text-sm">
                  Twiller stores your selected theme and whether you dismissed its storage notice in this browser&apos;s local storage, not in preference cookies. No analytics or marketing storage categories are configured in the app.
                </p>
              </div>
              <div className="bg-surface rounded-xl p-4 border border-border">
                <h3 className="font-semibold text-text mb-1">🔒 Security Cookies</h3>
                <p className="text-sm">
                  Firebase Authentication may use browser storage or cookies as part of its sign-in flow. Protected API access requires a verified token.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-text mb-3">Local Storage</h2>
            <p>In normal Firebase-authenticated use, Twiller does not store a private profile snapshot in its own localStorage or sessionStorage keys. Firebase manages its own authentication persistence. Twiller stores the chosen theme and storage-notice acknowledgement locally; optional local demo mode also stores demo data in localStorage on that browser.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-text mb-3">Third-Party Cookies</h2>
            <p className="mb-2">Third-party browser storage may be used by services loaded by the deployment, such as Firebase Authentication or Razorpay checkout. Those providers&apos; policies govern their storage.</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong className="text-text">Firebase Authentication</strong> — authentication</li>
              <li><strong className="text-text">Razorpay</strong> — checkout when a user opens the subscription flow</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-text mb-3">Managing Cookies</h2>
            <p>
              You can control cookies and site storage through your browser settings. Blocking Firebase Authentication&apos;s required browser persistence can prevent a session from being restored.
            </p>
            <p className="mt-2">
              Most browsers allow you to view, manage, and delete cookies under Settings → Privacy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-text mb-3">Updates to This Policy</h2>
            <p>
              We may update this Cookie Policy from time to time. We encourage you to review it
              periodically.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-border flex gap-6 text-sm text-text-muted">
          <Link href="/terms" className="hover:text-primary transition-colors">Terms of Service</Link>
          <Link href="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link>
          <Link href="/" className="hover:text-primary transition-colors">Home</Link>
        </div>
      </div>
    </div>
    </>
  );
}
