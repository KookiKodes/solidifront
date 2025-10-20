import { A, LocaleProvider } from "@solidifront/start/localization";
import { MetaProvider, Title } from "@solidjs/meta";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense } from "solid-js";
import "./app.css";

export default function App() {
	return (
		<Router
			root={(props) => (
				<MetaProvider>
					<Title>SolidStart - Basic</Title>
					<Suspense>
						<LocaleProvider>
							<A href="/">Index</A>
							<A href="/about">About</A>
							{props.children}
						</LocaleProvider>
					</Suspense>
				</MetaProvider>
			)}
		>
			<FileRoutes />
		</Router>
	);
}
