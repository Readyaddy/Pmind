export default function SignInLoading() {
  return (
    <div className="min-h-screen bg-[#080808] flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Background glow orbs */}
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-amber-600/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-amber-500/8 blur-[100px] pointer-events-none" />

      {/* Grid texture */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="mb-8 text-center relative z-10">
        <div className="flex items-center justify-center gap-2.5 mb-3">
          <div
            style={{
              width: 32,
              height: 32,
              background: "linear-gradient(145deg, #D97706 0%, #92400e 100%)",
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "Georgia, serif",
              fontSize: 15,
              fontWeight: 700,
              color: "rgba(255,255,255,0.95)",
              boxShadow: "0 4px 18px rgba(217,119,6,0.40), 0 0 0 1px rgba(217,119,6,0.2)",
            }}
          >
            P
          </div>
          <span className="font-serif text-2xl font-bold text-white tracking-tight" style={{ fontFamily: "Georgia, serif" }}>
            PMind
          </span>
        </div>
        <p className="text-white/35 text-sm">Your AI-native workspace for product work</p>
      </div>

      {/* Skeleton card */}
      <div className="w-full max-w-sm animate-pulse relative z-10">
        <div className="rounded-2xl border border-white/[0.07] bg-[#111111] p-8">
          {/* Social button skeleton (white, like Google) */}
          <div className="h-10 bg-white/90 rounded-xl mb-4" />
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-white/8" />
            <div className="h-3 bg-white/8 rounded w-8" />
            <div className="flex-1 h-px bg-white/8" />
          </div>
          <div className="space-y-3 mb-5">
            <div className="h-3 bg-white/8 rounded w-1/4" />
            <div className="h-10 bg-white/5 rounded-xl" />
          </div>
          <div className="space-y-3 mb-6">
            <div className="h-3 bg-white/8 rounded w-1/4" />
            <div className="h-10 bg-white/5 rounded-xl" />
          </div>
          <div className="h-10 bg-amber-500/25 rounded-xl mb-4" />
          <div className="h-3 bg-white/5 rounded w-1/2 mx-auto" />
        </div>
      </div>
    </div>
  );
}
