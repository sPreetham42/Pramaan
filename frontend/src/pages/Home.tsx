import BackendStatus from "../components/BackendStatus";

/** Foundation-phase landing page. Module pages (challenges, evidence, ...)
 * will be added by their owning developers. */
export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-xl text-center">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
          PRAMAAN
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          Prove Once. Reuse the Proof.
        </h1>
        <p className="mt-6 text-lg text-slate-600">
          Foundation build is running.
        </p>
        <div className="mt-8">
          <BackendStatus />
        </div>
      </div>
      <footer className="absolute bottom-6 text-xs text-slate-400">
        Smart India Hackathon prototype &middot; phase: foundation
      </footer>
    </main>
  );
}
