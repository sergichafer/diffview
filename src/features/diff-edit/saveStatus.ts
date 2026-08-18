export type FileSaveStatus =
  | "clean"
  | "dirty"
  | "saving"
  | "hydrating"
  | "error";

export type FileSaveState = {
  status: FileSaveStatus;
  error?: string;
};
