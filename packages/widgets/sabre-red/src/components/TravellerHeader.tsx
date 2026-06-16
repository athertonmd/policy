import { Traveller } from '../types';

interface TravellerHeaderProps {
  traveller: Traveller;
}

export function TravellerHeader({ traveller }: TravellerHeaderProps) {
  return (
    <div className="bg-brand-700 text-white px-4 py-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold">{traveller.name}</h1>
          <p className="text-xs text-brand-200">
            {traveller.grade} · {traveller.policyTier} tier
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold">
            {traveller.budget.currency}
            {traveller.budget.remaining.toLocaleString()}
          </p>
          <p className="text-xs text-brand-200">
            of {traveller.budget.currency}
            {traveller.budget.total.toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}
