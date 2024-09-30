import { useLocale } from "@solidifront/start";
import { Title } from "@solidjs/meta";
import { createEffect } from "solid-js";
import Counter from "~/components/Counter";

export default function Home() {
  const locale = useLocale();

  createEffect(() => {
    console.log(locale());
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
