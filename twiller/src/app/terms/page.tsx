import Link from "next/link";
import ScrollProgress from "@/components/ScrollProgress";

export const metadata = {
  title: "Terms of Service — Twiller",
  description: "Twiller Terms of Service",
};

export default function TermsPage() {
  return (
    <>
    <ScrollProgress />
    <div className="min-h-screen bg-bg text-text">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="mb-8">
          <Link href="/" className="text-primary hover:underline text-sm">← Back to Twiller</Link>
        </div>

        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-text-muted text-sm mb-10">Last updated: October 2026</p>

        <div className="space-y-8 text-text leading-relaxed">
          <section>
            <h2 className="text-xl font-bold text-text mb-3">1. Agreement to Terms</h2>
            <p>
              By accessing or using Twiller, you agree to be bound by these Terms of Service. If you
              disagree with any part of the terms, you may not use our service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-text mb-3">2. Use of Service</h2>
            <p className="mb-3">You agree to use Twiller only for lawful purposes and in a way that does not:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Infringe the rights of others</li>
              <li>Restrict or inhibit any other user&apos;s use or enjoyment of the service</li>
              <li>Include abusive, offensive, hateful, or harmful content</li>
              <li>Impersonate any person or entity</li>
              <li>Spam, advertise unsolicited products or services</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-text mb-3">3. Your Content</h2>
            <p>
              You retain ownership of content you post on Twiller. By posting, you grant Twiller a
              non-exclusive, worldwide, royalty-free license to display and distribute that content
              within the platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-text mb-3">4. Account Responsibility</h2>
            <p>
              You are responsible for maintaining the confidentiality of your account credentials.
              You agree to notify us immediately of any unauthorized use of your account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-text mb-3">5. Subscription Plans</h2>
            <p>
              Twiller currently offers Free, Bronze, Silver, and Gold posting allowances. Free allowance is one post or reply per UTC calendar month. Paid plans are one-time purchases that provide Bronze (3), Silver (5), or Gold (unlimited) posts or replies for 30 days; they do not renew automatically. Current prices are shown in the app. A paid entitlement is applied only after payment verification. Invoice email delivery is attempted but may fail.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-text mb-3">6. Termination</h2>
            <p>
              We reserve the right to suspend or terminate accounts that violate these terms, at our
              sole discretion and without prior notice.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-text mb-3">7. Limitation of Liability</h2>
            <p>
              Twiller is provided &quot;as is&quot; without warranties of any kind. We are not liable for any
              indirect, incidental, or consequential damages arising from your use of the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-text mb-3">8. Changes to Terms</h2>
            <p>
              We may update these terms from time to time. Continued use of Twiller after changes
              constitutes acceptance of the new terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-text mb-3">9. Contact</h2>
            <p>
              The current app does not include an in-app support or contact form. Use the service operator&apos;s published contact channel, if one has been provided to you.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-border flex gap-6 text-sm text-text-muted">
          <Link href="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link>
          <Link href="/cookies" className="hover:text-primary transition-colors">Cookie Policy</Link>
          <Link href="/" className="hover:text-primary transition-colors">Home</Link>
        </div>
      </div>
    </div>
    </>
  );
}
