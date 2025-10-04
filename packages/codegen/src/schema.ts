// This comment is used during ESM build:
//! import {createRequire} from 'module'; const require = createRequire(import.meta.url);

export const getSchema = (name: "storefront" | "customer-account") => {
	return require.resolve(`@solidifront/codegen/${name}.schema.json`);
};
