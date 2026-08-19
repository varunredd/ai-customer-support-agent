import "./load-env";
import { getDatabase } from "@/db/database";
import { applyDataRetention } from "@/services/privacy/data-retention.service";

console.log(JSON.stringify(applyDataRetention(getDatabase()), null, 2));
