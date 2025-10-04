import { join } from "node:path";

export const combinePath = (
	path: string = "",
	type: "storefront" | "customer" = "storefront",
) => {
	let combinedPath: string;
	if (type === "customer")
		combinedPath = join(path, "customeraccountapi.generated.d.ts");
	else combinedPath = join(path, "storefrontapi.generated.d.ts");

	return combinedPath;
};
