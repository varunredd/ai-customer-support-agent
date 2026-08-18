import { customers } from "@/data/customers";
import { orders } from "@/data/orders";
import type { CustomerRepository, OrderRepository } from "@/repositories/contracts";

export const customerRepository: CustomerRepository = {
  async findById(id) {
    return customers.find((customer) => customer.id === id) ?? null;
  },
  async findByEmail(email) {
    return customers.find((customer) => customer.email.toLowerCase() === email.toLowerCase()) ?? null;
  },
  async listAll() {
    return [...customers];
  },
};

export const orderRepository: OrderRepository = {
  async findById(id) {
    return orders.find((order) => order.id === id) ?? null;
  },
  async findForCustomer(orderId, customerId) {
    return orders.find((order) => order.id === orderId && order.customerId === customerId) ?? null;
  },
  async listForCustomer(customerId) {
    return orders.filter((order) => order.customerId === customerId);
  },
};
