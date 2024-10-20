// @refresh reload
import { getRequestLocale } from "@solidifront/start/localization";
import { createHandler, StartServer } from "@solidjs/start/server";

export default createHandler(() => {
  const locale = getRequestLocale();
  return (
    <StartServer
      document={({ assets, children, scripts }) => (
        <html lang={locale?.isoCode}>
          <head>
            <meta charset="utf-8" />
            <meta
              name="viewport"
              content="width=device-width, initial-scale=1"
            />
            <link rel="icon" href="/favicon.ico" />
            {assets}
          </head>
          <body>
            <div id="app">{children}</div>
            {scripts}
          </body>
        </html>
      )}
    />
  );
});
