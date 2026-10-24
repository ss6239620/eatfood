import { randomUUID } from "node:crypto";
import { sql } from "../src/lib/db";
import { hash, passwordHash, token } from "../src/lib/security";
const settings = {
  open: true,
  address: "12, 80 Feet Road, Indiranagar, Bengaluru 560038",
  phone: "+919876543210",
  deliveryAreas: ["Indiranagar", "Domlur", "Ulsoor"],
  deliveryFee: 3000,
  packagingFee: 1000,
  minimumOrder: 10000,
  taxBps: 500,
  opensAt: "00:00",
  closesAt: "00:00",
  alertMinutes: 2,
  timeoutMinutes: 10,
  printWidth: "80mm",
  billingDetails: "Sample bill • Tax configuration requires accountant review",
};
const foods = [
  [
    "paneer-tikka",
    "Paneer Tikka Bowl",
    "Smoky paneer, fragrant rice, mint chutney & a little crunch.",
    "Bowls",
    24900,
    "paneer",
    true,
  ],
  [
    "butter-chicken",
    "Butter Chicken Bowl",
    "Slow-cooked chicken in a rich tomato gravy with basmati rice.",
    "Bowls",
    29900,
    "chicken",
    false,
  ],
  [
    "dal-makhani",
    "Dal Makhani Bowl",
    "Black lentils, slow simmered overnight. Comfort in every bite.",
    "Bowls",
    21900,
    "dal",
    true,
  ],
  [
    "chicken-biryani",
    "Hyderabadi Biryani",
    "Dum-cooked chicken, long-grain rice, raita & house salan.",
    "Biryani",
    32900,
    "biryani",
    false,
  ],
  [
    "veg-biryani",
    "Garden Vegetable Biryani",
    "Seasonal vegetables, aromatic spices & saffron basmati.",
    "Biryani",
    24900,
    "vegbiryani",
    true,
  ],
  [
    "naan",
    "Garlic Butter Naan",
    "Tandoor-baked, brushed with garlic butter.",
    "Sides",
    5900,
    "naan",
    true,
  ],
  [
    "samosa",
    "Punjabi Samosa",
    "Two crisp pastries with spiced potato and tamarind chutney.",
    "Sides",
    8900,
    "samosa",
    true,
  ],
  [
    "mango-lassi",
    "Mango Lassi",
    "Alphonso mango, creamy yogurt & a hint of cardamom.",
    "Drinks",
    9900,
    "lassi",
    true,
  ],
  [
    "gulab-jamun",
    "Gulab Jamun",
    "Two warm milk dumplings in rose-scented syrup.",
    "Desserts",
    7900,
    "jamun",
    true,
  ],
] as const;
await sql.begin(async (tx) => {
  await tx`SELECT pg_advisory_xact_lock(823403)`;
  const [exists] = await tx`SELECT id FROM restaurants WHERE id='r_demo'`;
  if (exists) {
    console.log("Demo already seeded; existing data preserved.");
    return;
  }
  await tx`INSERT INTO restaurants(id,slug,name,settings) VALUES('r_demo','the-good-bowl','The Good Bowl',${JSON.stringify(settings)}::jsonb)`;
  await tx`INSERT INTO restaurants(id,slug,name,settings) VALUES('r_other','another-kitchen','Another Kitchen',${JSON.stringify(settings)}::jsonb)`;
  for (const [id, r, email, name, role] of [
    ["u_owner", "r_demo", "owner@eatfood.local", "Aarav Mehta", "owner"],
    ["u_staff", "r_demo", "staff@eatfood.local", "Priya Shah", "staff"],
    ["u_other", "r_other", "other@eatfood.local", "Other Owner", "owner"],
  ])
    await tx`INSERT INTO staff(id,restaurant_id,email,name,role,password_hash) VALUES(${id},${r},${email},${name},${role},${passwordHash("EatFoodDemo!2026")})`;
  for (const [i, f] of foods.entries()) {
    const [id, name, description, category, price, image, veg] = f;
    const opts =
      i < 5
        ? [
            { id: "extra-paneer", name: "Extra paneer", price: 4900 },
            { id: "extra-raita", name: "Extra raita", price: 2900 },
          ]
        : [];
    await tx`INSERT INTO menu_items(id,restaurant_id,name,description,category,price,image,vegetarian,options,position) VALUES(${id},'r_demo',${name},${description},${category},${price},${"/food/" + image + ".jpg"},${veg},${JSON.stringify(opts)}::jsonb,${i})`;
  }
  const states = [
    "awaiting",
    "awaiting",
    "accepted",
    "preparing",
    "ready",
    "out_for_delivery",
    "delivered",
    "collected",
    "cancelled",
    "rejected",
  ];
  const names = [
    "Ananya Sharma",
    "Rohan Kapoor",
    "Meera Iyer",
    "Aditya Rao",
    "Sana Khan",
    "Vikram Patel",
    "Nisha Reddy",
    "Arjun Das",
    "Dev Shah",
    "Tara Singh",
  ];
  for (const [i, status] of states.entries()) {
    const id = "demo-order-" + i,
      f = foods[i % foods.length],
      q = i % 3 === 0 ? 2 : 1,
      subtotal = f[4] * q,
      tax = Math.round(subtotal * 0.05),
      delivery = i % 2 === 0 || status === "out_for_delivery",
      fee = delivery ? 3000 : 0,
      total = subtotal + tax + 1000 + fee,
      online = i === 2 || i === 6;
    const items = [
      {
        id: f[0],
        name: f[1],
        quantity: q,
        unitPrice: f[4],
        options: [],
        total: subtotal,
      },
    ];
    await tx`INSERT INTO orders(id,restaurant_id,reference,source,customer_id,customer_name,phone,fulfillment,address,items,subtotal,tax,packaging,delivery_fee,total,status,payment_method,payment_status,simulated_payment,notes,estimate,tracking_hash,created_at) VALUES(${id},'r_demo',${"EF-" + (1042 + i)},'demo',${"demo-customer-" + i},${names[i]},'+919876543210',${delivery ? "delivery" : "pickup"},${delivery ? JSON.stringify({ line: "24, 2nd Cross, near Metro Station", area: "Indiranagar" }) : "null"}::jsonb,${JSON.stringify(items)}::jsonb,${subtotal},${tax},1000,${fee},${total},${status},${online ? "online" : "cod"},${online || ["delivered", "collected"].includes(status) ? "paid" : "unpaid"},${online},${i === 0 ? "Please keep it mildly spicy." : ""},${status === "awaiting" ? null : 20},${hash(token())},now()-${i === 0 ? 1 : i === 1 ? 2 : i * 7}*interval '1 minute')`;
    await tx`INSERT INTO order_events(id,restaurant_id,order_id,kind,actor,reason) VALUES(${randomUUID()},'r_demo',${id},${status},'Demo seed','Sample order for demonstration.')`;
    if (online || ["delivered", "collected"].includes(status))
      await tx`INSERT INTO payments(id,restaurant_id,order_id,event_id,kind,amount,simulated) VALUES(${randomUUID()},'r_demo',${id},${"seed-payment-" + i},${online ? "success" : "cod"},${total},${online})`;
  }
  console.log(
    "Seeded The Good Bowl. Owner/staff demo accounts are documented in README.",
  );
});
await sql.end();
