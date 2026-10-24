import { Utensils } from "lucide-react";
export function Brand() {
  return (
    <a href="/" className="brand" aria-label="EatFood home">
      <span className="brand-icon">
        <Utensils size={19} strokeWidth={1.8} />
      </span>
      eatfood<span className="brand-dot">.</span>
    </a>
  );
}
