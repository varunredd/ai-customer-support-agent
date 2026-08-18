import type { Customer, Order } from "@/domain/refunds/types";

export interface CustomerRepository {
  findById(id: string): Promise<Customer | null>;
  findByEmail(email: string): Promise<Customer | null>;
  listAll(): Promise<Customer[]>;
}

export interface OrderRepository {
  findById(id: string): Promise<Order | null>;
  findForCustomer(orderId: string, customerId: string): Promise<Order | null>;
  listForCustomer(customerId: string): Promise<Order[]>;
}
