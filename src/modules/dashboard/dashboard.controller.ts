import type {
  NextFunction,
  Request,
  Response,
} from "express";

import {
  getDashboardOverview,
} from "./dashboard.service.js";

//************************************************************** */

export async function getDashboardOverviewHandler(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const organizationId =
      request.params.organizationId;

    if (
      typeof organizationId !==
      "string"
    ) {
      response.status(
        400,
      ).json({
        message:
          "Organization ID is required.",
      });

      return;
    }

    const dashboard =
      await getDashboardOverview(
        organizationId,
      );

    response.status(
      200,
    ).json(
      dashboard,
    );
  } catch (
    error
  ) {
    next(
      error,
    );
  }
}

//************************************************************** */