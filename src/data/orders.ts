import type { Order } from "@/domain/refunds/types";

export const orders: Order[] = [
  {
    id: "ord_8901", customerId: "cus_001", status: "DELIVERED", currency: "USD",
    subtotalCents: 8900, shippingCents: 900, taxCents: 712, totalPaidCents: 10512, refundedCents: 0,
    placedAt: "2026-08-06T12:00:00Z", deliveredAt: "2026-08-12T15:30:00Z",
    items: [{ id: "item_001", sku: "HD-100", name: "Studio Headphones", quantity: 1, unitPriceCents: 8900, finalSale: false, refundable: true }]
  },
  {
    id: "ord_8902", customerId: "cus_002", status: "DELIVERED", currency: "USD",
    subtotalCents: 4200, shippingCents: 600, taxCents: 336, totalPaidCents: 5136, refundedCents: 0,
    placedAt: "2026-08-02T12:00:00Z", deliveredAt: "2026-08-08T13:00:00Z",
    items: [{ id: "item_002", sku: "FS-220", name: "Limited Edition Tee", quantity: 1, unitPriceCents: 4200, finalSale: true, refundable: true }]
  },
  {
    id: "ord_8903", customerId: "cus_003", status: "DELIVERED", currency: "USD",
    subtotalCents: 12900, shippingCents: 0, taxCents: 1032, totalPaidCents: 13932, refundedCents: 0,
    placedAt: "2026-06-01T12:00:00Z", deliveredAt: "2026-06-08T13:00:00Z",
    items: [{ id: "item_003", sku: "KB-310", name: "Mechanical Keyboard", quantity: 1, unitPriceCents: 12900, finalSale: false, refundable: true }]
  },
  {
    id: "ord_8904", customerId: "cus_004", status: "DELIVERED", currency: "USD",
    subtotalCents: 6500, shippingCents: 700, taxCents: 520, totalPaidCents: 7720, refundedCents: 0,
    placedAt: "2026-08-05T12:00:00Z", deliveredAt: "2026-08-11T13:00:00Z",
    items: [{ id: "item_004", sku: "SH-410", name: "Everyday Sneakers", quantity: 1, unitPriceCents: 6500, finalSale: false, refundable: true }]
  },
  {
    id: "ord_8905", customerId: "cus_006", status: "DELIVERED", currency: "USD",
    subtotalCents: 19900, shippingCents: 0, taxCents: 1592, totalPaidCents: 21492, refundedCents: 0,
    placedAt: "2026-08-04T12:00:00Z", deliveredAt: "2026-08-10T13:00:00Z",
    items: [{ id: "item_005", sku: "CM-500", name: "Creator Microphone", quantity: 1, unitPriceCents: 19900, finalSale: false, refundable: true }]
  },
  {
    id: "ord_8906", customerId: "cus_009", status: "DELIVERED", currency: "USD",
    subtotalCents: 6000, shippingCents: 700, taxCents: 480, totalPaidCents: 7180, refundedCents: 3000,
    placedAt: "2026-08-03T12:00:00Z", deliveredAt: "2026-08-09T13:00:00Z",
    items: [{ id: "item_006", sku: "BT-610", name: "Insulated Bottle", quantity: 2, unitPriceCents: 3000, finalSale: false, refundable: true }]
  }
];
