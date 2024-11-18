import { createSolidifrontConfig } from '@solidifront/codegen';

export default createSolidifrontConfig({
  generates: {
    storefront: {
      path: '.',
      documents: ['src/utils/getShopLocalization.ts'],
    },
  },
});
