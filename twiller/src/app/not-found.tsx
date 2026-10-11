import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="text-8xl font-black text-blue-500 mb-2">404</div>
        <h1 className="text-2xl font-bold mb-3">Hmm... this page doesn&apos;t exist.</h1>
        <p className="text-gray-400 mb-8">
          Try searching for something else, or go back home.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/search"
            className="px-6 py-3 border border-gray-700 hover:bg-gray-900 text-white font-bold rounded-full transition-colors"
          >
            Search Twiller
          </Link>
          <Link
            href="/"
            className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-full transition-colors"
          >
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
