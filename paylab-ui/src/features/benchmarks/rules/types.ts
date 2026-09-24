import type { components } from "@/api/generated/schema";

// Every benchmark shape comes from the generated OpenAPI types; nothing is handwritten.
type Schemas = components["schemas"];

export type Metric = Schemas["MetricResponse"];
export type Scenario = Schemas["ScenarioResponse"];
export type HeadlineMetric = Schemas["HeadlineMetricResponse"];
export type RunListItem = Schemas["RunListItemResponse"];
export type MetricDirection = Metric["direction"];
export type SummaryRole = HeadlineMetric["summaryRole"];
export type ComparisonState = Schemas["ScenarioComparisonResponse"]["state"];
