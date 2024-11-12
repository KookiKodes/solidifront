import { Context, Layer, Schema } from "effect";
import { ClientOptions } from "../schemas.js";

export class BuildDefaultClientOptions extends Context.Tag(
  "@solidifront/storefront-client/BuildDefaultClientOptions",
)<BuildDefaultClientOptions, ClientOptions["Type"]>() {
  static readonly Default = (options: ClientOptions["Encoded"]) =>
    Layer.effect(this, Schema.decode(ClientOptions)(options));
}
