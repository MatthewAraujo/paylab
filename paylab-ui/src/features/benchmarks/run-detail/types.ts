import type { components } from "@/api/generated/schema";

type Schemas = components["schemas"];

export type RunDetail = Schemas["RunDetailResponse"];
export type Artifact = Schemas["ArtifactResponse"];
export type Failure = Schemas["FailureDetailResponse"];
export type Protocol = Schemas["ProtocolResponse"];
