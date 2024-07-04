import { createAsync, RouteDefinition } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { Show } from "solid-js";
import { A } from "~/components/LocaleContext";

import storefront from "~/shopify/storefront";

const getShopQuery = `#graphql
  query GetShop($language: LanguageCode!, $country: CountryCode!) @inContext(language: $language, country: $country){
    shop {
      id
      name
    }
  }
`;

export const route = {
  load: async ({ params }) => {
    try {
      return await storefront.query(getShopQuery);
    } catch (err) {
      console.log(err);
    }
  },
} satisfies RouteDefinition;

export default function Home() {
  const data = createAsync(async () => storefront.query(getShopQuery));
  return (
    <main class="text-center mx-auto text-gray-700 p-4">
      <Show when={data()?.data}>
        <Title>Home Page | {data()?.data?.shop?.name}</Title>
        <h1>{data()?.data?.shop.name}</h1>
      </Show>
      <A href="/">Home</A>
      <A href="/about">About</A>
      <A href="/wow">WOW</A>
    </main>
  );
}
