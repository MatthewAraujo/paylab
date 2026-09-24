import { readApi } from "@/api/read";
import type { DayRange } from "./report";

export const loadDailyReport = ({ from, to }: DayRange) =>
  readApi("Daily report", (client) =>
    client.GET("/v1/reports/daily", { params: { query: { from, to } } }),
  );
