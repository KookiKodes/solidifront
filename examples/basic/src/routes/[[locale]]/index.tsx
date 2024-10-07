import { useLocale } from "@solidifront/start";
import { Title } from "@solidjs/meta";
import { createAsync } from "@solidjs/router";
import { createEffect } from "solid-js";
import { getRequestEvent } from "solid-js/web";
import Counter from "~/components/Counter";
import { shopQuery } from "~/graphql/storefront/queries";

export default function Home() {
  const locale = useLocale();
  const data = createAsync(async () => {
    "use server";
    const req = await getRequestEvent()?.locals.storefront.query(shopQuery);

    return req?.data?.shop.name;
  });

  createEffect(() => {
    console.log(locale());
  });

  return (
    <main>
      <Title>Hello World</Title>
      <h1>{data()}</h1>
      <Counter />
      <p>
        Visit{" "}
        <a href="https://start.solidjs.com" target="_blank">
          start.solidjs.com
        </a>{" "}
        to learn how to build SolidStart apps.
      </p>
    </main>
  );
}
