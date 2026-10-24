import { ShoppingBag } from "lucide-react";
export function Metric({
  label,
  value,
  icon: Icon,
  note,
}: {
  label: string;
  value: string;
  icon: typeof ShoppingBag;
  note: string;
}) {
  return (
    <div className="metric">
      <div className="metric-label">
        {label}
        <span className="metric-icon">
          <Icon size={16} strokeWidth={1.5} />
        </span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-note">
        <span>↗</span>
        {note}
      </div>
    </div>
  );
}
export function Heading({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="heading-row">
      <div>
        <h1>{title}</h1>
        <p className="subtitle">{subtitle}</p>
      </div>
    </div>
  );
}
