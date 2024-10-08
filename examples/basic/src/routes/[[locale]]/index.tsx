import {
  createStorefrontQuery,
  storefront,
  useLocale,
} from "@solidifront/start";
import { Title } from "@solidjs/meta";
import { createAsync } from "@solidjs/router";
import { Show } from "solid-js";
import Counter from "~/components/Counter";
import { shopQuery } from "~/graphql/storefront/queries";

export const route = {
  async preload() {
    return await storefront.query(shopQuery);
  },
};

export default function Home() {
  const locale = useLocale();
  const query = createAsync(() => storefront.query(shopQuery));

  return (
    <Show when={query()}>
      <main>
        <Title>Hello World</Title>

        <h1>Hello {query()?.data?.shop?.name}</h1>

        <div>
          <Counter />
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
    </Show>
  );
}
