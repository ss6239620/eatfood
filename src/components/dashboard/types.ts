import type {
  MenuItem,
  Order,
  Settings as RestaurantSettings,
  Staff,
} from "@/lib/types";
export type Job = {
  id: string;
  order_id: string;
  kind: string;
  status: string;
  attempts: number;
  error: string | null;
  created_at: string;
};
export type Data = {
  staff: Staff;
  restaurant: {
    id: string;
    name: string;
    slug: string;
    settings: RestaurantSettings;
  };
  menu: MenuItem[];
  categories: { id: string; name: string; position: number }[];
  orders: Order[];
  jobs: Job[];
  summary: {
    orders: number;
    completed_value: number;
    cod_collected: number;
    simulated_online: number;
    verified_online: number;
    unpaid: number;
    refunds: number;
  };
  syncedAt: string;
};
export type Event = {
  id: string;
  kind: string;
  actor: string;
  reason: string;
  created_at: string;
};
