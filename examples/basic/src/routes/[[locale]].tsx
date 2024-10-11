import { RouteSectionProps } from "@solidjs/router";
import { LocaleProvider } from "@solidifront/start/localization";

export default function Locale(props: RouteSectionProps) {
  return <LocaleProvider>{props.children}</LocaleProvider>;
}
