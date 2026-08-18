import type { Response } from "express";

import { AppError } from "../../platform/errors/app-error.js";

import type { AuthenticatedRequest } from "../auth/index.js";

import { getRequestContext } from "../../platform/request/request.context.js";

import {
  requireValidatedBody,
  requireValidatedParams,
} from "../../platform/validation/validated-request.js";

import { ok } from "../../platform/http/api-response.js";

import {
  assignRepairOrderToServiceBay,
  createServiceBay,
  listServiceBays,
  releaseRepairOrderFromServiceBay,
  updateServiceBayStatus,
} from "./service-bay.service.js";

import type {
  AssignRepairOrderToServiceBayInput,
  CreateServiceBayInput,
  ReleaseRepairOrderFromServiceBayInput,
  UpdateServiceBayStatusInput,
} from "./service-bay.schemas.js";

//************************************************************** */

interface ServiceBayAssignmentParams {
  repairOrderId: string;
}

//************************************************************** */

interface ServiceBayStatusParams {
  serviceBayId: string;
}

//************************************************************** */

function requireOrganizationId(request: AuthenticatedRequest): string {
  const organizationId = request.params.organizationId;

  if (
    typeof organizationId !== "string" ||
    organizationId.trim().length === 0
  ) {
    throw new AppError(400, "A valid organization ID is required.", {
      code: "ORGANIZATION_ID_REQUIRED",
    });
  }

  return organizationId;
}

//************************************************************** */
// Create Service Bay

export async function createServiceBayHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const input = requireValidatedBody<CreateServiceBayInput>(request);

  const serviceBay = await createServiceBay(organizationId, input);

  ok(response, serviceBay);
}

//************************************************************** */
// List Service Bays

export async function listServiceBaysHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const serviceBays = await listServiceBays(organizationId);

  ok(response, serviceBays);
}

//************************************************************** */
// Assign Repair Order To Service Bay

export async function assignRepairOrderToServiceBayHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId } =
    requireValidatedParams<ServiceBayAssignmentParams>(request);

  const input =
    requireValidatedBody<AssignRepairOrderToServiceBayInput>(request);

  const assignedByMembershipId = getRequestContext().membership?.id ?? null;

  const assignment = await assignRepairOrderToServiceBay(
    organizationId,
    repairOrderId,
    assignedByMembershipId,
    input,
  );

  ok(response, assignment);
}

//************************************************************** */
// Release Repair Order From Service Bay

export async function releaseRepairOrderFromServiceBayHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { repairOrderId } =
    requireValidatedParams<ServiceBayAssignmentParams>(request);

  const input =
    requireValidatedBody<ReleaseRepairOrderFromServiceBayInput>(request);

  const assignment = await releaseRepairOrderFromServiceBay(
    organizationId,
    repairOrderId,
    input,
  );

  ok(response, assignment);
}

//************************************************************** */
// Update Service Bay Status

export async function updateServiceBayStatusHandler(
  request: AuthenticatedRequest,
  response: Response,
): Promise<void> {
  const organizationId = requireOrganizationId(request);

  const { serviceBayId } =
    requireValidatedParams<ServiceBayStatusParams>(request);

  const input = requireValidatedBody<UpdateServiceBayStatusInput>(request);

  const serviceBay = await updateServiceBayStatus(
    organizationId,
    serviceBayId,
    input,
  );

  ok(response, serviceBay);
}
