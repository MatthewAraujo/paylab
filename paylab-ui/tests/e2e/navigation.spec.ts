import { expect, test } from "@playwright/test";

test("navigates between operational console sections without demo data", async ({
  page,
}) => {
  await page.goto("/dashboard");

  await expect(
    page.getByRole("heading", { name: "Dashboard", level: 1 }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Accounts" }).click();

  await expect(page).toHaveURL(/\/accounts$/);
  await expect(
    page.getByRole("heading", { name: "Accounts", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText(/illustrative design/i)).toHaveCount(0);
});
