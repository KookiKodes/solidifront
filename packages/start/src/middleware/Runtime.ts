import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";

export const Runtime = ManagedRuntime.make(Layer.empty);
