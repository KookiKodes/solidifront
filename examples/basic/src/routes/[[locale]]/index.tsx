import {
  getStorefrontClient,
  createStorefrontQuery,
  storefront,
  useLocale,
} from "@solidifront/start";
import { Title } from "@solidjs/meta";
import { createAsync } from "@solidjs/router";
import { createEffect, createSignal, Show } from "solid-js";
import Counter from "~/components/Counter";
import { shopQuery } from "~/graphql/storefront/queries";

export default function Home() {
  const locale = useLocale();
  const query = createStorefrontQuery(shopQuery);

  return (
    <main>
      <Title>Hello World</Title>

      <h1>Hello</h1>

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
  );
}
