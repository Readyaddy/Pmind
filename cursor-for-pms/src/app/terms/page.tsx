import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-[#050505] text-[#F3F2F1] font-sans selection:bg-amber-600/30">
      {/* Background Ambient Lighting */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-amber-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-amber-800/10 rounded-full blur-[150px]" />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-8 py-20">
        <Link 
          href="/"
          className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-amber-500 transition-colors mb-12"
        >
          <ArrowLeft size={16} />
          Back to home
        </Link>

        <header className="mb-16">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(217,119,6,0.3)]">
            <FileText className="text-white" size={24} />
          </div>
          <h1 className="text-4xl font-serif font-bold text-white/90 mb-4 tracking-tight">Terms of Service</h1>
          <p className="text-white/50 text-lg">Last updated: May 14, 2026</p>
        </header>

        <div className="glass-pane rounded-2xl p-8 md:p-12 space-y-10 border border-white/5 shadow-2xl">
          
          <section className="space-y-4">
            <h2 className="text-2xl font-serif font-semibold text-white/80">1. Acceptance of Terms</h2>
            <p className="text-white/60 leading-relaxed">
              By accessing or using PMind ("the Service"), you agree to be bound by these Terms of Service. 
              If you disagree with any part of the terms, you may not access the Service.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-serif font-semibold text-white/80">2. Description of Service</h2>
            <p className="text-white/60 leading-relaxed">
              PMind is an AI-native product management workspace that allows users to organize documents, 
              interact with AI assistants, and manage product development workflows.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-serif font-semibold text-white/80">3. User Accounts</h2>
            <p className="text-white/60 leading-relaxed">
              To use PMind, you must register for an account. You are responsible for safeguarding the credentials 
              that you use to access the Service and for any activities or actions under your account.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-serif font-semibold text-white/80">4. User Content and Data</h2>
            <p className="text-white/60 leading-relaxed">
              You retain all rights to any documents, projects, or knowledge base files you upload ("User Content"). 
              By uploading content, you grant PMind a license to use, store, and process this content solely for the 
              purpose of providing the Service, including processing via our LLM partners to generate AI responses.
            </p>
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 mt-4">
              <p className="text-sm text-amber-200/80">
                <strong>Important:</strong> We do not use your private User Content to train our proprietary models.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-serif font-semibold text-white/80">5. Acceptable Use</h2>
            <p className="text-white/60 leading-relaxed">
              You agree not to use the Service to:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-white/60">
              <li>Upload any content that is illegal, harmful, threatening, abusive, or harassing.</li>
              <li>Attempt to gain unauthorized access to any part of the Service.</li>
              <li>Use the Service for any unauthorized automated scraping or data extraction.</li>
              <li>Introduce viruses, trojans, worms, or other technologically harmful material.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-serif font-semibold text-white/80">6. Termination</h2>
            <p className="text-white/60 leading-relaxed">
              We may terminate or suspend your access to our Service immediately, without prior notice or liability, 
              for any reason whatsoever, including without limitation if you breach the Terms.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-serif font-semibold text-white/80">7. Limitation of Liability</h2>
            <p className="text-white/60 leading-relaxed">
              In no event shall PMind, nor its directors, employees, partners, agents, suppliers, or affiliates, 
              be liable for any indirect, incidental, special, consequential or punitive damages, including without 
              limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your access 
              to or use of or inability to access or use the Service.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-serif font-semibold text-white/80">8. Changes to Terms</h2>
            <p className="text-white/60 leading-relaxed">
              We reserve the right, at our sole discretion, to modify or replace these Terms at any time. By continuing 
              to access or use our Service after those revisions become effective, you agree to be bound by the revised terms.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-serif font-semibold text-white/80">9. Contact Us</h2>
            <p className="text-white/60 leading-relaxed">
              If you have any questions about these Terms, please contact us at support@pmind.app.
            </p>
          </section>

        </div>
      </div>
    </div>
  );
}
