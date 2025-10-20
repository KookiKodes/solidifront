import { Title } from "@solidjs/meta";
import { createAsync } from "@solidjs/router";
import { createQueryCache } from "@solidifront/start/storefront";
import { shopQuery } from "~/graphql/storefront/queries";

const cachedShopQuery = createQueryCache(shopQuery);

export default function Home() {
	const shopData = createAsync(() => cachedShopQuery());
	return (
		<main>
			<Title>About</Title>
			<h1>About</h1>
			<pre>
				<p>Shop Data:</p>
				<code>{JSON.stringify(shopData()?.data?.shop, null, 2)}</code>
			</pre>
		</main>
	);
}
