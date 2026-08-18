/// <reference types="vite/client" />

declare module "@pierre/diffs/worker/worker.js?worker" {
  const WorkerConstructor: new () => Worker;
  export default WorkerConstructor;
}
