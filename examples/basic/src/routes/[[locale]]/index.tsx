import { useLocale } from "@solidifront/start/localization";
import { createQueryCache } from "@solidifront/start/storefront";
import { createAsync } from "@solidjs/router";
import Counter from "~/components/Counter";
import { shopQuery } from "~/graphql/storefront/queries";

const cachedShopQuery = createQueryCache(shopQuery);

export const route = {
	async preload() {
		await cachedShopQuery();
	},
};

export default function Home() {
	const locale = useLocale();
	const shopData = createAsync(() => cachedShopQuery());

	return (
		<main>
			<div>
				<Counter />
				<h1>Hello {shopData()?.data?.shop.description}</h1>
				<p>
					Visit{" "}
					<a href="https://start.solidjs.com" target="_blank" rel="noopener">
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
