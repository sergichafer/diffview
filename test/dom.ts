import { Window } from "happy-dom";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (!GlobalRegistrator.isRegistered) {
  const probe = new Window();
  try {
    if (typeof probe.HTMLDialogElement !== "function") {
      throw new Error("happy-dom Window did not provide HTMLDialogElement");
    }
    GlobalRegistrator.register({
      width: probe.innerWidth,
      height: probe.innerHeight,
    });
  } finally {
    await probe.happyDOM.close();
  }
}

if (typeof document === "undefined" || typeof HTMLDialogElement !== "function") {
  throw new Error(
    "happy-dom GlobalRegistrator did not install document/HTMLDialogElement",
  );
}

const elementProto = HTMLElement.prototype as HTMLElement & {
  setPointerCapture?: (pointerId: number) => void;
  releasePointerCapture?: (pointerId: number) => void;
};
if (typeof elementProto.setPointerCapture !== "function") {
  elementProto.setPointerCapture = function setPointerCapture() {};
}
if (typeof elementProto.releasePointerCapture !== "function") {
  elementProto.releasePointerCapture = function releasePointerCapture() {};
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
