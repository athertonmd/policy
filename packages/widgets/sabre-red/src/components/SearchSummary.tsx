interface SearchSummaryProps {
  route: { origin: string; destination: string } | null;
  departureDate: string | null;
  fareCount: number;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function SearchSummary({ route, departureDate, fareCount }: SearchSummaryProps) {
  if (!route) return null;

  return (
    <div
      className="px-3 py-1 text-xs text-gray-500"
      data-testid="search-summary"
    >
      {route.origin} → {route.destination}
      {departureDate && ` · ${formatDate(departureDate)}`}
      {` · ${fareCount} fare${fareCount !== 1 ? 's' : ''} evaluated`}
    </div>
  );
}
