import type {
  Response,
} from "express";

//************************************************************** */

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

//************************************************************** */

export interface ApiMessageResponse {
  success: true;
  message: string;
}

//************************************************************** */

export interface ApiListResponse<T> {
  success: true;
  data: T[];
}

//************************************************************** */

export function ok<T>(
  response: Response,
  data: T,
): void {
  const body: ApiSuccessResponse<T> = {
    success: true,
    data,
  };

  response.status(200).json(body);
}

//************************************************************** */

export function created<T>(
  response: Response,
  data: T,
): void {
  const body: ApiSuccessResponse<T> = {
    success: true,
    data,
  };

  response.status(201).json(body);
}

//************************************************************** */

export function accepted<T>(
  response: Response,
  data: T,
): void {
  const body: ApiSuccessResponse<T> = {
    success: true,
    data,
  };

  response.status(202).json(body);
}

//************************************************************** */

export function list<T>(
  response: Response,
  data: T[],
): void {
  const body: ApiListResponse<T> = {
    success: true,
    data,
  };

  response.status(200).json(body);
}

//************************************************************** */

export function message(
  response: Response,
  messageText: string,
): void {
  const body: ApiMessageResponse = {
    success: true,
    message: messageText,
  };

  response.status(200).json(body);
}

//************************************************************** */

export function noContent(
  response: Response,
): void {
  response.status(204).send();
}