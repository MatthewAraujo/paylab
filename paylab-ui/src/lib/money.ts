const brlFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatBrl(centavos: number): string {
  if (!Number.isSafeInteger(centavos)) {
    throw new TypeError("BRL values must be safe integer centavos");
  }

  return brlFormatter.format(centavos / 100);
}
