import { LoginForm } from '@/components/auth/LoginForm';
import { Brand } from '@/components/Brand';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main id="main" className="auth-layout">
    <section className="auth-story">
      <Brand />
      <div className="my-auto py-16"><p className="eyebrow mb-6">A little today. A little tomorrow.</p>
        <h1 className="max-w-xl text-5xl leading-[1.12] tracking-[-0.055em] sm:text-6xl">Your effort deserves<br /><span className="text-accent">to be seen.</span></h1>
        <p className="mt-7 max-w-sm text-base leading-7 text-muted">Make room for focus. Build a record of the time you put in, one study session at a time.</p>
        <div aria-hidden="true" className="mt-12 grid max-w-md grid-cols-[repeat(18,1fr)] gap-1.5">
          {Array.from({ length: 90 }, (_, i) => <span key={i} className={`aspect-square rounded-sm heat-${[0, 1, 2, 3, 4, 5][(i * 7 + Math.floor(i / 18) * 3) % 6]}`} />)}
        </div>
        <p className="mt-4 text-xs text-muted">Small sessions. A year of progress.</p>
      </div>
      <p className="text-xs text-muted">A quiet place to grow.</p>
    </section>
    <section className="flex items-center justify-center p-6 py-14 sm:p-12"><LoginForm callbackError={!!error} /></section>
  </main>;
}
