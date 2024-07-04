// @refresh reload
import { createHandler, StartServer } from "@solidjs/start/server";
import tailwindCss from "./app.css?url";

export default createHandler((context) => {
  return (
    <StartServer
      document={({ assets, children, scripts }) => (
        <html lang={context.locals.locale.language.toLocaleLowerCase()}>
          <head>
            <meta charset="utf-8" />
            <meta
              name="viewport"
              content="width=device-width, initial-scale=1"
            />
            <link rel="icon" href="/favicon.ico" />
            <link rel="stylesheet" href={tailwindCss} />
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
