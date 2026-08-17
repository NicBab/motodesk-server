import { createAuthenticatedAgent } from "../../helpers/authenticated-agent.js";

type AuthenticatedAgentResult = Awaited<
  ReturnType<typeof createAuthenticatedAgent>
>;

//************************************************************** */

export interface PurchaseOrderFixtureOptions {
  orderedQty?: number;
  qtyOnHand?: number;

  withRepairOrder?: boolean;
  withRepairOrderPartLine?: boolean;
}

//************************************************************** */

export interface PurchaseOrderFixture {
  agent: AuthenticatedAgentResult["agent"];

  organizationId: string;

  vendorId: string;

  partId: string;
  partNumber: string;

  purchaseOrderId: string;
  purchaseOrderLineId: string;

  customerId?: string;
  vehicleId?: string;
  repairOrderId?: string;
  repairOrderPartLineId?: string;
}

//************************************************************** */

export async function createPurchaseOrderFixture(
  options: PurchaseOrderFixtureOptions = {},
): Promise<PurchaseOrderFixture> {
  const { agent, organizationId } = await createAuthenticatedAgent();

  const uniqueSuffix = Date.now().toString();

  const orderedQty = options.orderedQty ?? 2;

  const qtyOnHand = options.qtyOnHand ?? 0;

  const withRepairOrderPartLine = options.withRepairOrderPartLine ?? false;

  const withRepairOrder = options.withRepairOrder ?? withRepairOrderPartLine;

  //************************************************************** */
  // Vendor

  const vendorResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/vendors`)
    .send({
      name: `PO Fixture Vendor ${uniqueSuffix}`,
    });

  if (vendorResponse.status !== 201) {
    throw new Error(
      `Vendor fixture creation failed with status ${vendorResponse.status}.`,
    );
  }

  const vendorId = vendorResponse.body.data.id;

  //************************************************************** */
  // Part

  const partNumber = `PO-FIXTURE-${uniqueSuffix}`;

  const partResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/parts`)
    .send({
      partNumber,

      description: "Purchase order fixture part",

      qtyOnHand,

      costPrice: 10,

      sellPrice: 20,
    });

  if (partResponse.status !== 201) {
    throw new Error(
      `Part fixture creation failed with status ${partResponse.status}.`,
    );
  }

  const partId = partResponse.body.data.id;

  //************************************************************** */
  // Optional Repair Order foundation

  let customerId: string | undefined;

  let vehicleId: string | undefined;

  let repairOrderId: string | undefined;

  let repairOrderPartLineId: string | undefined;

  if (withRepairOrder) {
    const customerResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/customers`)
      .send({
        type: "INDIVIDUAL",

        firstName: "PO",

        lastName: "Fixture",
      });

    if (customerResponse.status !== 201) {
      throw new Error(
        `Customer fixture creation failed with status ${customerResponse.status}.`,
      );
    }

    customerId = customerResponse.body.data.id;

    const vehicleResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/vehicles`)
      .send({
        customerId,

        make: "Yamaha",

        model: "YZ250F",

        vin: `PO-FIXTURE-VIN-${uniqueSuffix}`,

        type: "MOTORCYCLE",
      });

    if (vehicleResponse.status !== 201) {
      throw new Error(
        `Vehicle fixture creation failed with status ${vehicleResponse.status}.`,
      );
    }

    vehicleId = vehicleResponse.body.data.id;

    const repairOrderResponse = await agent
      .post(`/api/v1/organizations/${organizationId}/repair-orders`)
      .send({
        customerId,
        vehicleId,

        complaint: "Purchase order fixture repair.",
      });

    if (repairOrderResponse.status !== 201) {
      throw new Error(
        `Repair order fixture creation failed with status ${repairOrderResponse.status}.`,
      );
    }

    repairOrderId = repairOrderResponse.body.data.id;
  }

  //************************************************************** */
  // Optional RO part line

  if (withRepairOrderPartLine) {
    if (!repairOrderId) {
      throw new Error(
        "Repair order fixture is required before creating a repair order part line.",
      );
    }

    const repairOrderPartLineResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines`,
      )
      .send({
        partId,
        partNumber,

        description: "Purchase order fixture part",

        quantity: orderedQty,

        requiredQty: orderedQty,

        approvedQty: orderedQty,

        unitPrice: 20,

        resolutionMethod: "ORIGINAL_PO",
      });

    if (repairOrderPartLineResponse.status !== 201) {
      throw new Error(
        `Repair order part line fixture creation failed with status ${repairOrderPartLineResponse.status}.`,
      );
    }

    repairOrderPartLineId = repairOrderPartLineResponse.body.data.id;

    const toBeOrderedResponse = await agent
      .post(
        `/api/v1/organizations/${organizationId}/repair-orders/${repairOrderId}/part-lines/${repairOrderPartLineId}/to-be-ordered`,
      )
      .send({});

    if (toBeOrderedResponse.status !== 200) {
      throw new Error(
        `Repair order part line TO_BE_ORDERED transition failed with status ${toBeOrderedResponse.status}.`,
      );
    }
  }

  //************************************************************** */
  // Purchase Order

  const purchaseOrderResponse = await agent
    .post(`/api/v1/organizations/${organizationId}/purchase-orders`)
    .send({
      vendorId,

      lines: [
        {
          partId,

          ...(repairOrderPartLineId !== undefined
            ? {
                repairOrderPartLineId,
              }
            : {}),

          orderedQty,

          unitCost: 10,
        },
      ],
    });

  if (purchaseOrderResponse.status !== 201) {
    throw new Error(
      `Purchase order fixture creation failed with status ${purchaseOrderResponse.status}.`,
    );
  }

  const purchaseOrderId = purchaseOrderResponse.body.data.id;

  const purchaseOrderLineId = purchaseOrderResponse.body.data.lines[0].id;

  //************************************************************** */

  return {
    agent,
    organizationId,

    vendorId,

    partId,
    partNumber,

    purchaseOrderId,
    purchaseOrderLineId,

    ...(customerId !== undefined
      ? {
          customerId,
        }
      : {}),

    ...(vehicleId !== undefined
      ? {
          vehicleId,
        }
      : {}),

    ...(repairOrderId !== undefined
      ? {
          repairOrderId,
        }
      : {}),

    ...(repairOrderPartLineId !== undefined
      ? {
          repairOrderPartLineId,
        }
      : {}),
  };
}
