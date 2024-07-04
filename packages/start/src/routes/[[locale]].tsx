import { RouteSectionProps } from "@solidjs/router";
import { LocaleProvider } from "~/components/LocaleContext";

export default function Locale(props: RouteSectionProps) {
  return <LocaleProvider>{props.children}</LocaleProvider>;
}
