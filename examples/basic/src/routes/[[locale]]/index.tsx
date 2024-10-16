import Counter from "~/components/Counter";
import { useLocale } from "@solidifront/start/localization";
import {
  createAsyncQuery,
  createMutationAction,
  createQueryCache,
} from "@solidifront/start/storefront";
import { shopQuery } from "~/graphql/storefront/queries";
import { createCartMutation } from "~/graphql/storefront/mutations";

const cachedShopQuery = createQueryCache(shopQuery);

export const route = {
  async preload() {
    await cachedShopQuery();
  },
};

const createCartAction = createMutationAction(createCartMutation, [shopQuery]);

export default function Home() {
  const locale = useLocale();
  const shopData = createAsyncQuery(shopQuery);

  return (
    <main>
      <div>
        <form action={createCartAction} method="post">
          <input type="hidden" name="test" value="test" />
          <button>Submit me!</button>
        </form>
        <Counter />
        <h1>Hello {shopData()?.data?.shop.name}</h1>
        <p>
          Visit{" "}
          <a href="https://start.solidjs.com" target="_blank">
            start.solidjs.com
          </a>{" "}
          to learn how to build SolidStart apps.
        </p>
      </div>
      <pre>
        <p>Locale: </p>
        <code>{JSON.stringify(locale(), null, 2)}</code>
      </pre>
    </main>
  );
}
