"use client";

import { signIn, useSession } from "next-auth/react";
import { CloudSync, Layers, Zap, Rss, ArrowLeft, LogIn } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function LoginPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      router.push("/home");
    }
  }, [status, router]);
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white overflow-hidden relative flex flex-col selection:bg-red-500/30">
      {/* Background gradients */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-red-600/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-orange-600/20 blur-[120px] pointer-events-none" />

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-6 md:p-12 z-10">
        <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-24 items-center">
          
          {/* Left: Login & Value Prop */}
          <div className="flex flex-col items-start max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-mono tracking-wide uppercase mb-6">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              Engineering Blogs
            </div>
            
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6 leading-[1.1]">
              Level up your <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-400">
                engineering knowledge.
              </span>
            </h1>
            
            <p className="text-lg text-white/60 mb-10 leading-relaxed max-w-md">
              Create a free account to unlock seamless cloud synchronization across all your devices. Never lose your reading history again.
            </p>

            <div className="w-full max-w-sm">
              <button
                onClick={() => signIn("google", { callbackUrl: "/home" })}
                className="w-full group relative flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-gray-900 px-6 py-4 rounded-xl font-bold text-lg transition-all shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)] hover:shadow-[0_0_60px_-15px_rgba(255,255,255,0.5)] active:scale-[0.98]"
              >
                <LogIn className="w-5 h-5 text-gray-700 group-hover:text-gray-900 transition-colors" />
                Continue with Google
              </button>
              <p className="text-xs text-center text-white/40 mt-4">
                By continuing, you agree to our Terms of Service and Privacy Policy.
              </p>
              <div className="mt-6">
                <Link
                  href="/home"
                  className="w-full inline-flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 text-white px-6 py-3 rounded-xl font-semibold transition-colors"
                >
                  Explore app without account
                </Link>
              </div>
            </div>
          </div>

          {/* Right: Features Grid (Glassmorphism) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-colors group">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <CloudSync className="w-5 h-5 text-blue-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Cloud Sync</h3>
              <p className="text-sm text-white/60 leading-relaxed">
                Your bookmarks, favorite sources, and read history are synced instantly across your phone, tablet, and desktop.
              </p>
            </div>

            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-colors group sm:translate-y-6">
              <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Rss className="w-5 h-5 text-orange-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">400+ Blogs</h3>
              <p className="text-sm text-white/60 leading-relaxed">
                We aggregate the absolute best engineering content from top tier companies and independent developers.
              </p>
            </div>

            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-colors group">
              <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Layers className="w-5 h-5 text-purple-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Smart Curation</h3>
              <p className="text-sm text-white/60 leading-relaxed">
                Explore hand-curated feeds or filter by categories like System Design, AI/ML, and Frontend.
              </p>
            </div>

            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-colors group sm:translate-y-6">
              <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Zap className="w-5 h-5 text-green-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Blazing Fast</h3>
              <p className="text-sm text-white/60 leading-relaxed">
                Optimized local caching and zero-latency optimistic UI means you never wait for content to load.
              </p>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
