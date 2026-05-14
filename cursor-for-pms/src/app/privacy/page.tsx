import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";

export default function PrivacyPolicyPage() {
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
            <Shield className="text-white" size={24} />
          </div>
          <h1 className="text-4xl font-serif font-bold text-white/90 mb-4 tracking-tight">Privacy Policy</h1>
          <p className="text-white/50 text-lg">Last updated: May 14, 2026</p>
        </header>

        <div className="glass-pane rounded-2xl p-8 md:p-12 space-y-10 border border-white/5 shadow-2xl">
          
          <section className="space-y-4">
            <h2 className="text-2xl font-serif font-semibold text-white/80">1. Introduction</h2>
            <p className="text-white/60 leading-relaxed">
              Welcome to PMind. We respect your privacy and are committed to protecting your personal data. 
              This privacy policy will inform you as to how we look after your personal data when you visit our 
              website and use our application, and tell you about your privacy rights and how the law protects you.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-serif font-semibold text-white/80">2. Data We Collect</h2>
            <p className="text-white/60 leading-relaxed">
              To provide you with our AI-native product management workspace, we collect the following types of information:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-white/60">
              <li><strong className="text-white/80">Identity & Contact Data:</strong> Email address and profile information provided via our authentication provider (Clerk).</li>
              <li><strong className="text-white/80">Workspace Data:</strong> Documents, project structures, and knowledge base files you upload to the platform (stored securely via Supabase).</li>
              <li><strong className="text-white/80">AI Interaction Data:</strong> Prompts, queries, and interactions you have with the AI assistant.</li>
              <li><strong className="text-white/80">Integration Data:</strong> Access tokens and metadata for connected services like Jira and Linear, stored securely and used only to perform actions on your behalf.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-serif font-semibold text-white/80">3. How We Use Your Data</h2>
            <p className="text-white/60 leading-relaxed">
              We use your data exclusively to provide, maintain, and improve the PMind service. Your workspace data and 
              documents are processed by our Large Language Model (LLM) partners (such as Google or OpenAI) solely for the 
              purpose of generating responses, drafting documents, and providing AI assistance. 
            </p>
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 mt-4">
              <p className="text-sm text-amber-200/80">
                <strong>Important:</strong> We do not train our proprietary models on your private documents, nor do we sell your data to third parties.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-serif font-semibold text-white/80">4. Third-Party Services</h2>
            <p className="text-white/60 leading-relaxed">
              We employ third-party companies to facilitate our service. These third parties have access to your Personal Data 
              only to perform these tasks on our behalf and are obligated not to disclose or use it for any other purpose:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-white/60">
              <li><strong>Clerk:</strong> User authentication and identity management.</li>
              <li><strong>Supabase:</strong> Database and secure file storage infrastructure.</li>
              <li><strong>LLM Providers:</strong> Processing text for AI generation capabilities.</li>
              <li><strong>Render / Vercel:</strong> Cloud hosting infrastructure.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-serif font-semibold text-white/80">5. Data Security</h2>
            <p className="text-white/60 leading-relaxed">
              We have put in place appropriate security measures to prevent your personal data from being accidentally lost, 
              used, or accessed in an unauthorized way, altered, or disclosed. All communication with our servers is encrypted 
              using standard TLS/SSL protocols.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-serif font-semibold text-white/80">6. Contact Us</h2>
            <p className="text-white/60 leading-relaxed">
              If you have any questions about this privacy policy or our privacy practices, please contact us at support@pmind.app.
            </p>
          </section>

        </div>
      </div>
    </div>
  );
}
