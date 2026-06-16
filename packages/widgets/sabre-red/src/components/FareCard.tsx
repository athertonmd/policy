import { Fare, ComplianceStatus } from '../types';

interface FareCardProps {
  fare: Fare;
}

const badgeConfig: Record<ComplianceStatus, { bg: string; text: string; label: string }> = {
  green: { bg: 'bg-green-100', text: 'text-green-800', label: 'Compliant' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Needs Approval' },
  red: { bg: 'bg-red-100', text: 'text-red-800', label: 'Non-Compliant' },
};

export function FareCard({ fare }: FareCardProps) {
  const badge = badgeConfig[fare.compliance.status];
  const hasDetails = fare.compliance.status !== 'green' && (
    fare.compliance.reasons.length > 0 ||
    fare.compliance.violatedRules.length > 0 ||
    fare.compliance.alternatives.length > 0
  );

  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-white" data-testid="fare-card">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900">
              {fare.flightNumber}
            </span>
            <span className="text-xs text-gray-500">
              {fare.route.origin}→{fare.route.destination}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {fare.airline} · {fare.cabinClass}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-semibold text-gray-900">
            {fare.currency}{fare.price.toLocaleString()}
          </p>
        </div>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badge.bg} ${badge.text}`}
          data-testid={`badge-${fare.compliance.status}`}
        >
          {badge.label}
        </span>
        {fare.compliance.obligations.length > 0 && (
          <span className="text-xs italic text-gray-400" data-testid="compliance-obligation">
            {fare.compliance.obligations[0]}
          </span>
        )}
      </div>
      {hasDetails && (
        <div className="mt-1.5 space-y-0.5" data-testid="compliance-details">
          {fare.compliance.reasons.length > 0 && (
            <ul className="text-xs text-gray-600 list-disc list-inside">
              {fare.compliance.reasons.map((reason, i) => (
                <li key={i} data-testid="compliance-reason">{reason}</li>
              ))}
            </ul>
          )}
          {fare.compliance.violatedRules.length > 0 && (
            <p className="text-xs italic text-gray-500" data-testid="violated-rules">
              Rules: {fare.compliance.violatedRules.join(', ')}
            </p>
          )}
          {fare.compliance.alternatives.length > 0 && (
            <p className="text-xs text-blue-600" data-testid="compliance-alternatives">
              Suggested: {fare.compliance.alternatives.join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
