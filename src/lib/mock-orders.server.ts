// In-memory mock "pharmacy orders" store — backs companyProviderApi() in
// portal-auth.server.ts now that every real backend call is mocked (see that
// file's header comment). Module-scoped array instead of a database: state
// lives for the lifetime of the server process and resets on redeploy/
// restart, which is expected for a demo with no real backend.
//
// Lets "Send to pharmacy" and "Pay now" actually change what "Recent
// orders" shows afterward — a new submission appears as a fresh order, and
// paying one flips its payment/fulfillment state — instead of every request
// replaying the same static snapshot.
//
// Seed data is built lazily (buildSeed(), first called from inside
// getOrders()) rather than at module top level. Cloudflare Workers restricts
// Date.now()/Math.random() precision in global scope — code that runs once
// at isolate startup, outside any request — as a Spectre-style timing-attack
// mitigation, since global scope isn't tied to a real request's wall-clock
// time. Building the seed eagerly at import time produced garbage dates
// (epoch-adjacent, e.g. "12/30/1969") in production; deferring it until the
// first actual call — which always happens inside a request handler — gets
// a real Date.now().

export type MockOrderItem = {
  name: string;
  strength: string | null;
  dosage: string | null;
  duration: string | null;
  quantity: string | null;
  instructions: string | null;
};

export type MockOrderStatus = "booked" | "dispatched" | "shipped" | "delivered";

export type MockOrder = {
  id: string;
  status: MockOrderStatus;
  orderedAt: string;
  requestedAmount: number | null;
  fileUrl: string | null;
  paymentStatus: "pending" | "paid";
  paidAt: string | null;
  patientId: string;
  patientName: string | null;
  doctorName: string | null;
  notes: string | null;
  items: MockOrderItem[];
};

/** Auto-quotes a new submission immediately instead of leaving it
 * unquoted — a real pharmacy would review and price it first, but that
 * would strand the demo with nothing payable until a second (non-existent)
 * pharmacy-side actor acts. Loosely scaled to how many medicines are on it
 * so the amount isn't the same every time. */
function autoQuote(itemCount: number): number {
  return Math.round((149 + itemCount * 62.5) * 100) / 100;
}

function buildSeed(): MockOrder[] {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();

  return [
    {
      id: "11111111-1111-4111-8111-111111111111",
      status: "booked",
      orderedAt: new Date(now - 2 * day).toISOString(),
      requestedAmount: 348.5,
      fileUrl: null,
      paymentStatus: "pending",
      paidAt: null,
      patientId: "mock-user-id",
      patientName: "Test User",
      doctorName: "Dr. Anjali Rao",
      notes: "Please substitute generics if unavailable",
      items: [
        { name: "Augmentin 625", strength: "625", dosage: "1-0-1", duration: "5", instructions: "After food", quantity: "10" },
        { name: "Pantop 40", strength: "40", dosage: "1-0-0", duration: "5", instructions: "Before food", quantity: "5" },
      ],
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      status: "dispatched",
      orderedAt: new Date(now - 6 * day).toISOString(),
      requestedAmount: 612,
      fileUrl: null,
      paymentStatus: "paid",
      paidAt: new Date(now - 5 * day).toISOString(),
      patientId: "mock-user-id",
      patientName: "Test User",
      doctorName: "Dr. Karthik Menon",
      notes: null,
      items: [
        { name: "Azithral 500", strength: "500", dosage: "0-0-1", duration: "3", instructions: "After food", quantity: "3" },
        { name: "Dolo 650", strength: "650", dosage: "1-1-1", duration: "3", instructions: "SOS for fever", quantity: "9" },
        { name: "Cetzine", strength: "10", dosage: "0-0-1", duration: "5", instructions: "At bedtime", quantity: "5" },
      ],
    },
    {
      id: "33333333-3333-4333-8333-333333333333",
      status: "shipped",
      orderedAt: new Date(now - 9 * day).toISOString(),
      requestedAmount: 275,
      fileUrl: null,
      paymentStatus: "paid",
      paidAt: new Date(now - 8 * day).toISOString(),
      patientId: "mock-user-id",
      patientName: "Test User",
      doctorName: "Dr. Anjali Rao",
      notes: null,
      items: [{ name: "Shelcal 500", strength: "500", dosage: "1-0-0", duration: "30", instructions: "After breakfast", quantity: "30" }],
    },
    {
      id: "44444444-4444-4444-8444-444444444444",
      status: "delivered",
      orderedAt: new Date(now - 14 * day).toISOString(),
      requestedAmount: 540,
      fileUrl: null,
      paymentStatus: "paid",
      paidAt: new Date(now - 13 * day).toISOString(),
      patientId: "mock-user-id",
      patientName: "Test User",
      doctorName: "Dr. Karthik Menon",
      notes: "Follow-up in 2 weeks",
      items: [
        { name: "Metrogyl 400", strength: "400", dosage: "1-1-1", duration: "7", instructions: "After food", quantity: "21" },
        { name: "Rantac 150", strength: "150", dosage: "1-0-1", duration: "7", instructions: "Before food", quantity: "14" },
      ],
    },
  ];
}

let orders: MockOrder[] | undefined;

function getOrders(): MockOrder[] {
  if (!orders) orders = buildSeed();
  return orders;
}

export function listMockOrders(patientId: string): MockOrder[] {
  return getOrders()
    .filter((o) => o.patientId === patientId)
    .sort((a, b) => new Date(b.orderedAt).getTime() - new Date(a.orderedAt).getTime());
}

export function getMockOrder(id: string): MockOrder | undefined {
  return getOrders().find((o) => o.id === id);
}

export function createMockOrder(input: {
  patientId: string;
  patientName: string | null;
  doctorName: string | null;
  notes: string | null;
  items: MockOrderItem[];
}): MockOrder {
  const order: MockOrder = {
    id: crypto.randomUUID(),
    status: "booked",
    orderedAt: new Date().toISOString(),
    requestedAmount: autoQuote(input.items.length),
    fileUrl: null,
    paymentStatus: "pending",
    paidAt: null,
    patientId: input.patientId,
    patientName: input.patientName,
    doctorName: input.doctorName,
    notes: input.notes,
    items: input.items,
  };
  getOrders().push(order);
  return order;
}

/** Marks an order paid and advances it to "dispatched" if it hadn't already
 * moved further along the fulfillment pipeline — simulates the pharmacy
 * starting to prepare the order once payment clears. */
export function markMockOrderPaid(id: string): MockOrder | undefined {
  const order = getOrders().find((o) => o.id === id);
  if (!order) return undefined;
  order.paymentStatus = "paid";
  order.paidAt = new Date().toISOString();
  if (order.status === "booked") order.status = "dispatched";
  return order;
}
