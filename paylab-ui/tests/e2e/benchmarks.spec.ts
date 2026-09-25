import { expect, type Page, type Route, test } from "@playwright/test";
import {
  artifact,
  artifactContent,
  baselineSelection,
  baselineView,
  benchmarkStatus,
  comparison,
  runDetail,
  runListItem,
  runPage,
} from "@/test/benchmark-fixtures";

// The browser reads the benchmark API directly (cross-origin), so the API is replaced by request
// interception: nothing here needs a running PayLab API, a database, or a credential.

const API = "http://localhost:3333";
const LATEST = "2026-09-23T14-08-12Z-8a2c91f";
const PREVIOUS = "2026-09-16T18-30-00Z-3f9d0aa";
const LOG = "t14.load.M.c64.sync-on log";

const latestItem = runListItem({ runId: LATEST });
const previousItem = runListItem({
  runId: PREVIOUS,
  startedAt: "2026-09-16T18:30:00.000Z",
  note: "Before the index",
});
const details = {
  [LATEST]: runDetail({ runId: LATEST, artifacts: [artifact()] }),
  [PREVIOUS]: runDetail({
    runId: PREVIOUS,
    startedAt: "2026-09-16T18:30:00.000Z",
  }),
};

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, PUT, OPTIONS",
  "access-control-allow-headers": "content-type, accept",
};

const reply = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    headers: { ...cors, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

type Recorded = { method: string; path: string; body: string | null };

async function serveBenchmarkApi(page: Page) {
  const recorded: Recorded[] = [];
  await page.route(`${API}/v1/benchmarks/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/v1/benchmarks", "");
    recorded.push({
      method: request.method(),
      path,
      body: request.postData(),
    });

    if (request.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: cors });
    }
    if (request.method() === "PUT" && path === "/baseline") {
      return reply(
        route,
        baselineSelection({
          baseline: { runId: PREVIOUS, selectedAt: "2026-09-24T09:00:00.000Z" },
          run: previousItem,
        }),
      );
    }
    if (path === "/status") return reply(route, benchmarkStatus());
    if (path === "/runs") {
      return reply(route, runPage({ items: [latestItem, previousItem] }));
    }
    if (path === "/baseline") return reply(route, baselineView());
    if (path === "/comparisons/default" || path === "/comparisons") {
      return reply(
        route,
        comparison({ current: latestItem, reference: previousItem }),
      );
    }
    const artifactContentMatch = path.match(
      /^\/runs\/([^/]+)\/artifacts\/([^/]+)\/content$/,
    );
    if (artifactContentMatch) return reply(route, artifactContent());
    const runMatch = path.match(/^\/runs\/([^/]+)$/);
    const detail = runMatch && details[runMatch[1] as keyof typeof details];
    if (detail) return reply(route, detail);
    return reply(route, { message: `No stub for ${path}` }, 501);
  });
  return recorded;
}

test("reads the latest Run, compares, opens an Artifact and selects the Baseline", async ({
  page,
}) => {
  const recorded = await serveBenchmarkApi(page);

  // Navigation to Benchmarks from the console shell.
  await page.goto("/dashboard");
  await page.getByRole("link", { name: "Benchmarks" }).first().click();
  await expect(page).toHaveURL(/\/benchmarks$/);
  await expect(
    page.getByRole("heading", { name: "Benchmarks", level: 1 }),
  ).toBeVisible();

  // The latest Run, read from the configured API base URL.
  await expect(page.getByText(LATEST).first()).toBeVisible();
  expect(recorded.some((r) => r.path === "/runs")).toBe(true);

  // Comparison selection.
  await page.goto(
    `/benchmarks/compare?current=${LATEST}&reference=${PREVIOUS}`,
  );
  await expect(
    page.getByRole("heading", { name: "Benchmark Comparison", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("t14.load.M.c64.sync-on").first()).toBeVisible();
  expect(recorded.some((r) => r.path === "/comparisons")).toBe(true);

  // Run detail and an Artifact opening.
  await page.goto(`/benchmarks/runs/${LATEST}`);
  await expect(page.getByText(LOG).first()).toBeVisible();
  const viewButton = page.getByRole("button", { name: /view/i }).first();
  await viewButton.focus();
  await page.keyboard.press("Enter");
  const viewer = page.getByRole("dialog");
  await expect(viewer.getByText(/block rep=1\/3/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
  // Closing the dialog returns focus to the control that opened it.
  await expect(viewButton).toBeFocused();
  // A keyboard user can see where focus is.
  const focusRing = await viewButton.evaluate((element) => {
    const style = getComputedStyle(element);
    return `${style.outlineStyle} ${style.boxShadow}`;
  });
  expect(focusRing).not.toMatch(/^none none$/);

  // Baseline selection: a cross-origin PUT whose body carries only the Run id, no credential.
  await page.goto(`/benchmarks/runs/${PREVIOUS}`);
  await page
    .getByRole("button", { name: /baseline/i })
    .first()
    .click();
  await page.getByRole("button", { name: "Make Baseline" }).click();
  await expect(
    page.getByText(/nothing is committed|reviewable/i),
  ).toBeVisible();

  const put = recorded.find((r) => r.method === "PUT");
  expect(put?.path).toBe("/baseline");
  expect(JSON.parse(put?.body ?? "{}")).toEqual({ runId: PREVIOUS });
});
