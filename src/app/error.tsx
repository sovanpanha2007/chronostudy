'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main id="main" className="m-auto max-w-md p-8"><p className="eyebrow mb-4">A small interruption</p><h1 className="text-3xl tracking-tight">We couldn’t load your space.</h1><p className="my-5 leading-7 text-muted">Check your connection and try again. Any sessions saved on this device will be waiting when you return.</p><button className="button primary" onClick={reset}>Try again</button><a className="button secondary ml-3" href="/login">Sign in</a></main>;
}
