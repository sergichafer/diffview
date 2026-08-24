import { Window } from "happy-dom";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (!GlobalRegistrator.isRegistered) {
  GlobalRegistrator.register();
}

if (typeof Window !== "function" || typeof HTMLDialogElement !== "function") {
  throw new Error(
    "happy-dom GlobalRegistrator did not install Window/HTMLDialogElement",
  );
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
