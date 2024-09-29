import { Title } from "@solidjs/meta";
import { cache, createAsync } from "@solidjs/router";
import { createEffect } from "solid-js";
import { getRequestEvent } from "solid-js/web";
import Counter from "~/components/Counter";

const getData = cache(async () => {
  "use server";
  return getRequestEvent()?.locals.locale;
}, "test");

export default function Home() {
  const data = createAsync(() => getData());

  createEffect(() => {
    console.log(data());
  });

  return (
    <main>
      <Title>Hello World</Title>
      <h1>Hello world!</h1>
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
