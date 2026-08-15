import { Link } from 'react-router-dom';

// Previously any unknown URL rendered an empty <main> with no way back.
export default function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center p-6">
      <div className="max-w-sm text-center animate-rise">
        <div className="num text-figure font-semibold text-text-tertiary">404</div>
        <h1 className="mt-1 text-[15px] font-semibold">No page at this address</h1>
        <p className="mx-auto mt-1.5 text-[13px] leading-relaxed text-text-tertiary">
          The route doesn’t exist. Head back to the markets, or search a symbol to analyse.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Link to="/" className="btn">Markets</Link>
          <Link to="/analyze" className="btn-ghost">Analyze</Link>
        </div>
      </div>
    </div>
  );
}
