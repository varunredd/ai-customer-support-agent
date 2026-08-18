import { getDatabase } from "@/db/database";
import { CustomersDirectory } from "@/components/admin/CustomersDirectory";
import { createSqliteCustomerRepository } from "@/repositories/sqlite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const customers = await createSqliteCustomerRepository(getDatabase()).listAll();
  return <CustomersDirectory customers={customers} />;
}
