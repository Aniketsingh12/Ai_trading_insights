import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

// Previously any unknown URL rendered an empty <main> with no way back.
export default function NotFound() {
  return (
    <div className="p-6 min-h-[70vh] grid place-items-center">
      <div className="card card-3d max-w-md text-center space-y-3 py-10">
        <Compass size={32} className="mx-auto text-primary" />
        <h1 className="text-xl font-bold">Page not found</h1>
        <p className="text-text-secondary text-sm">
          That route doesn’t exist. Try the dashboard, or search a ticker on Analyze.
        </p>
        <div className="flex gap-2 justify-center pt-1">
          <Link to="/" className="btn">Dashboard</Link>
          <Link to="/analyze" className="btn-ghost">Analyze</Link>
        </div>
      </div>
    </div>
  );
}
