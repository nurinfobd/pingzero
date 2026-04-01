'use client';
 
import { useEffect } from 'react';
 
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Next.js Error Boundary Caught:", error);
  }, [error]);
 
  return (
    <div className="p-8 text-red-500 bg-red-50">
      <h2>Something went wrong!</h2>
      <pre>{error.message}</pre>
      <pre>{error.stack}</pre>
      <button
        onClick={() => reset()}
        className="mt-4 px-4 py-2 bg-red-600 text-white rounded"
      >
        Try again
      </button>
    </div>
  );
}