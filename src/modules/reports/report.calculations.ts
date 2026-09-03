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
  return Math.round((value + Number.EPSILON) * 10) / 10;
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
// Production RO Estimate Calculation
//
// This follows MotoDesk's actual RepairOrderEstimateTab:
// labor + parts
// + shop supplies
// - discount
// + tax
//
// Deposit is deliberately NOT subtracted from revenue. Deposit
// affects balance due, not the value of the repair order.

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

    const quantity = decimalToNumber(line.quantity);

    const unitPrice = decimalToNumber(line.unitPrice);

    partsRevenue += quantity * unitPrice;
  }

  //************************************************************** */

  const laborAndParts = laborRevenue + partsRevenue;

  const shopSuppliesRate = decimalToNumber(repairOrder.shopSuppliesRate);

  const shopSuppliesRevenue = laborAndParts * (shopSuppliesRate / 100);

  const subtotal = laborAndParts + shopSuppliesRevenue;

  const discount = Math.min(
    subtotal,

    Math.max(
      0,

      decimalToNumber(repairOrder.discount),
    ),
  );

  const taxable = Math.max(
    0,

    subtotal - discount,
  );

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
  const buckets: TrendBucket[] = [];

  //************************************************************** */
  // Annual = monthly buckets

  if (mode === "annual") {
    let cursor = new Date(start);

    while (cursor < end) {
      const bucketStart = new Date(cursor);

      const next = new Date(cursor);

      next.setMonth(next.getMonth() + 1);

      buckets.push({
        label: new Intl.DateTimeFormat("en-US", {
          month: "short",
        }).format(bucketStart),

        start: bucketStart,

        end: next < end ? next : end,
      });

      cursor = next;
    }

    return buckets;
  }

  //************************************************************** */
  // Monthly = seven-day buckets

  let cursor = new Date(start);

  let week = 1;

  while (cursor < end) {
    const bucketStart = new Date(cursor);

    const next = new Date(cursor);

    next.setDate(next.getDate() + 7);

    buckets.push({
      label: `Wk ${week}`,

      start: bucketStart,

      end: next < end ? next : end,
    });

    cursor = next;

    week += 1;
  }

  return buckets;
}

//************************************************************** */

export function isDateInBucket(date: Date, bucket: TrendBucket): boolean {
  return date >= bucket.start && date < bucket.end;
}

//************************************************************** */
