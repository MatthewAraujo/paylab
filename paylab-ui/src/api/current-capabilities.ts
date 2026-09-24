import snapshot from "../../openapi/paylab.json";
import { type Capabilities, deriveCapabilities } from "./capabilities";

export const currentCapabilities: Capabilities = deriveCapabilities(snapshot);

/** The financial areas that show an "activation pending" notice; Benchmarks and health do not. */
export type FinancialCapability = Exclude<
  keyof Capabilities,
  "health" | "benchmarks" | "benchmarkBaselineWrite"
>;

export function capabilityNotice(
  capability: FinancialCapability,
  label: string,
) {
  if (currentCapabilities[capability]) {
    return {
      title: `${label} UI activation is pending`,
      description:
        "The generated API contract is typed. The next TDD task can now replace this state with the live workflow.",
    };
  }

  return {
    title: `${label} contract is incomplete`,
    description:
      "The route exists, but OpenAPI does not describe its request or response data yet. This capability stays disabled to avoid guessing the API contract.",
  };
}
