import assert from "node:assert/strict";
import test from "node:test";

import { prisma } from "../../../../src/config/prisma.js";

import {
  closePartReturn,
  createPartReturn,
  getPartReturnById,
  shipPartReturn,
  updatePartReturnCredit,
} from "../../../../src/modules/part-returns/part-return.service.js";

//************************************************************** */

test("Part return lifecycle integration", async (t) => {
  const suffix = Date.now().toString();

  //************************************************************** */

  const organization = await prisma.organization.create({
    data: {
      name: `Part Return Test ${suffix}`,

      slug: `part-return-test-${suffix}`,
    },
  });

  //************************************************************** */

  t.after(async () => {
    await prisma.organization.deleteMany({
      where: {
        id: organization.id,
      },
    });
  });

  //************************************************************** */

  const vendor = await prisma.vendor.create({
    data: {
      organizationId: organization.id,

      name: `Return Vendor ${suffix}`,

      isActive: true,
    },
  });

  //************************************************************** */

  const part = await prisma.part.create({
    data: {
      organizationId: organization.id,

      partNumber: `RET-${suffix}`,

      alternatePartNumbers: [],

      description: "Return lifecycle test part",

      qtyOnHand: 5,

      qtyAllocated: 0,

      qtyOnOrder: 0,

      reorderPoint: 0,

      costPrice: 10,

      sellPrice: 20,

      isActive: true,
    },
  });

  //************************************************************** */

  await t.test("creates sequential return numbers", async () => {
    const first = await createPartReturn(organization.id, {
      returnType: "TO_VENDOR",

      partId: part.id,

      quantity: 1,

      vendorId: vendor.id,

      restockingFee: 0,

      creditAmount: 0,
    });

    const second = await createPartReturn(organization.id, {
      returnType: "TO_VENDOR",

      partId: part.id,

      quantity: 1,

      vendorId: vendor.id,

      restockingFee: 0,

      creditAmount: 0,
    });

    assert.equal(second.returnNumber, first.returnNumber + 1);

    assert.equal(first.organizationId, organization.id);

    assert.equal(first.partId, part.id);

    assert.equal(first.vendorId, vendor.id);

    assert.equal(first.partNumber, part.partNumber);

    assert.equal(first.vendorName, vendor.name);
  });

  //************************************************************** */

  await t.test(
    "vendor return progresses pending to shipped to credited to closed",
    async () => {
      const partReturn = await createPartReturn(organization.id, {
        returnType: "TO_VENDOR",

        partId: part.id,

        quantity: 1,

        vendorId: vendor.id,

        restockingFee: 0,

        creditAmount: 0,
      });

      assert.equal(partReturn.status, "PENDING");

      assert.equal(partReturn.creditStatus, "PENDING");

      //************************************************************** */

      const shipped = await shipPartReturn(organization.id, partReturn.id);

      assert.equal(shipped.status, "SHIPPED");

      //************************************************************** */

      const credited = await updatePartReturnCredit(
        organization.id,
        partReturn.id,
        {
          creditAmount: 10,

          creditStatus: "RECEIVED",
        },
      );

      assert.equal(credited.status, "CREDITED");

      assert.equal(credited.creditStatus, "RECEIVED");

      assert.equal(Number(credited.creditAmount), 10);

      //************************************************************** */

      const closed = await closePartReturn(
        organization.id,
        partReturn.id,
        null,
      );

      assert.equal(closed.status, "CLOSED");
    },
  );

  //************************************************************** */

  await t.test(
    "inventory return adds quantity back to on-hand when closed",
    async () => {
      const before = await prisma.part.findUniqueOrThrow({
        where: {
          id: part.id,
        },
      });

      //************************************************************** */

      const partReturn = await createPartReturn(organization.id, {
        returnType: "TO_INVENTORY",

        partId: part.id,

        quantity: 2,

        restockingFee: 0,

        creditAmount: 0,
      });

      assert.equal(partReturn.status, "PENDING");

      //************************************************************** */

      const closed = await closePartReturn(
        organization.id,
        partReturn.id,
        null,
      );

      assert.equal(closed.status, "CLOSED");

      //************************************************************** */

      const after = await prisma.part.findUniqueOrThrow({
        where: {
          id: part.id,
        },
      });

      assert.equal(Number(after.qtyOnHand), Number(before.qtyOnHand) + 2);

      //************************************************************** */

      const inventoryTransaction =
        await prisma.partInventoryTransaction.findFirst({
          where: {
            partId: part.id,

            referenceType: "PART_RETURN",

            referenceId: partReturn.id,

            type: "RETURN",
          },
        });

      assert.ok(inventoryTransaction);

      assert.equal(Number(inventoryTransaction.quantity), 2);

      assert.equal(
        Number(inventoryTransaction.onHandBefore),
        Number(before.qtyOnHand),
      );

      assert.equal(
        Number(inventoryTransaction.onHandAfter),
        Number(before.qtyOnHand) + 2,
      );
    },
  );

  //************************************************************** */

  await t.test("inventory returns cannot be shipped", async () => {
    const partReturn = await createPartReturn(organization.id, {
      returnType: "TO_INVENTORY",

      partId: part.id,

      quantity: 1,

      restockingFee: 0,

      creditAmount: 0,
    });

    await assert.rejects(
      () => shipPartReturn(organization.id, partReturn.id),
      /Returns to inventory are not shipped to a vendor/,
    );
  });

  //************************************************************** */

  await t.test(
    "vendor return cannot close before credit is received",
    async () => {
      const partReturn = await createPartReturn(organization.id, {
        returnType: "TO_VENDOR",

        partId: part.id,

        quantity: 1,

        vendorId: vendor.id,

        restockingFee: 0,

        creditAmount: 0,
      });

      const shipped = await shipPartReturn(organization.id, partReturn.id);

      assert.equal(shipped.status, "SHIPPED");

      await assert.rejects(
        () => closePartReturn(organization.id, partReturn.id, null),
        /Vendor returns must be credited before they can be closed/,
      );
    },
  );

  //************************************************************** */

  await t.test("returns are organization scoped", async () => {
    const partReturn = await createPartReturn(organization.id, {
      returnType: "TO_VENDOR",

      partId: part.id,

      quantity: 1,

      vendorId: vendor.id,

      restockingFee: 0,

      creditAmount: 0,
    });

    //************************************************************** */

    const otherOrganization = await prisma.organization.create({
      data: {
        name: `Other Return Test ${suffix}`,

        slug: `other-return-test-${suffix}`,
      },
    });

    //************************************************************** */

    try {
      await assert.rejects(
        () => getPartReturnById(otherOrganization.id, partReturn.id),
        /Part return not found/,
      );
    } finally {
      await prisma.organization.deleteMany({
        where: {
          id: otherOrganization.id,
        },
      });
    }
  });
});

//************************************************************** */
