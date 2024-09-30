import { RouteSectionProps } from "@solidjs/router";
import { LocaleProvider } from "@solidifront/start";

export default function Locale(props: RouteSectionProps) {
  return <LocaleProvider>{props.children}</LocaleProvider>;
}
