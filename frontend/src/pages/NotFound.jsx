import { Link } from 'react-router-dom';

// Previously any unknown URL rendered an empty <main> with no way back.
export default function NotFound() {
  return (
    <div className="grid min-h-[70vh] place-items-center p-6">
      <div className="max-w-md text-center animate-rise">
        <div className="num text-figure font-semibold text-text-tertiary">404</div>
        <h1 className="mt-2 text-xl font-semibold">No page at this address</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-text-secondary">
          The route doesn’t exist. Head back to the markets, or search a symbol to analyse.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link to="/" className="btn">Markets</Link>
          <Link to="/analyze" className="btn-ghost">Analyze</Link>
        </div>
      </div>
    </div>
  );
}
