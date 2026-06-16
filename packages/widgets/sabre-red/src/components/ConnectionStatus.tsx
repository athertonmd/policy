interface ConnectionStatusProps {
  mode: 'mock' | 'connected' | 'disconnected';
}

export function ConnectionStatus({ mode }: ConnectionStatusProps) {
  const labels: Record<string, string> = {
    mock: 'Mock Mode',
    connected: 'Connected',
    disconnected: 'Disconnected',
  };

  const dotColors: Record<string, string> = {
    mock: 'bg-amber-400',
    connected: 'bg-green-500',
    disconnected: 'bg-red-500',
  };

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 bg-gray-100 border-b border-gray-200">
      <span
        className={`inline-block w-2 h-2 rounded-full ${dotColors[mode]}`}
        aria-hidden="true"
      />
      <span className="text-xs text-gray-600">{labels[mode]}</span>
    </div>
  );
}
