type SuccessEnvelope<T> = {
  status: "success";
  message: string;
  data: T;
  error: null;
};

type ErrorEnvelope = {
  status: "error";
  message: string;
  data: null;
  error: Record<string, unknown>;
};

export const apiResponse = {
  success: <T>(message: string, data: T): SuccessEnvelope<T> => ({
    status: "success",
    message,
    data,
    error: null,
  }),
  error: (message: string, error: Record<string, unknown> = {}): ErrorEnvelope => ({
    status: "error",
    message,
    data: null,
    error,
  }),
};
