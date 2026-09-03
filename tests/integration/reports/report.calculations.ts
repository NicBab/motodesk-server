//************************************************************** */

export function decimalToNumber(
  value:
    | {
        toString(): string;
      }
    | number
    | null
    | undefined,
): number {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = Number(value.toString());

  return Number.isFinite(parsed) ? parsed : 0;
}

//************************************************************** */

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

//************************************************************** */

export function roundHours(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

//************************************************************** */

export function getPersonName(
  user:
    | {
        firstName: string;
        lastName: string;
      }
    | null
    | undefined,
): string | null {
  if (!user) {
    return null;
  }

  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();

  return name || null;
}

//************************************************************** */

export function getCustomerName(customer: {
  firstName: string | null;

  lastName: string | null;

  companyName: string | null;
}): string {
  if (customer.companyName) {
    return customer.companyName;
  }

  return (
    [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim() ||
    "Unknown customer"
  );
}

//************************************************************** */

export function getVehicleDescription(vehicle: {
  year: number | null;

  make: string;

  model: string;
}): string {
  return (
    [vehicle.year, vehicle.make, vehicle.model]
      .filter(Boolean)
      .join(" ")
      .trim() || "Unknown vehicle"
  );
}

//************************************************************** */

export type RepairOrderCalculationInput = {
  taxRate: {
    toString(): string;
  } | null;

  shopSuppliesRate: {
    toString(): string;
  };

  discount: {
    toString(): string;
  };

  laborLines: Array<{
    hours: {
      toString(): string;
    };

    rate: {
      toString(): string;
    };

    status: string;
  }>;

  partLines: Array<{
    quantity: {
      toString(): string;
    };

    unitPrice: {
      toString(): string;
    };

    status: string;
  }>;
};

//************************************************************** */

export type RepairOrderTotals = {
  laborHours: number;

  laborRevenue: number;

  partsRevenue: number;

  shopSuppliesRevenue: number;

  subtotal: number;

  discount: number;

  taxable: number;

  tax: number;

  total: number;
};

//************************************************************** */

export function calculateRepairOrderTotals(
  repairOrder: RepairOrderCalculationInput,
): RepairOrderTotals {
  let laborHours = 0;

  let laborRevenue = 0;

  let partsRevenue = 0;

  //************************************************************** */
  // Labor

  for (const line of repairOrder.laborLines) {
    if (line.status === "CANCELLED") {
      continue;
    }

    const hours = decimalToNumber(line.hours);

    const rate = decimalToNumber(line.rate);

    laborHours += hours;

    laborRevenue += hours * rate;
  }

  //************************************************************** */
  // Parts

  for (const line of repairOrder.partLines) {
    if (line.status === "CANCELLED") {
      continue;
    }

    partsRevenue +=
      decimalToNumber(line.quantity) * decimalToNumber(line.unitPrice);
  }

  //************************************************************** */
  // Match RepairOrderEstimateTab exactly:
  //
  // labor + parts
  // + shop supplies %
  // - dollar discount
  // + tax %

  const laborAndParts = laborRevenue + partsRevenue;

  const shopSuppliesRate = decimalToNumber(repairOrder.shopSuppliesRate);

  const shopSuppliesRevenue = laborAndParts * (shopSuppliesRate / 100);

  const subtotal = laborAndParts + shopSuppliesRevenue;

  const discount = Math.min(
    subtotal,
    Math.max(0, decimalToNumber(repairOrder.discount)),
  );

  const taxable = Math.max(0, subtotal - discount);

  const taxRate = decimalToNumber(repairOrder.taxRate);

  const tax = taxable * (taxRate / 100);

  //************************************************************** */

  return {
    laborHours: roundHours(laborHours),

    laborRevenue: roundMoney(laborRevenue),

    partsRevenue: roundMoney(partsRevenue),

    shopSuppliesRevenue: roundMoney(shopSuppliesRevenue),

    subtotal: roundMoney(subtotal),

    discount: roundMoney(discount),

    taxable: roundMoney(taxable),

    tax: roundMoney(tax),

    total: roundMoney(taxable + tax),
  };
}

//************************************************************** */

export type TrendBucket = {
  label: string;

  start: Date;

  end: Date;
};

//************************************************************** */

export function createTrendBuckets(
  start: Date,
  end: Date,
  mode: "month" | "annual",
): TrendBucket[] {
  if (mode === "annual") {
    const buckets: TrendBucket[] = [];

    let cursor = new Date(start);

    cursor.setDate(1);

    cursor.setHours(0, 0, 0, 0);

    while (cursor < end) {
      const bucketStart = new Date(cursor);

      const next = new Date(cursor);

      next.setMonth(next.getMonth() + 1);

      const bucketEnd = next < end ? next : end;

      buckets.push({
        label: new Intl.DateTimeFormat("en-US", {
          month: "short",
        }).format(bucketStart),

        start: bucketStart,

        end: bucketEnd,
      });

      cursor = next;
    }

    return buckets;
  }

  //************************************************************** */
  // Monthly report = week buckets.

  const buckets: TrendBucket[] = [];

  let cursor = new Date(start);

  let index = 1;

  while (cursor < end) {
    const bucketStart = new Date(cursor);

    const next = new Date(cursor);

    next.setDate(next.getDate() + 7);

    buckets.push({
      label: `Wk ${index}`,

      start: bucketStart,

      end: next < end ? next : end,
    });

    cursor = next;

    index += 1;
  }

  return buckets;
}

//************************************************************** */

export function isDateInBucket(date: Date, bucket: TrendBucket): boolean {
  return date >= bucket.start && date < bucket.end;
}

//************************************************************** */
