import { createStorefrontQuery, useLocale } from "@solidifront/start";
import { Title } from "@solidjs/meta";
import { createEffect } from "solid-js";
import Counter from "~/components/Counter";
import { shopQuery } from "~/graphql/storefront/queries";

export default function Home() {
  const locale = useLocale();
  const query = createStorefrontQuery(shopQuery);

  createEffect(() => {
    console.log(locale());
  });

  return (
    <main>
      <Title>Hello World</Title>
      <div>
        <h1>{query()?.data?.shop?.name}</h1>
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
        <p>Shop Query:</p>
        <code>{JSON.stringify(query(), null, 2)}</code>
        <br />
        <p>Locale: </p>
        <code>{JSON.stringify(locale(), null, 2)}</code>
      </pre>
    </main>
  );
}
