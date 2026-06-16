import { Fare } from '../types';
import { FareCard } from './FareCard';

interface CompliancePanelProps {
  fares: Fare[];
}

export function CompliancePanel({ fares }: CompliancePanelProps) {
  const counts = {
    green: fares.filter((f) => f.compliance.status === 'green').length,
    amber: fares.filter((f) => f.compliance.status === 'amber').length,
    red: fares.filter((f) => f.compliance.status === 'red').length,
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {fares.map((fare) => (
          <FareCard key={fare.id} fare={fare} />
        ))}
      </div>
      <div className="border-t border-gray-200 px-4 py-2 bg-gray-50 flex items-center gap-3 text-xs">
        <span className="text-green-700 font-medium">{counts.green} ✓</span>
        <span className="text-amber-700 font-medium">{counts.amber} ⚠</span>
        <span className="text-red-700 font-medium">{counts.red} ✗</span>
        <span className="text-gray-500 ml-auto">{fares.length} fares</span>
      </div>
    </div>
  );
}
