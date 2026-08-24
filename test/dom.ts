import { Window } from "happy-dom";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (!GlobalRegistrator.isRegistered) {
  GlobalRegistrator.register();
}
if (typeof document === "undefined" || typeof HTMLDialogElement === "undefined") {
  throw new Error(
    `${Window.name} GlobalRegistrator did not install document`,
  );
}
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
