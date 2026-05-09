export default function SignInLoading() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center px-4">
      <div className="mb-8 text-center">
        <div className="flex items-center justify-center gap-2.5 mb-2">
          <div style={{ width:28, height:28, background:"linear-gradient(145deg,#D97706 0%,#92400e 100%)", borderRadius:7, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"Georgia,serif", fontSize:14, fontWeight:700, color:"rgba(255,255,255,0.92)" }}>
            P
          </div>
          <span className="font-serif text-2xl font-bold text-white tracking-tight">PMind</span>
        </div>
        <p className="text-white/30 text-sm">Your AI-native PM workspace</p>
      </div>

      {/* Skeleton matching Clerk card dimensions */}
      <div className="w-full max-w-[400px] animate-pulse">
        <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-8">
          <div className="h-5 bg-white/5 rounded-md w-1/3 mb-6" />
          <div className="space-y-3 mb-6">
            <div className="h-3 bg-white/5 rounded w-1/4" />
            <div className="h-10 bg-white/5 rounded-xl" />
          </div>
          <div className="space-y-3 mb-6">
            <div className="h-3 bg-white/5 rounded w-1/4" />
            <div className="h-10 bg-white/5 rounded-xl" />
          </div>
          <div className="h-10 bg-amber-500/20 rounded-xl mb-4" />
          <div className="h-3 bg-white/5 rounded w-1/2 mx-auto" />
        </div>
      </div>
    </div>
  );
}
