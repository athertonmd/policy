'use client';

interface ComplianceGaugeProps {
  value: number;
  label: string;
  size?: 'sm' | 'md' | 'lg';
}

export function ComplianceGauge({ value, label, size = 'lg' }: ComplianceGaugeProps) {
  const sizeConfig = {
    sm: { dimension: 80, strokeWidth: 4, fontSize: 'text-sm' },
    md: { dimension: 120, strokeWidth: 5, fontSize: 'text-xl' },
    lg: { dimension: 160, strokeWidth: 6, fontSize: 'text-3xl' },
  };

  const config = sizeConfig[size];
  const radius = 15.9155;
  const circumference = 2 * Math.PI * radius;
  const dashArray = `${value}, 100`;

  const getColor = (val: number) => {
    if (val >= 95) return '#16a34a'; // green
    if (val >= 90) return '#d97706'; // amber
    return '#dc2626'; // red
  };

  const color = getColor(value);

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: config.dimension, height: config.dimension }}>
        <svg
          className="-rotate-90"
          viewBox="0 0 36 36"
          style={{ width: config.dimension, height: config.dimension }}
          role="img"
          aria-label={`${label}: ${value}%`}
        >
          <path
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke="#e5e7eb"
            strokeWidth={config.strokeWidth}
            strokeLinecap="round"
          />
          <path
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke={color}
            strokeWidth={config.strokeWidth}
            strokeDasharray={dashArray}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`${config.fontSize} font-bold text-gray-900`}>
            {value}%
          </span>
        </div>
      </div>
      <p className="mt-2 text-sm font-medium text-gray-700">{label}</p>
    </div>
  );
}
