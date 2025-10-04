// @refresh reload
import { mount, StartClient } from "@solidjs/start/client";

const mountPoint = document.getElementById("app");

if (!mountPoint) {
	console.error("No mount point found!");
}

if (mountPoint) {
	mount(() => <StartClient />, mountPoint);
}
