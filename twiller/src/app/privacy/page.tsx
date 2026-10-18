import Link from "next/link";
import ScrollProgress from "@/components/ScrollProgress";

export const metadata = {
  title: "Privacy Policy — Twiller",
  description: "Twiller Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <>
    <ScrollProgress />
    <div className="min-h-screen bg-bg text-text">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="mb-8">
          <Link href="/" className="text-primary hover:underline text-sm">← Back to Twiller</Link>
        </div>

        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-text-muted text-sm mb-10">Last updated: October 2026</p>

        <div className="space-y-8 text-text leading-relaxed">
          <section>
            <h2 className="text-xl font-bold text-text mb-3">1. Information We Collect</h2>
            <p className="mb-3">When you use Twiller, we collect:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong className="text-text">Account information</strong> — name, email address, username, profile photo</li>
              <li><strong className="text-text">Content you post</strong> — tweets, images, audio clips, replies</li>
              <li><strong className="text-text">Usage data</strong> — login history, IP address, device and browser info</li>
              <li><strong className="text-text">Interaction data</strong> — likes, echo counts, saved posts, follows, and in-app activity</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-text mb-3">2. How We Use Your Information</h2>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>To provide and operate the Twiller service</li>
              <li>To authenticate your identity and secure your account</li>
              <li>To personalize your feed and suggestions</li>
              <li>To enforce our Terms of Service</li>
              <li>To send verification and password-reset messages when those account flows are used</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-text mb-3">3. Data Sharing</h2>
            <p>
              The application code contains no data-sale integration. Account and application data are processed by the configured authentication, database, email, and media services used by the deployment. The codebase does not send uploaded images to ImgBB; media is handled by the configured backend storage.
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
              <li><strong className="text-text">Firebase Authentication</strong> — sign-in and account recovery</li>
              <li>The deployment-configured MongoDB service — application records</li>
              <li>The deployment-configured email and media services — verification messages and uploaded media</li>
              <li>Authorities where disclosure is required by applicable law</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-text mb-3">4. Data Retention</h2>
            <p>
              Application records remain in the configured database until the service operator removes them. The current app does not provide self-service account deletion in Settings; do not rely on the app to delete an account or its records.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-text mb-3">5. Security</h2>
            <p>
              Sign-in is verified through Firebase Authentication and protected API requests use authenticated bearer tokens. Some workflows also require email verification codes. The protections available depend on the deployment configuration; no security method can guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-text mb-3">6. Your Rights</h2>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Review and update supported profile fields in the app</li>
              <li>For requests the app cannot perform, use a service-operator contact channel if one has been provided</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-text mb-3">7. Children&apos;s Privacy</h2>
            <p>
              Twiller is not intended for users under 13. We do not knowingly collect information
              from children under 13.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-text mb-3">8. Changes to This Policy</h2>
            <p>
              We may update this policy periodically. We will notify you of significant changes via
              the app or email.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-border flex gap-6 text-sm text-text-muted">
          <Link href="/terms" className="hover:text-primary transition-colors">Terms of Service</Link>
          <Link href="/cookies" className="hover:text-primary transition-colors">Cookie Policy</Link>
          <Link href="/" className="hover:text-primary transition-colors">Home</Link>
        </div>
      </div>
    </div>
    </>
  );
}
